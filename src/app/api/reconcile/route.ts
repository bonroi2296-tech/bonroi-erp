import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

interface RItem {
  line_index: number;
  doc_name: string;
  qty: number;
  unit_price: number | null;
  edi_code: string | null;
  pack_size: number | null;
  pack_unit: string | null;
}

const SYS = `너는 의료소모품 유통사의 정산 보조자다. 거래처가 보낸 [출고확인서/거래명세서](텍스트·이미지·PDF)를 읽고,
[발주품목] 목록의 각 줄에 실제 출고된 수량·단가·EDI코드·박스당 수량까지 매칭한다. JSON 객체만 출력한다.

출력 형식: {"vendor":"거래처명(있으면, 없으면 \\"\\")","shipping_fee":배송비숫자,"items":[{"line_index":번호,"doc_name":"명세서품목명","qty":출고수량,"unit_price":단가,"edi_code":"EDI코드 또는 null","pack_size":박스당수량 또는 null,"pack_unit":"단위 또는 null"}]}
- items 의 각 원소는 명세서의 품목 한 줄이다.
- line_index: [발주품목]에서 같은 품목의 번호(0부터). 못 찾으면 -1.
  표기변형·동의어를 고려: 스왑=솜=스폰지, 카테터=카테타, 글러브=장갑, cc=ml, 규격(게이지·매수)도 비교.
- doc_name: 명세서에 적힌 품목명 그대로
- qty: 실제 출고 수량(숫자만). 없으면 0
- unit_price: 단가(숫자만). 없으면 null
- edi_code: 식약처 의료기기 표준코드(보통 8~14자리 숫자/영문). 명세서에 "EDI"·"표준코드"·"보험코드" 등으로 표기되거나 품목명 옆 식별번호로 적혀 있다. 없으면 null.
- pack_size: 1포장(박스/통/BOX) 안의 개수(숫자만). 예: "100매/통"=100, "100ea/BOX"=100, "50개입"=50. 없으면 null.
- pack_unit: 박스당 수량의 단위(예: "EA","매","개","ml"). 없으면 null.
- shipping_fee: 배송비/택배비/운임/배송료 합계(숫자만). 무료이거나 없으면 0
- 합계·소계·부가세·공급가액 줄은 items 에서 제외한다.
- JSON 객체만, 코드펜스·설명 금지.`;

interface RDoc {
  vendor: string;
  shipping_fee: number;
  items: RItem[];
}

function extractDoc(t: string): RDoc {
  let s = (t || "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a === -1 || b === -1) return { vendor: "", shipping_fee: 0, items: [] };
  const o = JSON.parse(s.slice(a, b + 1));
  const items: RItem[] = Array.isArray(o.items)
    ? o.items.map((r: Record<string, unknown>) => ({
        line_index: Number.isInteger(Number(r.line_index)) ? Number(r.line_index) : -1,
        doc_name: String(r.doc_name ?? "").trim(),
        qty: Number(r.qty) || 0,
        unit_price: r.unit_price == null || r.unit_price === "" ? null : Number(r.unit_price),
        edi_code: r.edi_code == null || r.edi_code === "" ? null : String(r.edi_code).trim(),
        pack_size: r.pack_size == null || r.pack_size === "" ? null : Number(r.pack_size),
        pack_unit: r.pack_unit == null || r.pack_unit === "" ? null : String(r.pack_unit).trim(),
      }))
    : [];
  return {
    vendor: String(o.vendor ?? "").trim(),
    shipping_fee: Number(o.shipping_fee) || 0,
    items,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY 미설정" }, { status: 500 });

  let body: { jobId?: string; text?: string; imageBase64?: string; imageMimeType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const { jobId, text, imageBase64, imageMimeType } = body;
  if (!jobId) return NextResponse.json({ error: "발주건이 지정되지 않았습니다." }, { status: 400 });
  if (!text?.trim() && !imageBase64) {
    return NextResponse.json({ error: "출고확인서 텍스트나 이미지를 입력하세요." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = url && anon ? createClient(url, anon) : null;
  if (!supabase) return NextResponse.json({ error: "DB 연결 불가" }, { status: 500 });

  const { data: rows } = await supabase
    .from("demand_lines")
    .select("id, raw_name, sort_order, product_id, product:products(name, spec)")
    .eq("job_id", jobId);
  const dls = ((rows as unknown as {
    id: string;
    raw_name: string;
    sort_order: number | null;
    product_id: string | null;
    product: { name: string; spec: string | null } | null;
  }[]) || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (dls.length === 0) {
    return NextResponse.json({ error: "이 발주건에 품목이 없습니다." }, { status: 400 });
  }

  // 매칭 기준: 이 발주건의 품목 목록(매칭된 제품명 포함)
  const catalogText = dls
    .map((d, i) => {
      const p = d.product ? `${d.product.name}${d.product.spec ? ` (${d.product.spec})` : ""}` : "";
      return `${i}: ${d.raw_name}${p && p !== d.raw_name ? ` = ${p}` : ""}`;
    })
    .join("\n");

  let doc: RDoc;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const base: Array<Record<string, unknown>> = [
      { text: SYS },
      { text: `\n[발주품목]\n${catalogText}` },
    ];
    const genOnce = async (parts: Array<Record<string, unknown>>): Promise<string> => {
      const envModels = (process.env.GEMINI_MODEL || "gemini-3.5-flash,gemini-2.5-flash")
        .split(",").map((s) => s.trim()).filter(Boolean);
      const models = envModels.length ? envModels : ["gemini-3.5-flash", "gemini-2.5-flash"];
      let lastErr: unknown = null;
      for (const model of models) {
        try {
          const cfg: Record<string, unknown> = { responseMimeType: "application/json", temperature: 0 };
          if (!model.startsWith("gemini-2.0")) cfg.thinkingConfig = { thinkingBudget: 0 };
          const r = await ai.models.generateContent({ model, contents: [{ role: "user", parts }], config: cfg });
          return r.text ?? "";
        } catch (e) {
          lastErr = e;
          const msg = String(e instanceof Error ? e.message : e);
          if (!/(503|429|UNAVAILABLE|overload|high demand|RESOURCE_EXHAUSTED)/i.test(msg)) throw e;
        }
      }
      throw lastErr ?? new Error("모델 응답 없음");
    };

    const parts = [...base];
    if (text?.trim()) parts.push({ text: `\n[출고확인서]\n${text.trim()}` });
    if (imageBase64) parts.push({ inlineData: { mimeType: imageMimeType || "image/png", data: imageBase64 } });
    doc = extractDoc(await genOnce(parts));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const friendly = /(503|UNAVAILABLE|overload|high demand|429|RESOURCE_EXHAUSTED)/i.test(msg)
      ? "Gemini가 지금 과부하예요. 잠시 후 다시 시도해 주세요."
      : "출고확인서 분석에 실패했어요. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ error: friendly }, { status: 502 });
  }

  const items = doc.items.map((it) => {
    const dl = it.line_index >= 0 && it.line_index < dls.length ? dls[it.line_index] : null;
    return {
      demand_line_id: dl?.id ?? null,
      product_id: dl?.product_id ?? null,
      matched_name: dl?.raw_name ?? null,
      doc_name: it.doc_name,
      qty: it.qty,
      unit_price: it.unit_price,
      edi_code: it.edi_code,
      pack_size: it.pack_size,
      pack_unit: it.pack_unit,
    };
  });

  return NextResponse.json({ vendor: doc.vendor, shipping_fee: doc.shipping_fee, items });
}

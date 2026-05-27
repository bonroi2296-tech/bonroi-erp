import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

interface GLine {
  raw_name: string;
  quantity: number;
  unit: string;
  purpose: string;
  match_indices: number[];
  note: string;
}

const SYS = `너는 의료소모품 유통사의 주문 접수 보조자다. 입력(병원 주문 메시지/이미지)과 [카탈로그]를 받아,
주문 품목을 추출하고 각 품목을 카탈로그의 후보 품목에 매칭한다. JSON 배열만 출력한다.

각 원소: {"raw_name","quantity","unit","purpose","match_indices","note"}
- raw_name: 적힌 품목명 그대로(창작 금지)
- quantity: 숫자만. 불명확하면 1
- unit: 단위(개/박스/통/봉지/매/box 등). 없으면 ""
- match_indices: 카탈로그에서 맞을 가능성이 있는 품목 번호를 **폭넓게** 최대 8개(가능성 높은 순).
  반드시 동의어·표기변형을 고려해 다 담아라. 예: 스왑=솜=스폰지, 카테터=카테타, 글러브=장갑, 주사기/주사침, cc=ml.
  규격(게이지·cc·사이즈·매수)이 입력에 없으면 같은 계열을 여러 개 담아라.
- purpose: 용도/비고. 없으면 ""
- note: 사람이 확인할 모호점만 짧게(게이지/매수 미지정 등). 없으면 ""
- 배송지·인사말은 제외. JSON 배열만, 코드펜스·설명 금지.`;

function extractJson(t: string): GLine[] {
  let s = (t || "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a === -1 || b === -1) return [];
  const arr = JSON.parse(s.slice(a, b + 1));
  if (!Array.isArray(arr)) return [];
  return arr.map((r) => ({
    raw_name: String(r.raw_name ?? "").trim(),
    quantity: Number(r.quantity) || 0,
    unit: String(r.unit ?? "").trim(),
    purpose: String(r.purpose ?? "").trim(),
    match_indices: Array.isArray(r.match_indices) ? r.match_indices.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n)) : [],
    note: String(r.note ?? "").trim(),
  })).filter((r) => r.raw_name);
}

const fmtDate = (d: string | null) => (d ? d.slice(2).replace(/-/g, "/") : "");

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY 미설정" }, { status: 500 });

  let body: { text?: string; imageBase64?: string; imageMimeType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const { text, imageBase64, imageMimeType } = body;
  if (!text?.trim() && !imageBase64) {
    return NextResponse.json({ error: "주문 텍스트나 이미지를 입력하세요." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = url && anon ? createClient(url, anon) : null;
  if (!supabase) return NextResponse.json({ error: "DB 연결 불가" }, { status: 500 });

  const { data: products } = await supabase.from("products").select("id, name, spec").order("name");
  const cat = (products as { id: string; name: string; spec: string | null }[]) || [];
  const catalogText = cat.map((p, i) => `${i}: ${p.name}${p.spec ? ` (${p.spec})` : ""}`).join("\n");

  let glines: GLine[] = [];
  try {
    const ai = new GoogleGenAI({ apiKey });
    const parts: Array<Record<string, unknown>> = [
      { text: SYS },
      { text: `\n[카탈로그]\n${catalogText}` },
    ];
    if (text?.trim()) parts.push({ text: `\n[주문 입력]\n${text.trim()}` });
    if (imageBase64) parts.push({ inlineData: { mimeType: imageMimeType || "image/png", data: imageBase64 } });

    // 일시 과부하(503/429) 시 자동 재시도 + 폴백 모델
    const models = ["gemini-2.5-flash", "gemini-2.0-flash"];
    let res: { text?: string } | null = null;
    let lastErr: unknown = null;
    outer: for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          res = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts }],
            config: { responseMimeType: "application/json", temperature: 0 },
          });
          break outer;
        } catch (e) {
          lastErr = e;
          const msg = String(e instanceof Error ? e.message : e);
          if (!/(503|429|UNAVAILABLE|overload|high demand|RESOURCE_EXHAUSTED)/i.test(msg)) throw e;
          await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        }
      }
    }
    if (!res) throw lastErr ?? new Error("모델 응답 없음");
    glines = extractJson(res.text ?? "");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const friendly = /(503|UNAVAILABLE|overload|high demand)/i.test(msg)
      ? "Gemini가 일시적으로 과부하예요. 잠시 후 다시 시도해 주세요."
      : "AI 분석 실패: " + msg;
    return NextResponse.json({ error: friendly }, { status: 502 });
  }

  const matchedIds = Array.from(
    new Set(glines.flatMap((l) => l.match_indices.map((i) => cat[i]?.id).filter(Boolean)))
  ) as string[];

  // 주문 이력(전지점) + 거래처가/공급상태 일괄 조회
  const hist: Record<string, { cnt: number; last: string | null }> = {};
  const priceMap: Record<string, { vendor: string; price: number | null }[]> = {};
  if (matchedIds.length) {
    const [histRes, vpRes, vssRes] = await Promise.all([
      supabase.from("order_items").select("product_id, orders(order_date)").in("product_id", matchedIds),
      supabase.from("vendor_products").select("product_id, unit_price, vendor:vendors(name)").in("product_id", matchedIds),
      supabase.from("vendor_supply_status").select("product_id, vendor:vendors(name)").in("product_id", matchedIds),
    ]);
    for (const r of (histRes.data as unknown as { product_id: string; orders: { order_date: string } | null }[]) || []) {
      if (!r.product_id) continue;
      const h = (hist[r.product_id] ||= { cnt: 0, last: null });
      h.cnt += 1;
      const d = r.orders?.order_date ?? null;
      if (d && (!h.last || d > h.last)) h.last = d;
    }
    const blocked = new Set<string>();
    for (const s of (vssRes.data as unknown as { product_id: string; vendor: { name: string } | null }[]) || []) {
      if (s.vendor?.name) blocked.add(`${s.product_id}:${s.vendor.name}`);
    }
    for (const r of (vpRes.data as unknown as { product_id: string; unit_price: number | null; vendor: { name: string } | null }[]) || []) {
      const vn = r.vendor?.name ?? "?";
      if (blocked.has(`${r.product_id}:${vn}`)) continue;
      (priceMap[r.product_id] ||= []).push({ vendor: vn, price: r.unit_price });
    }
    for (const k in priceMap) priceMap[k].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  }

  const lines = glines.map((l) => {
    // 이력 많은 순으로 후보 재정렬
    const candidates = l.match_indices
      .map((i) => cat[i])
      .filter(Boolean)
      .map((p) => ({ id: p.id, name: p.name, spec: p.spec, cnt: hist[p.id]?.cnt ?? 0, last: hist[p.id]?.last ?? null }))
      .sort((a, b) => b.cnt - a.cnt);

    const top = candidates[0];
    const topCnt = top?.cnt ?? 0;
    const totalCnt = candidates.reduce((s, c) => s + c.cnt, 0);

    let confidence = 0;
    let reason = "";
    let autoMatch = false;
    let note = l.note;
    if (top && topCnt > 0) {
      confidence = Math.min(98, Math.max(55, Math.round((topCnt / Math.max(totalCnt, 1)) * 100)));
      reason = `이력 ${topCnt}건 · 최근 ${fmtDate(top.last)}`;
      autoMatch = true;
      if (topCnt >= 2 && confidence >= 70) note = ""; // 이력으로 확정되면 모호 플래그 해제
    } else if (top) {
      confidence = 45;
      reason = "이름 매칭 · 이력 없음";
      autoMatch = false;
    } else {
      confidence = 0;
      reason = "카탈로그에 없음(신규)";
    }

    const best = top ? priceMap[top.id]?.[0] : undefined;
    return {
      raw_name: l.raw_name,
      quantity: l.quantity,
      unit: l.unit,
      purpose: l.purpose,
      confidence,
      reason,
      note,
      candidates: candidates.map((c) => ({ id: c.id, name: c.name, spec: c.spec })),
      product_id: autoMatch && top ? top.id : "",
      best_vendor: best ? best.vendor : null,
      best_price: best ? best.price : null,
      sourceable: top ? (priceMap[top.id]?.length ?? 0) > 0 : false,
    };
  });

  return NextResponse.json({ lines });
}

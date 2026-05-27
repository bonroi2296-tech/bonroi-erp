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
  confidence: "high" | "medium" | "low";
  note: string;
}

const SYS = `너는 의료소모품 유통사의 주문 접수 보조자다. 입력(병원 주문 메시지/이미지)과 [카탈로그]를 받아,
주문 품목을 추출하고 각 품목을 카탈로그의 구체 품목에 매칭한다. JSON 배열만 출력한다.

각 원소: {"raw_name","quantity","unit","purpose","match_indices","confidence","note"}
- raw_name: 적힌 품목명 그대로(창작 금지)
- quantity: 숫자만. 불명확하면 1
- unit: 단위(개/박스/통/봉지/매/box 등). 없으면 ""
- match_indices: 카탈로그에서 맞는 품목 번호를 가능성 높은 순으로 최대 3개. 없으면 []
- confidence: 단일 품목으로 확정되면 "high", 후보 여럿이면 "medium", 카탈로그에 없거나 불확실하면 "low"
- note: 사람이 확인해야 할 모호점만 짧게. 예: "게이지 미지정(23G/21G 중 확인)", "알콜솜 매수 미지정(100/200/400)", "카탈로그에 없음(신규)". 없으면 ""

규칙:
- 규격(cc·게이지·사이즈·매수)이 입력에 없으면 추측하지 말고 후보를 여러 개 담고 note에 "확인" 표기.
- 제조사가 입력에 없고 카탈로그에 동일 규격이 한 제조사뿐이면 그걸 high로.
- 배송지·인사말은 품목이 아니므로 제외.
- 반드시 JSON 배열만. 코드펜스·설명 금지.`;

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
    confidence: ["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low",
    note: String(r.note ?? "").trim(),
  })).filter((r) => r.raw_name);
}

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

  // 카탈로그 적재 (매칭용)
  const { data: products } = await supabase.from("products").select("id, name, spec").order("name");
  const cat = (products as { id: string; name: string; spec: string | null }[]) || [];
  const catalogText = cat.map((p, i) => `${i}: ${p.name}${p.spec ? ` (${p.spec})` : ""}`).join("\n");

  // Gemini 추출 + 매칭
  let glines: GLine[] = [];
  try {
    const ai = new GoogleGenAI({ apiKey });
    const parts: Array<Record<string, unknown>> = [
      { text: SYS },
      { text: `\n[카탈로그]\n${catalogText}` },
    ];
    if (text?.trim()) parts.push({ text: `\n[주문 입력]\n${text.trim()}` });
    if (imageBase64) parts.push({ inlineData: { mimeType: imageMimeType || "image/png", data: imageBase64 } });
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      config: { responseMimeType: "application/json", temperature: 0 },
    });
    glines = extractJson(res.text ?? "");
  } catch (e) {
    return NextResponse.json({ error: "AI 분석 실패: " + (e instanceof Error ? e.message : String(e)) }, { status: 502 });
  }

  // 매칭 품목들의 거래처/최저가/공급상태 일괄 조회
  const matchedIds = Array.from(
    new Set(glines.flatMap((l) => l.match_indices.map((i) => cat[i]?.id).filter(Boolean)))
  ) as string[];
  const priceMap: Record<string, { vendor: string; price: number | null }[]> = {};
  const blocked = new Set<string>();
  if (matchedIds.length) {
    const [vpRes, vssRes] = await Promise.all([
      supabase.from("vendor_products").select("product_id, unit_price, vendor:vendors(name)").in("product_id", matchedIds),
      supabase.from("vendor_supply_status").select("product_id, vendor_id, vendor:vendors(name)").in("product_id", matchedIds),
    ]);
    for (const s of (vssRes.data as unknown as { product_id: string; vendor: { name: string } | null }[]) || []) {
      if (s.vendor?.name) blocked.add(`${s.product_id}:${s.vendor.name}`);
    }
    for (const r of (vpRes.data as unknown as { product_id: string; unit_price: number | null; vendor: { name: string } | null }[]) || []) {
      const vn = r.vendor?.name ?? "?";
      if (blocked.has(`${r.product_id}:${vn}`)) continue; // 품절/중단 제외
      (priceMap[r.product_id] ||= []).push({ vendor: vn, price: r.unit_price });
    }
    for (const k in priceMap) priceMap[k].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  }

  const lines = glines.map((l) => {
    const candidates = l.match_indices
      .map((i) => cat[i])
      .filter(Boolean)
      .map((p) => ({ id: p.id, name: p.name, spec: p.spec }));
    const top = candidates[0];
    const best = top ? priceMap[top.id]?.[0] : undefined;
    return {
      raw_name: l.raw_name,
      quantity: l.quantity,
      unit: l.unit,
      purpose: l.purpose,
      confidence: l.confidence,
      note: l.note,
      candidates,
      product_id: l.confidence === "high" && top ? top.id : "",
      best_vendor: best ? best.vendor : null,
      best_price: best ? best.price : null,
      sourceable: top ? (priceMap[top.id]?.length ?? 0) > 0 : false,
    };
  });

  return NextResponse.json({ lines });
}

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

  let body: { text?: string; imageBase64?: string; imageMimeType?: string; branchId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const { text, imageBase64, imageMimeType, branchId } = body;
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

  // 지점 결정: 수동 선택 우선, 없으면 주문 텍스트에서 지점명 자동 감지(예: "광명점"→광명면력한방병원)
  const { data: branchRows } = await supabase.from("branches").select("id, name").order("name");
  const allBranches = (branchRows as { id: string; name: string }[]) || [];
  const normTxt = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "");
  const branchStem = (s: string) =>
    normTxt(s).replace(/(면력)?한방병원$/, "").replace(/병원$/, "").replace(/(지점|점)$/, "");
  let resolvedBranch: { id: string; name: string } | null = null;
  if (branchId) resolvedBranch = allBranches.find((b) => b.id === branchId) ?? null;
  if (!resolvedBranch && text?.trim()) {
    const t = normTxt(text);
    const byStem = allBranches
      .map((b) => ({ b, stem: branchStem(b.name) }))
      .filter((x) => x.stem.length >= 2)
      .sort((a, b) => b.stem.length - a.stem.length);
    for (const { b, stem } of byStem) {
      if (t.includes(stem)) { resolvedBranch = b; break; }
    }
    if (!resolvedBranch) {
      for (const b of allBranches) {
        if (normTxt(b.name) && t.includes(normTxt(b.name))) { resolvedBranch = b; break; }
      }
    }
  }
  const resolvedBranchId = resolvedBranch?.id ?? null;

  let glines: GLine[] = [];
  try {
    const ai = new GoogleGenAI({ apiKey });
    const base: Array<Record<string, unknown>> = [
      { text: SYS },
      { text: `\n[카탈로그]\n${catalogText}` },
    ];

    // 빠른 모델 우선(thinking 끔). 과부하 시 즉시 폴백(sleep 없음).
    const genOnce = async (parts: Array<Record<string, unknown>>): Promise<string> => {
      const models = ["gemini-2.0-flash", "gemini-2.5-flash"];
      let lastErr: unknown = null;
      for (const model of models) {
        try {
          const cfg: Record<string, unknown> = { responseMimeType: "application/json", temperature: 0 };
          if (model.includes("2.5")) cfg.thinkingConfig = { thinkingBudget: 0 };
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

    if (imageBase64) {
      const parts = [...base];
      if (text?.trim()) parts.push({ text: `\n[주문 입력]\n${text.trim()}` });
      parts.push({ inlineData: { mimeType: imageMimeType || "image/png", data: imageBase64 } });
      glines = extractJson(await genOnce(parts));
    } else {
      // 긴 주문은 줄 단위로 쪼개 병렬 처리(10초 함수 제한 대응)
      const allLines = (text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const CH = 18;
      const chunks: string[] = [];
      for (let i = 0; i < allLines.length; i += CH) chunks.push(allLines.slice(i, i + CH).join("\n"));
      if (chunks.length === 0) chunks.push(text || "");
      const results = await Promise.all(
        chunks.map((c) => genOnce([...base, { text: `\n[주문 입력]\n${c}` }]))
      );
      glines = results.flatMap((t) => extractJson(t));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const friendly = /(503|UNAVAILABLE|overload|high demand|429|RESOURCE_EXHAUSTED)/i.test(msg)
      ? "Gemini가 지금 과부하예요. 잠시 후 'AI 분석'을 다시 눌러주세요."
      : "AI 분석에 실패했어요. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ error: friendly }, { status: 502 });
  }

  const matchedIds = Array.from(
    new Set(glines.flatMap((l) => l.match_indices.map((i) => cat[i]?.id).filter(Boolean)))
  ) as string[];

  // 주문 이력(지점별 + 전지점) + 거래처가/공급상태 일괄 조회
  const histBranch: Record<string, { cnt: number; last: string | null }> = {};
  const histAll: Record<string, { cnt: number; last: string | null }> = {};
  const priceMap: Record<string, { vendor: string; price: number | null }[]> = {};
  try {
  if (matchedIds.length) {
    const [histRes, vpRes, vssRes] = await Promise.all([
      supabase.from("order_items").select("product_id, orders(order_date, branch_id)").in("product_id", matchedIds),
      supabase.from("vendor_products").select("product_id, unit_price, vendor:vendors(name)").in("product_id", matchedIds),
      supabase.from("vendor_supply_status").select("product_id, vendor:vendors(name)").in("product_id", matchedIds),
    ]);
    for (const r of (histRes.data as unknown as { product_id: string; orders: { order_date: string; branch_id: string | null } | null }[]) || []) {
      if (!r.product_id) continue;
      const d = r.orders?.order_date ?? null;
      const ha = (histAll[r.product_id] ||= { cnt: 0, last: null });
      ha.cnt += 1;
      if (d && (!ha.last || d > ha.last)) ha.last = d;
      if (resolvedBranchId && r.orders?.branch_id === resolvedBranchId) {
        const hb = (histBranch[r.product_id] ||= { cnt: 0, last: null });
        hb.cnt += 1;
        if (d && (!hb.last || d > hb.last)) hb.last = d;
      }
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
  } catch {
    // 이력/거래처 조회 실패는 무시하고 추출 결과만 반환
  }

  const branchName = resolvedBranch?.name ?? "";
  const lines = glines.map((l) => {
    // 선택 지점 이력 우선, 동률·없으면 전지점 이력 순으로 후보 재정렬
    const candidates = l.match_indices
      .map((i) => cat[i])
      .filter(Boolean)
      .map((p) => ({
        id: p.id,
        name: p.name,
        spec: p.spec,
        bcnt: histBranch[p.id]?.cnt ?? 0,
        blast: histBranch[p.id]?.last ?? null,
        gcnt: histAll[p.id]?.cnt ?? 0,
        glast: histAll[p.id]?.last ?? null,
      }))
      .sort((a, b) => b.bcnt - a.bcnt || b.gcnt - a.gcnt);

    const top = candidates[0];

    let confidence = 0;
    let reason = "";
    let autoMatch = false;
    let note = l.note;
    if (top && top.bcnt > 0) {
      const totalB = candidates.reduce((s, c) => s + c.bcnt, 0);
      confidence = Math.min(98, Math.max(60, Math.round((top.bcnt / Math.max(totalB, 1)) * 100)));
      reason = `${branchName || "지점"} ${top.bcnt}건 · 최근 ${fmtDate(top.blast)}`;
      autoMatch = true;
      if (top.bcnt >= 2 && confidence >= 70) note = ""; // 지점 이력으로 확정되면 모호 플래그 해제
    } else if (top && top.gcnt > 0) {
      const totalG = candidates.reduce((s, c) => s + c.gcnt, 0);
      confidence = Math.min(90, Math.max(50, Math.round((top.gcnt / Math.max(totalG, 1)) * 100)));
      reason = `전지점 ${top.gcnt}건 · 최근 ${fmtDate(top.glast)}`;
      autoMatch = true;
      if (top.gcnt >= 2 && confidence >= 70) note = "";
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

  return NextResponse.json({ lines, detectedBranch: resolvedBranch });
}

import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ParsedLine {
  raw_name: string;
  quantity: number;
  unit: string;
  purpose: string;
}

const PROMPT = `너는 의료소모품 유통사의 주문 접수 보조자다.
아래 입력(병원에서 온 주문 메시지 또는 주문서 이미지)에서 주문 품목을 추출해 JSON으로만 반환하라.

규칙:
- 각 품목을 {"raw_name","quantity","unit","purpose"} 로 추출.
- raw_name: 적힌 품목명 그대로(추측·창작 금지). 규격/사이즈가 이름에 섞여 있으면 그대로 둔다.
- quantity: 숫자만(예: "5박스"->5). 수량 불명확하면 1.
- unit: 단위 문자열(개/박스/통/봉지/매/박스/ea/box 등). 없으면 "".
- purpose: 용도/비고가 있으면, 없으면 "".
- 배송지·인사말·요청문구는 품목이 아니므로 제외.
- 반드시 JSON 배열만 출력. 설명·코드펜스 금지.

예) "알콜스왑 30통, 5cc 주사기 5박스" ->
[{"raw_name":"알콜스왑","quantity":30,"unit":"통","purpose":""},{"raw_name":"5cc 주사기","quantity":5,"unit":"박스","purpose":""}]`;

function extractJson(t: string): ParsedLine[] {
  let s = t.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  const arr = JSON.parse(s.slice(start, end + 1));
  if (!Array.isArray(arr)) return [];
  return arr.map((r) => ({
    raw_name: String(r.raw_name ?? "").trim(),
    quantity: Number(r.quantity) || 0,
    unit: String(r.unit ?? "").trim(),
    purpose: String(r.purpose ?? "").trim(),
  })).filter((r) => r.raw_name);
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY 미설정" }, { status: 500 });
  }

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

  // 1) Gemini 추출
  let lines: ParsedLine[] = [];
  try {
    const ai = new GoogleGenAI({ apiKey });
    const parts: Array<Record<string, unknown>> = [{ text: PROMPT }];
    if (text?.trim()) parts.push({ text: `\n[주문 입력]\n${text.trim()}` });
    if (imageBase64) {
      parts.push({
        inlineData: { mimeType: imageMimeType || "image/png", data: imageBase64 },
      });
    }
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      config: { responseMimeType: "application/json", temperature: 0 },
    });
    lines = extractJson(res.text ?? "");
  } catch (e) {
    return NextResponse.json(
      { error: "파싱 실패: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 }
    );
  }

  // 2) 카탈로그 후보 매칭 (결정적, 토큰 ilike)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = url && anon ? createClient(url, anon) : null;

  const result = [];
  for (const line of lines) {
    let candidates: { id: string; name: string; spec: string | null }[] = [];
    if (supabase) {
      const tokens = line.raw_name
        .split(/[\s,()]+/)
        .map((t) => t.replace(/[%_]/g, ""))
        .filter((t) => t.length >= 2)
        .sort((a, b) => b.length - a.length)
        .slice(0, 2);
      if (tokens.length) {
        const orExpr = tokens.map((t) => `name.ilike.%${t}%`).join(",");
        const { data } = await supabase
          .from("products")
          .select("id, name, spec")
          .or(orExpr)
          .limit(6);
        candidates = (data as typeof candidates) || [];
      }
    }
    result.push({ ...line, candidates });
  }

  return NextResponse.json({ lines: result });
}

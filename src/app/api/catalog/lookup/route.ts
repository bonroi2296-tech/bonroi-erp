import { NextResponse } from "next/server";

export const runtime = "nodejs";

// 식약처 의료기기 UDI/EDI 정보 조회 (공공데이터포털 15138675).
// EDI 코드/UDI 코드/품목명 중 하나로 조회 → 정규화된 결과 반환.
//
// 환경변수:
//  - EDI_API_KEY   : 공공데이터포털 일반 인증키(디코딩 키 권장; 인코딩 키도 자동 처리)
//  - EDI_API_URL   : 엔드포인트 전체 URL (기본값은 가장 가능성 큰 패턴, 명세서 보고 조정)
//
// 응답: { ok: true, items: [...] } 또는 { ok: false, error: "..." }

// data.go.kr 데이터 ID 15138675(의료기기 UDI/EDI 정보 조회 서비스) — Swagger anchor 의 operation 이름 단서.
const DEFAULT_URL = "http://apis.data.go.kr/1471000/MdvUdiInfoService/getMdvUdiInfo";

type AnyObj = Record<string, unknown>;

function pick(o: AnyObj, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

// 공공데이터포털 키는 보통 디코딩 키(원본)인데, 사용자가 인코딩 키(예: %2B, %3D 포함)를 줄 수도 있다.
// 둘 다 안전하게 처리: 이미 % 인코딩이 들어 있으면 그대로, 아니면 URL 인코딩한다.
function serviceKey(raw: string): string {
  return /%[0-9A-Fa-f]{2}/.test(raw) ? raw : encodeURIComponent(raw);
}

export async function GET(request: Request) {
  const key = process.env.EDI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "EDI_API_KEY 환경변수가 설정되지 않았습니다. Vercel Settings → Environment Variables 에 추가하세요." },
      { status: 503 }
    );
  }
  const base = process.env.EDI_API_URL || DEFAULT_URL;
  const { searchParams } = new URL(request.url);
  const edi = (searchParams.get("edi") || "").trim();
  const udi = (searchParams.get("udi") || "").trim();
  const name = (searchParams.get("name") || "").trim();
  if (!edi && !udi && !name) {
    return NextResponse.json({ ok: false, error: "edi / udi / name 중 하나는 필요해요." }, { status: 400 });
  }

  // 데이터포털 공통 파라미터
  const params = new URLSearchParams({
    serviceKey: serviceKey(key),
    pageNo: "1",
    numOfRows: "10",
    type: "json",
    _type: "json",
  });
  // 검색 키 — 공공 API마다 파라미터명이 다를 수 있어 흔한 표기를 다 보냄(API는 모르는 건 무시)
  if (edi) {
    params.set("ediCd", edi);
    params.set("ediCode", edi);
  }
  if (udi) {
    params.set("udidiCd", udi);
    params.set("udiDi", udi);
  }
  if (name) {
    params.set("prdlstNm", name);
    params.set("prdtNm", name);
  }

  const url = `${base}?${params.toString()}`;
  let raw: unknown;
  try {
    const r = await fetch(url, { cache: "no-store" });
    const text = await r.text();
    try {
      raw = JSON.parse(text);
    } catch {
      // XML 응답일 경우 — 그대로 텍스트를 디버그용으로 돌려줌
      return NextResponse.json({
        ok: false,
        error: "API가 JSON으로 응답하지 않았어요. EDI_API_URL 또는 type=json 지원 여부 확인.",
        debug: { url: base, status: r.status, body: text.slice(0, 500) },
      }, { status: 502 });
    }
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "네트워크 오류",
    }, { status: 502 });
  }

  // 다양한 응답 구조 흡수
  const r = raw as AnyObj;
  const body = ((r.response as AnyObj)?.body as AnyObj) || (r.body as AnyObj) || r;
  const itemsRaw =
    (body.items as AnyObj)?.item ||
    body.item ||
    body.items ||
    [];
  const list: AnyObj[] = Array.isArray(itemsRaw) ? itemsRaw : itemsRaw ? [itemsRaw] : [];

  const items = list.map((it) => ({
    name: pick(it, "prdtNm", "prdlstNm", "itemName", "productName"),
    model: pick(it, "modlNm", "modelName"),
    spec: pick(it, "specNm", "specInfo", "spec"),
    grade: pick(it, "grade", "gradeNm"),
    manufacturer: pick(it, "mnftrName", "manufacturerName", "imptrName"),
    permit_no: pick(it, "permitNo", "lcnsNo", "prmsNo"),
    udi_di: pick(it, "udidiCd", "udiDi", "udiCd"),
    edi_code: pick(it, "ediCd", "ediCode", "insuClsNo"),
    raw: it,
  }));

  return NextResponse.json({ ok: true, count: items.length, items, source: { url: base } });
}

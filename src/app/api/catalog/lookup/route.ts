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

// 공공데이터포털 키 표준화 — 인코딩 키든 디코딩 키든 "디코딩 형태(원본)"로 통일.
// 이후 URLSearchParams 가 알아서 한 번만 인코딩하므로 %252B 같은 이중 인코딩을 방지.
function serviceKey(raw: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(raw)) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
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
  // 검색 키 — 응답 필드(UPPERCASE_UNDER) 기준 lowerCamel 이름.
  if (edi) {
    params.set("careSalCdInptVal", edi); // CARE_SAL_CD_INPT_VAL (요양급여 EDI 코드)
    params.set("ediCd", edi);
  }
  if (udi) {
    params.set("udidiCd", udi); // UDIDI_CD
  }
  if (name) {
    params.set("prdtNmCont", name); // PRDT_NM_CONT (제품명)
    params.set("prdlstNm", name);   // PRDLST_NM (품목분류명)
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

  // 식약처 응답 필드(대문자_언더스코어) 매핑.
  // PRDLST_NM=품목분류명, PRDT_NM_CONT=구체적 제품명, BIZ_IPLA_NM=업체, MDEQ_PRDLST_SN=허가번호,
  // UDI_MODL_NM_SN=모델일련번호, UDIDI_CD=UDI-DI, CLSF_GRAD_CD=등급, CARE_SAL_CD_INPT_VAL=요양급여(EDI)코드
  const items = list.map((it) => ({
    name: pick(it, "PRDT_NM_CONT", "PRDLST_NM", "prdtNm", "prdlstNm"),
    model: pick(it, "UDI_MODL_NM_SN", "MDL_NM", "modlNm"),
    spec: pick(it, "PRDLST_NM", "specNm"),
    grade: pick(it, "CLSF_GRAD_CD", "grade"),
    manufacturer: pick(it, "BIZ_IPLA_NM", "MNFTR_NM", "mnftrName"),
    permit_no: pick(it, "MDEQ_PRDLST_SN", "PRMS_NO", "permitNo"),
    udi_di: pick(it, "UDIDI_CD", "udidiCd"),
    edi_code: pick(it, "CARE_SAL_CD_INPT_VAL", "ediCd"),
    raw: it,
  }));

  return NextResponse.json({ ok: true, count: items.length, items, source: { url: base } });
}

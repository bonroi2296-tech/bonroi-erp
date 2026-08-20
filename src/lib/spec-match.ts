// 규격 비교 도우미.
// 왜: 이름이 같고 규격만 다른 형제 제품이 많다(메디폼 5mm 10*10 ↔ 20*20 은 가격이 4배).
// 규격을 안 보고 이력 건수만으로 고르면 엉뚱한 형제의 단가가 그대로 붙는다.

export type SpecClass = "dim" | "count" | "length" | "gauge" | "volume" | "size" | "code" | "type";

export interface SpecToken {
  cls: SpecClass;
  value: string;
}

// 규격을 가르는 변형어. 괄호 안에 자주 들어간다(수액세트 무침/Y타입, 알콜솜 벌크형/박스형).
const TYPE_WORDS = ["무침", "유침", "y타입", "벌크형", "박스형", "카톤", "살색", "투명"];

const COUNT_UNITS = "매|쌈|조|개|입|ea|pcs|pc|박스|box|통";
const LEN_UNITS = "mm|cm|인치|inch|m";
const VOL_UNITS = "cc|ml";

const clean = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
// 8 과 8.0 은 같은 규격이다(협성 엔도튜브에 둘 다 있음).
const num = (s: string) => String(parseFloat(s));

/** 문자열에서 규격 토큰을 뽑는다. 이름·spec 어디에 적혀 있든 같은 방식으로 처리한다. */
export function specTokens(input: string): SpecToken[] {
  const s = clean(input);
  const out: SpecToken[] = [];
  const push = (cls: SpecClass, value: string) => {
    if (!out.some((t) => t.cls === cls && t.value === value)) out.push({ cls, value });
  };

  // 치수쌍(10*10, 7.5cm * 7.5cm). 양쪽이 순수 숫자일 때만 — "400매 * 24ea" 는 카톤 수량이라 제외.
  const dimRe = /(\d+(?:\.\d+)?)\s*(?:cm|mm)?\s*[*x×]\s*(\d+(?:\.\d+)?)\s*(?:cm|mm)?/g;
  for (const m of Array.from(s.matchAll(dimRe))) {
    const before = s.slice(Math.max(0, m.index - 2), m.index);
    if (/[가-힣a-z]$/.test(before)) continue;
    push("dim", `${num(m[1])}x${num(m[2])}`);
  }

  // \b 는 한글 뒤에서 경계로 안 잡힌다("200매" 가 통째로 누락됨). 영숫자만 막는다.
  const END = "(?![0-9a-z])";
  for (const m of Array.from(s.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${COUNT_UNITS})${END}`, "g")))) {
    push("count", `${num(m[1])}${/box|박스/.test(m[2]) ? "box" : m[2] === "개" || m[2] === "입" || m[2] === "pcs" || m[2] === "pc" ? "ea" : m[2]}`);
  }
  for (const m of Array.from(s.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${LEN_UNITS})${END}`, "g")))) {
    push("length", `${num(m[1])}${m[2] === "inch" ? "인치" : m[2]}`);
  }
  for (const m of Array.from(s.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${VOL_UNITS})${END}`, "g")))) {
    push("volume", `${num(m[1])}cc`);
  }
  // 게이지는 대문자 G 로만 인식한다. 소문자 g 는 무게(성광 서지젤 100g).
  for (const m of Array.from((input || "").matchAll(/(\d+(?:\.\d+)?)\s*G\b/g))) push("gauge", `${num(m[1])}g`);

  // 괄호 안 숫자만 있는 것 = 사이즈(더블세이프 글러브(7.5)).
  for (const m of Array.from(s.matchAll(/\(\s*(\d+(?:\.\d+)?)\s*\)/g))) push("size", num(m[1]));
  // spec 칸 전체가 숫자 하나뿐인 경우(협성 엔도튜브 "7.5").
  if (/^\d+(?:\.\d+)?$/.test(s)) push("size", num(s));

  // 코드형(브라운 커버 PC200/LF20, 후두경 MAC3/MAC4).
  for (const m of Array.from(s.matchAll(/\b([a-z]{2,4})\s*-?\s*(\d{1,3})\b/g))) push("code", `${m[1]}${m[2]}`);

  for (const w of TYPE_WORDS) if (s.includes(w)) push("type", w);

  return out;
}

/**
 * 주문 줄에 적힌 규격 토큰. 수량으로 적힌 숫자는 규격이 아니므로 뺀다.
 * 예) "알콜솜 100매" 를 100개 주문한 것이면 100매는 수량이지 규격이 아니다.
 */
export function orderSpecTokens(rawName: string, quantity?: number, unit?: string): SpecToken[] {
  const tokens = specTokens(rawName);
  if (!quantity || quantity <= 0) return tokens;
  const u = clean(unit || "");
  return tokens.filter((t) => {
    if (t.cls !== "count") return true;
    if (parseFloat(t.value) !== quantity) return true;
    // 숫자가 주문 수량과 같다. 단위까지 맞으면 규격이 아니라 수량으로 본다.
    const tUnit = t.value.replace(/^[\d.]+/, "");
    return !(u === "" || u === tUnit || u.includes(tUnit) || tUnit.includes(u));
  });
}

export type SpecRelation = "match" | "conflict" | "unknown";

/**
 * 주문 줄 규격과 제품 규격의 관계.
 * - match: 같은 종류의 규격이 있고 값이 겹친다
 * - conflict: 같은 종류의 규격이 있는데 값이 하나도 안 겹친다 → 다른 형제다
 * - unknown: 비교할 근거가 없다
 */
export function specRelation(orderTokens: SpecToken[], productTokens: SpecToken[]): SpecRelation {
  if (orderTokens.length === 0 || productTokens.length === 0) return "unknown";
  let matched = false;
  for (const cls of Array.from(new Set(orderTokens.map((t) => t.cls)))) {
    const o = orderTokens.filter((t) => t.cls === cls).map((t) => t.value);
    const p = productTokens.filter((t) => t.cls === cls).map((t) => t.value);
    if (p.length === 0) continue;
    // 한 종류라도 어긋나면 다른 형제다. 다른 종류가 맞아떨어져도 뒤집지 않는다
    // (메디폼은 5mm 가 공통이고 10*10 / 20*20 만 다르다).
    if (o.some((v) => p.includes(v))) matched = true;
    else return "conflict";
  }
  return matched ? "match" : "unknown";
}

/** 제품(이름+규격)의 규격 토큰. 규격이 괄호 안 이름에 적힌 경우가 많아 둘 다 본다. */
export function productSpecTokens(name: string, spec: string | null): SpecToken[] {
  return specTokens(`${name || ""} ${spec || ""}`);
}

/** 형제 중 최고가가 최저가의 몇 배 이상이면 사람에게 물어볼지. */
export const AMBIGUOUS_PRICE_RATIO = 1.5;

/** 규격이 서로 다른 형제가 이만큼 이상이면 "여러 개"로 본다. */
export const AMBIGUOUS_MIN_SIBLINGS = 2;

/**
 * 규격으로 형제를 못 좁혔고(후보 2개 이상) 값 차이가 크면 사람에게 물어본다.
 * prices: 규격이 어긋나지 않아 아직 후보로 남은 형제들의 대표 단가.
 */
export function shouldAskSpec(prices: (number | null)[]): boolean {
  if (prices.length < AMBIGUOUS_MIN_SIBLINGS) return false;
  const known = prices.filter((v): v is number => v != null && v > 0);
  if (known.length < 2) return false;
  return Math.max(...known) / Math.min(...known) >= AMBIGUOUS_PRICE_RATIO;
}

// 지점·거래처 가시성용 칩 색상.
// 같은 이름 → 항상 같은 색을 보장(이름 해시 기반 폴백).
// 자주 쓰이는 곳은 고정 매핑으로 유지보수 가독성 확보.

export const BRANCH_COLORS: Record<string, string> = {
  강서: "bg-sky-200 text-sky-900",
  광명: "bg-violet-200 text-violet-900",
  성동: "bg-orange-200 text-orange-900",
  신촌: "bg-emerald-200 text-emerald-900",
};

export const VENDOR_COLORS: Record<string, string> = {
  주사기닷컴: "bg-red-200 text-red-900",
  한백상사: "bg-blue-200 text-blue-900",
  SD바이오: "bg-fuchsia-200 text-fuchsia-900",
  디에치몰: "bg-amber-200 text-amber-900",
  디에이치몰: "bg-indigo-200 text-indigo-900",
  케이엠몰: "bg-teal-200 text-teal-900",
  메디오션: "bg-pink-200 text-pink-900",
  허브원: "bg-lime-200 text-lime-900",
  수진메디칼: "bg-rose-200 text-rose-900",
  안진도매로: "bg-cyan-200 text-cyan-900",
  기타: "bg-gray-200 text-gray-800",
};

// 미등록 이름 폴백 — 위 두 맵 색과 가급적 겹치지 않는 잔여 톤.
const FALLBACK_PALETTE = [
  "bg-red-200 text-red-900",
  "bg-amber-200 text-amber-900",
  "bg-lime-200 text-lime-900",
  "bg-teal-200 text-teal-900",
  "bg-cyan-200 text-cyan-900",
  "bg-blue-200 text-blue-900",
  "bg-indigo-200 text-indigo-900",
  "bg-fuchsia-200 text-fuchsia-900",
  "bg-pink-200 text-pink-900",
  "bg-rose-200 text-rose-900",
];

export function chipColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

export function branchColor(name: string): string {
  return BRANCH_COLORS[name] ?? chipColor(name);
}

export function vendorColor(name: string): string {
  return VENDOR_COLORS[name] ?? chipColor(name);
}

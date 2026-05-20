// 통화/숫자 표시 공통 포맷터

export function formatCurrency(value: number | null | undefined): string {
  return `₩${(value ?? 0).toLocaleString("ko-KR")}`;
}

export function formatNumber(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("ko-KR");
}

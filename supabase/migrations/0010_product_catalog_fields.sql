-- 제품 상세(쇼핑몰형 카탈로그) 베이스 필드.
-- 거래처 사이트가 부실하고 박스당 수량 미표기 문제 대응을 위해,
-- 사진 URL, 박스당 수량/단위, 짧은 설명을 우리 마스터에 누적해 둔다.
-- 채우는 방법은 A(우리 촬영/명세서 누적) · B(스크래핑) · C(식약처) 혼합 예정.
alter table public.products
  add column if not exists image_url text,
  add column if not exists pack_size numeric,
  add column if not exists pack_unit text,
  add column if not exists description text;

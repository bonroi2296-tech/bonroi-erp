-- 소싱 품목별 납품가(병원가) 덮어쓰기 값.
-- null 이면 품목마스터(products.supply_price)를 기본값으로 사용한다.
-- 병원·시기마다 납품가가 달라 건마다 손수정할 수 있게 한다.
-- (주문↔소싱 일원화 1단계: 소싱이 주문관리의 '납품가 직접입력'을 대체)
alter table public.demand_lines
  add column if not exists supply_price numeric;

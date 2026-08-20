-- 원본 구글시트 "단가비교" 표와 ERP 단가 동기화.
--
-- 대조 결과: 이미 거의 일치했다.
--   납품가(products.supply_price)      : 160개 매칭 중 159개 일치
--   매입가(vendor_products.unit_price) : 397개 매칭 중 396개 일치
-- 실제로 어긋난 것만 여기서 맞춘다.
--
-- 보류(여기서 건드리지 않음):
--  · 필텍 일회용 인슐린 주사기 0.5cc 31G 납품가 — ERP 12,000 / 시트 9,300.
--    시트 값이 수진메디칼 '매입가'(9,300)와 똑같아 시트 쪽 오기로 보인다. ERP 유지.
--  · BD 인슐린 주사기 1cc 31G, 8mm · 디에이치몰 — 시트도 1(=단가 미확인 표시)이고
--    ERP 는 NULL(화면 "/")이라 이미 같은 뜻이다.

-- 1) 성광 서지젤 100g · 주사기닷컴 매입가 2,690 → 2,520
update vendor_products vp
set unit_price = 2520, last_updated = now()
from products p, vendors v
where p.id = vp.product_id and v.id = vp.vendor_id
  and p.name = '성광 서지젤(루브겔/외과젤) 100g' and p.spec = '1'
  and v.name = '주사기닷컴'
  and vp.unit_price is distinct from 2520;

-- 2) 다나 일회용스프링침 0.18×30 mm 1000쌈 · 허브원 매입가 140,000 신규 등록
--    (제품은 있는데 허브원 단가만 빠져 있었다)
insert into vendor_products (product_id, vendor_id, unit_price)
select p.id, v.id, 140000
from products p, vendors v
where p.name = '다나 일회용스프링침 0.18×30 mm' and p.spec = '1000쌈'
  and v.name = '허브원'
  and not exists (
    select 1 from vendor_products vp
    where vp.product_id = p.id and vp.vendor_id = v.id
  );

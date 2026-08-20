-- SH2608-050(2026-08-11 신촌 · 주사기닷컴) 납품단가 오류 정정.
--
-- 증상: 8개 품목 모두 납품'단가' 칸에 그 줄의 '총매입액'이 들어가 있었다.
--       그 값이 다시 수량으로 곱해져 공급가액이 수량배(최대 8배)로 부풀었다.
--       예) BD 정맥카테터24G 8개 · 매입단가 15,290 → 총매입 122,320
--           납품단가도 122,320 이 되어 공급가액 978,560 (정상은 17,920 × 8 = 143,360)
--       이 한 건 때문에 신촌 지점 마진율이 85% 로 튀었다(다른 지점 약 25%).
--
-- 정정 기준: 제품 마스터(products.supply_price). PO 가 확인해준 BD 정맥카테터24G 17,920 이
--            제품 마스터 값과 정확히 일치했고, 8개 중 6개는 과거 주문 납품단가와도 같다.
--            원본 구글시트에는 이 주문이 없어 다른 근거가 없다.
--
-- 결과: 공급가액 2,640,600 → 498,160 / 마진 2,261,926 → 119,486 (24.0%)

update order_items oi
set supply_price    = p.supply_price,
    total_supply    = p.supply_price * oi.quantity,
    supply_vat      = round(p.supply_price * oi.quantity * 0.1),
    billed_amount   = p.supply_price * oi.quantity + round(p.supply_price * oi.quantity * 0.1),
    purchase_supply = round(oi.total_purchase / 1.1),
    purchase_vat    = oi.total_purchase - round(oi.total_purchase / 1.1),
    margin          = p.supply_price * oi.quantity - round(oi.total_purchase / 1.1)
from products p, orders o
where p.id = oi.product_id
  and o.id = oi.order_id
  and o.order_number = 'SH2608-050'
  and p.supply_price is not null;

-- 주문 단위 합계도 품목에서 다시 계산
update orders o
set total_purchase_amount = s.purchase,
    total_purchase_supply = s.psupply,
    total_supply_amount   = s.supply,
    total_supply_vat      = s.vat,
    total_billed          = s.billed,
    total_margin          = s.margin
from (
  select order_id,
         sum(total_purchase)   as purchase,
         sum(purchase_supply)  as psupply,
         sum(total_supply)     as supply,
         sum(supply_vat)       as vat,
         sum(billed_amount)    as billed,
         sum(margin)           as margin
  from order_items
  group by order_id
) s
where s.order_id = o.id
  and o.order_number = 'SH2608-050';

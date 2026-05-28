-- 소싱 "완료" → 주문 내역(orders) 연결
--
-- 거래처별 발주를 완료하면 orders/order_items 한 건으로 만들어 주문 내역에 누적한다.
-- 그때 생성한 주문의 id 를 정산행에 보관해 두면, 완료 취소나 출고확인서 재반영 때
-- 정확히 그 주문만 지우고 다시 만들 수 있다(중복 방지).
alter table public.sourcing_settlements
  add column if not exists order_id uuid references public.orders(id) on delete set null;

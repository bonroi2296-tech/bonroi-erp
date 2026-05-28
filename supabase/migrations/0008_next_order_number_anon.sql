-- 주문번호 발급 RPC를 비로그인(anon)에서도 사용 가능하게 수정
--
-- 문제: 0002 의 next_order_number() 는 security invoker + authenticated 전용이라,
-- 앱을 로그인 없이(anon) 쓰는 현 환경에서 호출 시
--   "permission denied for sequence order_number_seq"
-- 가 났고, 클라이언트 폴백(최대번호+1)이 기존 번호와 충돌해
--   "duplicate key ... orders_order_number_key"
-- 로 주문 생성(소싱 완료 → 주문 내역 반영)이 실패했다.
--
-- 해결: security definer(소유자 권한으로 시퀀스 사용) + anon/authenticated execute,
-- 그리고 시퀀스를 기존 주문번호 최대 일련번호 이상으로 올려 충돌을 막는다.

create or replace function public.next_order_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'ORD-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.order_number_seq')::text, 4, '0');
$$;

grant execute on function public.next_order_number() to anon, authenticated;

select setval(
  'public.order_number_seq',
  greatest(
    coalesce((select max(split_part(order_number, '-', 3)::int)
                from public.orders
               where order_number ~ '^ORD-\d{4}-\d+$'), 0),
    (select last_value from public.order_number_seq)
  ),
  true
);

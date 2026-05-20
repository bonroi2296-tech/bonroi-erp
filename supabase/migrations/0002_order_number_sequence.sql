-- 주문번호(ORD-YYYY-NNNN) 원자적 생성
--
-- 배경: 기존 클라이언트 로직은 "현재 최대 주문번호 조회 후 +1" 방식이라
-- 동시 등록 시 같은 번호가 중복 발급될 수 있었습니다(경쟁 조건).
-- DB 시퀀스를 사용해 동시 호출에도 고유 번호를 보장합니다.
--
-- 적용 후 클라이언트는 supabase.rpc('next_order_number')로 번호를 받습니다.
-- (마이그레이션 미적용 환경에서는 클라이언트가 기존 방식으로 자동 폴백)

create sequence if not exists public.order_number_seq;

create or replace function public.next_order_number()
returns text
language sql
volatile
as $$
  select 'ORD-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.order_number_seq')::text, 4, '0');
$$;

grant execute on function public.next_order_number() to authenticated;

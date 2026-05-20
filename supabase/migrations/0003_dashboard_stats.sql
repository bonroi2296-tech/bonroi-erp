-- 대시보드 집계 RPC
--
-- 배경: 대시보드가 orders 전체 행을 브라우저로 받아 건수/마진/월 비교/지점별
-- 통계를 JS에서 계산했습니다. 데이터가 늘수록 전송량과 연산이 선형 증가합니다.
-- 본 함수로 집계를 DB에서 처리해 단일 JSON으로 반환합니다.
--
-- 적용 전에는 클라이언트가 기존 방식으로 자동 폴백합니다.

create or replace function public.get_dashboard_stats()
returns jsonb
language sql
stable
as $$
  with tm as (select to_char(now(), 'YYYY-MM') as m),
       lm as (select to_char((now() - interval '1 month'), 'YYYY-MM') as m)
  select jsonb_build_object(
    'product_count', (select count(*) from public.products),
    'vendor_count', (select count(*) from public.vendors),
    'purchase_order_count', (select count(*) from public.orders),
    'order_count', (
      select count(distinct (order_date::text || '_' || branch_id::text)) from public.orders
    ),
    'total_margin', coalesce((select sum(total_margin) from public.orders), 0),
    'this_month', jsonb_build_object(
      'purchase', coalesce((select sum(total_purchase_amount) from public.orders where to_char(order_date, 'YYYY-MM') = (select m from tm)), 0),
      'supply',   coalesce((select sum(total_supply_amount)   from public.orders where to_char(order_date, 'YYYY-MM') = (select m from tm)), 0),
      'margin',   coalesce((select sum(total_margin)          from public.orders where to_char(order_date, 'YYYY-MM') = (select m from tm)), 0)
    ),
    'last_month', jsonb_build_object(
      'purchase', coalesce((select sum(total_purchase_amount) from public.orders where to_char(order_date, 'YYYY-MM') = (select m from lm)), 0),
      'supply',   coalesce((select sum(total_supply_amount)   from public.orders where to_char(order_date, 'YYYY-MM') = (select m from lm)), 0),
      'margin',   coalesce((select sum(total_margin)          from public.orders where to_char(order_date, 'YYYY-MM') = (select m from lm)), 0)
    ),
    'branches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'branch_id', b.id,
        'branch_name', b.name,
        'purchase', coalesce(s.purchase, 0),
        'supply',   coalesce(s.supply, 0),
        'margin',   coalesce(s.margin, 0)
      ) order by b.name), '[]'::jsonb)
      from public.branches b
      left join (
        select branch_id,
               sum(total_purchase_amount) as purchase,
               sum(total_supply_amount)   as supply,
               sum(total_margin)          as margin
        from public.orders
        where to_char(order_date, 'YYYY-MM') = (select m from tm)
        group by branch_id
      ) s on s.branch_id = b.id
    )
  );
$$;

grant execute on function public.get_dashboard_stats() to authenticated;

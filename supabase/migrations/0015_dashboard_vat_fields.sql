-- 대시보드에 부가세 기준을 드러낸다.
--
-- 문제: 화면의 구매금액은 부가세 포함(total_purchase_amount)인데
-- 마진은 부가세 뺀 공급가액 기준(total_margin = 납품공급가액 - 매입공급가액)이라
-- "공급가 - 구매금액 ≠ 마진" 으로 보여 검산이 안 맞았다. 계산은 맞고 표시가 문제였다.
--
-- 해결: 매입 공급가액·부가세·청구액을 같이 내려서 화면이 같은 기준으로 보여줄 수 있게 한다.
-- 기존 필드는 이름·의미 그대로 두므로 옛 화면도 그대로 동작한다.

create or replace function public.get_dashboard_stats()
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
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
    'total_billed', coalesce((select sum(total_billed) from public.orders), 0),
    'this_month', (
      select jsonb_build_object(
        'purchase',        coalesce(sum(total_purchase_amount), 0),
        'purchase_supply', coalesce(sum(total_purchase_supply), 0),
        'supply',          coalesce(sum(total_supply_amount), 0),
        'supply_vat',      coalesce(sum(total_supply_vat), 0),
        'billed',          coalesce(sum(total_billed), 0),
        'margin',          coalesce(sum(total_margin), 0)
      )
      from public.orders where to_char(order_date, 'YYYY-MM') = (select m from tm)
    ),
    'last_month', (
      select jsonb_build_object(
        'purchase',        coalesce(sum(total_purchase_amount), 0),
        'purchase_supply', coalesce(sum(total_purchase_supply), 0),
        'supply',          coalesce(sum(total_supply_amount), 0),
        'supply_vat',      coalesce(sum(total_supply_vat), 0),
        'billed',          coalesce(sum(total_billed), 0),
        'margin',          coalesce(sum(total_margin), 0)
      )
      from public.orders where to_char(order_date, 'YYYY-MM') = (select m from lm)
    ),
    'branches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'branch_id', b.id,
        'branch_name', b.name,
        'purchase',        coalesce(s.purchase, 0),
        'purchase_supply', coalesce(s.purchase_supply, 0),
        'supply',          coalesce(s.supply, 0),
        'supply_vat',      coalesce(s.supply_vat, 0),
        'billed',          coalesce(s.billed, 0),
        'margin',          coalesce(s.margin, 0)
      ) order by b.name), '[]'::jsonb)
      from public.branches b
      left join (
        select branch_id,
               sum(total_purchase_amount) as purchase,
               sum(total_purchase_supply) as purchase_supply,
               sum(total_supply_amount)   as supply,
               sum(total_supply_vat)      as supply_vat,
               sum(total_billed)          as billed,
               sum(total_margin)          as margin
        from public.orders
        where to_char(order_date, 'YYYY-MM') = (select m from tm)
        group by branch_id
      ) s on s.branch_id = b.id
    )
  );
$function$;

-- 앱은 비로그인(anon)으로 돈다. 함수를 다시 만들면 실행 권한을 반드시 다시 준다.
grant execute on function public.get_dashboard_stats() to anon, authenticated;

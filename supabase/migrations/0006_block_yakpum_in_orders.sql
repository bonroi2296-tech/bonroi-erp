-- 의약품은 '거래처 배정'에만 쓰는 구분이다. 주문 내역(장부)에는 절대 들어가면 안 된다.
-- 화면에서도 막아뒀지만, 어떤 경로로 들어오든 DB에서 끊는다.

create or replace function public.block_yakpum_in_order_items()
returns trigger
language plpgsql
as $$
declare
  cat text;
  pname text;
begin
  if new.product_id is null then
    return new;
  end if;

  select category, name into cat, pname from public.products where id = new.product_id;

  if cat = '의약품' then
    raise exception '의약품은 주문 내역에 넣을 수 없습니다: %', coalesce(pname, new.product_id::text)
      using hint = '의약품은 단가 비교(거래처 배정) 전용입니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_yakpum_in_order_items on public.order_items;

create trigger trg_block_yakpum_in_order_items
before insert or update of product_id on public.order_items
for each row
execute function public.block_yakpum_in_order_items();

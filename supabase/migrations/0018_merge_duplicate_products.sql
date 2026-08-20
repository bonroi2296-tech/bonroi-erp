-- 규격 표기 차이로 두 벌씩 등록된 제품 합치기.
--
-- 원인: 같은 제품이 표기만 다르게 두 번 등록돼 있었다.
--   · 곱셈기호 "×" 와 알파벳 "x"  (다나/케이엠/SMC 스프링침)
--   · 소수점 표기 "1" 과 "1.0", "7" 과 "7.0"  (성광 서지젤, 협성 엔도튜브)
-- 한쪽에만 거래처 단가가 붙어 있어서, 옛 표기로 주문이 들어오면 단가를 못 찾았다.
--
-- 남기는 쪽: 거래처 단가가 더 많은 쪽(= 현재 쓰는 쪽). 같으면 주문 많은 쪽 → 표기 짧은 쪽.
-- 없애는 쪽의 주문·소싱·가격이력 참조는 남기는 쪽으로 옮긴 뒤 삭제한다(장부 보존).
-- order_items.raw_product_name 은 그대로 둔다 — 그때 적힌 이름이 장부의 기록이다.

create table if not exists _dup_merge_map (loser_id uuid primary key, keeper_id uuid not null);

insert into _dup_merge_map (loser_id, keeper_id)
with base as (
  select p.id, p.name, p.spec,
         regexp_replace(
           regexp_replace(
             replace(lower(trim(split_part(p.name,'⚠️',1)) || ' ' || coalesce(p.spec,'')), '×', 'x'),
           '\.0+\y', '', 'g'),
         '[^0-9a-z가-힣]', '', 'g') as k
  from products p
),
stat as (
  select b.*,
    (select count(*) from vendor_products vp where vp.product_id = b.id) as vp,
    (select count(*) from order_items oi where oi.product_id = b.id) as oi
  from base b
),
ranked as (
  select *, row_number() over (
    partition by k order by vp desc, oi desc, length(spec) asc, length(name) asc
  ) as rn
  from stat
)
select l.id, k.id
from ranked l
join ranked k on k.k = l.k and k.rn = 1
where l.rn > 1;

-- 1) 거래처 단가: 남기는 쪽에 이미 있는 거래처면 없애는 쪽 행을 버리고, 없으면 옮긴다
delete from vendor_products vp
using _dup_merge_map m, vendor_products keep
where vp.product_id = m.loser_id
  and keep.product_id = m.keeper_id and keep.vendor_id = vp.vendor_id;
update vendor_products vp set product_id = m.keeper_id
from _dup_merge_map m where vp.product_id = m.loser_id;

-- 2) 공급 상태(품절 등)도 같은 방식
delete from vendor_supply_status s
using _dup_merge_map m, vendor_supply_status keep
where s.product_id = m.loser_id
  and keep.product_id = m.keeper_id and keep.vendor_id = s.vendor_id;
update vendor_supply_status s set product_id = m.keeper_id
from _dup_merge_map m where s.product_id = m.loser_id;

-- 3) 수량별 단가(price_tiers): product+vendor+min_qty 가 겹치면 버린다
delete from price_tiers t
using _dup_merge_map m, price_tiers keep
where t.product_id = m.loser_id
  and keep.product_id = m.keeper_id and keep.vendor_id = t.vendor_id and keep.min_qty = t.min_qty;
update price_tiers t set product_id = m.keeper_id
from _dup_merge_map m where t.product_id = m.loser_id;

-- 4) 장부·소싱·이력 참조를 남기는 쪽으로
update order_items oi          set product_id = m.keeper_id from _dup_merge_map m where oi.product_id  = m.loser_id;
update demand_lines dl         set product_id = m.keeper_id from _dup_merge_map m where dl.product_id  = m.loser_id;
update price_history ph        set product_id = m.keeper_id from _dup_merge_map m where ph.product_id  = m.loser_id;
update purchase_order_items pi set product_id = m.keeper_id from _dup_merge_map m where pi.product_id  = m.loser_id;

-- 5) 남기는 쪽의 빈 칸은 없애는 쪽 값으로 채운다(EDI 코드·사진·설명 등 손실 방지)
update products keep set
  edi_code    = coalesce(nullif(keep.edi_code, ''), nullif(lose.edi_code, '')),
  image_url   = coalesce(keep.image_url, lose.image_url),
  description = coalesce(keep.description, lose.description),
  pack_size   = coalesce(keep.pack_size, lose.pack_size),
  pack_unit   = coalesce(keep.pack_unit, lose.pack_unit)
from _dup_merge_map m
join products lose on lose.id = m.loser_id
where keep.id = m.keeper_id;

-- 6) 중복 제품 삭제
delete from products p using _dup_merge_map m where p.id = m.loser_id;

drop table _dup_merge_map;

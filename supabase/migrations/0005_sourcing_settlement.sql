-- 소싱 정산(배송비 + 매입원가 마감)
--
-- 배경: 실제 발주 후 거래처가 "출고 가능 수량 + 배송비"를 확정해 준다.
-- 배송비는 거래처마다 규칙이 다르다.
--   - 규칙형(예: 주사기닷컴): N원 이상 무료, 아니면 정액 → vendors.free_shipping_min/shipping_fee 로 자동계산
--   - 후책정형(예: 디에이치메디칼, 한백상사): 주문량 보고 나중에 책정 → 정산 때 수동 입력
-- 거래처별 출고확인서(PDF/이미지)를 다시 던지면 라인별 실제값으로 마감한다.
--
-- 물품 소계는 sourcing_allocations(거래처별 출고수량 × 단가)에서 집계하므로,
-- 정산 테이블은 (발주건 × 거래처)당 배송비/마감상태만 들고 있으면 된다.

alter table public.vendors
  add column if not exists shipping_policy text not null default 'auto';
-- 'auto'  = 규칙 기반 자동계산(free_shipping_min 이상 무료, 아니면 shipping_fee)
-- 'later' = 후책정(정산 시 수동 입력)

create table if not exists public.sourcing_settlements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.sourcing_jobs(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  vendor_label text,                       -- 미등록 거래처(자유 입력) 대응
  shipping_fee numeric not null default 0, -- 실제 배송비(후책정이면 정산 때 입력)
  settled boolean not null default false,  -- 거래처 정산 마감 여부
  doc_url text,                            -- 업로드한 출고확인서(선택)
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sourcing_settlements_job on public.sourcing_settlements(job_id);
-- (발주건 × 거래처) 중복 방지: 등록 거래처는 vendor_id로, 미등록은 vendor_label로 유일
create unique index if not exists uq_sourcing_settlements_job_vendor
  on public.sourcing_settlements(job_id, vendor_id) where vendor_id is not null;
create unique index if not exists uq_sourcing_settlements_job_label
  on public.sourcing_settlements(job_id, vendor_label) where vendor_id is null and vendor_label is not null;

-- RLS: 로그인 사용자 전체 접근(다른 ERP 테이블과 동일), anon 차단
alter table public.sourcing_settlements enable row level security;
grant all on public.sourcing_settlements to authenticated;
revoke all on public.sourcing_settlements from anon;
drop policy if exists sourcing_settlements_authenticated_all on public.sourcing_settlements;
create policy sourcing_settlements_authenticated_all on public.sourcing_settlements
  for all to authenticated using (true) with check (true);

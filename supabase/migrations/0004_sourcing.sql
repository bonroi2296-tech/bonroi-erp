-- 확보(소싱) 모듈
--
-- 배경: 병원이 필요로 하는 수량을, 공급 불안정 속에서 여러 거래처로 쪼개
-- 발주하고(분할발주), 거래처별 출고/부분출고/출고불가를 추적해 "필요 대비 확보"를
-- 실시간으로 본다. 부족분은 자동으로 드러나 재소싱 대기로 남는다.
--
-- 구조: sourcing_job(병원 발주건) → demand_line(품목별 수요) → sourcing_allocation(거래처 할당)
--
-- 설계 메모:
--  - demand_line.raw_name 은 자유텍스트(매칭 전). product_id 는 추후 매칭(b 단계)용 nullable.
--  - unit_label 은 자유 단위(개/박스/카톤). 추후 포장 환산엔진(c 단계)이 이 자리에 들어온다.
--  - allocation.vendor_label 은 미등록/신규 거래처 자유 입력(신규 거래처 발굴 대응).

create table if not exists public.sourcing_jobs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete set null,
  title text not null,
  requester text,
  delivery_note text,
  status text not null default 'open',
  note text,
  created_at timestamptz default now()
);

create table if not exists public.demand_lines (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.sourcing_jobs(id) on delete cascade,
  raw_name text not null,
  product_id uuid references public.products(id) on delete set null,
  required_qty numeric not null default 0,
  unit_label text,
  purpose text,
  note text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists public.sourcing_allocations (
  id uuid primary key default gen_random_uuid(),
  demand_line_id uuid not null references public.demand_lines(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  vendor_label text,
  order_qty numeric not null default 0,
  unit_price numeric,
  status text not null default 'ordered',
  shipped_qty numeric,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_demand_lines_job on public.demand_lines(job_id);
create index if not exists idx_sourcing_allocations_demand on public.sourcing_allocations(demand_line_id);

-- RLS: 로그인 사용자 전체 접근(다른 ERP 테이블과 동일), anon 차단
do $$
declare
  t text;
  tables text[] := array['sourcing_jobs', 'demand_lines', 'sourcing_allocations'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('grant all on public.%I to authenticated;', t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t || '_authenticated_all', t
    );
  end loop;
end $$;

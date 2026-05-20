-- 모든 ERP 테이블에 RLS(행 수준 보안) 활성화
--
-- 배경: 앱은 브라우저에서 anon 키로 Supabase에 직접 접근합니다. anon 키는
-- 공개 키이므로, RLS가 없으면 누구나 전 테이블을 읽고 쓸 수 있습니다.
-- 본 시스템은 사내용 단일 권한 도구이므로 "로그인한 사용자(authenticated)"에게만
-- 전체 접근을 허용하고, 비로그인(anon)은 정책이 없어 기본 거부됩니다.
--
-- 적용 방법:
--   supabase db push            (Supabase CLI, 로컬 → 원격)
--   또는 Supabase 대시보드 SQL 편집기에 본 파일 내용을 붙여넣어 실행

do $$
declare
  t text;
  tables text[] := array[
    'branches',
    'products',
    'vendors',
    'vendor_products',
    'orders',
    'order_items',
    'order_status_log',
    'purchase_orders',
    'purchase_order_items',
    'returns',
    'price_history',
    'price_tiers',
    'vendor_supply_status',
    'app_users',
    'expense_reports',
    'invoices'
  ];
begin
  -- 기존 과허용 정책 제거(anon 포함 USING(true)) — 어드바이저 rls_policy_always_true 대응
  drop policy if exists "Allow all for returns" on public.returns;
  drop policy if exists "Allow all for price_tiers" on public.price_tiers;

  foreach t in array tables loop
    -- 테이블이 존재하는 경우에만 처리
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('alter table public.%I enable row level security;', t);

      -- 로그인 사용자 전체 접근 정책 (재실행 가능하도록 먼저 drop)
      execute format('drop policy if exists %I on public.%I;', t || '_authenticated_all', t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (true) with check (true);',
        t || '_authenticated_all', t
      );
    end if;
  end loop;
end $$;

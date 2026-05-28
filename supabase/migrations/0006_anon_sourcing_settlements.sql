-- sourcing_settlements 에 anon 접근 부여
--
-- 배경: 이 앱은 현재 로그인 없이 anon 키로 동작한다(다른 소싱/주문 테이블도
-- temp_anon_* 마이그레이션으로 anon 정책·권한이 부여돼 있다).
-- 0005 에서 sourcing_settlements 만 authenticated 전용으로 만들어,
-- 로그인하지 않은 사용자가 마감/정산을 저장할 때
-- "permission denied for table sourcing_settlements" 가 발생했다.
-- 다른 소싱 테이블과 동일하게 anon 접근을 열어 일관성을 맞춘다.

grant all on public.sourcing_settlements to anon;
drop policy if exists sourcing_settlements_anon_all on public.sourcing_settlements;
create policy sourcing_settlements_anon_all on public.sourcing_settlements
  for all to anon using (true) with check (true);

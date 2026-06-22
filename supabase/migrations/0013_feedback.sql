-- 화면에서 바로 보내는 '개선 요청/피드백' 저장 테이블.
-- 사용자가 쓰다가 불편한 점을 그 자리에서 적어 남기면 여기에 쌓인다.
-- (무로그인 anon 운영이므로 다른 테이블과 동일하게 anon 전체 접근을 연다)
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  page text,                       -- 어느 화면에서 보냈는지(경로)
  message text not null,           -- 사용자가 적은 내용
  status text not null default 'new', -- new | done
  resolution text                  -- 처리 메모(나중에 반영하며 남김)
);

alter table public.feedback enable row level security;

grant all on public.feedback to anon;
drop policy if exists feedback_anon_all on public.feedback;
create policy feedback_anon_all on public.feedback
  for all to anon using (true) with check (true);

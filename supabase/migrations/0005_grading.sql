-- 解答採点システムの採点履歴
create table public.grading_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  question text not null,
  answer text not null,
  score int not null check (score between 0 and 100),
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index grading_results_user_idx on public.grading_results (user_id, created_at desc);

alter table public.grading_results enable row level security;

create policy "own grading_results" on public.grading_results
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 模試成績管理
-- kind: common=共通テスト模試 / university=冠模試(大学別) / ability=学力測定模試
create table public.mock_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('common', 'university', 'ability')),
  name text not null,
  provider text,
  university text,
  date date not null,
  overall_deviation numeric,
  weaknesses jsonb,
  image_path text,
  memo text,
  created_at timestamptz not null default now()
);
create index mock_exams_user_idx on public.mock_exams (user_id, kind, date);
create index mock_exams_univ_idx on public.mock_exams (user_id, university, date);

create table public.mock_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mock_id uuid not null references public.mock_exams (id) on delete cascade,
  subject text not null,
  score numeric,
  max_score numeric,
  deviation numeric,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index mock_subjects_mock_idx on public.mock_subjects (mock_id, sort_order);

alter table public.mock_exams enable row level security;
alter table public.mock_subjects enable row level security;

create policy "own mock_exams" on public.mock_exams
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own mock_subjects" on public.mock_subjects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

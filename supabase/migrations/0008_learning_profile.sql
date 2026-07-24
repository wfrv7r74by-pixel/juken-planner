-- 学習相談: ユーザー学習プロフィール(5層モデル)と単元マスタリー
-- プロフィールは深いネスト構造 + フィールドごとの confidence を持つため jsonb で保持する。
-- ※冪等化: 既に適用済みでも安全に再実行できるよう if not exists / drop policy を使用。
create table if not exists public.user_learning_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  phase text not null default 'onboarding'
    check (phase in ('onboarding', 'diagnostic', 'steady')),
  completeness int not null default 0 check (completeness between 0 and 100),
  updated_at timestamptz not null default now()
);

alter table public.user_learning_profiles enable row level security;
drop policy if exists "own learning_profile" on public.user_learning_profiles;
create policy "own learning_profile" on public.user_learning_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 単元マスタリー(第2層の最重要データ。診断/チェックリスト/週次で埋める)
-- level: 0=未習 1=未定着 2=基礎可 3=応用可
create table if not exists public.unit_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  unit text not null,
  level int not null default 0 check (level between 0 and 3),
  verified_by text not null default 'self_report'
    check (verified_by in ('self_report', 'diagnostic', 'mock_exam', 'weekly_check')),
  updated_at timestamptz not null default now(),
  unique (user_id, subject, unit)
);
create index if not exists unit_mastery_user_idx on public.unit_mastery (user_id, subject);

alter table public.unit_mastery enable row level security;
drop policy if exists "own unit_mastery" on public.unit_mastery;
create policy "own unit_mastery" on public.unit_mastery
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

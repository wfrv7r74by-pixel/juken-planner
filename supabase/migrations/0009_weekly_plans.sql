-- 学習相談 Phase 1-3: 週次計画(計画生成エンジンの出力)を保持する。
-- タスクは範囲ベース(教材名+開始+終了+到達度)で、週テンプレ(4:2:1)の枠に配置される。
-- 深いネスト + タスクの完了状態を持つため plan は jsonb で保持し、
-- 検索・一意制約に使う week_start / phase / generated_by のみカラムに出す。
-- ※冪等化: 既に適用済みでも安全に再実行できるよう if not exists / drop policy を使用。
create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- その週の月曜(YYYY-MM-DD)。ユーザー×週で一意。
  week_start date not null,
  phase text not null default 'steady'
    check (phase in ('onboarding', 'diagnostic', 'steady')),
  theme text,
  plan jsonb not null default '{}'::jsonb,
  generated_by text not null default 'ai'
    check (generated_by in ('ai', 'deterministic')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create index if not exists weekly_plans_user_week_idx
  on public.weekly_plans (user_id, week_start desc);

alter table public.weekly_plans enable row level security;
drop policy if exists "own weekly_plans" on public.weekly_plans;
create policy "own weekly_plans" on public.weekly_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

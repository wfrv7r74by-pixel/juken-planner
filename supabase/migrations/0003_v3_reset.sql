-- v3: 「AI と一緒に作る受験ダッシュボード」への全面移行
-- 教材の日割りエンジンを廃止し、フェーズ戦略 + 曜日別ルーティン + 振り返りへ。

-- ============================================================
-- 旧テーブルの削除
-- ============================================================
drop table if exists public.study_tasks cascade;
drop table if exists public.plan_settings cascade;
-- study_logs.task_id は study_tasks 依存だったため削除
alter table public.study_logs drop column if exists task_id;

-- ============================================================
-- phases: 年間フェーズ戦略(「英語立て直し+数学発展加速」など)
-- ============================================================
create table public.phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  color text not null default '#22c55e',
  memo text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (start_date <= end_date)
);
create index phases_user_idx on public.phases (user_id, start_date);

-- ============================================================
-- routine_blocks: 曜日別の時間ブロック(1日のルーティン)
--   weekday: 0=日〜6=土 / category: study=勉強, life=生活
--   effective_from/until で「〜7月末」のような期間限定ルーティンを表現
-- ============================================================
create table public.routine_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  title text not null,
  category text not null default 'study' check (category in ('study', 'life')),
  subject_id uuid references public.subjects (id) on delete set null,
  effective_from date,
  effective_until date,
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);
create index routine_blocks_user_idx on public.routine_blocks (user_id, weekday, start_time);

-- ============================================================
-- material_sections: 教材の章・項目(AI が Web 参照して分割)
-- ============================================================
create table public.material_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  title text not null,
  sort_order int not null default 0,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  memo text,
  created_at timestamptz not null default now()
);
create index material_sections_material_idx on public.material_sections (material_id, sort_order);

-- materials から日割りエンジン用の列要件を緩和(総量は任意に)
alter table public.materials alter column total_units set default 1;

-- ============================================================
-- daily_notes: 日次の振り返り
-- ============================================================
create table public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  mood int check (mood between 1 and 5),
  good text,
  issue text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index daily_notes_user_date_idx on public.daily_notes (user_id, date desc);

-- ============================================================
-- chat_messages: AI 相談の履歴(提案は metadata に JSON で保持)
-- ============================================================
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index chat_messages_user_idx on public.chat_messages (user_id, created_at);

-- ============================================================
-- RLS
-- ============================================================
alter table public.phases enable row level security;
alter table public.routine_blocks enable row level security;
alter table public.material_sections enable row level security;
alter table public.daily_notes enable row level security;
alter table public.chat_messages enable row level security;

create policy "own phases" on public.phases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own routine_blocks" on public.routine_blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own material_sections" on public.material_sections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own daily_notes" on public.daily_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own chat_messages" on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

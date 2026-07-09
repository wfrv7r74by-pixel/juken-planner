-- juken-planner 初期スキーマ
-- 受験合格から逆算した学習スケジュール計画アプリ

-- ============================================================
-- profiles: auth.users 1:1 のプロフィール
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- ============================================================
-- plan_settings: 逆算プラン生成の設定(ユーザーごとに1行)
--   weekday_minutes: 曜日(0=日〜6=土)ごとの学習可能分数
--   basic_ratio / advance_ratio: 年間フェーズの配分
--     (残り期間のうち最初の basic_ratio が基礎固め、次の advance_ratio が発展、残りが直前期)
-- ============================================================
create table public.plan_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  weekday_minutes jsonb not null
    default '{"0": 240, "1": 120, "2": 120, "3": 120, "4": 120, "5": 120, "6": 240}',
  basic_ratio numeric not null default 0.5 check (basic_ratio > 0 and basic_ratio < 1),
  advance_ratio numeric not null default 0.35 check (advance_ratio > 0 and advance_ratio < 1),
  updated_at timestamptz not null default now(),
  check (basic_ratio + advance_ratio < 1)
);

-- ============================================================
-- milestones: 本命試験日・模試・出願などの日付イベント
--   is_target=true の行(1つ)が逆算の基準となる本命試験日
-- ============================================================
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  date date not null,
  kind text not null default 'exam' check (kind in ('exam', 'mock', 'application', 'other')),
  is_target boolean not null default false,
  memo text,
  created_at timestamptz not null default now()
);
create index milestones_user_date_idx on public.milestones (user_id, date);

-- ============================================================
-- subjects: 科目
-- ============================================================
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  color text not null default '#4f46e5',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index subjects_user_idx on public.subjects (user_id);

-- ============================================================
-- materials: 教材(問題集・参考書・過去問など)
--   total_units × minutes_per_unit で総学習時間を見積もり、
--   phase の期間内に完了するよう日次タスクへ割り振る
-- ============================================================
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  title text not null,
  total_units int not null check (total_units > 0),
  unit_label text not null default 'ページ',
  minutes_per_unit numeric not null default 5 check (minutes_per_unit > 0),
  phase text not null default 'basic' check (phase in ('basic', 'advance', 'final')),
  priority int not null default 3 check (priority between 1 and 5),
  created_at timestamptz not null default now()
);
create index materials_user_idx on public.materials (user_id);

-- ============================================================
-- study_tasks: 逆算エンジンが生成する日次タスク
--   unit_start〜unit_end で「p.12〜20」のような範囲を表す
-- ============================================================
create table public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  date date not null,
  planned_units int not null check (planned_units > 0),
  unit_start int not null,
  unit_end int not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index study_tasks_user_date_idx on public.study_tasks (user_id, date);
create index study_tasks_material_idx on public.study_tasks (material_id);

-- ============================================================
-- study_logs: 学習時間の記録(タスク完了時の自動記録+手動記録)
-- ============================================================
create table public.study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  task_id uuid references public.study_tasks (id) on delete cascade,
  date date not null,
  minutes int not null check (minutes > 0),
  memo text,
  source text not null default 'manual' check (source in ('manual', 'task')),
  created_at timestamptz not null default now()
);
create index study_logs_user_date_idx on public.study_logs (user_id, date);

-- ============================================================
-- RLS: 全テーブル本人のみアクセス可
-- ============================================================
alter table public.profiles enable row level security;
alter table public.plan_settings enable row level security;
alter table public.milestones enable row level security;
alter table public.subjects enable row level security;
alter table public.materials enable row level security;
alter table public.study_tasks enable row level security;
alter table public.study_logs enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own plan_settings" on public.plan_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own milestones" on public.milestones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own subjects" on public.subjects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own materials" on public.materials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own study_tasks" on public.study_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own study_logs" on public.study_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- サインアップ時に profiles / plan_settings を自動作成
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  insert into public.plan_settings (user_id) values (new.id);
  return new;
end;
$$;

-- トリガー専用関数のため PostgREST 経由の直接実行は許可しない
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

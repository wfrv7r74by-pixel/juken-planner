-- 勉強計画 ロードマップ層: 受験までを 基礎/演習/発展/過去問/共テ に区分し、
-- 区分ごとの抽象概念(科目別到達目標)・月目標・週目標・バッファ方針を保持する。
-- 区分の「期間」自体は既存 phases テーブルを再利用し(kind 列を追加)、
-- 目標・概念などの計画メタは深いネストのため jsonb で study_roadmaps に持つ。
-- ※冪等化: 既に適用済みでも安全に再実行できるよう if not exists / drop policy を使用。

create table if not exists public.study_roadmaps (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  exam_date date,
  roadmap jsonb not null default '{}'::jsonb,
  generated_by text not null default 'ai'
    check (generated_by in ('ai', 'deterministic')),
  updated_at timestamptz not null default now()
);

alter table public.study_roadmaps enable row level security;
drop policy if exists "own study_roadmaps" on public.study_roadmaps;
create policy "own study_roadmaps" on public.study_roadmaps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 区分の種別。既存(手動作成)の phase は null のまま。ロードマップ生成の phase に付与する。
alter table public.phases
  add column if not exists kind text
    check (kind is null or kind in ('basic', 'practice', 'advance', 'past', 'common'));

-- 採点に使った答案画像のパス(storage の answers バケット内)
alter table public.grading_results
  add column if not exists image_path text;

-- 復習リスト(採点結果や日々の学習から溜める復習項目)
create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null default 'other',
  topic text not null,
  detail text,
  status text not null default 'todo' check (status in ('todo', 'done')),
  source text not null default 'manual' check (source in ('manual', 'grading')),
  grading_id uuid references public.grading_results (id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index review_items_user_idx on public.review_items (user_id, status, created_at desc);

alter table public.review_items enable row level security;
create policy "own review_items" on public.review_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 答案画像用のプライベートストレージバケット
insert into storage.buckets (id, name, public)
values ('answers', 'answers', false)
on conflict (id) do nothing;

-- 自分のフォルダ(answers/<uid>/...)のみ読み書きできる
create policy "own answer uploads read" on storage.objects
  for select using (
    bucket_id = 'answers' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own answer uploads insert" on storage.objects
  for insert with check (
    bucket_id = 'answers' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own answer uploads delete" on storage.objects
  for delete using (
    bucket_id = 'answers' and (storage.foldername(name))[1] = auth.uid()::text
  );

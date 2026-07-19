-- 教材の目標適合度評価(AI が判定)
alter table public.materials
  add column if not exists fit_score int check (fit_score between 1 and 5),
  add column if not exists fit_comment text;

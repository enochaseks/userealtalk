alter table public.user_weekly_insights
  add column if not exists emailed_at timestamptz;

create index if not exists user_weekly_insights_user_emailed_idx
  on public.user_weekly_insights(user_id, emailed_at desc);
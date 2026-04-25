alter table public.user_weekly_insights
  add column if not exists advice_snippets jsonb not null default '[]'::jsonb;

alter table public.user_money_planner
  add column if not exists employment_type text default null,
  add column if not exists job_income jsonb default null;

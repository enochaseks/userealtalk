alter table public.user_insight_settings
  add column if not exists debt_weekly_checkin_enabled boolean not null default false,
  add column if not exists debt_weekly_checkin_email_enabled boolean not null default false;

create table if not exists public.user_debt_checkin_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  open_debt_count integer not null default 0,
  emailed_at timestamptz,
  email_subject text not null default '',
  email_body text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists user_debt_checkin_logs_user_week_idx
  on public.user_debt_checkin_logs(user_id, week_start desc);

alter table public.user_debt_checkin_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_debt_checkin_logs' and policyname = 'own debt checkin logs select'
  ) then
    create policy "own debt checkin logs select"
      on public.user_debt_checkin_logs
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

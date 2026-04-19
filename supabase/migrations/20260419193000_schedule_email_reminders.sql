alter table public.user_insight_settings
  add column if not exists schedule_email_reminders_enabled boolean not null default false,
  add column if not exists schedule_email_reminder_minutes integer not null default 30;

alter table public.user_insight_settings
  drop constraint if exists user_insight_settings_schedule_email_reminder_minutes_check;

alter table public.user_insight_settings
  add constraint user_insight_settings_schedule_email_reminder_minutes_check
  check (schedule_email_reminder_minutes between 5 and 180);

create table if not exists public.user_schedule_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_id uuid not null references public.user_schedules(id) on delete cascade,
  channel text not null default 'gmail',
  sent_at timestamptz not null default now(),
  unique (user_id, schedule_id, channel)
);

create index if not exists user_schedule_reminder_logs_user_sent_idx
  on public.user_schedule_reminder_logs(user_id, sent_at desc);

alter table public.user_schedule_reminder_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_schedule_reminder_logs' and policyname = 'own schedule reminder logs select'
  ) then
    create policy "own schedule reminder logs select"
      on public.user_schedule_reminder_logs
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_schedule_reminder_logs' and policyname = 'own schedule reminder logs insert'
  ) then
    create policy "own schedule reminder logs insert"
      on public.user_schedule_reminder_logs
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_schedule_reminder_logs' and policyname = 'own schedule reminder logs delete'
  ) then
    create policy "own schedule reminder logs delete"
      on public.user_schedule_reminder_logs
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

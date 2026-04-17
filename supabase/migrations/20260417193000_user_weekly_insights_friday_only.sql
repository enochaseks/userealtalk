create table if not exists public.user_weekly_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  emotion_trend text not null,
  thought_patterns text not null,
  calm_progress text not null,
  overthinking_reduction text not null,
  ai_help_summary text not null,
  source_message_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists user_weekly_insights_user_week_idx
  on public.user_weekly_insights(user_id, week_start desc);

alter table public.user_weekly_insights enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_weekly_insights' and policyname = 'own user weekly insights select'
  ) then
    create policy "own user weekly insights select"
      on public.user_weekly_insights
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_weekly_insights' and policyname = 'own user weekly insights insert'
  ) then
    create policy "own user weekly insights insert"
      on public.user_weekly_insights
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_weekly_insights' and policyname = 'own user weekly insights update'
  ) then
    create policy "own user weekly insights update"
      on public.user_weekly_insights
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- User requested a clean reset: remove legacy per-conversation insights.
delete from public.conversation_weekly_insights;

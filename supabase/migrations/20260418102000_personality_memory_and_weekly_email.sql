alter table public.user_insight_settings
  add column if not exists weekly_email_enabled boolean not null default false;

create table if not exists public.user_memory_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preference_notes text not null default '',
  comfort_boundaries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_memory_profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_memory_profiles' and policyname = 'own memory profile select'
  ) then
    create policy "own memory profile select"
      on public.user_memory_profiles
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_memory_profiles' and policyname = 'own memory profile insert'
  ) then
    create policy "own memory profile insert"
      on public.user_memory_profiles
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_memory_profiles' and policyname = 'own memory profile update'
  ) then
    create policy "own memory profile update"
      on public.user_memory_profiles
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

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

alter table public.user_weekly_insights
  add column if not exists what_worked text not null default 'Helpful patterns are still being learned.',
  add column if not exists what_didnt text not null default 'Areas to improve are still being learned.',
  add column if not exists response_patterns text not null default 'Response patterns are still being observed.',
  add column if not exists boundary_respect text not null default 'Comfort boundaries are still being tracked.';
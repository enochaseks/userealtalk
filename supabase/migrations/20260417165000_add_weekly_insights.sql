create table public.user_insight_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monitor_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_insight_settings enable row level security;

create policy "own insight settings select"
  on public.user_insight_settings
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "own insight settings insert"
  on public.user_insight_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "own insight settings update"
  on public.user_insight_settings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.conversation_weekly_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  week_start date not null,
  emotion_trend text not null,
  thought_patterns text not null,
  calm_progress text not null,
  overthinking_reduction text not null,
  ai_help_summary text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, conversation_id, week_start)
);

create index conversation_weekly_insights_user_week_idx
  on public.conversation_weekly_insights(user_id, week_start desc);

alter table public.conversation_weekly_insights enable row level security;

create policy "own weekly insights select"
  on public.conversation_weekly_insights
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "own weekly insights insert"
  on public.conversation_weekly_insights
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "own weekly insights update"
  on public.conversation_weekly_insights
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
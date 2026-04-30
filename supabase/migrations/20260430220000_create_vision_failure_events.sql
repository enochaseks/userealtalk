-- Track vision (image analysis) failures per user so rate-limit patterns can be monitored
create table if not exists public.vision_failure_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  user_plan   text not null default 'free',
  provider    text not null default 'mistral',
  model       text,
  failure_type text not null default 'rate_limited', -- rate_limited | error
  image_count  int  not null default 0,
  total_bytes  bigint not null default 0,
  error_msg   text,
  created_at  timestamptz not null default now()
);

alter table public.vision_failure_events enable row level security;

-- Admins (service role) can read all; users cannot read others' rows
create policy "service role full access"
  on public.vision_failure_events
  for all
  using (true)
  with check (true);

-- Index for per-user queries and time-series queries
create index vision_failure_events_user_id_idx on public.vision_failure_events(user_id);
create index vision_failure_events_created_at_idx on public.vision_failure_events(created_at desc);
create index vision_failure_events_failure_type_idx on public.vision_failure_events(failure_type);

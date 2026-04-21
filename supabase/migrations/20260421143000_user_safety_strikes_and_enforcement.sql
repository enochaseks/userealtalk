create table if not exists public.user_safety_enforcement (
  user_id uuid primary key references auth.users(id) on delete cascade,
  strike_count integer not null default 0,
  restricted_until timestamptz,
  last_violation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_safety_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  severity text not null,
  action text not null,
  message_excerpt text not null,
  created_at timestamptz not null default now()
);

create index if not exists user_safety_events_user_created_idx
  on public.user_safety_events(user_id, created_at desc);

alter table public.user_safety_enforcement enable row level security;
alter table public.user_safety_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_safety_enforcement' and policyname = 'own safety enforcement select'
  ) then
    create policy "own safety enforcement select"
      on public.user_safety_enforcement
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_safety_events' and policyname = 'own safety events select'
  ) then
    create policy "own safety events select"
      on public.user_safety_events
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

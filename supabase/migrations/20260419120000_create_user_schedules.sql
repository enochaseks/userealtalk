create table if not exists public.user_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_schedules_end_after_start check (ends_at is null or ends_at >= starts_at)
);

create index if not exists user_schedules_user_starts_idx
  on public.user_schedules(user_id, starts_at asc);

alter table public.user_schedules enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_schedules' and policyname = 'own user schedules select'
  ) then
    create policy "own user schedules select"
      on public.user_schedules
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_schedules' and policyname = 'own user schedules insert'
  ) then
    create policy "own user schedules insert"
      on public.user_schedules
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_schedules' and policyname = 'own user schedules update'
  ) then
    create policy "own user schedules update"
      on public.user_schedules
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_schedules' and policyname = 'own user schedules delete'
  ) then
    create policy "own user schedules delete"
      on public.user_schedules
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;
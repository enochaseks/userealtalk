create table if not exists public.user_money_planner (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goal jsonb not null default '{}',
  spends jsonb not null default '[]',
  tasks jsonb not null default '[]',
  debts jsonb not null default '[]',
  advice_markdown text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.user_money_planner enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_money_planner' and policyname = 'own money planner select'
  ) then
    create policy "own money planner select"
      on public.user_money_planner
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_money_planner' and policyname = 'own money planner insert'
  ) then
    create policy "own money planner insert"
      on public.user_money_planner
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_money_planner' and policyname = 'own money planner update'
  ) then
    create policy "own money planner update"
      on public.user_money_planner
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_money_planner' and policyname = 'own money planner delete'
  ) then
    create policy "own money planner delete"
      on public.user_money_planner
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;

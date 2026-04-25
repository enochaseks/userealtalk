-- Journal entries: saved AI replies from chat
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_message_id uuid references public.messages(id) on delete set null,
  content text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists journal_entries_user_idx on public.journal_entries(user_id, created_at desc);

alter table public.journal_entries enable row level security;

create policy "own journal select" on public.journal_entries
  for select using (auth.uid() = user_id);

create policy "own journal insert" on public.journal_entries
  for insert with check (auth.uid() = user_id);

create policy "own journal delete" on public.journal_entries
  for delete using (auth.uid() = user_id);

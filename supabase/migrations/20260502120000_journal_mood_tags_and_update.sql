-- Add mood and tags columns to journal entries, plus update RLS policy

alter table public.journal_entries
  add column if not exists mood text check (mood in ('Good', 'Okay', 'Hard')) default null,
  add column if not exists tags text[] not null default '{}';

-- Allow users to update their own journal entries (for notes, mood, tags)
create policy "own journal update" on public.journal_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

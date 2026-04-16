create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conversations enable row level security;
create policy "own conversations select" on public.conversations for select to authenticated using (auth.uid() = user_id);
create policy "own conversations insert" on public.conversations for insert to authenticated with check (auth.uid() = user_id);
create policy "own conversations update" on public.conversations for update to authenticated using (auth.uid() = user_id);
create policy "own conversations delete" on public.conversations for delete to authenticated using (auth.uid() = user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create index messages_conv_created_idx on public.messages(conversation_id, created_at);
create policy "own messages select" on public.messages for select to authenticated using (auth.uid() = user_id);
create policy "own messages insert" on public.messages for insert to authenticated with check (auth.uid() = user_id);
create policy "own messages delete" on public.messages for delete to authenticated using (auth.uid() = user_id);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  source_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.plans enable row level security;
create policy "own plans select" on public.plans for select to authenticated using (auth.uid() = user_id);
create policy "own plans insert" on public.plans for insert to authenticated with check (auth.uid() = user_id);
create policy "own plans update" on public.plans for update to authenticated using (auth.uid() = user_id);
create policy "own plans delete" on public.plans for delete to authenticated using (auth.uid() = user_id);
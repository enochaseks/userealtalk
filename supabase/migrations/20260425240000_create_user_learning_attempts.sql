create table if not exists public.user_learning_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  outcome text not null, -- 'changed' | 'skipped'
  skip_reason text,       -- null when outcome = 'changed'
  confidence numeric,     -- null when skipped before confidence check
  extracted_summary jsonb, -- extracted fields (interests, style, etc.) if parsed
  message_count int
);

create index if not exists user_learning_attempts_user_id_idx
  on public.user_learning_attempts (user_id, attempted_at desc);

alter table public.user_learning_attempts enable row level security;

create policy "Users can view own learning attempts"
  on public.user_learning_attempts for select
  using (auth.uid() = user_id);

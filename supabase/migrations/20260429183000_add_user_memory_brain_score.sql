alter table public.user_memory_profiles
  add column if not exists brain_score numeric(5,1) not null default 2.0,
  add column if not exists brain_changed_attempts integer not null default 0,
  add column if not exists brain_last_increment_at timestamptz;

alter table public.user_memory_profiles
  drop constraint if exists user_memory_profiles_brain_score_range;

alter table public.user_memory_profiles
  add constraint user_memory_profiles_brain_score_range
  check (brain_score >= 0 and brain_score <= 100);

create index if not exists user_memory_profiles_brain_score_idx
  on public.user_memory_profiles (brain_score desc);

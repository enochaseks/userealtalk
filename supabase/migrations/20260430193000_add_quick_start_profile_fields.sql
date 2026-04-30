alter table public.user_memory_profiles
  add column if not exists quick_start_top_struggle text,
  add column if not exists quick_start_weekly_win text,
  add column if not exists quick_start_support_type text,
  add column if not exists quick_start_updated_at timestamptz,
  add column if not exists quick_start_last_applied_at timestamptz;

alter table public.user_memory_profiles
  drop constraint if exists user_memory_profiles_quick_start_support_type_check;

alter table public.user_memory_profiles
  add constraint user_memory_profiles_quick_start_support_type_check
  check (
    quick_start_support_type is null
    or quick_start_support_type in ('clarity', 'plan', 'encouragement', 'accountability')
  );
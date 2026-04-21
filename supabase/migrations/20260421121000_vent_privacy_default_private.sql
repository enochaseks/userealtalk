alter table public.user_insight_settings
  add column if not exists share_venting_with_database boolean not null default false;

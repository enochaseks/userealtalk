alter table public.user_insight_settings
  add column if not exists schedule_email_use_gmail boolean not null default false;

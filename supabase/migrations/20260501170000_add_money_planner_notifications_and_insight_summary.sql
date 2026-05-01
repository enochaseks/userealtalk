alter table public.user_insight_settings
  add column if not exists money_planner_email_notifications_enabled boolean not null default true;

alter table public.user_weekly_insights
  add column if not exists money_planner_summary text not null default 'No clear pattern this week.';
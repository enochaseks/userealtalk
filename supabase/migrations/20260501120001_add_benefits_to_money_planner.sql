-- Add benefits column to user_money_planner table
alter table public.user_money_planner
add column benefits jsonb not null default '[]';

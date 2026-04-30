-- Add AI moderation fields to advice_reports for 24h deferred processing
alter table public.advice_reports
  add column if not exists ai_decision   text,
  add column if not exists ai_confidence float,
  add column if not exists ai_summary    text,
  add column if not exists ai_source     text,
  add column if not exists process_after timestamptz,
  add column if not exists ai_processed_at timestamptz;

-- Fix status constraint to include 'removed' (used by auto-moderation)
alter table public.advice_reports
  drop constraint if exists advice_reports_status_check;

alter table public.advice_reports
  add constraint advice_reports_status_check
  check (status in ('open', 'reviewed', 'dismissed', 'removed'));

-- Index to find matured pending reports efficiently
create index if not exists advice_reports_process_after_idx
  on public.advice_reports(process_after)
  where status = 'open' and ai_decision is not null and ai_processed_at is null;

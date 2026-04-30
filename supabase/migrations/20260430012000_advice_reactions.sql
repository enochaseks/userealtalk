-- Add reaction type to advice_feedback (helpful / inspiring / practical / supportive)
-- Keeps is_helpful for backward compat but the trigger now uses reaction.

alter table public.advice_feedback
  add column if not exists reaction text not null default 'helpful'
  check (reaction in ('helpful', 'inspiring', 'practical', 'supportive'));

-- Backfill: any existing row with is_helpful=true gets reaction='helpful' (already the default)
update public.advice_feedback set reaction = 'helpful' where is_helpful = true;

-- Add per-reaction count columns to advice_posts
alter table public.advice_posts
  add column if not exists inspiring_count int not null default 0,
  add column if not exists practical_count int not null default 0,
  add column if not exists supportive_count int not null default 0;

-- Replace trigger function to count by reaction type
create or replace function public.refresh_advice_post_counters()
returns trigger
language plpgsql
as $$
declare
  target_post uuid;
begin
  target_post := coalesce(new.advice_post_id, old.advice_post_id);

  update public.advice_posts p
  set
    helpful_count = (
      select count(*)::int from public.advice_feedback f
      where f.advice_post_id = target_post and f.reaction = 'helpful'
    ),
    inspiring_count = (
      select count(*)::int from public.advice_feedback f
      where f.advice_post_id = target_post and f.reaction = 'inspiring'
    ),
    practical_count = (
      select count(*)::int from public.advice_feedback f
      where f.advice_post_id = target_post and f.reaction = 'practical'
    ),
    supportive_count = (
      select count(*)::int from public.advice_feedback f
      where f.advice_post_id = target_post and f.reaction = 'supportive'
    ),
    report_count = (
      select count(*)::int from public.advice_reports r
      where r.advice_post_id = target_post and r.status = 'open'
    ),
    updated_at = now()
  where p.id = target_post;

  return coalesce(new, old);
end;
$$;

-- Prevent duplicate saves of the same assistant response for a user.
-- Keep the newest row when historical duplicates exist.
delete from public.journal_entries existing
using public.journal_entries newer
where existing.user_id = newer.user_id
  and existing.source_message_id = newer.source_message_id
  and existing.source_message_id is not null
  and (
    existing.created_at < newer.created_at
    or (existing.created_at = newer.created_at and existing.id < newer.id)
  );

create unique index if not exists journal_entries_user_source_message_unique_idx
  on public.journal_entries(user_id, source_message_id)
  where source_message_id is not null;

update public.advice_posts
set moderation_notes = ''
where moderation_notes is null;

alter table public.advice_posts
  alter column moderation_notes set default '',
  alter column moderation_notes set not null;

create table if not exists public.advice_posts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references auth.users(id) on delete cascade,
  is_anonymous boolean not null default true,
  title text not null,
  body text not null,
  category text not null,
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  moderation_notes text not null default '',
  helpful_count integer not null default 0,
  report_count integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advice_posts_category_check check (category in ('general', 'benefits', 'money', 'mental-health', 'work', 'relationships')),
  constraint advice_posts_status_check check (status in ('pending', 'approved', 'rejected', 'removed')),
  constraint advice_posts_title_len_check check (char_length(title) between 8 and 140),
  constraint advice_posts_body_len_check check (char_length(body) between 30 and 4000),
  constraint advice_posts_tags_array_check check (jsonb_typeof(tags) = 'array')
);

create index if not exists advice_posts_status_created_idx on public.advice_posts(status, created_at desc);
create index if not exists advice_posts_category_status_idx on public.advice_posts(category, status);
create index if not exists advice_posts_author_idx on public.advice_posts(author_user_id, created_at desc);

create table if not exists public.advice_feedback (
  id uuid primary key default gen_random_uuid(),
  advice_post_id uuid not null references public.advice_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_helpful boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advice_feedback_unique_user_post unique (advice_post_id, user_id)
);

create index if not exists advice_feedback_post_idx on public.advice_feedback(advice_post_id);
create index if not exists advice_feedback_user_idx on public.advice_feedback(user_id, created_at desc);

create table if not exists public.advice_reports (
  id uuid primary key default gen_random_uuid(),
  advice_post_id uuid not null references public.advice_posts(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advice_reports_status_check check (status in ('open', 'reviewed', 'dismissed')),
  constraint advice_reports_reason_len_check check (char_length(reason) between 3 and 120),
  constraint advice_reports_one_per_user_post unique (advice_post_id, reporter_user_id)
);

create index if not exists advice_reports_post_idx on public.advice_reports(advice_post_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
      select count(*)::int
      from public.advice_feedback f
      where f.advice_post_id = target_post and f.is_helpful = true
    ),
    report_count = (
      select count(*)::int
      from public.advice_reports r
      where r.advice_post_id = target_post and r.status = 'open'
    ),
    updated_at = now()
  where p.id = target_post;

  return coalesce(new, old);
end;
$$;

drop trigger if exists advice_posts_touch_updated_at on public.advice_posts;
create trigger advice_posts_touch_updated_at
before update on public.advice_posts
for each row execute function public.touch_updated_at();

drop trigger if exists advice_feedback_touch_updated_at on public.advice_feedback;
create trigger advice_feedback_touch_updated_at
before update on public.advice_feedback
for each row execute function public.touch_updated_at();

drop trigger if exists advice_reports_touch_updated_at on public.advice_reports;
create trigger advice_reports_touch_updated_at
before update on public.advice_reports
for each row execute function public.touch_updated_at();

drop trigger if exists advice_feedback_refresh_counts on public.advice_feedback;
create trigger advice_feedback_refresh_counts
after insert or update or delete on public.advice_feedback
for each row execute function public.refresh_advice_post_counters();

drop trigger if exists advice_reports_refresh_counts on public.advice_reports;
create trigger advice_reports_refresh_counts
after insert or update or delete on public.advice_reports
for each row execute function public.refresh_advice_post_counters();

alter table public.advice_posts enable row level security;
alter table public.advice_feedback enable row level security;
alter table public.advice_reports enable row level security;

create policy "approved advice visible to authenticated"
  on public.advice_posts
  for select
  to authenticated
  using (status = 'approved' or auth.uid() = author_user_id);

create policy "users can submit advice"
  on public.advice_posts
  for insert
  to authenticated
  with check (
    auth.uid() = author_user_id
    and status = 'pending'
  );

create policy "users can edit pending own advice"
  on public.advice_posts
  for update
  to authenticated
  using (auth.uid() = author_user_id and status = 'pending')
  with check (auth.uid() = author_user_id and status = 'pending');

create policy "users can delete pending own advice"
  on public.advice_posts
  for delete
  to authenticated
  using (auth.uid() = author_user_id and status = 'pending');

create policy "users can read own feedback"
  on public.advice_feedback
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users can submit feedback"
  on public.advice_feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update own feedback"
  on public.advice_feedback
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own feedback"
  on public.advice_feedback
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "users can read own reports"
  on public.advice_reports
  for select
  to authenticated
  using (auth.uid() = reporter_user_id);

create policy "users can submit reports"
  on public.advice_reports
  for insert
  to authenticated
  with check (auth.uid() = reporter_user_id);

create policy "users can update own open reports"
  on public.advice_reports
  for update
  to authenticated
  using (auth.uid() = reporter_user_id and status = 'open')
  with check (auth.uid() = reporter_user_id and status = 'open');
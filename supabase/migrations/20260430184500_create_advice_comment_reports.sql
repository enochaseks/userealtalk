create table if not exists public.advice_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.advice_comments(id) on delete cascade,
  advice_post_id uuid not null references public.advice_posts(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text not null default '',
  status text not null default 'open',
  moderator_notes text not null default '',
  ai_decision text,
  ai_confidence numeric,
  ai_summary text,
  ai_source text,
  ai_processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advice_comment_reports_status_check check (status in ('open', 'reviewed', 'dismissed')),
  constraint advice_comment_reports_reason_len_check check (char_length(reason) between 3 and 120),
  constraint advice_comment_reports_ai_decision_check check (ai_decision is null or ai_decision in ('approve', 'reject', 'review')),
  constraint advice_comment_reports_unique_reporter unique (comment_id, reporter_user_id)
);

create index if not exists advice_comment_reports_comment_idx
  on public.advice_comment_reports(comment_id, created_at desc);

create index if not exists advice_comment_reports_post_idx
  on public.advice_comment_reports(advice_post_id, created_at desc);

create index if not exists advice_comment_reports_status_idx
  on public.advice_comment_reports(status, created_at desc);

drop trigger if exists advice_comment_reports_touch_updated_at on public.advice_comment_reports;
create trigger advice_comment_reports_touch_updated_at
before update on public.advice_comment_reports
for each row execute function public.touch_updated_at();

alter table public.advice_comment_reports enable row level security;

create policy "users can read own comment reports"
  on public.advice_comment_reports
  for select
  to authenticated
  using (auth.uid() = reporter_user_id);

create policy "users can submit comment reports"
  on public.advice_comment_reports
  for insert
  to authenticated
  with check (auth.uid() = reporter_user_id);

create policy "users can update own open comment reports"
  on public.advice_comment_reports
  for update
  to authenticated
  using (auth.uid() = reporter_user_id and status = 'open')
  with check (auth.uid() = reporter_user_id and status = 'open');

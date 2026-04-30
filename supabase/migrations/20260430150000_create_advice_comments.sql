create table if not exists public.advice_comments (
  id uuid primary key default gen_random_uuid(),
  advice_post_id uuid not null references public.advice_posts(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advice_comments_body_len_check check (char_length(trim(body)) between 1 and 800)
);

create index if not exists advice_comments_post_created_idx
  on public.advice_comments(advice_post_id, created_at desc);

create index if not exists advice_comments_author_created_idx
  on public.advice_comments(author_user_id, created_at desc);

drop trigger if exists advice_comments_touch_updated_at on public.advice_comments;
create trigger advice_comments_touch_updated_at
before update on public.advice_comments
for each row execute function public.touch_updated_at();

alter table public.advice_comments enable row level security;

drop policy if exists "advice comments visible for approved posts" on public.advice_comments;
create policy "advice comments visible for approved posts"
  on public.advice_comments
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.advice_posts p
      where p.id = advice_comments.advice_post_id
        and p.status = 'approved'
    )
  );

drop policy if exists "users can insert own advice comments" on public.advice_comments;
create policy "users can insert own advice comments"
  on public.advice_comments
  for insert
  to authenticated
  with check (
    auth.uid() = author_user_id
    and exists (
      select 1
      from public.advice_posts p
      where p.id = advice_comments.advice_post_id
        and p.status = 'approved'
    )
  );

drop policy if exists "users can delete own advice comments" on public.advice_comments;
create policy "users can delete own advice comments"
  on public.advice_comments
  for delete
  to authenticated
  using (auth.uid() = author_user_id);

drop policy if exists "post authors can delete comments on their posts" on public.advice_comments;
create policy "post authors can delete comments on their posts"
  on public.advice_comments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.advice_posts p
      where p.id = advice_comments.advice_post_id
        and p.author_user_id = auth.uid()
    )
  );

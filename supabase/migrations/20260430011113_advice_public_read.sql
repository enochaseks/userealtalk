-- Allow unauthenticated (public) users to read approved advice posts
-- Previously only `authenticated` could read, so the public advice library was invisible to visitors and search engines.

drop policy if exists "approved advice visible to anon" on public.advice_posts;

create policy "approved advice visible to anon"
  on public.advice_posts
  for select
  to anon
  using (status = 'approved');

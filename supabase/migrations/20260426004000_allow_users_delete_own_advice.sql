drop policy if exists "users can delete pending own advice"
  on public.advice_posts;

drop policy if exists "users can delete own advice"
  on public.advice_posts;

create policy "users can delete own advice"
  on public.advice_posts
  for delete
  to authenticated
  using (auth.uid() = author_user_id);

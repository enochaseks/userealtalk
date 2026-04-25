drop policy if exists "users can edit pending own advice"
  on public.advice_posts;

create policy "users can edit own resubmittable advice"
  on public.advice_posts
  for update
  to authenticated
  using (
    auth.uid() = author_user_id
    and status in ('pending', 'rejected', 'removed')
  )
  with check (
    auth.uid() = author_user_id
    and status = 'pending'
  );

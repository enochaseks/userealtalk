-- Give specific allowlisted accounts a Professional default subscription.
-- This updates existing rows and creates missing rows for those accounts.
insert into public.user_subscriptions (user_id, plan, status)
select u.id, 'professional', 'active'
from auth.users u
where lower(coalesce(u.email, '')) in ('enochaseks@yahoo.co.uk', 'enochaseks@gmail.com')
  and not exists (
    select 1
    from public.user_subscriptions s
    where s.user_id = u.id
  );

update public.user_subscriptions s
set
  plan = 'professional',
  status = 'active',
  updated_at = now()
from auth.users u
where s.user_id = u.id
  and lower(coalesce(u.email, '')) in ('enochaseks@yahoo.co.uk', 'enochaseks@gmail.com')
  and s.plan = 'free';

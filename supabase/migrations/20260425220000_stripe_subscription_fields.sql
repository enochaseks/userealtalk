-- Add Stripe-specific fields to user_subscriptions
alter table public.user_subscriptions
  add column if not exists stripe_price_id text,
  add column if not exists cancel_at_period_end boolean not null default false;

-- Index for webhook lookups by Stripe customer ID
create index if not exists user_subscriptions_provider_customer_idx
  on public.user_subscriptions (provider_customer_id)
  where provider_customer_id is not null;

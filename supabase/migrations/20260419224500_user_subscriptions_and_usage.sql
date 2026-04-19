create table if not exists public.user_subscriptions (
  user_id uuid primary key,
  plan text not null default 'free' check (plan in ('free', 'pro', 'platinum')),
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due', 'incomplete', 'trialing')),
  billing_provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_feature_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  feature text not null check (feature in ('deep_thinking', 'plan', 'gmail_send')),
  period_type text not null check (period_type in ('day', 'month')),
  period_key text not null,
  used_count integer not null default 0 check (used_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, feature, period_type, period_key)
);

alter table public.user_subscriptions enable row level security;
alter table public.user_feature_usage enable row level security;

drop policy if exists "Users can view own subscription" on public.user_subscriptions;
create policy "Users can view own subscription"
  on public.user_subscriptions
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own subscription" on public.user_subscriptions;
create policy "Users can create own subscription"
  on public.user_subscriptions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own subscription" on public.user_subscriptions;
create policy "Users can update own subscription"
  on public.user_subscriptions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can view own feature usage" on public.user_feature_usage;
create policy "Users can view own feature usage"
  on public.user_feature_usage
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own feature usage" on public.user_feature_usage;
create policy "Users can create own feature usage"
  on public.user_feature_usage
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own feature usage" on public.user_feature_usage;
create policy "Users can update own feature usage"
  on public.user_feature_usage
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_subscriptions_updated_at on public.user_subscriptions;
create trigger set_user_subscriptions_updated_at
before update on public.user_subscriptions
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists set_user_feature_usage_updated_at on public.user_feature_usage;
create trigger set_user_feature_usage_updated_at
before update on public.user_feature_usage
for each row execute function public.set_updated_at_timestamp();

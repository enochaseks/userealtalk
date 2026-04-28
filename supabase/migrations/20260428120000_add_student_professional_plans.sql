-- Add student and professional to the plan CHECK constraint on user_subscriptions
alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_plan_check;

alter table public.user_subscriptions
  add constraint user_subscriptions_plan_check
  check (plan in ('free', 'pro', 'platinum', 'student', 'professional'));

-- Add cv_toolkit to the feature CHECK constraint on user_feature_usage
alter table public.user_feature_usage
  drop constraint if exists user_feature_usage_feature_check;

alter table public.user_feature_usage
  add constraint user_feature_usage_feature_check
  check (feature in ('deep_thinking', 'plan', 'gmail_send', 'voice_input', 'journal_save', 'cv_toolkit'));

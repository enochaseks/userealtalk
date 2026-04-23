alter table public.user_feature_usage
  drop constraint if exists user_feature_usage_feature_check;

alter table public.user_feature_usage
  add constraint user_feature_usage_feature_check
  check (feature in ('deep_thinking', 'plan', 'gmail_send', 'voice_input'));

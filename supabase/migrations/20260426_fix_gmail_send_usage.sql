-- Fix gmail_send usage tracking
-- Reset all gmail_send usage records to 0 for current month (April 2026)
-- to resolve the issue where users show limit reached without using the feature

DELETE FROM public.user_feature_usage
WHERE feature = 'gmail_send' 
AND period_type = 'month'
AND period_key != '2026-04';

-- Reset all April 2026 gmail_send records to 0
UPDATE public.user_feature_usage
SET used_count = 0
WHERE feature = 'gmail_send'
AND period_type = 'month'  
AND period_key = '2026-04';

-- Safari/mobile stability hotfix:
-- Remove base64 avatar payloads from auth metadata to avoid oversized JWT/session headers.

update auth.users
set raw_user_meta_data =
  case
    when coalesce(raw_user_meta_data->>'avatar_url', '') like 'data:%'
      then (raw_user_meta_data - 'avatar_data_url' - 'avatar_url')
    else (raw_user_meta_data - 'avatar_data_url')
  end
where raw_user_meta_data ? 'avatar_data_url'
   or coalesce(raw_user_meta_data->>'avatar_url', '') like 'data:%';

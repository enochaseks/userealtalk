insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  4194304,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can read their own chat attachments'
  ) then
    create policy "Users can read their own chat attachments"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'chat-attachments'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can upload their own chat attachments'
  ) then
    create policy "Users can upload their own chat attachments"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'chat-attachments'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can update their own chat attachments'
  ) then
    create policy "Users can update their own chat attachments"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'chat-attachments'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'chat-attachments'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can delete their own chat attachments'
  ) then
    create policy "Users can delete their own chat attachments"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'chat-attachments'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

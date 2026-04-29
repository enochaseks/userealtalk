-- Add slug column to advice_posts table
alter table public.advice_posts 
  add column slug text default '';

-- Create function to generate URL-safe slugs from title
create or replace function public.generate_slug(title text)
returns text
language plpgsql
as $$
declare
  slug text;
  suffix text;
  base_slug text;
  counter int := 1;
  existing_count int;
begin
  -- Convert title to lowercase and replace non-alphanumeric chars with hyphens
  base_slug := lower(title);
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  base_slug := substring(base_slug, 1, 50); -- truncate to 50 chars max
  
  slug := base_slug;
  
  -- Check for uniqueness and append counter if needed
  loop
    select count(*) into existing_count 
    from public.advice_posts 
    where public.advice_posts.slug = slug 
      and public.advice_posts.id != coalesce(current_setting('advice.post_id', true), 'null');
    
    if existing_count = 0 then
      return slug;
    end if;
    
    suffix := '-' || counter::text;
    slug := substring(base_slug, 1, 50 - length(suffix)) || suffix;
    counter := counter + 1;
    
    if counter > 1000 then
      return base_slug || '-' || gen_random_uuid()::text; -- fallback
    end if;
  end loop;
end;
$$;

-- Populate slugs for existing advice posts
do $$
declare
  post record;
  slug text;
begin
  for post in select id, title from public.advice_posts where slug = '' or slug is null
  loop
    slug := public.generate_slug(post.title);
    update public.advice_posts 
    set slug = slug 
    where id = post.id;
  end loop;
end;
$$;

-- Make slug column unique and not null
alter table public.advice_posts 
  alter column slug set not null,
  add constraint advice_posts_slug_unique unique(slug);

-- Create index on slug for faster queries
create index if not exists advice_posts_slug_idx on public.advice_posts(slug);

-- Create trigger to auto-generate slug when new advice post is created
create or replace function public.set_advice_post_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.generate_slug(new.title);
  end if;
  return new;
end;
$$;

drop trigger if exists advice_posts_set_slug on public.advice_posts;
create trigger advice_posts_set_slug
before insert on public.advice_posts
for each row execute function public.set_advice_post_slug();

-- Make advice slug setup idempotent and self-healing.

alter table public.advice_posts
  add column if not exists slug text;

create or replace function public.generate_slug(title text, p_post_id uuid default null)
returns text
language plpgsql
as $$
declare
  candidate text;
  base_slug text;
  suffix text;
  counter int := 1;
begin
  base_slug := lower(coalesce(title, ''));
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  base_slug := substring(base_slug, 1, 50);

  if base_slug = '' then
    base_slug := 'advice';
  end if;

  candidate := base_slug;

  loop
    if not exists (
      select 1
      from public.advice_posts p
      where p.slug = candidate
        and (p_post_id is null or p.id <> p_post_id)
    ) then
      return candidate;
    end if;

    suffix := '-' || counter::text;
    candidate := substring(base_slug, 1, greatest(1, 50 - length(suffix))) || suffix;
    counter := counter + 1;

    if counter > 1000 then
      return substring(base_slug, 1, 36) || '-' || left(replace(gen_random_uuid()::text, '-', ''), 12);
    end if;
  end loop;
end;
$$;

update public.advice_posts p
set slug = public.generate_slug(p.title, p.id)
where p.slug is null or btrim(p.slug) = '';

with duplicates as (
  select id
  from (
    select id, row_number() over (partition by slug order by created_at, id) as rn
    from public.advice_posts
    where slug is not null and btrim(slug) <> ''
  ) x
  where x.rn > 1
)
update public.advice_posts p
set slug = public.generate_slug(p.title, p.id)
from duplicates d
where p.id = d.id;

alter table public.advice_posts
  alter column slug set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'advice_posts_slug_unique'
      and conrelid = 'public.advice_posts'::regclass
  ) then
    alter table public.advice_posts
      add constraint advice_posts_slug_unique unique(slug);
  end if;
end $$;

create index if not exists advice_posts_slug_idx on public.advice_posts(slug);

create or replace function public.set_advice_post_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := public.generate_slug(new.title, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists advice_posts_set_slug on public.advice_posts;
create trigger advice_posts_set_slug
before insert on public.advice_posts
for each row execute function public.set_advice_post_slug();

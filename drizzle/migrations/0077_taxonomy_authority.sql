-- STEP T2 — Taxonomy authority (additive, non-destructive).
-- No existing table, column, enum value or row is altered or removed.

create table if not exists public.taxonomy_role_groups (
  code text primary key,
  labels jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.taxonomy_sub_roles (
  role_group_code text not null references public.taxonomy_role_groups(code) on update cascade,
  code text not null,
  labels jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role_group_code, code)
);

create table if not exists public.taxonomy_skills (
  code text primary key,
  labels jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.taxonomy_skill_role_groups (
  skill_code text not null references public.taxonomy_skills(code) on update cascade,
  role_group_code text not null references public.taxonomy_role_groups(code) on update cascade,
  primary key (skill_code, role_group_code)
);

create table if not exists public.taxonomy_disciplines (
  code text primary key,
  labels jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.taxonomy_languages (
  code text primary key,
  labels jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Data API grants: taxonomy is public read-only reference data (public profile and
-- market pages render its labels). All writes go through admin SECURITY DEFINER RPCs.
grant select on public.taxonomy_role_groups to anon, authenticated;
grant select on public.taxonomy_sub_roles to anon, authenticated;
grant select on public.taxonomy_skills to anon, authenticated;
grant select on public.taxonomy_skill_role_groups to anon, authenticated;
grant select on public.taxonomy_disciplines to anon, authenticated;
grant select on public.taxonomy_languages to anon, authenticated;
grant all on public.taxonomy_role_groups to service_role;
grant all on public.taxonomy_sub_roles to service_role;
grant all on public.taxonomy_skills to service_role;
grant all on public.taxonomy_skill_role_groups to service_role;
grant all on public.taxonomy_disciplines to service_role;
grant all on public.taxonomy_languages to service_role;

alter table public.taxonomy_role_groups enable row level security;
alter table public.taxonomy_sub_roles enable row level security;
alter table public.taxonomy_skills enable row level security;
alter table public.taxonomy_skill_role_groups enable row level security;
alter table public.taxonomy_disciplines enable row level security;
alter table public.taxonomy_languages enable row level security;

create policy "taxonomy_role_groups_read" on public.taxonomy_role_groups for select to anon, authenticated using (true);
create policy "taxonomy_sub_roles_read" on public.taxonomy_sub_roles for select to anon, authenticated using (true);
create policy "taxonomy_skills_read" on public.taxonomy_skills for select to anon, authenticated using (true);
create policy "taxonomy_skill_role_groups_read" on public.taxonomy_skill_role_groups for select to anon, authenticated using (true);
create policy "taxonomy_disciplines_read" on public.taxonomy_disciplines for select to anon, authenticated using (true);
create policy "taxonomy_languages_read" on public.taxonomy_languages for select to anon, authenticated using (true);

-- Hard delete of a taxonomy identity is never allowed: deactivate instead.
create or replace function public.tg_taxonomy_no_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Taxonomy entries cannot be deleted; deactivate them instead';
end $$;

create trigger taxonomy_role_groups_no_delete before delete on public.taxonomy_role_groups for each row execute function public.tg_taxonomy_no_delete();
create trigger taxonomy_sub_roles_no_delete before delete on public.taxonomy_sub_roles for each row execute function public.tg_taxonomy_no_delete();
create trigger taxonomy_skills_no_delete before delete on public.taxonomy_skills for each row execute function public.tg_taxonomy_no_delete();
create trigger taxonomy_disciplines_no_delete before delete on public.taxonomy_disciplines for each row execute function public.tg_taxonomy_no_delete();
create trigger taxonomy_languages_no_delete before delete on public.taxonomy_languages for each row execute function public.tg_taxonomy_no_delete();

-- ---------- Admin write authority ----------

create or replace function public.taxonomy_assert_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden: admin only' using errcode = '42501';
  end if;
end $$;

create or replace function public.taxonomy_normalize_code(p text)
returns text language plpgsql immutable as $$
declare c text;
begin
  c := lower(regexp_replace(coalesce(trim(p), ''), '[^A-Za-z0-9_]+', '_', 'g'));
  c := regexp_replace(c, '_+', '_', 'g');
  c := trim(both '_' from c);
  if length(c) < 2 or length(c) > 64 then
    raise exception 'Invalid taxonomy code: %', p;
  end if;
  return c;
end $$;

-- Upsert a taxonomy identity. p_kind: role_group | sub_role | skill | discipline | language.
-- The code is the immutable identity; labels/order/active are editable.
create or replace function public.admin_taxonomy_upsert(
  p_kind text,
  p_code text,
  p_parent text default null,
  p_labels jsonb default null,
  p_sort integer default null,
  p_active boolean default null,
  p_expected_version integer default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_existing integer;
  v_new integer;
  v_created boolean := false;
begin
  perform public.taxonomy_assert_admin();
  v_code := public.taxonomy_normalize_code(p_code);

  if p_labels is not null and (jsonb_typeof(p_labels) <> 'object'
      or coalesce(trim(p_labels->>'en'), '') = '') then
    raise exception 'An English label is required';
  end if;

  if p_kind = 'role_group' then
    select version into v_existing from public.taxonomy_role_groups where code = v_code;
  elsif p_kind = 'sub_role' then
    if p_parent is null then raise exception 'A macro-role is required for a sub-role'; end if;
    if not exists (select 1 from public.taxonomy_role_groups where code = p_parent) then
      raise exception 'Unknown macro-role: %', p_parent;
    end if;
    select version into v_existing from public.taxonomy_sub_roles where role_group_code = p_parent and code = v_code;
  elsif p_kind = 'skill' then
    select version into v_existing from public.taxonomy_skills where code = v_code;
  elsif p_kind = 'discipline' then
    select version into v_existing from public.taxonomy_disciplines where code = v_code;
  elsif p_kind = 'language' then
    select version into v_existing from public.taxonomy_languages where code = v_code;
  else
    raise exception 'Unknown taxonomy kind: %', p_kind;
  end if;

  if v_existing is null then
    if p_labels is null then raise exception 'Labels are required when creating a taxonomy entry'; end if;
    v_created := true;
    if p_kind = 'discipline' then
      -- Keeps the historical `discipline` enum authoritative for existing columns while
      -- removing the need for a hand-written migration when an admin adds a championship.
      execute format('alter type public.discipline add value if not exists %L', v_code);
    end if;
  elsif p_expected_version is not null and p_expected_version <> v_existing then
    return jsonb_build_object('ok', false, 'conflict', 'stale_version',
                              'current_version', v_existing, 'expected_version', p_expected_version);
  end if;

  if p_kind = 'role_group' then
    insert into public.taxonomy_role_groups (code, labels, sort_order, is_active)
      values (v_code, coalesce(p_labels, '{}'::jsonb), coalesce(p_sort, 0), coalesce(p_active, true))
    on conflict (code) do update set
      labels = coalesce(p_labels, taxonomy_role_groups.labels),
      sort_order = coalesce(p_sort, taxonomy_role_groups.sort_order),
      is_active = coalesce(p_active, taxonomy_role_groups.is_active),
      version = taxonomy_role_groups.version + 1,
      updated_at = now()
    returning version into v_new;
  elsif p_kind = 'sub_role' then
    insert into public.taxonomy_sub_roles (role_group_code, code, labels, sort_order, is_active)
      values (p_parent, v_code, coalesce(p_labels, '{}'::jsonb), coalesce(p_sort, 0), coalesce(p_active, true))
    on conflict (role_group_code, code) do update set
      labels = coalesce(p_labels, taxonomy_sub_roles.labels),
      sort_order = coalesce(p_sort, taxonomy_sub_roles.sort_order),
      is_active = coalesce(p_active, taxonomy_sub_roles.is_active),
      version = taxonomy_sub_roles.version + 1,
      updated_at = now()
    returning version into v_new;
  elsif p_kind = 'skill' then
    insert into public.taxonomy_skills (code, labels, sort_order, is_active)
      values (v_code, coalesce(p_labels, '{}'::jsonb), coalesce(p_sort, 0), coalesce(p_active, true))
    on conflict (code) do update set
      labels = coalesce(p_labels, taxonomy_skills.labels),
      sort_order = coalesce(p_sort, taxonomy_skills.sort_order),
      is_active = coalesce(p_active, taxonomy_skills.is_active),
      version = taxonomy_skills.version + 1,
      updated_at = now()
    returning version into v_new;
  elsif p_kind = 'discipline' then
    insert into public.taxonomy_disciplines (code, labels, sort_order, is_active)
      values (v_code, coalesce(p_labels, '{}'::jsonb), coalesce(p_sort, 0), coalesce(p_active, true))
    on conflict (code) do update set
      labels = coalesce(p_labels, taxonomy_disciplines.labels),
      sort_order = coalesce(p_sort, taxonomy_disciplines.sort_order),
      is_active = coalesce(p_active, taxonomy_disciplines.is_active),
      version = taxonomy_disciplines.version + 1,
      updated_at = now()
    returning version into v_new;
  else
    insert into public.taxonomy_languages (code, labels, sort_order, is_active)
      values (v_code, coalesce(p_labels, '{}'::jsonb), coalesce(p_sort, 0), coalesce(p_active, true))
    on conflict (code) do update set
      labels = coalesce(p_labels, taxonomy_languages.labels),
      sort_order = coalesce(p_sort, taxonomy_languages.sort_order),
      is_active = coalesce(p_active, taxonomy_languages.is_active),
      version = taxonomy_languages.version + 1,
      updated_at = now()
    returning version into v_new;
  end if;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null,
          case when v_created then 'taxonomy_create' else 'taxonomy_update' end,
          jsonb_build_object('kind', p_kind, 'code', v_code, 'parent', p_parent,
                             'labels', p_labels, 'sort_order', p_sort, 'is_active', p_active,
                             'version', v_new));

  return jsonb_build_object('ok', true, 'kind', p_kind, 'code', v_code,
                            'parent', p_parent, 'version', v_new, 'created', v_created);
end $$;

-- Skill <-> macro-role associations are presentation defaults only. Replaced atomically.
create or replace function public.admin_taxonomy_set_skill_groups(p_skill text, p_groups text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_bad text;
begin
  perform public.taxonomy_assert_admin();
  if not exists (select 1 from public.taxonomy_skills where code = p_skill) then
    raise exception 'Unknown skill: %', p_skill;
  end if;
  select g into v_bad from unnest(coalesce(p_groups, '{}'::text[])) g
    where not exists (select 1 from public.taxonomy_role_groups r where r.code = g) limit 1;
  if v_bad is not null then raise exception 'Unknown macro-role: %', v_bad; end if;

  delete from public.taxonomy_skill_role_groups where skill_code = p_skill;
  insert into public.taxonomy_skill_role_groups (skill_code, role_group_code)
    select p_skill, g from unnest(coalesce(p_groups, '{}'::text[])) g
    on conflict do nothing;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'taxonomy_skill_associations',
          jsonb_build_object('skill', p_skill, 'groups', to_jsonb(coalesce(p_groups, '{}'::text[]))));

  return jsonb_build_object('ok', true, 'skill', p_skill, 'groups', to_jsonb(coalesce(p_groups, '{}'::text[])));
end $$;

-- Live usage counts across the current (non-historical) surfaces an admin needs before
-- deactivating a value. Single pass per surface; no per-row fan-out.
create or replace function public.admin_taxonomy_usage()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.taxonomy_assert_admin();
  select jsonb_build_object(
    'role_group', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
        select k, sum(n) n from (
          select role_group k, count(*) n from public.freelancer_profiles where role_group is not null group by 1
          union all select role_group, count(*) from public.requests where role_group is not null group by 1
        ) a group by k) b),
    'sub_role', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
        select k, sum(n) n from (
          select x->>'sub_role' k, count(*) n from public.freelancer_profiles, lateral jsonb_array_elements(sub_roles) x group by 1
          union all select sub_role, count(*) from public.requests where sub_role is not null group by 1
        ) a where k is not null group by k) b),
    'skill', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
        select k, sum(n) n from (
          select s k, count(*) n from public.freelancer_profiles, unnest(skills) s group by 1
          union all select s, count(*) from public.requests, unnest(skills) s group by 1
          union all select s, count(*) from public.requests, unnest(skills_hard) s group by 1
        ) a group by k) b),
    'discipline', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
        select k, sum(n) n from (
          select d::text k, count(*) n from public.freelancer_profiles, unnest(disciplines) d group by 1
          union all select discipline::text, count(*) from public.requests group by 1
          union all select x->>'discipline', count(*) from public.freelancer_profiles, lateral jsonb_array_elements(experiences) x group by 1
          union all select x->>'discipline', count(*) from public.requests, lateral jsonb_array_elements(experience_requirements) x group by 1
        ) a where k is not null group by k) b),
    'language', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
        select k, sum(n) n from (
          select x->>'code' k, count(*) n from public.freelancer_profiles, lateral jsonb_array_elements(languages) x group by 1
          union all select x->>'code', count(*) from public.requests, lateral jsonb_array_elements(languages) x group by 1
        ) a where k is not null group by k) b)
  ) into v;
  return v;
end $$;

revoke all on function public.admin_taxonomy_upsert(text, text, text, jsonb, integer, boolean, integer) from public, anon;
revoke all on function public.admin_taxonomy_set_skill_groups(text, text[]) from public, anon;
revoke all on function public.admin_taxonomy_usage() from public, anon;
grant execute on function public.admin_taxonomy_upsert(text, text, text, jsonb, integer, boolean, integer) to authenticated, service_role;
grant execute on function public.admin_taxonomy_set_skill_groups(text, text[]) to authenticated, service_role;
grant execute on function public.admin_taxonomy_usage() to authenticated, service_role;
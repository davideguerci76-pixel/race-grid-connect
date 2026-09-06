CREATE OR REPLACE FUNCTION public.admin_taxonomy_upsert(p_kind text, p_code text, p_parent text DEFAULT NULL::text, p_labels jsonb DEFAULT NULL::jsonb, p_sort integer DEFAULT NULL::integer, p_active boolean DEFAULT NULL::boolean, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  elsif p_expected_version is null then
    -- A create attempt (no expected_version) whose normalized code already exists must not
    -- silently overwrite the existing entry's labels, order or status.
    return jsonb_build_object('ok', false, 'conflict', 'code_exists',
                              'code', v_code, 'kind', p_kind, 'current_version', v_existing);
  elsif p_expected_version <> v_existing then
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

  insert into public.admin_audit_log (admin_id, action, details)
  values (auth.uid(), case when v_created then 'taxonomy_create' else 'taxonomy_update' end,
          jsonb_build_object('kind', p_kind, 'code', v_code, 'parent', p_parent,
                             'labels', p_labels, 'sort_order', p_sort, 'is_active', p_active,
                             'version', v_new));

  return jsonb_build_object('ok', true, 'kind', p_kind, 'code', v_code, 'parent', p_parent,
                            'created', v_created, 'version', v_new);
end;
$function$;
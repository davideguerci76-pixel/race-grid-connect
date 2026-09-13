-- OPS-BR-01B — BACKUP ALL (LIVE) v1
-- Single-statement, read-only export of LIVE business data + real-database architecture snapshot.
-- Executable ONLY by service_role (server-side, after Admin role + fresh re-authentication checks).
-- Never returns secrets: email_hook_config, push_subscriptions, auth credentials are never selected.

CREATE OR REPLACE FUNCTION public.backup_all_live_export()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  _business jsonb;
  _arch jsonb;
  _mig_supabase jsonb := '[]'::jsonb;
  _mig_drizzle jsonb := '[]'::jsonb;
  _cron jsonb := '[]'::jsonb;
BEGIN
  -- ------------------------------------------------------------------
  -- BUSINESS DATA — LIVE ONLY (is_test = false, or parent relation LIVE)
  -- ------------------------------------------------------------------
  _business := jsonb_build_object(
    -- IDENTITY / PROFILE
    'profiles',            (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at, t.id), '[]') FROM public.profiles t WHERE t.is_test = false),
    'freelancer_profiles', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.user_id), '[]') FROM public.freelancer_profiles t WHERE t.is_test = false),
    'team_profiles',       (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.user_id), '[]') FROM public.team_profiles t WHERE t.is_test = false),
    'freelancer_contacts', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.user_id), '[]') FROM public.freelancer_contacts t
                              WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.user_id AND p.is_test = false)),
    'user_roles',          (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.user_id, t.role), '[]') FROM public.user_roles t
                              WHERE t.role = 'admin' OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.user_id AND p.is_test = false)),
    'billing_details',     (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.user_id), '[]') FROM public.billing_details t WHERE t.is_test = false),
    'legal_acceptances',   (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.legal_acceptances t WHERE t.is_test = false),
    -- AVAILABILITY / CALENDAR
    'availability',        (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.freelancer_id, t.day), '[]') FROM public.availability t WHERE t.is_test = false),
    'user_calendars',      (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.user_calendars t WHERE t.is_test = false),
    'calendar_day_notes',  (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.calendar_day_notes t WHERE t.is_test = false),
    -- PIT CALL / ENGAGEMENT
    'requests',            (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at, t.id), '[]') FROM public.requests t WHERE t.is_test = false),
    'engagements',         (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at, t.id), '[]') FROM public.engagements t WHERE t.is_test = false),
    -- RATINGS
    'ratings',             (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.ratings t WHERE t.is_test = false),
    'rating_bonus_grants', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.user_id, t.engagement_id), '[]') FROM public.rating_bonus_grants t WHERE t.is_test = false),
    -- TOKEN ECONOMY
    'token_transactions',  (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at, t.id), '[]') FROM public.token_transactions t WHERE t.is_test = false),
    'token_orders',        (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at, t.id), '[]') FROM public.token_orders t WHERE t.is_test = false),
    'token_order_events',  (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.token_order_events t WHERE t.is_test = false),
    -- PLATFORM BUSINESS CONFIG (environment-agnostic)
    'platform_settings',   (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.key), '[]') FROM public.platform_settings t),
    'matching_weights',    (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]') FROM public.matching_weights t),
    'token_packages',      (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]') FROM public.token_packages t),
    'taxonomy_disciplines',      (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]') FROM public.taxonomy_disciplines t),
    'taxonomy_languages',        (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]') FROM public.taxonomy_languages t),
    'taxonomy_role_groups',      (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]') FROM public.taxonomy_role_groups t),
    'taxonomy_sub_roles',        (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]') FROM public.taxonomy_sub_roles t),
    'taxonomy_skills',           (SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]') FROM public.taxonomy_skills t),
    'taxonomy_skill_role_groups',(SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]') FROM public.taxonomy_skill_role_groups t),
    'admin_emails',        (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.email), '[]') FROM public.admin_emails t),
    -- USEFUL
    'matches',             (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.matches t WHERE t.is_test = false),
    'match_history',       (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.match_history t WHERE t.is_test = false),
    'team_pool',           (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.team_pool t WHERE t.is_test = false),
    'match_unlocks',       (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.match_unlocks t
                              WHERE EXISTS (SELECT 1 FROM public.requests r WHERE r.id = t.request_id AND r.is_test = false)),
    'request_tier_unlocks',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.request_tier_unlocks t
                              WHERE EXISTS (SELECT 1 FROM public.requests r WHERE r.id = t.request_id AND r.is_test = false)),
    'pool_search_unlocks', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.pool_search_unlocks t
                              WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.team_id AND p.is_test = false)),
    'review_unlocks',      (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.review_unlocks t
                              WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.user_id AND p.is_test = false)),
    'team_reveals',        (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.team_reveals t
                              WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.user_id AND p.is_test = false)),
    'request_team_reveals',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.request_team_reveals t
                              WHERE EXISTS (SELECT 1 FROM public.requests r WHERE r.id = t.request_id AND r.is_test = false)),
    'sos_calls',           (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.sos_calls t WHERE t.is_test = false),
    'sos_call_targets',    (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.sos_call_targets t
                              WHERE EXISTS (SELECT 1 FROM public.sos_calls s WHERE s.id = t.sos_id AND s.is_test = false)),
    'rating_flags',        (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.rating_flags t
                              WHERE EXISTS (SELECT 1 FROM public.ratings r WHERE r.id = t.rating_id AND r.is_test = false)),
    'admin_audit_log',     (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at, t.id), '[]') FROM public.admin_audit_log t),
    'notifications',       (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.notifications t WHERE t.is_test = false)
  );

  -- ------------------------------------------------------------------
  -- ARCHITECTURE SNAPSHOT — real catalog state (not the repository)
  -- ------------------------------------------------------------------
  BEGIN
    SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.version), '[]') INTO _mig_supabase
      FROM (SELECT version, name FROM supabase_migrations.schema_migrations) m;
  EXCEPTION WHEN OTHERS THEN _mig_supabase := jsonb_build_array(jsonb_build_object('error', SQLERRM));
  END;
  BEGIN
    SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id), '[]') INTO _mig_drizzle
      FROM (SELECT id, hash, created_at FROM drizzle.__drizzle_migrations) m;
  EXCEPTION WHEN OTHERS THEN _mig_drizzle := jsonb_build_array(jsonb_build_object('error', SQLERRM));
  END;
  BEGIN
    SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY j.jobid), '[]') INTO _cron
      FROM (SELECT jobid, jobname, schedule, command, nodename, database, username, active FROM cron.job) j;
  EXCEPTION WHEN OTHERS THEN _cron := jsonb_build_array(jsonb_build_object('error', SQLERRM));
  END;

  _arch := jsonb_build_object(
    'captured_at', now(),
    'server_version', current_setting('server_version'),
    'schemas', (SELECT coalesce(jsonb_agg(nspname ORDER BY nspname), '[]') FROM pg_namespace
                  WHERE nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema'),
    'tables', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'schema', n.nspname, 'name', c.relname,
                  'rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity,
                  'owner', pg_get_userbyid(c.relowner), 'acl', c.relacl::text
                ) ORDER BY n.nspname, c.relname), '[]')
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind IN ('r','p') AND n.nspname = 'public'),
    'columns', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'table', table_name, 'name', column_name, 'position', ordinal_position,
                  'type', data_type, 'udt', udt_name, 'nullable', is_nullable, 'default', column_default,
                  'char_max', character_maximum_length, 'num_precision', numeric_precision, 'num_scale', numeric_scale,
                  'identity', is_identity, 'generated', is_generated
                ) ORDER BY table_name, ordinal_position), '[]')
                FROM information_schema.columns WHERE table_schema = 'public'),
    'enums', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'name', t.typname,
                  'values', (SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid)
                ) ORDER BY t.typname), '[]')
                FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                WHERE n.nspname = 'public' AND t.typtype = 'e'),
    'constraints', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'table', rel.relname, 'name', con.conname, 'type', con.contype,
                  'definition', pg_get_constraintdef(con.oid, true),
                  'sql', format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;', rel.relname, con.conname, pg_get_constraintdef(con.oid, true))
                ) ORDER BY rel.relname, con.contype, con.conname), '[]')
                FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE n.nspname = 'public'),
    'indexes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'table', tablename, 'name', indexname, 'definition', indexdef
                ) ORDER BY tablename, indexname), '[]')
                FROM pg_indexes WHERE schemaname = 'public'),
    'functions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'name', p.proname, 'kind', p.prokind, 'identity', p.oid::regprocedure::text,
                  'language', l.lanname, 'security_definer', p.prosecdef, 'volatility', p.provolatile,
                  'returns', pg_get_function_result(p.oid), 'owner', pg_get_userbyid(p.proowner),
                  'acl', p.proacl::text, 'config', p.proconfig,
                  'definition', CASE WHEN p.prokind IN ('f','p') THEN pg_get_functiondef(p.oid) ELSE NULL END
                ) ORDER BY p.proname, p.oid), '[]')
                FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
                WHERE n.nspname = 'public'),
    'triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'schema', n.nspname, 'table', c.relname, 'name', t.tgname, 'enabled', t.tgenabled,
                  'definition', pg_get_triggerdef(t.oid, true)
                ) ORDER BY n.nspname, c.relname, t.tgname), '[]')
                FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth')),
    'policies', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'table', tablename, 'name', policyname, 'permissive', permissive, 'roles', roles,
                  'command', cmd, 'using', qual, 'with_check', with_check
                ) ORDER BY tablename, policyname), '[]')
                FROM pg_policies WHERE schemaname = 'public'),
    'table_grants', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'table', table_name, 'grantee', grantee, 'privilege', privilege_type
                ) ORDER BY table_name, grantee, privilege_type), '[]')
                FROM information_schema.role_table_grants
                WHERE table_schema = 'public' AND grantee IN ('anon','authenticated','service_role','PUBLIC')),
    'routine_grants', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'routine', specific_name, 'name', routine_name, 'grantee', grantee, 'privilege', privilege_type
                ) ORDER BY routine_name, grantee), '[]')
                FROM information_schema.role_routine_grants
                WHERE specific_schema = 'public' AND grantee IN ('anon','authenticated','service_role','PUBLIC')),
    'default_acls', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'role', pg_get_userbyid(d.defaclrole), 'schema', n.nspname, 'objtype', d.defaclobjtype, 'acl', d.defaclacl::text
                )), '[]')
                FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace),
    'sequences', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]') FROM (SELECT sequence_name, data_type, start_value, increment FROM information_schema.sequences WHERE sequence_schema = 'public') s),
    'views', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', viewname, 'definition', definition) ORDER BY viewname), '[]') FROM pg_views WHERE schemaname = 'public'),
    'extensions', (SELECT coalesce(jsonb_agg(jsonb_build_object('name', e.extname, 'version', e.extversion, 'schema', n.nspname) ORDER BY e.extname), '[]')
                FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace),
    'publications', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'name', p.pubname, 'all_tables', p.puballtables, 'insert', p.pubinsert, 'update', p.pubupdate, 'delete', p.pubdelete,
                  'tables', (SELECT coalesce(jsonb_agg(pt.schemaname || '.' || pt.tablename ORDER BY pt.tablename), '[]') FROM pg_publication_tables pt WHERE pt.pubname = p.pubname)
                ) ORDER BY p.pubname), '[]') FROM pg_publication p),
    'cron_jobs', _cron,
    'migration_state', jsonb_build_object(
        'supabase_migrations', _mig_supabase,
        'drizzle_migrations', _mig_drizzle
    ),
    'auth_schema_note', 'Only application-level triggers on auth.* tables are captured. The managed auth schema, Auth configuration, providers and credentials are NOT part of this snapshot.'
  );

  RETURN jsonb_build_object(
    'snapshot_time', now(),
    'transaction_id', txid_current_if_assigned(),
    'business', _business,
    'architecture', _arch
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backup_all_live_export() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backup_all_live_export() FROM anon;
REVOKE ALL ON FUNCTION public.backup_all_live_export() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backup_all_live_export() TO service_role;

COMMENT ON FUNCTION public.backup_all_live_export() IS
  'OPS-BR-01B Backup All (LIVE): read-only LIVE business export + real catalog architecture snapshot. service_role only; caller must be a re-authenticated Admin (enforced server-side).';
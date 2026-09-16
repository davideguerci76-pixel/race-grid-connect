-- BLACKLIST-02 — Double-blind private blacklist.
-- Directional record (blocker -> blocked), symmetric effect on pairing.
-- Creation authority: ONLY a grace cancellation made by the actor, or a no-show
-- engagement (Team side). No client INSERT. No notification to the counterparty.

-- 1) Table -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocked_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_engagement_id uuid REFERENCES public.engagements(id) ON DELETE SET NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('cancel_grace', 'no_show')),
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocked_pairs_no_self CHECK (blocker_user_id <> blocked_user_id),
  CONSTRAINT blocked_pairs_unique UNIQUE (blocker_user_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS blocked_pairs_blocked_idx ON public.blocked_pairs (blocked_user_id);

-- 2) Grants: owner-only reads/removals, never anon, never client INSERT -------
GRANT SELECT, DELETE ON public.blocked_pairs TO authenticated;
GRANT ALL ON public.blocked_pairs TO service_role;

ALTER TABLE public.blocked_pairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own blocks readable" ON public.blocked_pairs;
CREATE POLICY "own blocks readable" ON public.blocked_pairs
  FOR SELECT TO authenticated
  USING (blocker_user_id = auth.uid());

DROP POLICY IF EXISTS "own blocks removable" ON public.blocked_pairs;
CREATE POLICY "own blocks removable" ON public.blocked_pairs
  FOR DELETE TO authenticated
  USING (blocker_user_id = auth.uid());

-- 3) Pairing predicate --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pair_blocked(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_pairs bp
    WHERE (bp.blocker_user_id = _a AND bp.blocked_user_id = _b)
       OR (bp.blocker_user_id = _b AND bp.blocked_user_id = _a)
  );
$$;

REVOKE ALL ON FUNCTION public.pair_blocked(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pair_blocked(uuid, uuid) TO service_role;

-- 4) Creation authority -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_blocked_pair(_engagement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _e record;
  _other uuid;
  _kind text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'BLACKLIST_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT e.id, e.team_id, e.freelancer_id, e.status, e.cancellation_kind, e.no_show,
         e.cancelled_by, e.confirmed_at, e.is_test
    INTO _e
  FROM public.engagements e
  WHERE e.id = _engagement_id;

  IF _e.id IS NULL OR (_uid <> _e.team_id AND _uid <> _e.freelancer_id) THEN
    RAISE EXCEPTION 'BLACKLIST_NOT_A_PARTY' USING ERRCODE = '42501';
  END IF;

  IF _e.status <> 'cancelled' OR _e.confirmed_at IS NULL THEN
    RAISE EXCEPTION 'BLACKLIST_SOURCE_NOT_ELIGIBLE' USING ERRCODE = '42501';
  END IF;

  IF _e.cancellation_kind = 'grace' AND _e.cancelled_by = _uid THEN
    _kind := 'cancel_grace';
  ELSIF _e.cancellation_kind = 'no_show' AND COALESCE(_e.no_show, false) AND _uid = _e.team_id THEN
    _kind := 'no_show';
  ELSE
    RAISE EXCEPTION 'BLACKLIST_SOURCE_NOT_ELIGIBLE' USING ERRCODE = '42501';
  END IF;

  _other := CASE WHEN _uid = _e.team_id THEN _e.freelancer_id ELSE _e.team_id END;

  INSERT INTO public.blocked_pairs (blocker_user_id, blocked_user_id, source_engagement_id, source_kind, is_test)
  VALUES (_uid, _other, _e.id, _kind, COALESCE(_e.is_test, false))
  ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING;

  PERFORM public.enqueue_availability_recompute(_e.freelancer_id, COALESCE(_e.is_test, false));

  BEGIN
    PERFORM public.ops_log_event(
      public.ops_env(COALESCE(_e.is_test, false)), 'BLACKLIST_BLOCK_CREATED', 'SUCCESS', NULL,
      'engagement', _e.id, NULL, NULL, NULL, NULL, '{}'::jsonb, _uid
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_blocked_pair(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_blocked_pair(uuid) TO authenticated, service_role;

-- 5) Removal authority: answers only "removed", never the reverse state --------
CREATE OR REPLACE FUNCTION public.remove_blocked_pair(_blocked_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row record;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'BLACKLIST_UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.blocked_pairs bp
   WHERE bp.blocker_user_id = _uid AND bp.blocked_user_id = _blocked_user_id
  RETURNING bp.is_test, bp.source_engagement_id INTO _row;

  IF FOUND THEN
    PERFORM public.enqueue_availability_recompute(
      (SELECT CASE WHEN p.user_type = 'freelancer' THEN _blocked_user_id ELSE _uid END
         FROM public.profiles p WHERE p.id = _blocked_user_id),
      COALESCE(_row.is_test, false)
    );
    BEGIN
      PERFORM public.ops_log_event(
        public.ops_env(COALESCE(_row.is_test, false)), 'BLACKLIST_BLOCK_REMOVED', 'SUCCESS', NULL,
        'engagement', _row.source_engagement_id, NULL, NULL, NULL, NULL, '{}'::jsonb, _uid
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.remove_blocked_pair(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_blocked_pair(uuid) TO authenticated, service_role;

-- 6) Matching hard gate: the two independent candidate universes --------------
DO $do$
DECLARE d text; p text;
BEGIN
  SELECT pg_get_functiondef(pr.oid) INTO STRICT d
  FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public' AND pr.proname = 'recompute_matches_core';

  IF position('pair_blocked' IN d) = 0 THEN
    p := replace(d,
      'JOIN public.freelancer_profiles fp ON fp.is_test = r.is_test AND public.freelancer_identity_complete(fp.user_id)',
      'JOIN public.freelancer_profiles fp ON fp.is_test = r.is_test AND public.freelancer_identity_complete(fp.user_id) AND NOT public.pair_blocked(r.team_id, fp.user_id)');
    IF p = d THEN RAISE EXCEPTION 'BLACKLIST_02: candidate join not found in recompute_matches_core'; END IF;
    EXECUTE p;
  END IF;

  SELECT pg_get_functiondef(pr.oid) INTO STRICT d
  FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public' AND pr.proname = 'emit_availability_opportunity_notifications';

  IF position('pair_blocked' IN d) = 0 THEN
    p := replace(d,
      'JOIN public.freelancer_profiles fp ON fp.is_test = _is_test AND public.freelancer_identity_complete(fp.user_id)',
      'JOIN public.freelancer_profiles fp ON fp.is_test = _is_test AND public.freelancer_identity_complete(fp.user_id) AND NOT public.pair_blocked(r.team_id, fp.user_id)');
    IF p = d THEN RAISE EXCEPTION 'BLACKLIST_02: candidate join not found in emit_availability_opportunity_notifications'; END IF;
    EXECUTE p;
  END IF;
END
$do$;

-- 7) Environment purge + account deletion must know about the new table -------
DO $do$
DECLARE d text; p text;
BEGIN
  SELECT pg_get_functiondef(pr.oid) INTO STRICT d
  FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public' AND pr.proname = 'purge_test_environment';

  IF position('blocked_pairs' IN d) = 0 THEN
    p := replace(d,
      'DELETE FROM public.team_pool WHERE is_test;',
      'DELETE FROM public.blocked_pairs WHERE is_test;
  DELETE FROM public.team_pool WHERE is_test;');
    IF p = d THEN RAISE EXCEPTION 'BLACKLIST_02: purge_test_environment anchor not found'; END IF;
    EXECUTE p;
  END IF;

  SELECT pg_get_functiondef(pr.oid) INTO STRICT d
  FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'pitcall_internal' AND pr.proname = 'account_deletion_cleanup';

  IF position('blocked_pairs' IN d) = 0 THEN
    p := replace(d,
      'DELETE FROM public.team_pool WHERE freelancer_id = _uid OR team_id = _uid;',
      'DELETE FROM public.blocked_pairs WHERE blocker_user_id = _uid OR blocked_user_id = _uid;
  DELETE FROM public.team_pool WHERE freelancer_id = _uid OR team_id = _uid;');
    IF p = d THEN RAISE EXCEPTION 'BLACKLIST_02: account_deletion_cleanup anchor not found'; END IF;
    EXECUTE p;
  END IF;

  SELECT pg_get_functiondef(pr.oid) INTO STRICT d
  FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public' AND pr.proname = 'backup_all_live_export';

  IF position('blocked_pairs' IN d) = 0 THEN
    p := replace(d,
      $q$    'team_pool',           (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.team_pool t WHERE t.is_test = false),$q$,
      $q$    'team_pool',           (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.team_pool t WHERE t.is_test = false),
    'blocked_pairs',       (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.blocked_pairs t WHERE t.is_test = false),$q$);
    IF p = d THEN RAISE EXCEPTION 'BLACKLIST_02: backup_all_live_export anchor not found'; END IF;
    EXECUTE p;
  END IF;
END
$do$;
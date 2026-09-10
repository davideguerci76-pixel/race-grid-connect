-- =====================================================================
-- DEMO V1 — hardening prima del seeder deterministico
--  1. recompute_matches: pre-filtro esplicito di ambiente (defense in depth)
--  2. purge_test_environment: assertion LIVE invariato
--  3. cancel_engagement: refactor in _internal + wrapper TEST-only per il seed
--  4. demo_seed_state: metadati dello scenario DEMO
-- =====================================================================

-- 1) ENV PRE-FILTER NEL MATCHING ------------------------------------------------
-- Il pair-skip trigger resta invariato: questo è un filtro aggiuntivo che
-- impedisce anche solo di calcolare coppie cross-ambiente.
DO $mig$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'recompute_matches'
     AND pg_get_function_identity_arguments(p.oid) = '_freelancer_id uuid, _request_id uuid';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'recompute_matches(uuid,uuid) not found';
  END IF;

  IF position('fp.is_test = r.is_test' in _def) = 0 THEN
    IF position('JOIN public.freelancer_profiles fp ON true' in _def) = 0 THEN
      RAISE EXCEPTION 'recompute_matches shape changed: environment pre-filter cannot be applied safely';
    END IF;
    _def := replace(_def,
      'JOIN public.freelancer_profiles fp ON true',
      'JOIN public.freelancer_profiles fp ON fp.is_test = r.is_test');
    EXECUTE _def;
  END IF;
END
$mig$;

-- 2) PURGE HARDENING ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_test_environment()
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _live_before jsonb;
  _live_after jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT jsonb_build_object(
    'profiles',    (SELECT count(*) FROM public.profiles          WHERE is_test = false),
    'requests',    (SELECT count(*) FROM public.requests          WHERE is_test = false),
    'matches',     (SELECT count(*) FROM public.matches           WHERE is_test = false),
    'engagements', (SELECT count(*) FROM public.engagements       WHERE is_test = false),
    'availability',(SELECT count(*) FROM public.availability      WHERE is_test = false),
    'ratings',     (SELECT count(*) FROM public.ratings           WHERE is_test = false),
    'notifications',(SELECT count(*) FROM public.notifications    WHERE is_test = false),
    'tokens',      (SELECT count(*) FROM public.token_transactions WHERE is_test = false),
    'pool',        (SELECT count(*) FROM public.team_pool         WHERE is_test = false),
    'sos',         (SELECT count(*) FROM public.sos_calls         WHERE is_test = false),
    'calendars',   (SELECT count(*) FROM public.user_calendars    WHERE is_test = false),
    'match_history',(SELECT count(*) FROM public.match_history    WHERE is_test = false)
  ) INTO _live_before;

  -- Ogni DELETE è vincolato allo scope TEST, direttamente o tramite il profilo proprietario.
  DELETE FROM public.rating_flags rf USING public.ratings r WHERE rf.rating_id = r.id AND r.is_test;
  DELETE FROM public.ratings WHERE is_test;
  DELETE FROM public.sos_call_targets t USING public.sos_calls s WHERE t.sos_id = s.id AND s.is_test;
  DELETE FROM public.sos_calls WHERE is_test;
  DELETE FROM public.match_unlocks mu USING public.profiles p WHERE mu.team_id = p.id AND p.is_test;
  DELETE FROM public.pool_search_unlocks pu USING public.profiles p WHERE pu.team_id = p.id AND p.is_test;
  DELETE FROM public.request_tier_unlocks ru USING public.profiles p WHERE ru.team_id = p.id AND p.is_test;
  DELETE FROM public.request_team_reveals rr USING public.profiles p WHERE rr.user_id = p.id AND p.is_test;
  DELETE FROM public.team_reveals tr USING public.profiles p WHERE (tr.user_id = p.id OR tr.team_id = p.id) AND p.is_test;
  DELETE FROM public.review_unlocks vu USING public.profiles p WHERE (vu.user_id = p.id OR vu.target_user_id = p.id) AND p.is_test;
  DELETE FROM public.team_pool WHERE is_test;
  DELETE FROM public.engagements WHERE is_test;
  DELETE FROM public.match_history WHERE is_test;
  DELETE FROM public.matches WHERE is_test;
  DELETE FROM public.requests WHERE is_test;
  DELETE FROM public.availability WHERE is_test;
  DELETE FROM public.user_calendars WHERE is_test;
  DELETE FROM public.notifications WHERE is_test;
  DELETE FROM public.token_transactions WHERE is_test;
  DELETE FROM public.calendar_day_notes WHERE is_test;
  DELETE FROM public.availability_opportunity_state WHERE is_test;
  DELETE FROM public.hot_partial_state WHERE is_test;
  DELETE FROM public.team_match_notification_state WHERE is_test;
  DELETE FROM public.availability_recompute_queue WHERE is_test;
  DELETE FROM public.freelancer_contacts fc USING public.profiles p WHERE fc.user_id = p.id AND p.is_test;
  DELETE FROM public.freelancer_profiles WHERE is_test;
  DELETE FROM public.team_profiles WHERE is_test;
  DELETE FROM public.admin_audit_log al USING public.profiles p WHERE al.target_user_id = p.id AND p.is_test;

  SELECT jsonb_build_object(
    'profiles',    (SELECT count(*) FROM public.profiles          WHERE is_test = false),
    'requests',    (SELECT count(*) FROM public.requests          WHERE is_test = false),
    'matches',     (SELECT count(*) FROM public.matches           WHERE is_test = false),
    'engagements', (SELECT count(*) FROM public.engagements       WHERE is_test = false),
    'availability',(SELECT count(*) FROM public.availability      WHERE is_test = false),
    'ratings',     (SELECT count(*) FROM public.ratings           WHERE is_test = false),
    'notifications',(SELECT count(*) FROM public.notifications    WHERE is_test = false),
    'tokens',      (SELECT count(*) FROM public.token_transactions WHERE is_test = false),
    'pool',        (SELECT count(*) FROM public.team_pool         WHERE is_test = false),
    'sos',         (SELECT count(*) FROM public.sos_calls         WHERE is_test = false),
    'calendars',   (SELECT count(*) FROM public.user_calendars    WHERE is_test = false),
    'match_history',(SELECT count(*) FROM public.match_history    WHERE is_test = false)
  ) INTO _live_after;

  IF _live_before IS DISTINCT FROM _live_after THEN
    RAISE EXCEPTION 'PURGE ABORTED: LIVE data changed. before=% after=%', _live_before, _live_after;
  END IF;

  RETURN QUERY SELECT p.id FROM public.profiles p WHERE p.is_test;
END;
$function$;

-- Diagnostica pubblica dei conteggi LIVE (snapshot per i test di cross-talk).
CREATE OR REPLACE FUNCTION public.live_scope_snapshot()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'profiles',    (SELECT count(*) FROM public.profiles          WHERE is_test = false),
    'requests',    (SELECT count(*) FROM public.requests          WHERE is_test = false),
    'matches',     (SELECT count(*) FROM public.matches           WHERE is_test = false),
    'engagements', (SELECT count(*) FROM public.engagements       WHERE is_test = false),
    'availability',(SELECT count(*) FROM public.availability      WHERE is_test = false),
    'ratings',     (SELECT count(*) FROM public.ratings           WHERE is_test = false),
    'notifications',(SELECT count(*) FROM public.notifications    WHERE is_test = false),
    'tokens',      (SELECT count(*) FROM public.token_transactions WHERE is_test = false),
    'pool',        (SELECT count(*) FROM public.team_pool         WHERE is_test = false),
    'sos',         (SELECT count(*) FROM public.sos_calls         WHERE is_test = false),
    'calendars',   (SELECT count(*) FROM public.user_calendars    WHERE is_test = false),
    'match_history',(SELECT count(*) FROM public.match_history    WHERE is_test = false)
  );
$function$;

REVOKE ALL ON FUNCTION public.live_scope_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.live_scope_snapshot() TO service_role;

-- 3) CANCEL ENGAGEMENT: LEGGE UNICA, ATTORE ESPLICITO ---------------------------
DO $mig$
DECLARE _def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cancel_engagement_internal'
  ) THEN
    SELECT pg_get_functiondef(p.oid) INTO _def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cancel_engagement'
       AND pg_get_function_identity_arguments(p.oid) = '_engagement_id uuid, _reason text';

    IF _def IS NULL THEN RAISE EXCEPTION 'cancel_engagement(uuid,text) not found'; END IF;
    IF position('_uid uuid := auth.uid();' in _def) = 0 THEN
      RAISE EXCEPTION 'cancel_engagement shape changed: cannot extract actor';
    END IF;

    _def := replace(_def,
      'FUNCTION public.cancel_engagement(_engagement_id uuid, _reason text DEFAULT NULL::text)',
      'FUNCTION public.cancel_engagement_internal(_engagement_id uuid, _actor uuid, _reason text DEFAULT NULL::text)');
    _def := replace(_def, '_uid uuid := auth.uid();', '_uid uuid := _actor;');
    EXECUTE _def;
  END IF;
END
$mig$;

REVOKE ALL ON FUNCTION public.cancel_engagement_internal(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_engagement_internal(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_engagement(_engagement_id uuid, _reason text DEFAULT NULL::text)
 RETURNS public.engagements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN public.cancel_engagement_internal(_engagement_id, auth.uid(), _reason);
END;
$function$;

-- Wrapper TEST-only usato dal seeder DEMO per costruire stati legittimi
-- (es. rinuncia tardiva del freelancer) attraverso la legge reale.
CREATE OR REPLACE FUNCTION public.demo_cancel_engagement_test(_engagement_id uuid, _actor uuid, _reason text DEFAULT NULL::text)
 RETURNS public.engagements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _e public.engagements%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Engagement not found'; END IF;
  IF NOT _e.is_test THEN RAISE EXCEPTION 'TEST scope only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _actor AND p.is_test) THEN
    RAISE EXCEPTION 'Actor must be a TEST account';
  END IF;
  IF _actor <> _e.freelancer_id AND _actor <> _e.team_id THEN
    RAISE EXCEPTION 'Actor is not a party of this engagement';
  END IF;
  RETURN public.cancel_engagement_internal(_engagement_id, _actor, _reason);
END;
$function$;

REVOKE ALL ON FUNCTION public.demo_cancel_engagement_test(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_cancel_engagement_test(uuid, uuid, text) TO service_role;

-- 4) STATO DELLO SCENARIO DEMO --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.demo_seed_state (
  scenario_id text PRIMARY KEY,
  version text NOT NULL,
  anchor_date date NOT NULL,
  seeded_at timestamptz NOT NULL DEFAULT now(),
  seeded_by uuid,
  status text NOT NULL DEFAULT 'unknown',
  report jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.demo_seed_state TO authenticated;
GRANT ALL ON public.demo_seed_state TO service_role;

ALTER TABLE public.demo_seed_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read demo seed state" ON public.demo_seed_state;
CREATE POLICY "Admins can read demo seed state"
  ON public.demo_seed_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
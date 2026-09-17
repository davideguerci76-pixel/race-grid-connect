-- CANCEL-UX-01 — Cancellation messaging.
-- `engagements.cancellation_reason` keeps its EXISTING semantics: it is already
-- copied into the counterparty's `engagement_cancelled` notification payload, so
-- it is (and always was) a counterparty-visible message. Historic rows are
-- untouched and keep the same meaning.
-- The NEW author-only note lives in its own table so privacy is enforced by RLS,
-- not by the UI.

CREATE TABLE IF NOT EXISTS public.engagement_private_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note text NOT NULL,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engagement_private_notes_unique UNIQUE (engagement_id, author_user_id)
);

GRANT SELECT, DELETE ON public.engagement_private_notes TO authenticated;
GRANT ALL ON public.engagement_private_notes TO service_role;

ALTER TABLE public.engagement_private_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own private notes readable" ON public.engagement_private_notes;
CREATE POLICY "own private notes readable" ON public.engagement_private_notes
  FOR SELECT TO authenticated
  USING (author_user_id = auth.uid());

DROP POLICY IF EXISTS "own private notes removable" ON public.engagement_private_notes;
CREATE POLICY "own private notes removable" ON public.engagement_private_notes
  FOR DELETE TO authenticated
  USING (author_user_id = auth.uid());

-- Cancellation wrapper: all cancellation authority stays in
-- cancel_engagement_internal. The two texts are pure metadata.
CREATE OR REPLACE FUNCTION public.cancel_engagement_with_notes(
  _engagement_id uuid,
  _reason text DEFAULT NULL,
  _private_note text DEFAULT NULL
)
RETURNS public.engagements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
  _public text := nullif(btrim(coalesce(_reason, '')), '');
  _private text := nullif(btrim(coalesce(_private_note, '')), '');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  _public := left(_public, 500);
  _private := left(_private, 500);

  _e := public.cancel_engagement_internal(_engagement_id, _uid, _public);

  IF _private IS NOT NULL THEN
    INSERT INTO public.engagement_private_notes (engagement_id, author_user_id, note, is_test)
    VALUES (_e.id, _uid, _private, COALESCE(_e.is_test, false))
    ON CONFLICT (engagement_id, author_user_id)
    DO UPDATE SET note = EXCLUDED.note, created_at = now();
  END IF;

  RETURN _e;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_engagement_with_notes(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_engagement_with_notes(uuid, text, text) TO authenticated, service_role;

-- Environment purge, account deletion and LIVE backup must know the new table.
DO $do$
DECLARE d text; p text;
BEGIN
  SELECT pg_get_functiondef(pr.oid) INTO STRICT d
  FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public' AND pr.proname = 'purge_test_environment';

  IF position('engagement_private_notes' IN d) = 0 THEN
    p := replace(d,
      'DELETE FROM public.team_pool WHERE is_test;',
      'DELETE FROM public.engagement_private_notes WHERE is_test;
  DELETE FROM public.team_pool WHERE is_test;');
    IF p = d THEN RAISE EXCEPTION 'CANCEL_UX_01: purge_test_environment anchor not found'; END IF;
    EXECUTE p;
  END IF;

  SELECT pg_get_functiondef(pr.oid) INTO STRICT d
  FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'pitcall_internal' AND pr.proname = 'account_deletion_cleanup';

  IF position('engagement_private_notes' IN d) = 0 THEN
    p := replace(d,
      'DELETE FROM public.team_pool WHERE freelancer_id = _uid OR team_id = _uid;',
      'DELETE FROM public.engagement_private_notes WHERE author_user_id = _uid;
  DELETE FROM public.team_pool WHERE freelancer_id = _uid OR team_id = _uid;');
    IF p = d THEN RAISE EXCEPTION 'CANCEL_UX_01: account_deletion_cleanup anchor not found'; END IF;
    EXECUTE p;
  END IF;

  SELECT pg_get_functiondef(pr.oid) INTO STRICT d
  FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
  WHERE n.nspname = 'public' AND pr.proname = 'backup_all_live_export';

  IF position('engagement_private_notes' IN d) = 0 THEN
    p := replace(d,
      $q$    'team_pool',           (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.team_pool t WHERE t.is_test = false),$q$,
      $q$    'team_pool',           (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.team_pool t WHERE t.is_test = false),
    'engagement_private_notes', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM public.engagement_private_notes t WHERE t.is_test = false),$q$);
    IF p = d THEN RAISE EXCEPTION 'CANCEL_UX_01: backup_all_live_export anchor not found'; END IF;
    EXECUTE p;
  END IF;
END
$do$;
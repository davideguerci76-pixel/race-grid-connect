-- 1. Append-only legal acceptance history -------------------------------------
CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('terms','privacy')),
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('signup','reacceptance','profile','admin','backfill')),
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, doc_type, version)
);

CREATE INDEX idx_legal_acceptances_user ON public.legal_acceptances (user_id, doc_type, accepted_at DESC);

GRANT SELECT, INSERT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_acceptances_select_own"
  ON public.legal_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND is_test = public.env_is_test());

CREATE POLICY "legal_acceptances_select_admin"
  ON public.legal_acceptances FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "legal_acceptances_insert_own"
  ON public.legal_acceptances FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- environment inherited from the account, never from the client
DROP TRIGGER IF EXISTS trg_env_legal_acceptances ON public.legal_acceptances;
CREATE TRIGGER trg_env_legal_acceptances BEFORE INSERT OR UPDATE ON public.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.tg_inherit_env('user_id');

-- hard immutability: no UPDATE, no DELETE, whatever the caller
CREATE OR REPLACE FUNCTION public.tg_legal_acceptances_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'legal_acceptances is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_legal_acceptances_immutable ON public.legal_acceptances;
CREATE TRIGGER trg_legal_acceptances_immutable
  BEFORE UPDATE OR DELETE ON public.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.tg_legal_acceptances_immutable();

-- 2. Atomic acceptance: history row(s) + current state on profiles ------------
CREATE OR REPLACE FUNCTION public.record_legal_acceptance(_version text, _source text DEFAULT 'signup')
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _now timestamptz := now();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _source NOT IN ('signup','reacceptance','profile') THEN
    RAISE EXCEPTION 'invalid source';
  END IF;

  INSERT INTO public.legal_acceptances (user_id, doc_type, version, accepted_at, source)
  VALUES (_uid, 'terms', _version, _now, _source),
         (_uid, 'privacy', _version, _now, _source)
  ON CONFLICT (user_id, doc_type, version) DO NOTHING;

  UPDATE public.profiles
     SET terms_accepted_at = _now,
         privacy_accepted_at = _now,
         legal_version = _version
   WHERE id = _uid;

  RETURN _now;
END;
$$;

REVOKE ALL ON FUNCTION public.record_legal_acceptance(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_legal_acceptance(text, text) TO authenticated;

-- 3. Throttled "device really used" touch for push subscriptions --------------
CREATE OR REPLACE FUNCTION public.touch_push_subscription(_endpoint text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rows integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.push_subscriptions
     SET last_seen_at = now()
   WHERE user_id = _uid
     AND endpoint = _endpoint
     AND last_seen_at < now() - interval '1 day';

  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_push_subscription(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_push_subscription(text) TO authenticated;

-- 4. Backfill of pre-existing state (migration, not fresh proof) --------------
INSERT INTO public.legal_acceptances (user_id, doc_type, version, accepted_at, source)
SELECT p.id, 'terms', COALESCE(p.legal_version, 'pre-2026-08'), p.terms_accepted_at, 'backfill'
FROM public.profiles p
WHERE p.terms_accepted_at IS NOT NULL
ON CONFLICT (user_id, doc_type, version) DO NOTHING;

INSERT INTO public.legal_acceptances (user_id, doc_type, version, accepted_at, source)
SELECT p.id, 'privacy', COALESCE(p.legal_version, 'pre-2026-08'), p.privacy_accepted_at, 'backfill'
FROM public.profiles p
WHERE p.privacy_accepted_at IS NOT NULL
ON CONFLICT (user_id, doc_type, version) DO NOTHING;
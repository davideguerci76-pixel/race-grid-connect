
-- Add new token reason enum value
DO $$ BEGIN
  ALTER TYPE public.token_reason ADD VALUE IF NOT EXISTS 'team_reveal_spend';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table for tracking team reveals
CREATE TABLE IF NOT EXISTS public.team_reveals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, team_id)
);

GRANT SELECT, INSERT ON public.team_reveals TO authenticated;
GRANT ALL ON public.team_reveals TO service_role;

ALTER TABLE public.team_reveals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reveals"
  ON public.team_reveals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Reveal function (2 tokens, idempotent)
CREATE OR REPLACE FUNCTION public.reveal_team(_team_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _bal integer;
  _exists boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.team_reveals WHERE user_id = _uid AND team_id = _team_id) INTO _exists;
  IF _exists THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;

  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < 2 THEN
    RAISE EXCEPTION 'Insufficient tokens: need 2 but balance is %', COALESCE(_bal, 0);
  END IF;

  INSERT INTO public.team_reveals(user_id, team_id) VALUES (_uid, _team_id);
  _bal := public.credit_tokens(_uid, -2, 'team_reveal_spend'::public.token_reason, _team_id, 'Reveal team');
  RETURN _bal;
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_team(uuid) TO authenticated;

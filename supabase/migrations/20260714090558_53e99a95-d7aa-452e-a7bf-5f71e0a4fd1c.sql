
CREATE TABLE IF NOT EXISTS public.request_team_reveals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);

GRANT SELECT, INSERT ON public.request_team_reveals TO authenticated;
GRANT ALL ON public.request_team_reveals TO service_role;

ALTER TABLE public.request_team_reveals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own request reveals"
  ON public.request_team_reveals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.reveal_request(_request_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _bal integer;
  _exists boolean;
  _team uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT team_id INTO _team FROM public.requests WHERE id = _request_id;
  IF _team IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.request_team_reveals WHERE user_id = _uid AND request_id = _request_id) INTO _exists;
  IF _exists THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;

  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < 2 THEN
    RAISE EXCEPTION 'Insufficient tokens: need 2 but balance is %', COALESCE(_bal, 0);
  END IF;

  INSERT INTO public.request_team_reveals(user_id, request_id) VALUES (_uid, _request_id);
  _bal := public.credit_tokens(_uid, -2, 'team_reveal_spend'::public.token_reason, _request_id, 'Reveal team for request');
  RETURN _bal;
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_request(uuid) TO authenticated;

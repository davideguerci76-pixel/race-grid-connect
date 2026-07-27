
-- Settings
INSERT INTO public.platform_settings(key, value_num, category, label, description, unit, sort_order)
VALUES ('cost_reveal_reviews', 1, 'reveal_costs', 'Unlock anonymous reviews', 'Tokens to unlock the anonymous review list on a profile', 'tokens', 60)
ON CONFLICT (key) DO NOTHING;

-- Table
CREATE TABLE IF NOT EXISTS public.review_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_user_id)
);

GRANT SELECT ON public.review_unlocks TO authenticated;
GRANT ALL ON public.review_unlocks TO service_role;

ALTER TABLE public.review_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own review unlocks" ON public.review_unlocks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Unlock function
CREATE OR REPLACE FUNCTION public.reveal_reviews(_target uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _bal integer;
  _exists boolean;
  _cost integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _uid = _target THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.review_unlocks WHERE user_id = _uid AND target_user_id = _target) INTO _exists;
  IF _exists THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;
  _cost := public.get_setting_num('cost_reveal_reviews', 1)::int;
  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;
  INSERT INTO public.review_unlocks(user_id, target_user_id) VALUES (_uid, _target);
  _bal := public.credit_tokens(_uid, -_cost, 'reveal_spend'::public.token_reason, _target, 'Reveal anonymous reviews');
  RETURN _bal;
END;
$$;

-- Anonymous reviews reader (double-blind, no author)
CREATE OR REPLACE FUNCTION public.get_anonymous_reviews(_target uuid)
RETURNS TABLE(stars integer, overall numeric, sub_scores jsonb, comment text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _allowed boolean;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  _allowed := (_uid = _target) OR EXISTS (
    SELECT 1 FROM public.review_unlocks WHERE user_id = _uid AND target_user_id = _target
  );
  IF NOT _allowed THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.stars, r.overall, r.sub_scores, r.comment, r.created_at
    FROM public.ratings r
    WHERE r.to_user_id = _target
      AND (r.unlocked_at IS NOT NULL OR r.created_at < (public.sim_now() - interval '30 days'))
    ORDER BY r.created_at DESC
    LIMIT 100;
END;
$$;

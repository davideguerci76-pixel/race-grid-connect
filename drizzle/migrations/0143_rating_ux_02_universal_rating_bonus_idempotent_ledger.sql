-- RATING-UX-02 — Universal rating bonus + economic idempotency
-- Product law: ANY valid rating credits reward_rating_bonus to its AUTHOR
-- (normal T→F, normal F→T, unilateral team_ghosting F→T, unilateral no_show T→F).
-- Idempotency law: max ONE rating_bonus per (author, engagement), surviving rating
-- deletion / moderation / re-creation. Authority = persistent grant ledger with a
-- PRIMARY KEY, claimed atomically via INSERT ... ON CONFLICT DO NOTHING (concurrency-safe).

CREATE TABLE public.rating_bonus_grants (
  user_id       uuid        NOT NULL,
  engagement_id uuid        NOT NULL,
  is_test       boolean     NOT NULL DEFAULT false,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, engagement_id)
);
GRANT ALL ON public.rating_bonus_grants TO service_role;
ALTER TABLE public.rating_bonus_grants ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: internal economic ledger, written only by SECURITY DEFINER submit_rating_v2.

CREATE TRIGGER tg_rating_bonus_grants_env
BEFORE INSERT ON public.rating_bonus_grants
FOR EACH ROW EXECUTE FUNCTION public.tg_inherit_env('user_id');

-- Backfill: every author already credited keeps their grant memory (no retroactive economic change).
INSERT INTO public.rating_bonus_grants(user_id, engagement_id, granted_at)
SELECT t.user_id, t.ref_id, min(t.created_at)
FROM public.token_transactions t
WHERE t.reason = 'rating_bonus' AND t.ref_id IS NOT NULL
GROUP BY t.user_id, t.ref_id
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.submit_rating_v2(_engagement_id uuid, _sub_scores jsonb, _overall numeric, _comment text DEFAULT NULL::text)
 RETURNS ratings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
  _to uuid;
  _opens timestamptz;
  _row public.ratings;
  _other public.ratings;
  _stars int;
  _bonus int;
  _awarded boolean := false;
  _is_ghost_unilateral boolean := false;
  _is_no_show_unilateral boolean := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Engagement not found'; END IF;
  IF _uid NOT IN (_e.freelancer_id, _e.team_id) THEN RAISE EXCEPTION 'Not a party'; END IF;

  -- Unilateral path: freelancer rating a team that ghosted the match
  IF _e.status = 'cancelled'
     AND _e.cancellation_kind = 'team_ghosting'
     AND _uid = _e.freelancer_id THEN
    _is_ghost_unilateral := true;
  -- Unilateral path (SOS-RATING-02): team rating a freelancer it declared no-show via SOS Call
  ELSIF _e.status = 'cancelled'
     AND _e.cancellation_kind = 'no_show'
     AND _e.no_show = true
     AND _uid = _e.team_id THEN
    _is_no_show_unilateral := true;
  ELSIF _e.status NOT IN ('confirmed','completed') THEN
    RAISE EXCEPTION 'Engagement not active';
  ELSE
    _opens := public.rating_opens_at(_engagement_id);
    IF _opens IS NULL OR now() < _opens THEN RAISE EXCEPTION 'Rating not open yet'; END IF;
  END IF;

  _to := CASE WHEN _uid = _e.freelancer_id THEN _e.team_id ELSE _e.freelancer_id END;
  _stars := GREATEST(1, LEAST(5, ROUND(_overall)::int));

  INSERT INTO public.ratings(engagement_id, from_user_id, to_user_id, stars, comment, sub_scores, overall)
  VALUES (_engagement_id, _uid, _to, _stars, _comment, COALESCE(_sub_scores, '{}'::jsonb), _overall)
  RETURNING * INTO _row;

  -- RATING-UX-02: universal rating bonus to the AUTHOR, once per (author, engagement).
  -- The grant ledger (not the ratings row) is the idempotency authority: it survives
  -- rating deletion / re-creation and the PK makes concurrent claims collapse to one.
  INSERT INTO public.rating_bonus_grants(user_id, engagement_id)
  VALUES (_uid, _engagement_id)
  ON CONFLICT DO NOTHING;
  IF FOUND THEN
    _bonus := public.get_setting_num('reward_rating_bonus', 1)::int;
    IF _bonus > 0 THEN
      PERFORM public.credit_tokens(_uid, _bonus, 'rating_bonus'::public.token_reason, _engagement_id, 'Rating submitted bonus');
      _awarded := true;
    END IF;
  END IF;
  UPDATE public.ratings SET token_bonus_awarded = _awarded WHERE id = _row.id RETURNING * INTO _row;

  IF _is_ghost_unilateral THEN
    -- Immediately visible, no double-blind waiting
    UPDATE public.ratings SET unlocked_at = now() WHERE id = _row.id RETURNING * INTO _row;
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_to, 'rating_received', jsonb_build_object('engagement_id', _engagement_id, 'unilateral', true));
    RETURN _row;
  END IF;

  IF _is_no_show_unilateral THEN
    -- Immediately visible, no double-blind waiting
    UPDATE public.ratings SET unlocked_at = now() WHERE id = _row.id RETURNING * INTO _row;
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_to, 'rating_received', jsonb_build_object('engagement_id', _engagement_id, 'unilateral', true, 'kind', 'no_show'));
    RETURN _row;
  END IF;

  SELECT * INTO _other FROM public.ratings WHERE engagement_id = _engagement_id AND from_user_id = _to LIMIT 1;
  IF FOUND THEN
    UPDATE public.ratings SET unlocked_at = now() WHERE engagement_id = _engagement_id AND unlocked_at IS NULL;
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_uid, 'rating_unlocked', jsonb_build_object('engagement_id', _engagement_id)),
      (_to,  'rating_unlocked', jsonb_build_object('engagement_id', _engagement_id));
  ELSE
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_to, 'rating_received', jsonb_build_object('engagement_id', _engagement_id));
  END IF;

  RETURN _row;
END;
$function$;
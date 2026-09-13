-- SOS-RATING-02 — Team-declared freelancer no-show → Team may rate the no-show Freelancer unilaterally.
-- Mirrors the existing team_ghosting unilateral path (Freelancer → Team). No bonus token (same as team_ghosting),
-- immediately unlocked (no double-blind wait), opens immediately (rating_opens_at not consulted).
-- All other cancelled engagements keep being rejected ('Engagement not active').

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

  IF _is_ghost_unilateral THEN
    -- Immediately visible, no double-blind waiting
    UPDATE public.ratings SET unlocked_at = now() WHERE id = _row.id RETURNING * INTO _row;
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_to, 'rating_received', jsonb_build_object('engagement_id', _engagement_id, 'unilateral', true));
    RETURN _row;
  END IF;

  IF _is_no_show_unilateral THEN
    -- Immediately visible, no double-blind waiting, no bonus token (same economics as team_ghosting)
    UPDATE public.ratings SET unlocked_at = now() WHERE id = _row.id RETURNING * INTO _row;
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_to, 'rating_received', jsonb_build_object('engagement_id', _engagement_id, 'unilateral', true, 'kind', 'no_show'));
    RETURN _row;
  END IF;

  IF NOT _row.token_bonus_awarded THEN
    _bonus := public.get_setting_num('reward_rating_bonus', 1)::int;
    IF _bonus > 0 THEN
      PERFORM public.credit_tokens(_uid, _bonus, 'rating_bonus'::public.token_reason, _engagement_id, 'Rating submitted bonus');
    END IF;
    UPDATE public.ratings SET token_bonus_awarded = true WHERE id = _row.id RETURNING * INTO _row;
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

-- rating_available: Team-only notification for cancelled/no_show engagements (immediate, deduped, never sent to the no-show freelancer)
CREATE OR REPLACE FUNCTION public.emit_rating_available_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _cnt integer := 0; _r record; _opens timestamptz; _exists_f boolean; _exists_t boolean;
BEGIN
  FOR _r IN
    SELECT e.id, e.freelancer_id, e.team_id FROM public.engagements e
    WHERE e.status IN ('confirmed', 'completed') AND e.is_test = false
  LOOP
    _opens := public.rating_opens_at(_r.id);
    IF _opens IS NULL OR now() < _opens THEN CONTINUE; END IF;

    SELECT EXISTS(SELECT 1 FROM public.notifications WHERE user_id = _r.freelancer_id AND kind = 'rating_available' AND (payload->>'engagement_id')::uuid = _r.id) INTO _exists_f;
    SELECT EXISTS(SELECT 1 FROM public.notifications WHERE user_id = _r.team_id AND kind = 'rating_available' AND (payload->>'engagement_id')::uuid = _r.id) INTO _exists_t;

    IF NOT _exists_f THEN
      INSERT INTO public.notifications(user_id, kind, payload) VALUES (_r.freelancer_id, 'rating_available', jsonb_build_object('engagement_id', _r.id));
      _cnt := _cnt + 1;
    END IF;
    IF NOT _exists_t THEN
      INSERT INTO public.notifications(user_id, kind, payload) VALUES (_r.team_id, 'rating_available', jsonb_build_object('engagement_id', _r.id));
      _cnt := _cnt + 1;
    END IF;
  END LOOP;

  -- SOS-RATING-02: team-declared no-show → Team may rate immediately; notify the Team only, once, if not already rated.
  FOR _r IN
    SELECT e.id, e.freelancer_id, e.team_id FROM public.engagements e
    WHERE e.status = 'cancelled' AND e.cancellation_kind = 'no_show' AND e.no_show = true AND e.is_test = false
      AND NOT EXISTS (SELECT 1 FROM public.ratings r WHERE r.engagement_id = e.id AND r.from_user_id = e.team_id)
  LOOP
    SELECT EXISTS(SELECT 1 FROM public.notifications WHERE user_id = _r.team_id AND kind = 'rating_available' AND (payload->>'engagement_id')::uuid = _r.id) INTO _exists_t;
    IF NOT _exists_t THEN
      INSERT INTO public.notifications(user_id, kind, payload) VALUES (_r.team_id, 'rating_available', jsonb_build_object('engagement_id', _r.id, 'kind', 'no_show'));
      _cnt := _cnt + 1;
    END IF;
  END LOOP;
  RETURN _cnt;
END;
$function$;
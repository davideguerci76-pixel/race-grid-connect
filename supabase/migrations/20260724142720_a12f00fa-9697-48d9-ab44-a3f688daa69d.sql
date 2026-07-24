
-- Add 'filled' to request_status enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='filled' AND enumtypid = 'public.request_status'::regtype) THEN
    ALTER TYPE public.request_status ADD VALUE 'filled';
  END IF;
END $$;

-- RPC: Team requests confirmation for a specific match (candidate)
CREATE OR REPLACE FUNCTION public.request_match_confirmation(_match_id uuid)
RETURNS public.engagements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _m public.matches%ROWTYPE;
  _r public.requests%ROWTYPE;
  _existing public.engagements%ROWTYPE;
  _new public.engagements%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _m.team_id <> _uid THEN RAISE EXCEPTION 'Not owner of this match'; END IF;

  SELECT * INTO _r FROM public.requests WHERE id = _m.request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _r.status = 'filled' THEN RAISE EXCEPTION 'Request already filled'; END IF;

  -- Prevent duplicate active proposals
  SELECT * INTO _existing FROM public.engagements
    WHERE match_id = _match_id AND status IN ('proposed','confirmed')
    LIMIT 1;
  IF FOUND THEN RETURN _existing; END IF;

  INSERT INTO public.engagements(
    freelancer_id, team_id, request_id, match_id,
    start_date, end_date, fee, currency, proposed_by, status, notes
  ) VALUES (
    _m.freelancer_id, _m.team_id, _m.request_id, _m.id,
    _r.start_date, _r.end_date, _r.budget_max, 'EUR', _uid, 'proposed',
    'Confirmation requested by team for "' || _r.title || '"'
  ) RETURNING * INTO _new;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_m.freelancer_id, 'engagement_proposed',
     jsonb_build_object('engagement_id', _new.id, 'request_id', _r.id, 'request_title', _r.title));

  RETURN _new;
END;
$$;

REVOKE ALL ON FUNCTION public.request_match_confirmation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_match_confirmation(uuid) TO authenticated;

-- RPC: Freelancer accepts → fills request, auto-unlocks contacts both ways
CREATE OR REPLACE FUNCTION public.accept_match_confirmation(_engagement_id uuid)
RETURNS public.engagements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Engagement not found'; END IF;
  IF _e.freelancer_id <> _uid THEN RAISE EXCEPTION 'Only the freelancer can accept'; END IF;
  IF _e.status <> 'proposed' THEN RAISE EXCEPTION 'Engagement is not pending'; END IF;

  UPDATE public.engagements SET status = 'confirmed', updated_at = now()
    WHERE id = _engagement_id RETURNING * INTO _e;

  -- Fill the request
  IF _e.request_id IS NOT NULL THEN
    UPDATE public.requests
      SET status = 'filled', is_active = false, updated_at = now()
      WHERE id = _e.request_id;

    -- Auto-unlock freelancer -> team (both single-request and full team) at no cost
    INSERT INTO public.request_team_reveals(user_id, request_id)
      VALUES (_e.freelancer_id, _e.request_id)
      ON CONFLICT DO NOTHING;
    INSERT INTO public.team_reveals(user_id, team_id)
      VALUES (_e.freelancer_id, _e.team_id)
      ON CONFLICT DO NOTHING;
  END IF;

  -- Auto-unlock team -> freelancer contact via match_unlocks
  IF _e.match_id IS NOT NULL THEN
    INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
      VALUES (_e.team_id, _e.match_id, _e.request_id, _e.freelancer_id, true)
      ON CONFLICT DO NOTHING;
    UPDATE public.matches SET revealed_by_team = true, revealed_by_freelancer = true
      WHERE id = _e.match_id;
  END IF;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_e.team_id, 'engagement_confirmed',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id));

  RETURN _e;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_match_confirmation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_match_confirmation(uuid) TO authenticated;

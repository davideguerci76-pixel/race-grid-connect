-- OPS-BOARD-02A — Team Cancel Grace anti-scraping law + F-OBA-01 / F-OBA-02 remediation.
-- Authority for "this Pit Call already consumed its single Team Grace reopen":
-- a persistent, server-only timestamp on the request row. Nullable/additive.
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS team_grace_reopen_used_at timestamptz;

COMMENT ON COLUMN public.requests.team_grace_reopen_used_at IS
  'OPS-BOARD-02A: set once when a Team-initiated grace cancellation reopens this Pit Call. A Pit Call may be reopened by the Team at most once; Freelancer grace cancellations never set it.';

CREATE OR REPLACE FUNCTION public.cancel_engagement_internal(_engagement_id uuid, _actor uuid, _reason text DEFAULT NULL::text)
 RETURNS engagements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := _actor;
  _e public.engagements%ROWTYPE;
  _now timestamptz := now();
  _first_day date;
  _is_team boolean;
  _is_grace boolean;
  _kind text;
  _other record;
  _r public.requests%ROWTYPE;
  _quota_exhausted boolean := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Engagement not found'; END IF;
  IF _uid <> _e.freelancer_id AND _uid <> _e.team_id THEN RAISE EXCEPTION 'Not a party'; END IF;
  IF _e.status NOT IN ('confirmed') THEN RAISE EXCEPTION 'Only confirmed matches can be cancelled here'; END IF;

  _is_team := (_uid = _e.team_id);
  _first_day := _e.start_date;

  -- Determine grace window: within 24h of confirmation AND before first required day
  _is_grace := (_e.confirmed_at IS NOT NULL
                AND _now - _e.confirmed_at < interval '24 hours'
                AND _now::date < _first_day);

  IF _is_grace THEN
    _kind := 'grace';
  ELSIF _is_team THEN
    _kind := 'team_late';
  ELSE
    _kind := 'freelancer_late';
  END IF;

  UPDATE public.engagements
    SET status = 'cancelled',
        cancelled_at = _now,
        cancelled_by = _uid,
        cancellation_kind = _kind,
        cancellation_reason = _reason,
        updated_at = now()
    WHERE id = _engagement_id
    RETURNING * INTO _e;

  -- Notify the other party
  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (CASE WHEN _is_team THEN _e.freelancer_id ELSE _e.team_id END,
     'engagement_cancelled',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id, 'kind', _kind, 'by_team', _is_team, 'reason', _reason));

  -- Reopen request except for team_late (which archives it)
  IF _e.request_id IS NOT NULL THEN
    -- Row lock: makes the reopen decision and the single-use quota consumption atomic
    -- against concurrent cancellations / retries on the same Pit Call.
    SELECT * INTO _r FROM public.requests WHERE id = _e.request_id FOR UPDATE;
    IF _kind = 'team_late' THEN
      UPDATE public.requests SET status = 'completed', is_active = false, updated_at = now()
        WHERE id = _e.request_id;
    ELSE
      -- Reopen if still meaningful (first date hasn't passed by more than 1 day)
      IF _now::date <= _first_day THEN
        -- Anti-scraping: a Team-initiated grace cancellation may reopen a given
        -- Pit Call only once. Freelancer grace cancellations never consume it.
        _quota_exhausted := (_is_team AND _kind = 'grace' AND _r.team_grace_reopen_used_at IS NOT NULL);

        IF _quota_exhausted THEN
          -- Cancellation stays valid, but the Pit Call reaches the same terminal
          -- state already used for a non-reopenable cancellation (team_late).
          UPDATE public.requests SET status = 'completed', is_active = false, updated_at = now()
            WHERE id = _e.request_id;
        ELSE
          UPDATE public.requests
            SET status = 'active',
                is_active = true,
                team_grace_reopen_used_at = CASE
                  WHEN _is_team AND _kind = 'grace' THEN COALESCE(team_grace_reopen_used_at, _now)
                  ELSE team_grace_reopen_used_at END,
                updated_at = now()
            WHERE id = _e.request_id;

          -- F-OBA-01: full request-scoped recompute against the whole eligible
          -- market, not just the freelancer who cancelled.
          PERFORM public.recompute_matches(NULL, _e.request_id);

          -- Notify candidates on the freshly recomputed set.
          -- F-OBA-02: never notify a blacklisted pair.
          FOR _other IN
            SELECT DISTINCT m.freelancer_id
            FROM public.matches m
            WHERE m.request_id = _e.request_id
              AND m.freelancer_id <> _e.freelancer_id
              AND NOT public.pair_blocked(_e.team_id, m.freelancer_id)
            ORDER BY m.freelancer_id
          LOOP
            INSERT INTO public.notifications(user_id, kind, payload) VALUES
              (_other.freelancer_id, 'match_reopened',
               jsonb_build_object('request_id', _e.request_id, 'reason', _kind));
          END LOOP;
        END IF;
      ELSE
        UPDATE public.requests SET status = 'completed', is_active = false, updated_at = now()
          WHERE id = _e.request_id;
      END IF;
    END IF;
  END IF;

  RETURN _e;
END;
$function$;

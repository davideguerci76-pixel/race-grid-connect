-- STEP 6.5.R — REMEDIATION B/C/D: outcome notification recipient authority.
-- B: recipients come from public.match_history (the persistent matching record
--    written by tg_log_match_history), never from generic notification history.
-- C: no fabricated score — a missing authoritative score is stripped, not 0.
-- D: the Team owner can never enter the Freelancer outcome population.
CREATE OR REPLACE FUNCTION public.emit_pitcall_outcome_notifications(_request_id uuid, _outcome text, _confirmed_freelancer uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cnt int := 0;
  _kind public.notif_kind := CASE WHEN _outcome = 'filled' THEN 'match_taken'::public.notif_kind ELSE 'request_unfilled'::public.notif_kind END;
  _team uuid;
BEGIN
  SELECT r.team_id INTO _team FROM public.requests r WHERE r.id = _request_id;

  -- RECIPIENT AUTHORITY: public.match_history is the persistent matching record
  -- and survives match-row cleanup. public.notifications is NEVER the authority
  -- for role, match membership or score; below it is used only as delivery
  -- history (dedup) and as a secondary "was actually informed" barrier.
  INSERT INTO public.notifications(user_id, kind, payload)
  SELECT h.freelancer_id, _kind,
    -- SCORE TRUTH: no COALESCE(..., 0). When no authoritative score exists the
    -- key is stripped and the notification carries no percentage at all.
    jsonb_strip_nulls(jsonb_build_object(
      'request_id', _request_id,
      'informational', true,
      'audience', 'freelancer',
      'outcome', _outcome,
      'score', m.match_score,
      'criteria', m.missing_criteria,
      'message', CASE WHEN _outcome = 'filled'
        THEN 'This Pit Call has been filled.'
        ELSE 'This Pit Call has been closed without a confirmed freelancer.' END
    ))
  FROM public.match_history h
  -- Defense in depth: the recipient must really be a Freelancer account.
  JOIN public.profiles p ON p.id = h.freelancer_id AND p.user_type = 'freelancer'
  LEFT JOIN public.matches m ON m.request_id = _request_id AND m.freelancer_id = h.freelancer_id
  WHERE h.request_id = _request_id
    AND h.freelancer_id IS DISTINCT FROM _team
    AND (_confirmed_freelancer IS NULL OR h.freelancer_id <> _confirmed_freelancer)
    -- Secondary barrier only: the match is still live, or the freelancer really
    -- was informed about this Pit Call with a freelancer-audience alert.
    AND (
      m.id IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.notifications s
        WHERE s.user_id = h.freelancer_id
          AND s.kind = 'new_matches'
          AND s.payload->>'request_id' = _request_id::text
          AND COALESCE(s.payload->>'audience', 'freelancer') = 'freelancer'
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications d
      WHERE d.user_id = h.freelancer_id
        AND d.kind = _kind
        AND d.payload->>'request_id' = _request_id::text
        AND d.payload->>'audience' = 'freelancer'
    );
  GET DIAGNOSTICS _cnt = ROW_COUNT;
  RETURN _cnt;
END;
$function$;
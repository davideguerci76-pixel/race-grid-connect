-- STEP UX-HELP.2 — Freelancer late cancellation must keep the engagement days
-- blocked/protected for that freelancer, server-authoritatively.
-- Minimal change: day_blocked_by_engagement now also counts engagements that were
-- cancelled with cancellation_kind = 'freelancer_late'. Grace, team_late and every
-- other kind keep the current behaviour (days released).
CREATE OR REPLACE FUNCTION public.day_blocked_by_engagement(_freelancer uuid, _day date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.engagements e
    LEFT JOIN public.requests r ON r.id = e.request_id
    WHERE e.freelancer_id = _freelancer
      AND (
        e.status IN ('confirmed','completed')
        OR (e.status = 'cancelled' AND e.cancellation_kind = 'freelancer_late')
      )
      AND (
        CASE
          WHEN e.covered_days IS NOT NULL AND cardinality(e.covered_days) > 0
            THEN _day = ANY(e.covered_days)
          WHEN r.season_dates IS NOT NULL AND cardinality(r.season_dates) > 0
            THEN _day = ANY(r.season_dates)
          ELSE _day BETWEEN COALESCE(r.start_date, e.start_date) AND COALESCE(r.end_date, e.end_date)
        END
      )
  );
$function$;

-- STEP 4C: Single source of truth for REQUEST REQUIRED DAYS.
-- Sparse Championship requests preserve their selected dates; all other requests
-- expand their inclusive start_date..end_date range.
CREATE OR REPLACE FUNCTION public.request_required_days(_request_id uuid)
RETURNS date[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _season_dates date[];
  _start_date date;
  _end_date date;
  _required_days date[];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT r.season_dates, r.start_date, r.end_date
    INTO _season_dates, _start_date, _end_date
  FROM public.requests r
  WHERE r.id = _request_id
    AND (
      r.team_id = _uid
      OR EXISTS (
        SELECT 1
        FROM public.engagements e
        WHERE e.request_id = r.id
          AND e.freelancer_id = _uid
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or not accessible';
  END IF;

  IF _season_dates IS NOT NULL AND cardinality(_season_dates) > 0 THEN
    SELECT ARRAY(
      SELECT DISTINCT d
      FROM unnest(_season_dates) AS d
      ORDER BY d
    ) INTO _required_days;
  ELSE
    SELECT array_agg(d::date ORDER BY d::date)
      INTO _required_days
    FROM generate_series(_start_date, _end_date, interval '1 day') AS d;
  END IF;

  RETURN COALESCE(_required_days, ARRAY[]::date[]);
END;
$function$;

REVOKE ALL ON FUNCTION public.request_required_days(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_required_days(uuid) TO authenticated, service_role;
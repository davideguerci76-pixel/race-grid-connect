CREATE OR REPLACE FUNCTION public.recompute_matches(_freelancer_id uuid DEFAULT NULL::uuid, _request_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE inserted_count INTEGER := 0;
BEGIN
  WITH valid_matches AS (
    SELECT
      fp.user_id AS freelancer_id,
      r.team_id AS team_id,
      r.id AS request_id,
      COUNT(a.day)::integer AS overlap_days,
      COUNT(a.day)::numeric AS score
    FROM public.requests r
    JOIN public.freelancer_profiles fp
      ON fp.role = r.role
     AND r.discipline = ANY(fp.disciplines)
     AND (
       COALESCE(array_length(r.skills, 1), 0) = 0
       OR fp.skills @> r.skills
     )
    JOIN public.availability a
      ON a.freelancer_id = fp.user_id
     AND (
       (
         r.season_dates IS NOT NULL
         AND array_length(r.season_dates, 1) > 0
         AND a.day = ANY(r.season_dates)
       )
       OR (
         (r.season_dates IS NULL OR array_length(r.season_dates, 1) IS NULL)
         AND a.day BETWEEN r.start_date AND r.end_date
       )
     )
    WHERE r.is_active = true
      AND (_freelancer_id IS NULL OR fp.user_id = _freelancer_id)
      AND (_request_id IS NULL OR r.id = _request_id)
    GROUP BY fp.user_id, r.team_id, r.id
    HAVING COUNT(a.day) > 0
  ), deleted AS (
    DELETE FROM public.matches m
    WHERE (_freelancer_id IS NULL OR m.freelancer_id = _freelancer_id)
      AND (_request_id IS NULL OR m.request_id = _request_id)
      AND NOT EXISTS (
        SELECT 1
        FROM valid_matches v
        WHERE v.freelancer_id = m.freelancer_id
          AND v.request_id = m.request_id
      )
    RETURNING 1
  )
  INSERT INTO public.matches (freelancer_id, team_id, request_id, overlap_days, score)
  SELECT freelancer_id, team_id, request_id, overlap_days, score
  FROM valid_matches
  ON CONFLICT (freelancer_id, request_id) DO UPDATE
    SET overlap_days = EXCLUDED.overlap_days,
        score = EXCLUDED.score;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF _freelancer_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, kind, payload)
    SELECT _freelancer_id, 'new_matches', jsonb_build_object('count', COUNT(*))
    FROM public.matches
    WHERE freelancer_id = _freelancer_id
      AND revealed_by_freelancer = false
    HAVING COUNT(*) > 0;
  END IF;

  IF _request_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, kind, payload)
    SELECT r.team_id, 'new_matches', jsonb_build_object('count', COUNT(m.id), 'request_id', r.id)
    FROM public.requests r
    LEFT JOIN public.matches m
      ON m.request_id = r.id
     AND m.revealed_by_team = false
    WHERE r.id = _request_id
    GROUP BY r.team_id, r.id
    HAVING COUNT(m.id) > 0;
  END IF;

  RETURN inserted_count;
END;
$function$;

SELECT public.recompute_matches(NULL, NULL);
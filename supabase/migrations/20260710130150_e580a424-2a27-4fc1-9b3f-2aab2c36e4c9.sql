
-- 1) Extend freelancer_role enum
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'accounting_finance';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'assembly_sub_assembly';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'composite_design_engineer';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'composite_staff';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'control_systems_engineer';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'design_engineer';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'driver_management';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'electric_vehicles';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'electronics_engineer';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'engine_powertrain';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'events';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'hospitality_staff';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'inspector_quality_control';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'it_computer_engineer';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'logistics';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'managers';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'marketing';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'performance_engineer';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'procurement_buyer';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'production_engineer';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'production_manager';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'project_engineer';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'project_planner';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'rd_development_engineer';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'race_mechanics';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'simulation_engineer';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'stores_parts_coordinator';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'technicians';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'test_engineers';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'truck_driver';
ALTER TYPE public.freelancer_role ADD VALUE IF NOT EXISTS 'vehicle_dynamics_engineer';

-- 2) Extend discipline enum
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'formula_1';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'formula_2';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'formula_3';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'freca';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'formula_regional_americas';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'formula_regional_japanese';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'formula_regional_oceania';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'formula_regional_middle_east';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'gb3_championship';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'euroformula_open';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'f4_italian';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'f4_british';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'f4_spanish';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'usf_pro_2000';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'usf2000';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'indycar';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'indy_nxt';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'super_formula';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'wec_hypercar';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'lmp2';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'gt3';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'gt4';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'dtm';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'tcr';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'wrc_rally1';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'rally2';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'rally3';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'rally4';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'rally5';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'rallycross';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'nascar_cup';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'nascar_xfinity';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'nascar_truck';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'supercars';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'sprint_cars';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'midget_cars';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'autocross';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'hillclimb_specials';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'drift_cars';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'trophy_trucks';
ALTER TYPE public.discipline ADD VALUE IF NOT EXISTS 'dakar_rally';

-- 3) Season-dates column on requests
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS season_dates date[];

-- 4) Update create_request: dynamic cost + season_dates support
CREATE OR REPLACE FUNCTION public.create_request(_payload jsonb)
 RETURNS public.requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _bal integer;
  _new public.requests%ROWTYPE;
  _duration public.duration_type;
  _cost integer;
  _season_dates date[] := NULL;
  _elem jsonb;
  _start date;
  _end date;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  _duration := COALESCE((_payload->>'duration')::public.duration_type, 'race_weekend'::public.duration_type);
  _cost := CASE WHEN _duration = 'full_season' THEN 15 ELSE 5 END;

  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;

  -- Parse season_dates array of ISO date strings, if provided
  IF _duration = 'full_season' AND jsonb_typeof(_payload->'season_dates') = 'array' THEN
    SELECT array_agg((value #>> '{}')::date ORDER BY (value #>> '{}')::date)
      INTO _season_dates
    FROM jsonb_array_elements(_payload->'season_dates');

    IF _season_dates IS NULL OR cardinality(_season_dates) = 0 THEN
      RAISE EXCEPTION 'Full-season requests require at least one date';
    END IF;

    _start := _season_dates[1];
    _end   := _season_dates[array_length(_season_dates, 1)];
  ELSE
    _start := (_payload->>'start_date')::date;
    _end   := (_payload->>'end_date')::date;
  END IF;

  INSERT INTO public.requests(
    team_id, title, role, discipline, duration,
    circuit, location, start_date, end_date, season_dates,
    budget_min, budget_max, budget_unit, notes
  ) VALUES (
    _uid,
    _payload->>'title',
    (_payload->>'role')::public.freelancer_role,
    (_payload->>'discipline')::public.discipline,
    _duration,
    NULLIF(_payload->>'circuit',''),
    NULLIF(_payload->>'location',''),
    _start,
    _end,
    _season_dates,
    NULLIF(_payload->>'budget_min','')::integer,
    NULLIF(_payload->>'budget_max','')::integer,
    COALESCE(NULLIF(_payload->>'budget_unit',''),'day'),
    NULLIF(_payload->>'notes','')
  )
  RETURNING * INTO _new;

  PERFORM public.credit_tokens(_uid, -_cost, 'request_post'::public.token_reason, _new.id, 'Post request: ' || _new.title);

  RETURN _new;
END;
$function$;

-- 5) Update match engine to honor season_dates when present
CREATE OR REPLACE FUNCTION public.recompute_matches(_freelancer_id uuid DEFAULT NULL::uuid, _request_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE inserted_count INTEGER := 0;
BEGIN
  INSERT INTO public.matches (freelancer_id, team_id, request_id, overlap_days, score)
  SELECT
    fp.user_id AS freelancer_id,
    r.team_id AS team_id,
    r.id AS request_id,
    COUNT(a.day) AS overlap_days,
    COUNT(a.day)::numeric AS score
  FROM public.requests r
  JOIN public.freelancer_profiles fp
    ON fp.role = r.role
   AND r.discipline = ANY(fp.disciplines)
  JOIN public.availability a
    ON a.freelancer_id = fp.user_id
   AND (
     (r.season_dates IS NOT NULL AND COALESCE(cardinality(r.season_dates), 0) > 0 AND a.day = ANY(r.season_dates))
     OR
     ((r.season_dates IS NULL OR COALESCE(cardinality(r.season_dates), 0) = 0) AND a.day BETWEEN r.start_date AND r.end_date)
   )
  WHERE r.is_active = true
    AND (_freelancer_id IS NULL OR fp.user_id = _freelancer_id)
    AND (_request_id IS NULL OR r.id = _request_id)
  GROUP BY fp.user_id, r.team_id, r.id
  HAVING COUNT(a.day) > 0
  ON CONFLICT (freelancer_id, request_id) DO UPDATE
    SET overlap_days = EXCLUDED.overlap_days,
        score = EXCLUDED.score;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF _freelancer_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, kind, payload)
    SELECT _freelancer_id, 'new_matches', jsonb_build_object('count', COUNT(*))
    FROM public.matches WHERE freelancer_id = _freelancer_id AND revealed_by_freelancer = false
    HAVING COUNT(*) > 0;
  END IF;
  IF _request_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, kind, payload)
    SELECT r.team_id, 'new_matches', jsonb_build_object('count', COUNT(m.id), 'request_id', r.id)
    FROM public.requests r LEFT JOIN public.matches m ON m.request_id = r.id AND m.revealed_by_team = false
    WHERE r.id = _request_id GROUP BY r.team_id, r.id
    HAVING COUNT(m.id) > 0;
  END IF;

  RETURN inserted_count;
END;
$function$;

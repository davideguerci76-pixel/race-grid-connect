
CREATE OR REPLACE FUNCTION public.create_request(_payload jsonb)
RETURNS public.requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _bal integer;
  _new public.requests%ROWTYPE;
  _cost integer := 5;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;

  INSERT INTO public.requests(
    team_id, title, role, discipline, duration,
    circuit, location, start_date, end_date,
    budget_min, budget_max, budget_unit, notes
  ) VALUES (
    _uid,
    _payload->>'title',
    (_payload->>'role')::public.freelancer_role,
    (_payload->>'discipline')::public.discipline,
    COALESCE((_payload->>'duration')::public.duration_type, 'race_weekend'::public.duration_type),
    NULLIF(_payload->>'circuit',''),
    NULLIF(_payload->>'location',''),
    (_payload->>'start_date')::date,
    (_payload->>'end_date')::date,
    NULLIF(_payload->>'budget_min','')::integer,
    NULLIF(_payload->>'budget_max','')::integer,
    COALESCE(NULLIF(_payload->>'budget_unit',''),'day'),
    NULLIF(_payload->>'notes','')
  )
  RETURNING * INTO _new;

  PERFORM public.credit_tokens(_uid, -_cost, 'request_post'::public.token_reason, _new.id, 'Post request: ' || _new.title);

  RETURN _new;
END;
$$;

REVOKE ALL ON FUNCTION public.create_request(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_request(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_request_status(_id uuid, _status public.request_status)
RETURNS public.requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.requests%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _row FROM public.requests WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF _row.team_id <> _uid THEN RAISE EXCEPTION 'Not owner'; END IF;

  UPDATE public.requests
    SET status = _status,
        is_active = (_status = 'active'),
        updated_at = now()
    WHERE id = _id
    RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_request_status(uuid, public.request_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_request_status(uuid, public.request_status) TO authenticated;

-- F1: approved calendars are real platform calendars (env-scoped), no relationship required
DROP POLICY IF EXISTS "Calendars read scoped" ON public.user_calendars;
CREATE POLICY "Calendars read scoped" ON public.user_calendars
  FOR SELECT TO authenticated
  USING (
    review_status = 'approved'
    AND is_test = public.env_is_test()
  );

-- F2: environment stamping for calendars (inherit on insert, immutable on update)
CREATE OR REPLACE FUNCTION public.tg_calendar_env()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _owner_test boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.is_test := OLD.is_test;
    RETURN NEW;
  END IF;
  SELECT p.is_test INTO _owner_test FROM public.profiles p WHERE p.id = NEW.owner_id;
  NEW.is_test :=
    COALESCE(_owner_test, false)
    OR public.env_is_test()
    OR (COALESCE(NEW.is_test, false) AND public.has_role(NEW.owner_id, 'admin'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_env_user_calendars ON public.user_calendars;
DROP TRIGGER IF EXISTS trg_calendar_env ON public.user_calendars;
CREATE TRIGGER trg_calendar_env BEFORE INSERT OR UPDATE ON public.user_calendars
  FOR EACH ROW EXECUTE FUNCTION public.tg_calendar_env();

-- F3 + F4: atomic, owner-preserving, environment-checked approval with a single token reward
CREATE OR REPLACE FUNCTION public.admin_approve_calendar(_admin_id uuid, _calendar_id uuid, _name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _env boolean;
  _row public.user_calendars;
  _reward integer;
  _credited integer := 0;
  _final_name text;
BEGIN
  IF NOT public.has_role(_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  SELECT COALESCE(s.is_test, false) INTO _env
  FROM public.admin_env_state s WHERE s.admin_id = _admin_id;
  _env := COALESCE(_env, false);

  SELECT * INTO _row FROM public.user_calendars WHERE id = _calendar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calendar not found';
  END IF;
  IF _row.is_test IS DISTINCT FROM _env THEN
    RAISE EXCEPTION 'Cross-environment operation blocked';
  END IF;

  _final_name := COALESCE(NULLIF(btrim(COALESCE(_name, '')), ''), _row.name);

  IF _row.review_status = 'approved' THEN
    UPDATE public.user_calendars SET name = _final_name WHERE id = _calendar_id;
    RETURN jsonb_build_object('credited', 0, 'already_approved', true, 'owner_id', _row.owner_id);
  END IF;

  UPDATE public.user_calendars
     SET review_status = 'approved',
         name = _final_name,
         review_note = NULL,
         reviewed_at = now(),
         reviewed_by = _admin_id
   WHERE id = _calendar_id;

  IF _row.owner_id <> _admin_id THEN
    SELECT ROUND(COALESCE(ps.value_num, 5))::int INTO _reward
      FROM public.platform_settings ps WHERE ps.key = 'reward_calendar_approved';
    _reward := COALESCE(_reward, 5);
    IF _reward > 0 THEN
      PERFORM public.credit_tokens(
        _row.owner_id, _reward, 'admin_credit'::public.token_reason, _calendar_id,
        'Calendar approved: ' || _final_name);
      INSERT INTO public.notifications(user_id, kind, payload)
      VALUES (_row.owner_id, 'tokens_credited',
              jsonb_build_object('reason', 'calendar_approved', 'calendar', _final_name, 'tokens', _reward));
      _credited := _reward;
    END IF;
  END IF;

  RETURN jsonb_build_object('credited', _credited, 'already_approved', false, 'owner_id', _row.owner_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_calendar(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_calendar(uuid, uuid, text) TO service_role;
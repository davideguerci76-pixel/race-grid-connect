
-- 1) Settings table
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value_num numeric NOT NULL,
  category text NOT NULL DEFAULT 'general',
  label text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'tokens',
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_read_all_authed" ON public.platform_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_update_admin" ON public.platform_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "settings_insert_admin" ON public.platform_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Seed defaults
INSERT INTO public.platform_settings (key, value_num, category, label, description, unit, sort_order) VALUES
  ('token_price_eur',                     2.00, 'economics', 'Token price (EUR)',                  'Retail price for one token in euros.', 'eur',    10),
  ('cost_reveal_match',                   1,    'costs',     'Reveal match (freelancer)',          'Freelancer spends this to reveal a match''s technical info.', 'tokens', 20),
  ('cost_unlock_match_for_team',          1,    'costs',     'Unlock candidate (team)',            'Team pays this after the 3 free previews per request.', 'tokens', 21),
  ('cost_request_race_weekend',           5,    'costs',     'Post request — race weekend',        'Cost to publish a single-event match request.', 'tokens', 30),
  ('cost_request_full_season',            15,   'costs',     'Post request — full season',         'Cost to publish a full-season match request.', 'tokens', 31),
  ('cost_repost_identical_race_weekend',  3,    'costs',     'Repost identical — race weekend',    'Discounted repost of an already-filled race-weekend request.', 'tokens', 32),
  ('cost_repost_identical_full_season',   10,   'costs',     'Repost identical — full season',     'Discounted repost of an already-filled full-season request.', 'tokens', 33),
  ('cost_reveal_request_team',            2,    'costs',     'Reveal team on request',             'Freelancer unlocks the team on a single job posting.', 'tokens', 40),
  ('cost_reveal_team_full',               5,    'costs',     'Reveal full team profile',           'Freelancer unlocks the team''s complete profile (all requests).', 'tokens', 41),
  ('reward_rating_bonus',                 1,    'rewards',   'Rating submitted bonus',             'Tokens credited when a user submits a rating.', 'tokens', 50),
  ('reward_signup_bonus',                 5,    'rewards',   'Signup welcome bonus',               'Tokens credited on account creation.', 'tokens', 51)
ON CONFLICT (key) DO NOTHING;

-- 3) Helper
CREATE OR REPLACE FUNCTION public.get_setting_num(_key text, _default numeric)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT value_num FROM public.platform_settings WHERE key = _key), _default);
$$;

-- 4) Rewrite RPCs to read from settings
CREATE OR REPLACE FUNCTION public.reveal_match(_match_id uuid)
 RETURNS TABLE(revealed_freelancer uuid, revealed_team uuid, new_balance integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _m public.matches%ROWTYPE;
  _bal INTEGER;
  _side TEXT;
  _other UUID;
  _cost INTEGER;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  IF _uid = _m.freelancer_id THEN _side := 'freelancer'; _other := _m.team_id;
  ELSIF _uid = _m.team_id THEN _side := 'team'; _other := _m.freelancer_id;
  ELSE RAISE EXCEPTION 'Not a party to this match';
  END IF;

  IF (_side = 'freelancer' AND _m.revealed_by_freelancer) OR (_side = 'team' AND _m.revealed_by_team) THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN QUERY SELECT _m.freelancer_id, _m.team_id, _bal;
    RETURN;
  END IF;

  _cost := public.get_setting_num('cost_reveal_match', 1)::int;
  _bal := public.credit_tokens(_uid, -_cost, 'reveal_spend', _match_id, 'Reveal match');
  IF _side = 'freelancer' THEN
    UPDATE public.matches SET revealed_by_freelancer = true WHERE id = _match_id;
  ELSE
    UPDATE public.matches SET revealed_by_team = true WHERE id = _match_id;
  END IF;

  INSERT INTO public.notifications(user_id, kind, payload)
  VALUES (_other, 'revealed_by', jsonb_build_object('match_id', _match_id, 'side', _side));

  RETURN QUERY SELECT _m.freelancer_id, _m.team_id, _bal;
END; $function$;

CREATE OR REPLACE FUNCTION public.reveal_team(_team_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _bal integer;
  _exists boolean;
  _cost integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.team_reveals WHERE user_id = _uid AND team_id = _team_id) INTO _exists;
  IF _exists THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;
  _cost := public.get_setting_num('cost_reveal_team_full', 5)::int;
  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;
  INSERT INTO public.team_reveals(user_id, team_id) VALUES (_uid, _team_id);
  _bal := public.credit_tokens(_uid, -_cost, 'team_reveal_spend'::public.token_reason, _team_id, 'Full team profile unlock');
  RETURN _bal;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reveal_request(_request_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _bal integer;
  _exists boolean;
  _team uuid;
  _cost integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT team_id INTO _team FROM public.requests WHERE id = _request_id;
  IF _team IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.request_team_reveals WHERE user_id = _uid AND request_id = _request_id) INTO _exists;
  IF _exists THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;
  _cost := public.get_setting_num('cost_reveal_request_team', 2)::int;
  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;
  INSERT INTO public.request_team_reveals(user_id, request_id) VALUES (_uid, _request_id);
  _bal := public.credit_tokens(_uid, -_cost, 'team_reveal_spend'::public.token_reason, _request_id, 'Reveal team for request');
  RETURN _bal;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unlock_match_for_team(_match_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _m public.matches%ROWTYPE;
  _rank int;
  _bal int;
  _already boolean;
  _cost int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _m.team_id <> _uid THEN RAISE EXCEPTION 'Not owner'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.match_unlocks WHERE team_id = _uid AND match_id = _match_id) INTO _already;
  IF _already THEN
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;

  SELECT COUNT(*) + 1 INTO _rank FROM public.matches
    WHERE request_id = _m.request_id
      AND (match_score > _m.match_score OR (match_score = _m.match_score AND created_at < _m.created_at));

  IF _rank <= 3 THEN
    INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
    VALUES (_uid, _match_id, _m.request_id, _m.freelancer_id, true);
    UPDATE public.matches SET revealed_by_team = true WHERE id = _match_id;
    SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
    RETURN _bal;
  END IF;

  _cost := public.get_setting_num('cost_unlock_match_for_team', 1)::int;
  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal < _cost THEN RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal,0); END IF;

  INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
  VALUES (_uid, _match_id, _m.request_id, _m.freelancer_id, false);
  UPDATE public.matches SET revealed_by_team = true WHERE id = _match_id;
  _bal := public.credit_tokens(_uid, -_cost, 'team_reveal_spend'::public.token_reason, _match_id, 'Unlock candidate');
  RETURN _bal;
END; $function$;

CREATE OR REPLACE FUNCTION public.create_request(_payload jsonb)
 RETURNS requests LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _bal integer;
  _new public.requests%ROWTYPE;
  _duration public.duration_type;
  _cost integer;
  _season_dates date[] := NULL;
  _skills text[] := '{}';
  _skills_hard text[] := '{}';
  _education text[] := '{}';
  _experience_reqs jsonb := '[]'::jsonb;
  _languages jsonb := '[]'::jsonb;
  _start date;
  _end date;
  _role_hard boolean;
  _travel_required boolean;
  _repost_of uuid;
  _source_ok boolean := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  _duration := COALESCE((_payload->>'duration')::public.duration_type, 'race_weekend'::public.duration_type);
  _cost := CASE WHEN _duration = 'full_season'
                  THEN public.get_setting_num('cost_request_full_season', 15)::int
                  ELSE public.get_setting_num('cost_request_race_weekend', 5)::int END;
  _role_hard := COALESCE((_payload->>'role_hard')::boolean, true);
  _travel_required := COALESCE((_payload->>'travel_required')::boolean, true);

  IF _payload ? 'repost_of' AND length(_payload->>'repost_of') > 0 THEN
    _repost_of := (_payload->>'repost_of')::uuid;
    SELECT true INTO _source_ok FROM public.requests
      WHERE id = _repost_of AND team_id = _uid
        AND status IN ('completed','filled','closed');
    IF COALESCE(_source_ok, false) THEN
      _cost := CASE WHEN _duration = 'full_season'
                      THEN public.get_setting_num('cost_repost_identical_full_season', 10)::int
                      ELSE public.get_setting_num('cost_repost_identical_race_weekend', 3)::int END;
    END IF;
  END IF;

  SELECT token_balance INTO _bal FROM public.profiles WHERE id = _uid;
  IF _bal IS NULL OR _bal < _cost THEN
    RAISE EXCEPTION 'Insufficient tokens: need % but balance is %', _cost, COALESCE(_bal, 0);
  END IF;

  IF _payload ? 'season_dates' AND jsonb_typeof(_payload->'season_dates') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::date FROM jsonb_array_elements(_payload->'season_dates')) INTO _season_dates;
  END IF;
  IF _payload ? 'skills' AND jsonb_typeof(_payload->'skills') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::text FROM jsonb_array_elements(_payload->'skills')) INTO _skills;
  END IF;
  IF _payload ? 'skills_hard' AND jsonb_typeof(_payload->'skills_hard') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::text FROM jsonb_array_elements(_payload->'skills_hard')) INTO _skills_hard;
  END IF;
  IF _payload ? 'education' AND jsonb_typeof(_payload->'education') = 'array' THEN
    SELECT ARRAY(SELECT (value #>> '{}')::text FROM jsonb_array_elements(_payload->'education')) INTO _education;
  END IF;
  IF _payload ? 'experience_requirements' AND jsonb_typeof(_payload->'experience_requirements') = 'array' THEN
    _experience_reqs := _payload->'experience_requirements';
  END IF;
  IF _payload ? 'languages' AND jsonb_typeof(_payload->'languages') = 'array' THEN
    _languages := _payload->'languages';
  END IF;

  IF _duration = 'full_season' AND (_season_dates IS NULL OR array_length(_season_dates, 1) IS NULL) THEN
    RAISE EXCEPTION 'Full season requests require at least one selected day';
  END IF;

  IF _season_dates IS NOT NULL AND array_length(_season_dates, 1) > 0 THEN
    SELECT MIN(d), MAX(d) INTO _start, _end FROM unnest(_season_dates) d;
  ELSE
    _start := (_payload->>'start_date')::date;
    _end := (_payload->>'end_date')::date;
  END IF;

  INSERT INTO public.requests(
    team_id, title, role, discipline, duration,
    circuit, location, start_date, end_date,
    budget_min, budget_max, budget_unit, notes, season_dates, skills, skills_hard, education,
    experience_requirements, languages, role_hard, travel_required
  ) VALUES (
    _uid,
    _payload->>'title',
    (_payload->>'role')::public.freelancer_role,
    (_payload->>'discipline')::public.discipline,
    _duration,
    NULLIF(_payload->>'circuit',''),
    NULLIF(_payload->>'location',''),
    _start, _end,
    NULLIF(_payload->>'budget_min','')::integer,
    NULLIF(_payload->>'budget_max','')::integer,
    COALESCE(_payload->>'budget_unit','day'),
    NULLIF(_payload->>'notes',''),
    _season_dates,
    _skills, _skills_hard, _education,
    _experience_reqs, _languages,
    _role_hard, _travel_required
  ) RETURNING * INTO _new;

  UPDATE public.profiles SET token_balance = token_balance - _cost WHERE id = _uid;
  INSERT INTO public.token_transactions(user_id, delta, reason, ref_id)
    VALUES (_uid, -_cost, 'request_post', _new.id);

  RETURN _new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_rating_v2(_engagement_id uuid, _sub_scores jsonb, _overall numeric, _comment text DEFAULT NULL::text)
 RETURNS ratings LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Engagement not found'; END IF;
  IF _uid NOT IN (_e.freelancer_id, _e.team_id) THEN RAISE EXCEPTION 'Not a party'; END IF;
  IF _e.status <> 'confirmed' AND _e.status <> 'completed' THEN RAISE EXCEPTION 'Engagement not active'; END IF;

  _opens := public.rating_opens_at(_engagement_id);
  IF _opens IS NULL OR public.sim_now() < _opens THEN RAISE EXCEPTION 'Rating not open yet'; END IF;

  _to := CASE WHEN _uid = _e.freelancer_id THEN _e.team_id ELSE _e.freelancer_id END;
  _stars := GREATEST(1, LEAST(5, ROUND(_overall)::int));

  INSERT INTO public.ratings(engagement_id, from_user_id, to_user_id, stars, comment, sub_scores, overall)
  VALUES (_engagement_id, _uid, _to, _stars, _comment, COALESCE(_sub_scores, '{}'::jsonb), _overall)
  RETURNING * INTO _row;

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
      (_to, 'rating_unlocked', jsonb_build_object('engagement_id', _engagement_id));
  ELSE
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_to, 'rating_received', jsonb_build_object('engagement_id', _engagement_id));
  END IF;

  RETURN _row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _user_type public.user_type;
  _display TEXT;
  _is_admin BOOLEAN;
  _bonus int;
BEGIN
  _user_type := COALESCE((NEW.raw_user_meta_data->>'user_type')::public.user_type, 'freelancer');
  _display := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles(id, user_type, display_name)
  VALUES (NEW.id, _user_type, _display);

  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user');

  SELECT EXISTS(SELECT 1 FROM public.admin_emails WHERE email = NEW.email) INTO _is_admin;
  IF _is_admin THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF _user_type = 'freelancer' THEN
    INSERT INTO public.freelancer_profiles(user_id) VALUES (NEW.id);
  ELSE
    INSERT INTO public.team_profiles(user_id, team_name, initials)
    VALUES (NEW.id, _display, upper(left(regexp_replace(_display, '[^A-Za-z]', '', 'g'), 2)));
  END IF;

  _bonus := public.get_setting_num('reward_signup_bonus', 5)::int;
  IF _bonus > 0 THEN
    PERFORM public.credit_tokens(NEW.id, _bonus, 'signup_bonus', NULL, 'Welcome bonus');
  END IF;
  RETURN NEW;
END;
$function$;

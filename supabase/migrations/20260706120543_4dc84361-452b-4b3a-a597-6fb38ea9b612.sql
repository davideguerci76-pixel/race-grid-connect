-- Enums
CREATE TYPE public.user_type AS ENUM ('freelancer', 'team');
CREATE TYPE public.discipline AS ENUM ('f1', 'rally', 'wec_gt', 'karting');
CREATE TYPE public.freelancer_role AS ENUM ('track_engineer', 'mechanic', 'telemetrist', 'data_analyst', 'tire_specialist', 'chief_mechanic', 'other');
CREATE TYPE public.duration_type AS ENUM ('full_season', 'race_weekend', 'test_session');
CREATE TYPE public.engagement_status AS ENUM ('proposed', 'confirmed', 'completed', 'cancelled');
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE public.notif_kind AS ENUM ('new_matches', 'revealed_by', 'engagement_proposed', 'engagement_confirmed', 'engagement_completed', 'rating_received', 'tokens_credited');
CREATE TYPE public.token_reason AS ENUM ('signup_bonus', 'purchase', 'reveal_spend', 'admin_credit', 'admin_debit', 'refund');

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =========== profiles ===========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type public.user_type NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  token_balance INTEGER NOT NULL DEFAULT 0,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========== user_roles ===========
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- =========== freelancer_profiles ===========
CREATE TABLE public.freelancer_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.freelancer_role NOT NULL DEFAULT 'other',
  headline TEXT,
  disciplines public.discipline[] NOT NULL DEFAULT '{}',
  day_rate INTEGER,
  currency TEXT NOT NULL DEFAULT 'EUR',
  travels BOOLEAN NOT NULL DEFAULT true,
  location TEXT,
  bio TEXT,
  skills TEXT[] NOT NULL DEFAULT '{}',
  years_experience INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.freelancer_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.freelancer_profiles TO authenticated;
GRANT ALL ON public.freelancer_profiles TO service_role;
ALTER TABLE public.freelancer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Freelancer profiles public" ON public.freelancer_profiles FOR SELECT USING (true);
CREATE POLICY "Freelancer manages own" ON public.freelancer_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER freelancer_profiles_updated_at BEFORE UPDATE ON public.freelancer_profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========== team_profiles ===========
CREATE TABLE public.team_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  initials TEXT,
  team_type TEXT,
  location TEXT,
  primary_discipline public.discipline,
  founded_year INTEGER,
  size TEXT,
  bio TEXT,
  website TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.team_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_profiles TO authenticated;
GRANT ALL ON public.team_profiles TO service_role;
ALTER TABLE public.team_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team profiles public" ON public.team_profiles FOR SELECT USING (true);
CREATE POLICY "Team manages own" ON public.team_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER team_profiles_updated_at BEFORE UPDATE ON public.team_profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========== availability ===========
CREATE TABLE public.availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (freelancer_id, day)
);
CREATE INDEX availability_day_idx ON public.availability(day);
GRANT SELECT ON public.availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability TO authenticated;
GRANT ALL ON public.availability TO service_role;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Availability public read" ON public.availability FOR SELECT USING (true);
CREATE POLICY "Freelancer manages own availability" ON public.availability FOR ALL USING (auth.uid() = freelancer_id) WITH CHECK (auth.uid() = freelancer_id);

-- =========== requests (team job requests with date ranges) ===========
CREATE TABLE public.requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  role public.freelancer_role NOT NULL,
  discipline public.discipline NOT NULL,
  circuit TEXT,
  location TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  budget_min INTEGER,
  budget_max INTEGER,
  currency TEXT NOT NULL DEFAULT 'EUR',
  budget_unit TEXT NOT NULL DEFAULT 'day',
  duration public.duration_type NOT NULL DEFAULT 'race_weekend',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX requests_active_idx ON public.requests(is_active);
CREATE INDEX requests_range_idx ON public.requests(start_date, end_date);
GRANT SELECT ON public.requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requests TO authenticated;
GRANT ALL ON public.requests TO service_role;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requests public read active" ON public.requests FOR SELECT USING (true);
CREATE POLICY "Team manages own requests" ON public.requests FOR ALL USING (auth.uid() = team_id) WITH CHECK (auth.uid() = team_id);
CREATE TRIGGER requests_updated_at BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========== matches ===========
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  overlap_days INTEGER NOT NULL DEFAULT 1,
  score NUMERIC NOT NULL DEFAULT 1,
  revealed_by_freelancer BOOLEAN NOT NULL DEFAULT false,
  revealed_by_team BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(freelancer_id, request_id)
);
CREATE INDEX matches_freelancer_idx ON public.matches(freelancer_id);
CREATE INDEX matches_team_idx ON public.matches(team_id);
GRANT SELECT, UPDATE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Match visible to parties" ON public.matches FOR SELECT USING (auth.uid() = freelancer_id OR auth.uid() = team_id);
-- No user-driven INSERT/UPDATE policies: matches are managed by SECURITY DEFINER functions.

-- =========== token_transactions ===========
CREATE TABLE public.token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason public.token_reason NOT NULL,
  ref_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tokens_user_idx ON public.token_transactions(user_id, created_at DESC);
GRANT SELECT ON public.token_transactions TO authenticated;
GRANT ALL ON public.token_transactions TO service_role;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own token history" ON public.token_transactions FOR SELECT USING (auth.uid() = user_id);

-- =========== engagements ===========
CREATE TABLE public.engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.requests(id) ON DELETE SET NULL,
  match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  fee INTEGER,
  currency TEXT NOT NULL DEFAULT 'EUR',
  proposed_by UUID NOT NULL,
  status public.engagement_status NOT NULL DEFAULT 'proposed',
  freelancer_marked_complete BOOLEAN NOT NULL DEFAULT false,
  team_marked_complete BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX engagements_freelancer_idx ON public.engagements(freelancer_id);
CREATE INDEX engagements_team_idx ON public.engagements(team_id);
GRANT SELECT, INSERT, UPDATE ON public.engagements TO authenticated;
GRANT ALL ON public.engagements TO service_role;
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Engagement visible to parties" ON public.engagements FOR SELECT
  USING (auth.uid() = freelancer_id OR auth.uid() = team_id);
CREATE POLICY "Engagement inserted by parties" ON public.engagements FOR INSERT
  WITH CHECK (auth.uid() = proposed_by AND (auth.uid() = freelancer_id OR auth.uid() = team_id));
CREATE POLICY "Engagement updated by parties" ON public.engagements FOR UPDATE
  USING (auth.uid() = freelancer_id OR auth.uid() = team_id)
  WITH CHECK (auth.uid() = freelancer_id OR auth.uid() = team_id);
CREATE TRIGGER engagements_updated_at BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========== ratings ===========
CREATE TABLE public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(engagement_id, from_user_id)
);
GRANT SELECT ON public.ratings TO anon;
GRANT SELECT, INSERT ON public.ratings TO authenticated;
GRANT ALL ON public.ratings TO service_role;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ratings public read" ON public.ratings FOR SELECT USING (true);
CREATE POLICY "Rating insert by author on completed engagement" ON public.ratings FOR INSERT
  WITH CHECK (
    auth.uid() = from_user_id
    AND EXISTS (
      SELECT 1 FROM public.engagements e
      WHERE e.id = engagement_id
        AND e.status = 'completed'
        AND ( (auth.uid() = e.freelancer_id AND to_user_id = e.team_id)
           OR (auth.uid() = e.team_id AND to_user_id = e.freelancer_id) )
    )
  );

-- =========== notifications ===========
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind public.notif_kind NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Mark own notifications read" ON public.notifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========== helper: credit tokens (security definer) ===========
CREATE OR REPLACE FUNCTION public.credit_tokens(_user_id UUID, _delta INTEGER, _reason public.token_reason, _ref UUID DEFAULT NULL, _note TEXT DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_balance INTEGER;
BEGIN
  INSERT INTO public.token_transactions(user_id, delta, reason, ref_id, note) VALUES (_user_id, _delta, _reason, _ref, _note);
  UPDATE public.profiles SET token_balance = token_balance + _delta WHERE id = _user_id RETURNING token_balance INTO new_balance;
  IF new_balance < 0 THEN RAISE EXCEPTION 'Insufficient tokens'; END IF;
  RETURN new_balance;
END;
$$;

-- =========== new-user signup trigger ===========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user_type public.user_type;
  _display TEXT;
BEGIN
  _user_type := COALESCE((NEW.raw_user_meta_data->>'user_type')::public.user_type, 'freelancer');
  _display := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles(id, user_type, display_name)
  VALUES (NEW.id, _user_type, _display);

  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user');

  IF _user_type = 'freelancer' THEN
    INSERT INTO public.freelancer_profiles(user_id) VALUES (NEW.id);
  ELSE
    INSERT INTO public.team_profiles(user_id, team_name, initials)
    VALUES (NEW.id, _display, upper(left(regexp_replace(_display, '[^A-Za-z]', '', 'g'), 2)));
  END IF;

  -- Signup bonus: 5 tokens
  PERFORM public.credit_tokens(NEW.id, 5, 'signup_bonus', NULL, 'Welcome bonus');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========== matching function ===========
-- Recomputes match rows for a freelancer and/or a request.
CREATE OR REPLACE FUNCTION public.recompute_matches(_freelancer_id UUID DEFAULT NULL, _request_id UUID DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
   AND a.day BETWEEN r.start_date AND r.end_date
  WHERE r.is_active = true
    AND (_freelancer_id IS NULL OR fp.user_id = _freelancer_id)
    AND (_request_id IS NULL OR r.id = _request_id)
  GROUP BY fp.user_id, r.team_id, r.id
  HAVING COUNT(a.day) > 0
  ON CONFLICT (freelancer_id, request_id) DO UPDATE
    SET overlap_days = EXCLUDED.overlap_days,
        score = EXCLUDED.score;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  -- Emit notification of counts to affected users
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
$$;

-- Triggers to auto-recompute matches
CREATE OR REPLACE FUNCTION public.tg_recompute_on_availability()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_matches(COALESCE(NEW.freelancer_id, OLD.freelancer_id), NULL);
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER availability_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.availability
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_on_availability();

CREATE OR REPLACE FUNCTION public.tg_recompute_on_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_matches(NULL, COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER requests_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.requests
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_on_request();

-- =========== reveal_match (spends a token, flips flag, notifies counterparty) ===========
CREATE OR REPLACE FUNCTION public.reveal_match(_match_id UUID)
RETURNS TABLE (revealed_freelancer UUID, revealed_team UUID, new_balance INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _m public.matches%ROWTYPE;
  _bal INTEGER;
  _side TEXT;
  _other UUID;
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

  _bal := public.credit_tokens(_uid, -1, 'reveal_spend', _match_id, 'Reveal match');
  IF _side = 'freelancer' THEN
    UPDATE public.matches SET revealed_by_freelancer = true WHERE id = _match_id;
  ELSE
    UPDATE public.matches SET revealed_by_team = true WHERE id = _match_id;
  END IF;

  INSERT INTO public.notifications(user_id, kind, payload)
  VALUES (_other, 'revealed_by', jsonb_build_object('match_id', _match_id, 'side', _side));

  RETURN QUERY SELECT _m.freelancer_id, _m.team_id, _bal;
END; $$;

GRANT EXECUTE ON FUNCTION public.reveal_match(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_matches(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_tokens(UUID, INTEGER, public.token_reason, UUID, TEXT) TO service_role;

-- =========== engagement completion helper ===========
CREATE OR REPLACE FUNCTION public.tg_engagement_completion_check()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.freelancer_marked_complete AND NEW.team_marked_complete AND NEW.status <> 'completed' THEN
    NEW.status := 'completed';
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (NEW.freelancer_id, 'engagement_completed', jsonb_build_object('engagement_id', NEW.id)),
      (NEW.team_id, 'engagement_completed', jsonb_build_object('engagement_id', NEW.id));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER engagement_completion BEFORE UPDATE ON public.engagements
FOR EACH ROW EXECUTE FUNCTION public.tg_engagement_completion_check();

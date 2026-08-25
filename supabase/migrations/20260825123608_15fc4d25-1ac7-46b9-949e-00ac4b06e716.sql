
-- 1. Unique freelancer code
ALTER TABLE public.freelancer_profiles ADD COLUMN IF NOT EXISTS pit_code text;

CREATE OR REPLACE FUNCTION public.gen_pit_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _c text;
BEGIN
  LOOP
    _c := 'PIT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.freelancer_profiles WHERE pit_code = _c);
  END LOOP;
  RETURN _c;
END;
$$;

UPDATE public.freelancer_profiles SET pit_code = public.gen_pit_code() WHERE pit_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS freelancer_profiles_pit_code_key ON public.freelancer_profiles(pit_code);

CREATE OR REPLACE FUNCTION public.tg_set_pit_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pit_code IS NULL THEN NEW.pit_code := public.gen_pit_code(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_pit_code ON public.freelancer_profiles;
CREATE TRIGGER set_pit_code BEFORE INSERT OR UPDATE ON public.freelancer_profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_pit_code();

-- 2. Team pool
CREATE TABLE IF NOT EXISTS public.team_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'engagement',
  engagement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, freelancer_id)
);

GRANT SELECT ON public.team_pool TO authenticated;
GRANT ALL ON public.team_pool TO service_role;
ALTER TABLE public.team_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team sees own pool" ON public.team_pool;
CREATE POLICY "Team sees own pool" ON public.team_pool
FOR SELECT TO authenticated USING (auth.uid() = team_id OR auth.uid() = freelancer_id);

CREATE INDEX IF NOT EXISTS team_pool_team_idx ON public.team_pool(team_id);
CREATE INDEX IF NOT EXISTS team_pool_freelancer_idx ON public.team_pool(freelancer_id);

-- 3. Pool search unlocks
CREATE TABLE IF NOT EXISTS public.pool_search_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  tokens_spent integer NOT NULL DEFAULT 0,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, request_id)
);

GRANT SELECT ON public.pool_search_unlocks TO authenticated;
GRANT ALL ON public.pool_search_unlocks TO service_role;
ALTER TABLE public.pool_search_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team sees own pool unlocks" ON public.pool_search_unlocks;
CREATE POLICY "Team sees own pool unlocks" ON public.pool_search_unlocks
FOR SELECT TO authenticated USING (auth.uid() = team_id);

-- 4. Setting
INSERT INTO public.platform_settings(key, value_num, category, label, description, unit, sort_order)
VALUES ('cost_pool_search', 5, 'costs', 'My Pool search', 'Tokens charged when a team runs a Pit Call search restricted to its own pool.', 'tokens', 90)
ON CONFLICT (key) DO NOTHING;

-- 5. Auto-add to pool on completed engagement
CREATE OR REPLACE FUNCTION public.tg_pool_on_engagement_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    INSERT INTO public.team_pool(team_id, freelancer_id, source, engagement_id)
    VALUES (NEW.team_id, NEW.freelancer_id, 'engagement', NEW.id)
    ON CONFLICT (team_id, freelancer_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pool_on_engagement_complete ON public.engagements;
CREATE TRIGGER pool_on_engagement_complete AFTER INSERT OR UPDATE OF status ON public.engagements
FOR EACH ROW EXECUTE FUNCTION public.tg_pool_on_engagement_complete();

-- backfill from history
INSERT INTO public.team_pool(team_id, freelancer_id, source, engagement_id)
SELECT DISTINCT ON (team_id, freelancer_id) team_id, freelancer_id, 'engagement', id
FROM public.engagements WHERE status = 'completed'
ON CONFLICT (team_id, freelancer_id) DO NOTHING;

-- 6. Add by code (opens blind rating immediately via a completed engagement record)
CREATE OR REPLACE FUNCTION public.add_pool_member_by_code(_code text)
RETURNS public.team_pool
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _f uuid;
  _eng uuid;
  _row public.team_pool;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND user_type = 'team') THEN
    RAISE EXCEPTION 'Only teams have a pool';
  END IF;

  SELECT user_id INTO _f FROM public.freelancer_profiles
  WHERE upper(pit_code) = upper(btrim(_code));
  IF _f IS NULL THEN RAISE EXCEPTION 'No freelancer found for this code'; END IF;

  SELECT id INTO _row.id FROM public.team_pool WHERE team_id = _uid AND freelancer_id = _f;
  IF _row.id IS NOT NULL THEN
    SELECT * INTO _row FROM public.team_pool WHERE id = _row.id;
    RETURN _row;
  END IF;

  INSERT INTO public.engagements(freelancer_id, team_id, start_date, end_date, proposed_by, status, notes,
                                 freelancer_marked_complete, team_marked_complete, confirmed_at)
  VALUES (_f, _uid, (public.sim_now()::date - 1), (public.sim_now()::date - 1), _uid, 'completed', 'pool_manual',
          true, true, now())
  RETURNING id INTO _eng;

  INSERT INTO public.team_pool(team_id, freelancer_id, source, engagement_id)
  VALUES (_uid, _f, 'code', _eng)
  ON CONFLICT (team_id, freelancer_id) DO UPDATE SET source = 'code'
  RETURNING * INTO _row;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_f, 'rating_available', jsonb_build_object('engagement_id', _eng, 'pool', true)),
    (_uid, 'rating_available', jsonb_build_object('engagement_id', _eng, 'pool', true));

  RETURN _row;
END;
$$;

-- 7. Pool search unlock
CREATE OR REPLACE FUNCTION public.unlock_pool_search(_request_id uuid)
RETURNS TABLE(tokens_spent integer, balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cost int;
  _bal int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.requests WHERE id = _request_id AND team_id = _uid) THEN
    RAISE EXCEPTION 'Not owner of this pit call';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pool_search_unlocks WHERE team_id = _uid AND request_id = _request_id) THEN
    SELECT p.token_balance INTO _bal FROM public.profiles p WHERE p.id = _uid;
    RETURN QUERY SELECT 0, _bal;
    RETURN;
  END IF;

  _cost := public.get_setting_num('cost_pool_search', 5)::int;
  SELECT p.token_balance INTO _bal FROM public.profiles p WHERE p.id = _uid;
  IF _bal < _cost THEN RAISE EXCEPTION 'Not enough tokens'; END IF;

  _bal := public.credit_tokens(_uid, -_cost, 'reveal_spend'::public.token_reason, _request_id, 'My Pool search');

  INSERT INTO public.pool_search_unlocks(team_id, request_id, tokens_spent)
  VALUES (_uid, _request_id, _cost);

  RETURN QUERY SELECT _cost, _bal;
END;
$$;

REVOKE ALL ON FUNCTION public.gen_pit_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tg_set_pit_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tg_pool_on_engagement_complete() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_pool_member_by_code(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlock_pool_search(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_pool_member_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_pool_search(uuid) TO authenticated;

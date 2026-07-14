DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'freelancer_profiles'
      AND policyname = 'Freelancer manages own'
  ) THEN
    CREATE POLICY "Freelancer manages own"
    ON public.freelancer_profiles
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  ELSE
    ALTER POLICY "Freelancer manages own"
    ON public.freelancer_profiles
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'team_profiles'
      AND policyname = 'Team manages own'
  ) THEN
    CREATE POLICY "Team manages own"
    ON public.team_profiles
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  ELSE
    ALTER POLICY "Team manages own"
    ON public.team_profiles
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users update own profile'
  ) THEN
    CREATE POLICY "Users update own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
  ELSE
    ALTER POLICY "Users update own profile"
    ON public.profiles
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.freelancer_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.team_profiles TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.freelancer_profiles TO service_role;
GRANT ALL ON public.team_profiles TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.availability TO service_role;
GRANT ALL ON public.requests TO service_role;
GRANT ALL ON public.matches TO service_role;
GRANT ALL ON public.notifications TO service_role;

DROP TRIGGER IF EXISTS trg_freelancer_profiles_updated_at ON public.freelancer_profiles;
CREATE TRIGGER trg_freelancer_profiles_updated_at
BEFORE UPDATE ON public.freelancer_profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_team_profiles_updated_at ON public.team_profiles;
CREATE TRIGGER trg_team_profiles_updated_at
BEFORE UPDATE ON public.team_profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_recompute_on_availability_insert ON public.availability;
CREATE TRIGGER trg_recompute_on_availability_insert
AFTER INSERT ON public.availability
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_on_availability();

DROP TRIGGER IF EXISTS trg_recompute_on_availability_delete ON public.availability;
CREATE TRIGGER trg_recompute_on_availability_delete
AFTER DELETE ON public.availability
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_on_availability();

DROP TRIGGER IF EXISTS trg_recompute_on_request_insert ON public.requests;
CREATE TRIGGER trg_recompute_on_request_insert
AFTER INSERT ON public.requests
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_on_request();

DROP TRIGGER IF EXISTS trg_recompute_on_request_update ON public.requests;
CREATE TRIGGER trg_recompute_on_request_update
AFTER UPDATE OF role, discipline, start_date, end_date, season_dates, is_active, status ON public.requests
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_on_request();

CREATE OR REPLACE FUNCTION public.tg_recompute_on_freelancer_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.recompute_matches(NEW.user_id, NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_on_freelancer_profile_insert ON public.freelancer_profiles;
CREATE TRIGGER trg_recompute_on_freelancer_profile_insert
AFTER INSERT ON public.freelancer_profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_on_freelancer_profile();

DROP TRIGGER IF EXISTS trg_recompute_on_freelancer_profile_update ON public.freelancer_profiles;
CREATE TRIGGER trg_recompute_on_freelancer_profile_update
AFTER UPDATE OF role, disciplines, skills ON public.freelancer_profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_on_freelancer_profile();

SELECT public.recompute_matches(NULL, NULL);
-- The shared lock trigger referenced NEW.team_name even when firing on
-- public.profiles, which made plpgsql fail resolving the field instead of
-- raising the intended TEAM_NAME_LOCKED error. Resolve fields via to_jsonb so
-- the same function is safe on both tables.
CREATE OR REPLACE FUNCTION public.tg_lock_team_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _old jsonb := to_jsonb(OLD);
  _new jsonb := to_jsonb(NEW);
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'team_profiles'
     AND (_new->>'team_name') IS DISTINCT FROM (_old->>'team_name') THEN
    RAISE EXCEPTION 'TEAM_NAME_LOCKED';
  END IF;

  IF TG_TABLE_NAME = 'profiles'
     AND (_old->>'user_type') = 'team'
     AND (_new->>'display_name') IS DISTINCT FROM (_old->>'display_name') THEN
    RAISE EXCEPTION 'TEAM_NAME_LOCKED';
  END IF;

  RETURN NEW;
END;
$function$;
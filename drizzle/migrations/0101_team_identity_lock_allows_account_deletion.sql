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

  -- Account deletion (de-identification) is not a rename: the profile row is
  -- being flagged deleted in the same UPDATE by delete_my_account().
  IF TG_TABLE_NAME = 'profiles'
     AND (_old->>'deleted_at') IS NULL
     AND (_new->>'deleted_at') IS NOT NULL THEN
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
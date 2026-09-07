-- The guard must observe the *effective* role of the caller. As SECURITY DEFINER
-- current_user was rewritten to the function owner, so the check never fired.
CREATE OR REPLACE FUNCTION public.tg_engagement_insert_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Engagements can only be created through the PITCALL confirmation flow';
  END IF;
  RETURN NEW;
END;
$$;
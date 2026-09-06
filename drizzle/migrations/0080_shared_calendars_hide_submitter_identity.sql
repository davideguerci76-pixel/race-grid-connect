-- Public (approved) calendars stay readable by every authenticated user in the
-- same environment, but only through a function that returns the deliberately
-- public columns. Submitter identity (owner_id), moderator identity
-- (reviewed_by) and moderation metadata are no longer exposed via the Data API.

DROP POLICY IF EXISTS "Calendars read scoped" ON public.user_calendars;

CREATE OR REPLACE FUNCTION public.list_shared_calendars()
RETURNS TABLE (
  id uuid,
  name text,
  discipline text,
  season_year integer,
  events jsonb,
  dates date[],
  source text,
  review_status text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.name, c.discipline, c.season_year, c.events, c.dates,
         c.source, c.review_status, c.updated_at
  FROM public.user_calendars c
  WHERE c.review_status = 'approved'
    AND c.is_test = public.env_is_test()
    AND c.owner_id <> auth.uid()
    AND auth.uid() IS NOT NULL
  ORDER BY c.name;
$$;

REVOKE ALL ON FUNCTION public.list_shared_calendars() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_shared_calendars() TO authenticated;

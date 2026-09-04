-- F5: server-authoritative protected days -----------------------------------

CREATE OR REPLACE FUNCTION public.my_protected_days(_days date[])
RETURNS SETOF date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT d
  FROM unnest(COALESCE(_days, ARRAY[]::date[])) AS d
  WHERE public.day_blocked_by_engagement(auth.uid(), d)
     OR public.day_frozen_by_pending_request(auth.uid(), d);
$$;

REVOKE ALL ON FUNCTION public.my_protected_days(date[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_protected_days(date[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_protected_days(date[]) TO service_role;

-- Private day notes may not be created/changed on protected days.
CREATE OR REPLACE FUNCTION public.tg_protect_day_notes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.day_blocked_by_engagement(NEW.freelancer_id, NEW.day) THEN
    RAISE EXCEPTION 'Day % is covered by a confirmed engagement and cannot be modified', NEW.day
      USING ERRCODE = '55006';
  END IF;
  IF public.day_frozen_by_pending_request(NEW.freelancer_id, NEW.day) THEN
    RAISE EXCEPTION 'Day % is frozen while a Pit Call request is awaiting your response', NEW.day
      USING ERRCODE = '55006';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calendar_day_notes_protect ON public.calendar_day_notes;
CREATE TRIGGER calendar_day_notes_protect
  BEFORE INSERT OR UPDATE ON public.calendar_day_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_day_notes();

-- Availability may not be created on protected days.
CREATE OR REPLACE FUNCTION public.tg_protect_availability_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.day_blocked_by_engagement(NEW.freelancer_id, NEW.day) THEN
    RAISE EXCEPTION 'Day % is covered by a confirmed engagement and cannot be modified', NEW.day
      USING ERRCODE = '55006';
  END IF;
  IF public.day_frozen_by_pending_request(NEW.freelancer_id, NEW.day) THEN
    RAISE EXCEPTION 'Day % is frozen while a Pit Call request is awaiting your response', NEW.day
      USING ERRCODE = '55006';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS availability_protect_insert ON public.availability;
CREATE TRIGGER availability_protect_insert
  BEFORE INSERT ON public.availability
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_availability_insert();

-- Deletions: frozen days were already protected; confirmed engagement days join them.
CREATE OR REPLACE FUNCTION public.tg_protect_frozen_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.day_frozen_by_pending_request(OLD.freelancer_id, OLD.day) THEN
    RAISE EXCEPTION 'Availability locked while a Pit Call request is awaiting your response'
      USING ERRCODE = '55006';
  END IF;
  IF public.day_blocked_by_engagement(OLD.freelancer_id, OLD.day) THEN
    RAISE EXCEPTION 'Availability locked by a confirmed engagement'
      USING ERRCODE = '55006';
  END IF;
  RETURN OLD;
END;
$$;

-- F6: approved calendars are read-only for their owner ------------------------

DROP POLICY IF EXISTS "Owners manage their calendars" ON public.user_calendars;

CREATE POLICY "Owners read their calendars"
  ON public.user_calendars FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners create their calendars"
  ON public.user_calendars FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND COALESCE(review_status, 'private') <> 'approved');

CREATE POLICY "Owners update unapproved calendars"
  ON public.user_calendars FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id AND review_status <> 'approved')
  WITH CHECK (auth.uid() = owner_id AND review_status <> 'approved');

CREATE POLICY "Owners delete unapproved calendars"
  ON public.user_calendars FOR DELETE TO authenticated
  USING (auth.uid() = owner_id AND review_status <> 'approved');
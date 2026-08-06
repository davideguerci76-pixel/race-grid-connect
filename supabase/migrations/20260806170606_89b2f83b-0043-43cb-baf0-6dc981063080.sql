CREATE TABLE public.user_calendars (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  discipline text,
  season_year integer,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  dates date[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'manual',
  review_status text NOT NULL DEFAULT 'private',
  review_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_calendars_source_chk CHECK (source IN ('manual','ics','official')),
  CONSTRAINT user_calendars_review_chk CHECK (review_status IN ('private','pending','approved','rejected'))
);

CREATE INDEX user_calendars_owner_idx ON public.user_calendars(owner_id);
CREATE INDEX user_calendars_review_idx ON public.user_calendars(review_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_calendars TO authenticated;
GRANT ALL ON public.user_calendars TO service_role;

ALTER TABLE public.user_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their calendars"
  ON public.user_calendars FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Approved calendars are readable by signed-in users"
  ON public.user_calendars FOR SELECT TO authenticated
  USING (review_status = 'approved');

CREATE POLICY "Admins can read all calendars"
  ON public.user_calendars FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can moderate calendars"
  ON public.user_calendars FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER user_calendars_set_updated_at
  BEFORE UPDATE ON public.user_calendars
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
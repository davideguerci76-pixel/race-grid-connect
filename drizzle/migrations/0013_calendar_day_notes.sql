CREATE TABLE IF NOT EXISTS public.calendar_day_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day date NOT NULL,
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 60),
  busy boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT public.env_is_test(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (freelancer_id, day)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_day_notes TO authenticated;
GRANT ALL ON public.calendar_day_notes TO service_role;

ALTER TABLE public.calendar_day_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own notes read" ON public.calendar_day_notes;
CREATE POLICY "own notes read" ON public.calendar_day_notes
  FOR SELECT TO authenticated
  USING (auth.uid() = freelancer_id AND is_test = public.env_is_test());

DROP POLICY IF EXISTS "own notes insert" ON public.calendar_day_notes;
CREATE POLICY "own notes insert" ON public.calendar_day_notes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = freelancer_id AND is_test = public.env_is_test());

DROP POLICY IF EXISTS "own notes update" ON public.calendar_day_notes;
CREATE POLICY "own notes update" ON public.calendar_day_notes
  FOR UPDATE TO authenticated
  USING (auth.uid() = freelancer_id AND is_test = public.env_is_test())
  WITH CHECK (auth.uid() = freelancer_id AND is_test = public.env_is_test());

DROP POLICY IF EXISTS "own notes delete" ON public.calendar_day_notes;
CREATE POLICY "own notes delete" ON public.calendar_day_notes
  FOR DELETE TO authenticated
  USING (auth.uid() = freelancer_id AND is_test = public.env_is_test());

DROP TRIGGER IF EXISTS trg_calendar_day_notes_updated_at ON public.calendar_day_notes;
CREATE TRIGGER trg_calendar_day_notes_updated_at
  BEFORE UPDATE ON public.calendar_day_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_calendar_day_notes_owner_day ON public.calendar_day_notes (freelancer_id, day);

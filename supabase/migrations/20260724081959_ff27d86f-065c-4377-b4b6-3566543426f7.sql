
-- Move phone data to a separate owner-only table so we can restore full SELECT on freelancer_profiles to authenticated (public profile browsing).
CREATE TABLE IF NOT EXISTS public.freelancer_contacts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_dial_code text,
  phone_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.freelancer_contacts TO authenticated;
GRANT ALL ON public.freelancer_contacts TO service_role;

ALTER TABLE public.freelancer_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own contacts select" ON public.freelancer_contacts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own contacts insert" ON public.freelancer_contacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own contacts update" ON public.freelancer_contacts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own contacts delete" ON public.freelancer_contacts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_freelancer_contacts_updated_at BEFORE UPDATE ON public.freelancer_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Migrate existing phone data if columns still exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='freelancer_profiles' AND column_name='phone_number') THEN
    INSERT INTO public.freelancer_contacts (user_id, phone_dial_code, phone_number)
    SELECT user_id, phone_dial_code, phone_number FROM public.freelancer_profiles
    WHERE phone_number IS NOT NULL OR phone_dial_code IS NOT NULL
    ON CONFLICT (user_id) DO NOTHING;

    ALTER TABLE public.freelancer_profiles DROP COLUMN phone_number;
    ALTER TABLE public.freelancer_profiles DROP COLUMN phone_dial_code;
  END IF;
END $$;

-- Restore full Data-API access on freelancer_profiles (previous column-level revokes left the table unreadable).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.freelancer_profiles TO authenticated;
GRANT ALL ON public.freelancer_profiles TO service_role;

-- Replace the old phone-fetch RPC so existing callers keep working.
CREATE OR REPLACE FUNCTION public.my_freelancer_phone()
RETURNS TABLE(phone_dial_code text, phone_number text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT phone_dial_code, phone_number FROM public.freelancer_contacts WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_freelancer_phone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_freelancer_phone() TO authenticated;

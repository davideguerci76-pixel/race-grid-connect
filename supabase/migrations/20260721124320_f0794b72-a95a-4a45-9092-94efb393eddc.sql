
-- 1. Delete the test user (cascades to public.profiles via FK)
DELETE FROM auth.users WHERE email = 'davideguerci76@gmail.com';

-- 2. Admin email allowlist
CREATE TABLE IF NOT EXISTS public.admin_emails (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_emails TO authenticated;
GRANT ALL ON public.admin_emails TO service_role;
ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view admin emails" ON public.admin_emails
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.admin_emails(email) VALUES ('davideguerci76@gmail.com')
  ON CONFLICT (email) DO NOTHING;

-- 3. Blocked flag on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

-- 4. Update handle_new_user to grant admin role automatically if the email is in admin_emails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_type public.user_type;
  _display TEXT;
  _is_admin BOOLEAN;
BEGIN
  _user_type := COALESCE((NEW.raw_user_meta_data->>'user_type')::public.user_type, 'freelancer');
  _display := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles(id, user_type, display_name)
  VALUES (NEW.id, _user_type, _display);

  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user');

  SELECT EXISTS(SELECT 1 FROM public.admin_emails WHERE email = NEW.email) INTO _is_admin;
  IF _is_admin THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF _user_type = 'freelancer' THEN
    INSERT INTO public.freelancer_profiles(user_id) VALUES (NEW.id);
  ELSE
    INSERT INTO public.team_profiles(user_id, team_name, initials)
    VALUES (NEW.id, _display, upper(left(regexp_replace(_display, '[^A-Za-z]', '', 'g'), 2)));
  END IF;

  PERFORM public.credit_tokens(NEW.id, 5, 'signup_bonus', NULL, 'Welcome bonus');
  RETURN NEW;
END;
$function$;

-- 5. Admin RLS policies (read-all)
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all freelancer profiles" ON public.freelancer_profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view all team profiles" ON public.team_profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all user_roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can modify user_roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

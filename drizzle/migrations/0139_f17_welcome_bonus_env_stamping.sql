-- F-17: welcome bonus token_transaction must be stamped with the account's own environment.
-- Root cause: handle_new_user() inserted public.profiles without is_test (default false),
-- so the tg_inherit_env trigger on token_transactions stamped the signup_bonus row is_test=false
-- even for synthetic TEST accounts (Testing Lab / Demo flip profiles.is_test AFTER signup).
-- Fix: classify the environment at profile-creation time, using a server-side reserved-domain
-- authority combined with the admin-createUser metadata flag. A normal LIVE signup cannot
-- self-classify as TEST unless it uses a reserved, non-deliverable test domain.
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
  _bonus int;
  _is_test BOOLEAN;
BEGIN
  _user_type := COALESCE((NEW.raw_user_meta_data->>'user_type')::public.user_type, 'freelancer');
  _display := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));

  -- Environment authority: reserved synthetic-account domains AND the explicit creation flag.
  _is_test := COALESCE((NEW.raw_user_meta_data->>'is_test')::boolean, false)
              AND (
                NEW.email ILIKE '%@test-pitcall.invalid'
                OR NEW.email ILIKE '%@testlab.pitcall.net'
              );

  INSERT INTO public.profiles(id, user_type, display_name, is_test)
  VALUES (NEW.id, _user_type, _display, _is_test);

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

  _bonus := public.get_setting_num('reward_signup_bonus', 5)::int;
  IF _bonus > 0 THEN
    PERFORM public.credit_tokens(NEW.id, _bonus, 'signup_bonus', NULL, 'Welcome bonus');
  END IF;
  RETURN NEW;
END;
$function$;
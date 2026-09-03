-- STEP 11.2 — anti-ghosting TEST/LIVE parity.
-- The three anti-ghosting jobs hardcoded `is_test = false`, so the lifecycle was
-- untestable in TEST. Introduce env-scoped variants and make the existing LIVE
-- entrypoints (used by cron) thin wrappers over `_env(false)`. No semantic change.

create or replace function public.emit_contact_checks_env(_is_test boolean)
returns integer language plpgsql security definer set search_path = public as $$
DECLARE _n int; _cnt int := 0; _row record;
BEGIN
  _n := COALESCE(public.get_setting_num('ghosting_freelance_check_days', 3), 3)::int;
  FOR _row IN
    SELECT id, freelancer_id FROM public.engagements
     WHERE status = 'confirmed' AND is_test = _is_test
       AND confirmed_at IS NOT NULL
       AND contact_check_sent_at IS NULL
       AND freelancer_contacted IS NULL
       AND team_confirmed_contact IS NOT TRUE
       AND confirmed_at <= (now() - make_interval(days => _n))
  LOOP
    INSERT INTO public.notifications(user_id, kind, payload, is_test)
    VALUES (_row.freelancer_id, 'contact_check', jsonb_build_object('engagement_id', _row.id), _is_test);
    UPDATE public.engagements SET contact_check_sent_at = now() WHERE id = _row.id;
    _cnt := _cnt + 1;
  END LOOP;
  RETURN _cnt;
END; $$;

create or replace function public.emit_contact_checks()
returns integer language sql security definer set search_path = public as $$
  select public.emit_contact_checks_env(false)
$$;

create or replace function public.emit_team_ghosting_reminders_env(_is_test boolean)
returns integer language plpgsql security definer set search_path = public as $$
DECLARE _n1 int; _n2 int; _cnt int := 0; _row record;
BEGIN
  _n1 := COALESCE(public.get_setting_num('ghosting_team_reminder1_days', 5), 5)::int;
  _n2 := COALESCE(public.get_setting_num('ghosting_team_reminder2_days', 8), 8)::int;

  FOR _row IN
    SELECT id, team_id FROM public.engagements
     WHERE status = 'confirmed' AND is_test = _is_test
       AND confirmed_at IS NOT NULL
       AND team_confirmed_contact IS NOT TRUE
       AND freelancer_contacted = false
       AND team_reminder1_sent_at IS NULL
       AND confirmed_at <= (now() - make_interval(days => _n1))
  LOOP
    INSERT INTO public.notifications(user_id, kind, payload, is_test)
    VALUES (_row.team_id, 'team_contact_reminder_1', jsonb_build_object('engagement_id', _row.id), _is_test);
    UPDATE public.engagements SET team_reminder1_sent_at = now() WHERE id = _row.id;
    _cnt := _cnt + 1;
  END LOOP;

  FOR _row IN
    SELECT id, team_id FROM public.engagements
     WHERE status = 'confirmed' AND is_test = _is_test
       AND confirmed_at IS NOT NULL
       AND team_confirmed_contact IS NOT TRUE
       AND freelancer_contacted = false
       AND team_reminder1_sent_at IS NOT NULL
       AND team_reminder2_sent_at IS NULL
       AND confirmed_at <= (now() - make_interval(days => _n2))
  LOOP
    INSERT INTO public.notifications(user_id, kind, payload, is_test)
    VALUES (_row.team_id, 'team_contact_reminder_2', jsonb_build_object('engagement_id', _row.id), _is_test);
    UPDATE public.engagements SET team_reminder2_sent_at = now() WHERE id = _row.id;
    _cnt := _cnt + 1;
  END LOOP;

  RETURN _cnt;
END; $$;

create or replace function public.emit_team_ghosting_reminders()
returns integer language sql security definer set search_path = public as $$
  select public.emit_team_ghosting_reminders_env(false)
$$;

create or replace function public.release_ghosted_engagements_env(_is_test boolean)
returns integer language plpgsql security definer set search_path = public as $$
DECLARE _n int; _cnt int := 0; _row record;
BEGIN
  _n := COALESCE(public.get_setting_num('ghosting_deadline_days', 10), 10)::int;
  FOR _row IN
    SELECT id, freelancer_id, team_id, request_id FROM public.engagements
     WHERE status = 'confirmed' AND is_test = _is_test
       AND confirmed_at IS NOT NULL
       AND team_confirmed_contact IS NOT TRUE
       AND freelancer_contacted = false
       AND confirmed_at <= (now() - make_interval(days => _n))
  LOOP
    UPDATE public.engagements
       SET status = 'cancelled',
           cancellation_kind = 'team_ghosting',
           cancellation_reason = 'Auto-released: team failed to confirm contact within deadline.',
           cancelled_by = team_id,
           cancelled_at = now(),
           ghosting_released_at = now(),
           updated_at = now()
     WHERE id = _row.id;

    INSERT INTO public.notifications(user_id, kind, payload, is_test)
    VALUES (_row.freelancer_id, 'ghosting_released',
            jsonb_build_object('engagement_id', _row.id, 'team_id', _row.team_id, 'request_id', _row.request_id),
            _is_test);

    INSERT INTO public.notifications(user_id, kind, payload, is_test)
    VALUES (_row.team_id, 'team_ghosted',
            jsonb_build_object('engagement_id', _row.id, 'request_id', _row.request_id),
            _is_test);

    IF _row.request_id IS NOT NULL THEN
      UPDATE public.requests
         SET status = 'active', is_active = true, updated_at = now()
       WHERE id = _row.request_id
         AND NOT EXISTS (SELECT 1 FROM public.engagements e2
                          WHERE e2.request_id = _row.request_id AND e2.status = 'confirmed');
    END IF;
    _cnt := _cnt + 1;
  END LOOP;
  RETURN _cnt;
END; $$;

create or replace function public.release_ghosted_engagements()
returns integer language sql security definer set search_path = public as $$
  select public.release_ghosted_engagements_env(false)
$$;

-- Env-scoped variants are Testing-Lab / cron infrastructure only.
revoke all on function public.emit_contact_checks_env(boolean) from public, anon, authenticated;
revoke all on function public.emit_team_ghosting_reminders_env(boolean) from public, anon, authenticated;
revoke all on function public.release_ghosted_engagements_env(boolean) from public, anon, authenticated;
grant execute on function public.emit_contact_checks_env(boolean) to service_role;
grant execute on function public.emit_team_ghosting_reminders_env(boolean) to service_role;
grant execute on function public.release_ghosted_engagements_env(boolean) to service_role;


-- 1. Engagement columns
ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS freelancer_contacted boolean,
  ADD COLUMN IF NOT EXISTS freelancer_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS team_confirmed_contact boolean,
  ADD COLUMN IF NOT EXISTS team_confirmed_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_check_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS team_reminder1_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS team_reminder2_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS ghosting_released_at timestamptz;

-- 2. Notification kinds
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'contact_check';
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'team_contact_reminder_1';
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'team_contact_reminder_2';
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'ghosting_released';
ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'team_ghosted';

-- 3. Platform settings (timings)
INSERT INTO public.platform_settings (key, value_num, category, label, description, unit, sort_order)
VALUES
  ('ghosting_freelance_check_days', 3,  'anti_ghosting', 'Freelancer contact check',        'Days after match confirmation before asking the freelancer if the team reached out.', 'days', 200),
  ('ghosting_team_reminder1_days',  5,  'anti_ghosting', 'Team reminder 1 (collaborative)', 'Days after confirmation before the first collaborative reminder to the team.',        'days', 201),
  ('ghosting_team_reminder2_days',  8,  'anti_ghosting', 'Team reminder 2 (final)',         'Days after confirmation before the final warning that the match will be released.',   'days', 202),
  ('ghosting_deadline_days',        10, 'anti_ghosting', 'Ghosting release deadline',       'Days after confirmation after which an unconfirmed match is auto-released.',          'days', 203)
ON CONFLICT (key) DO NOTHING;

-- 4. Freelancer answers the contact check (YES / NO)
CREATE OR REPLACE FUNCTION public.freelancer_answer_contact(_engagement_id uuid, _contacted boolean)
RETURNS public.engagements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Engagement not found'; END IF;
  IF _e.freelancer_id <> _uid THEN RAISE EXCEPTION 'Only the freelancer can answer'; END IF;
  IF _e.status <> 'confirmed' THEN RAISE EXCEPTION 'Engagement is not active'; END IF;

  UPDATE public.engagements
     SET freelancer_contacted    = _contacted,
         freelancer_contacted_at = now(),
         updated_at              = now()
   WHERE id = _engagement_id
  RETURNING * INTO _e;

  -- If freelancer confirms YES, also flag the team side as resolved
  IF _contacted IS TRUE THEN
    UPDATE public.engagements
       SET team_confirmed_contact    = true,
           team_confirmed_contact_at = COALESCE(team_confirmed_contact_at, now())
     WHERE id = _engagement_id;
  END IF;

  RETURN _e;
END; $$;

-- 5. Team declares having contacted the freelancer
CREATE OR REPLACE FUNCTION public.team_confirm_contact(_engagement_id uuid)
RETURNS public.engagements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Engagement not found'; END IF;
  IF _e.team_id <> _uid THEN RAISE EXCEPTION 'Only the team can confirm'; END IF;
  IF _e.status <> 'confirmed' THEN RAISE EXCEPTION 'Engagement is not active'; END IF;

  UPDATE public.engagements
     SET team_confirmed_contact    = true,
         team_confirmed_contact_at = now(),
         updated_at                = now()
   WHERE id = _engagement_id
  RETURNING * INTO _e;

  RETURN _e;
END; $$;

-- 6. Emit contact checks to freelancers after N sim days
CREATE OR REPLACE FUNCTION public.emit_contact_checks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n int;
  _cnt int := 0;
  _row record;
BEGIN
  _n := COALESCE(public.get_setting_num('ghosting_freelance_check_days', 3), 3)::int;
  FOR _row IN
    SELECT id, freelancer_id
      FROM public.engagements
     WHERE status = 'confirmed'
       AND confirmed_at IS NOT NULL
       AND contact_check_sent_at IS NULL
       AND freelancer_contacted IS NULL
       AND team_confirmed_contact IS NOT TRUE
       AND confirmed_at <= (public.sim_now() - make_interval(days => _n))
  LOOP
    INSERT INTO public.notifications(user_id, kind, payload)
    VALUES (_row.freelancer_id, 'contact_check', jsonb_build_object('engagement_id', _row.id));
    UPDATE public.engagements SET contact_check_sent_at = now() WHERE id = _row.id;
    _cnt := _cnt + 1;
  END LOOP;
  RETURN _cnt;
END; $$;

-- 7. Emit team ghosting reminders (1st and 2nd)
CREATE OR REPLACE FUNCTION public.emit_team_ghosting_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n1 int;
  _n2 int;
  _cnt int := 0;
  _row record;
BEGIN
  _n1 := COALESCE(public.get_setting_num('ghosting_team_reminder1_days', 5), 5)::int;
  _n2 := COALESCE(public.get_setting_num('ghosting_team_reminder2_days', 8), 8)::int;

  -- Reminder 1
  FOR _row IN
    SELECT id, team_id
      FROM public.engagements
     WHERE status = 'confirmed'
       AND confirmed_at IS NOT NULL
       AND team_confirmed_contact IS NOT TRUE
       AND freelancer_contacted = false
       AND team_reminder1_sent_at IS NULL
       AND confirmed_at <= (public.sim_now() - make_interval(days => _n1))
  LOOP
    INSERT INTO public.notifications(user_id, kind, payload)
    VALUES (_row.team_id, 'team_contact_reminder_1', jsonb_build_object('engagement_id', _row.id));
    UPDATE public.engagements SET team_reminder1_sent_at = now() WHERE id = _row.id;
    _cnt := _cnt + 1;
  END LOOP;

  -- Reminder 2
  FOR _row IN
    SELECT id, team_id
      FROM public.engagements
     WHERE status = 'confirmed'
       AND confirmed_at IS NOT NULL
       AND team_confirmed_contact IS NOT TRUE
       AND freelancer_contacted = false
       AND team_reminder1_sent_at IS NOT NULL
       AND team_reminder2_sent_at IS NULL
       AND confirmed_at <= (public.sim_now() - make_interval(days => _n2))
  LOOP
    INSERT INTO public.notifications(user_id, kind, payload)
    VALUES (_row.team_id, 'team_contact_reminder_2', jsonb_build_object('engagement_id', _row.id));
    UPDATE public.engagements SET team_reminder2_sent_at = now() WHERE id = _row.id;
    _cnt := _cnt + 1;
  END LOOP;

  RETURN _cnt;
END; $$;

-- 8. Release ghosted engagements at deadline
CREATE OR REPLACE FUNCTION public.release_ghosted_engagements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n int;
  _cnt int := 0;
  _row record;
BEGIN
  _n := COALESCE(public.get_setting_num('ghosting_deadline_days', 10), 10)::int;
  FOR _row IN
    SELECT id, freelancer_id, team_id, request_id
      FROM public.engagements
     WHERE status = 'confirmed'
       AND confirmed_at IS NOT NULL
       AND team_confirmed_contact IS NOT TRUE
       AND freelancer_contacted = false
       AND confirmed_at <= (public.sim_now() - make_interval(days => _n))
  LOOP
    UPDATE public.engagements
       SET status               = 'cancelled',
           cancellation_kind    = 'team_ghosting',
           cancellation_reason  = 'Auto-released: team failed to confirm contact within deadline.',
           cancelled_by         = team_id,
           cancelled_at         = now(),
           ghosting_released_at = now(),
           updated_at           = now()
     WHERE id = _row.id;

    -- Notify freelancer with an actionable CTA (unilateral rating)
    INSERT INTO public.notifications(user_id, kind, payload)
    VALUES (_row.freelancer_id, 'ghosting_released',
            jsonb_build_object('engagement_id', _row.id, 'team_id', _row.team_id, 'request_id', _row.request_id));

    -- Notify team with the outcome
    INSERT INTO public.notifications(user_id, kind, payload)
    VALUES (_row.team_id, 'team_ghosted',
            jsonb_build_object('engagement_id', _row.id, 'request_id', _row.request_id));

    -- Reopen the request so team can re-list if desired
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

-- 9. Extend submit_rating_v2 to accept unilateral rating after team ghosting
CREATE OR REPLACE FUNCTION public.submit_rating_v2(_engagement_id uuid, _sub_scores jsonb, _overall numeric, _comment text DEFAULT NULL::text)
 RETURNS ratings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
  _to uuid;
  _opens timestamptz;
  _row public.ratings;
  _other public.ratings;
  _stars int;
  _bonus int;
  _is_ghost_unilateral boolean := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Engagement not found'; END IF;
  IF _uid NOT IN (_e.freelancer_id, _e.team_id) THEN RAISE EXCEPTION 'Not a party'; END IF;

  -- Unilateral path: freelancer rating a team that ghosted the match
  IF _e.status = 'cancelled'
     AND _e.cancellation_kind = 'team_ghosting'
     AND _uid = _e.freelancer_id THEN
    _is_ghost_unilateral := true;
  ELSIF _e.status NOT IN ('confirmed','completed') THEN
    RAISE EXCEPTION 'Engagement not active';
  ELSE
    _opens := public.rating_opens_at(_engagement_id);
    IF _opens IS NULL OR public.sim_now() < _opens THEN RAISE EXCEPTION 'Rating not open yet'; END IF;
  END IF;

  _to := CASE WHEN _uid = _e.freelancer_id THEN _e.team_id ELSE _e.freelancer_id END;
  _stars := GREATEST(1, LEAST(5, ROUND(_overall)::int));

  INSERT INTO public.ratings(engagement_id, from_user_id, to_user_id, stars, comment, sub_scores, overall)
  VALUES (_engagement_id, _uid, _to, _stars, _comment, COALESCE(_sub_scores, '{}'::jsonb), _overall)
  RETURNING * INTO _row;

  IF _is_ghost_unilateral THEN
    -- Immediately visible, no double-blind waiting
    UPDATE public.ratings SET unlocked_at = now() WHERE id = _row.id RETURNING * INTO _row;
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_to, 'rating_received', jsonb_build_object('engagement_id', _engagement_id, 'unilateral', true));
    RETURN _row;
  END IF;

  IF NOT _row.token_bonus_awarded THEN
    _bonus := public.get_setting_num('reward_rating_bonus', 1)::int;
    IF _bonus > 0 THEN
      PERFORM public.credit_tokens(_uid, _bonus, 'rating_bonus'::public.token_reason, _engagement_id, 'Rating submitted bonus');
    END IF;
    UPDATE public.ratings SET token_bonus_awarded = true WHERE id = _row.id RETURNING * INTO _row;
  END IF;

  SELECT * INTO _other FROM public.ratings WHERE engagement_id = _engagement_id AND from_user_id = _to LIMIT 1;
  IF FOUND THEN
    UPDATE public.ratings SET unlocked_at = now() WHERE engagement_id = _engagement_id AND unlocked_at IS NULL;
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_uid, 'rating_unlocked', jsonb_build_object('engagement_id', _engagement_id)),
      (_to,  'rating_unlocked', jsonb_build_object('engagement_id', _engagement_id));
  ELSE
    INSERT INTO public.notifications(user_id, kind, payload) VALUES
      (_to, 'rating_received', jsonb_build_object('engagement_id', _engagement_id));
  END IF;

  RETURN _row;
END;
$function$;

-- 10. Grants
REVOKE ALL ON FUNCTION public.freelancer_answer_contact(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_confirm_contact(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.emit_contact_checks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.emit_team_ghosting_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_ghosted_engagements() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.freelancer_answer_contact(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_confirm_contact(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.emit_contact_checks()             TO service_role;
GRANT EXECUTE ON FUNCTION public.emit_team_ghosting_reminders()    TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ghosted_engagements()     TO service_role;


-- Add new notification kind for freelancers whose pending confirmation request
-- becomes obsolete because someone else confirmed first.
DO $$ BEGIN
  ALTER TYPE public.notif_kind ADD VALUE IF NOT EXISTS 'match_taken';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.accept_match_confirmation(_engagement_id uuid)
 RETURNS engagements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _e public.engagements%ROWTYPE;
  _other record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _e FROM public.engagements WHERE id = _engagement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF _e.freelancer_id <> _uid THEN RAISE EXCEPTION 'Only the freelancer can accept'; END IF;
  IF _e.status <> 'proposed' THEN RAISE EXCEPTION 'Match request is no longer pending'; END IF;

  UPDATE public.engagements SET status = 'confirmed', updated_at = now()
    WHERE id = _engagement_id RETURNING * INTO _e;

  IF _e.match_id IS NOT NULL THEN
    INSERT INTO public.match_unlocks(team_id, match_id, request_id, freelancer_id, free_preview)
      VALUES (_e.team_id, _e.match_id, _e.request_id, _e.freelancer_id, true)
      ON CONFLICT DO NOTHING;
    UPDATE public.matches SET revealed_by_team = true, revealed_by_freelancer = true
      WHERE id = _e.match_id;
  END IF;

  IF _e.request_id IS NOT NULL THEN
    INSERT INTO public.request_team_reveals(user_id, request_id)
      VALUES (_e.freelancer_id, _e.request_id)
      ON CONFLICT DO NOTHING;
    INSERT INTO public.team_reveals(user_id, team_id)
      VALUES (_e.freelancer_id, _e.team_id)
      ON CONFLICT DO NOTHING;

    UPDATE public.requests
      SET status = 'completed', is_active = false, updated_at = now()
      WHERE id = _e.request_id;

    -- Race-condition guard: cancel every other pending confirmation request
    -- tied to the same team request and notify those freelancers.
    FOR _other IN
      SELECT id, freelancer_id, team_id
      FROM public.engagements
      WHERE request_id = _e.request_id
        AND id <> _e.id
        AND status = 'proposed'
    LOOP
      UPDATE public.engagements
        SET status = 'cancelled', updated_at = now()
        WHERE id = _other.id;

      INSERT INTO public.notifications(user_id, kind, payload) VALUES
        (_other.freelancer_id, 'match_taken',
         jsonb_build_object('engagement_id', _other.id, 'request_id', _e.request_id));
    END LOOP;
  END IF;

  INSERT INTO public.notifications(user_id, kind, payload) VALUES
    (_e.team_id, 'engagement_confirmed',
     jsonb_build_object('engagement_id', _e.id, 'request_id', _e.request_id, 'freelancer_id', _e.freelancer_id));

  RETURN _e;
END;
$function$;

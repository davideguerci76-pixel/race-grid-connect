DELETE FROM public.rating_flags f
USING public.rating_flags k
WHERE f.rating_id = k.rating_id
  AND f.reported_by = k.reported_by
  AND f.created_at > k.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS rating_flags_reporter_rating_uidx
  ON public.rating_flags(rating_id, reported_by);

CREATE OR REPLACE FUNCTION public.get_user_rating_summary(_user_id uuid)
 RETURNS TABLE(count integer, average numeric, tech numeric, punct numeric, stress numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH visible AS (
    SELECT r.*
    FROM public.ratings r
    WHERE r.to_user_id = _user_id
      AND r.moderation_status IN ('active','approved','flagged')
      AND (r.unlocked_at IS NOT NULL OR r.created_at < (now() - interval '30 days'))
  )
  SELECT
    COUNT(*)::int,
    ROUND(AVG(COALESCE(overall, stars))::numeric, 2),
    ROUND(AVG(NULLIF((sub_scores->>'technical')::numeric, 0))::numeric, 2),
    ROUND(AVG(NULLIF((sub_scores->>'punctuality')::numeric, 0))::numeric, 2),
    ROUND(AVG(NULLIF((sub_scores->>'stress')::numeric, 0))::numeric, 2)
  FROM visible;
$function$;

DROP FUNCTION IF EXISTS public.flag_rating(uuid, text);

CREATE FUNCTION public.flag_rating(_rating_id uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.ratings%ROWTYPE;
  _flag_id uuid;
  _created boolean := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'Please describe the reason (min 10 characters)';
  END IF;
  IF length(_reason) > 2000 THEN
    RAISE EXCEPTION 'Reason too long (max 2000 characters)';
  END IF;

  SELECT * INTO _r FROM public.ratings WHERE id = _rating_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rating not found'; END IF;

  IF _uid <> _r.to_user_id AND _uid <> _r.from_user_id THEN
    RAISE EXCEPTION 'Forbidden: you are not involved in this review';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('rating-flag:' || _rating_id::text || ':' || _uid::text, 0));

  SELECT id INTO _flag_id
  FROM public.rating_flags
  WHERE rating_id = _rating_id AND reported_by = _uid;

  IF _flag_id IS NULL THEN
    INSERT INTO public.rating_flags(rating_id, reported_by, reason)
    VALUES (_rating_id, _uid, _reason)
    ON CONFLICT (rating_id, reported_by) DO NOTHING
    RETURNING id INTO _flag_id;
    _created := _flag_id IS NOT NULL;
  END IF;

  IF NOT _created THEN
    RETURN jsonb_build_object('ok', true, 'already_reported', true, 'flag_id', _flag_id);
  END IF;

  IF _r.moderation_status IN ('active', 'approved') THEN
    UPDATE public.ratings
      SET moderation_status = 'flagged',
          flag_reason = _reason,
          flagged_by = _uid,
          flagged_at = now()
      WHERE id = _rating_id;
  END IF;

  INSERT INTO public.notifications(user_id, kind, payload, is_test)
  SELECT ur.user_id,
         'admin_alert',
         jsonb_build_object(
           'type', 'rating_flag',
           'rating_id', _rating_id,
           'flag_id', _flag_id,
           'message', 'A review has been reported and is waiting for moderation.'
         ),
         _r.is_test
  FROM public.user_roles ur
  WHERE ur.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'already_reported', false, 'flag_id', _flag_id, 'is_test', _r.is_test);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.flag_rating(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.flag_rating(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_notifications_recipient_read_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.is_test IS DISTINCT FROM OLD.is_test
       OR NEW.emailed_at IS DISTINCT FROM OLD.emailed_at
       OR NEW.pushed_at IS DISTINCT FROM OLD.pushed_at
    THEN
      RAISE EXCEPTION 'Notification content is server-authoritative';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_notifications_recipient_read_only ON public.notifications;
CREATE TRIGGER tg_notifications_recipient_read_only
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_notifications_recipient_read_only();

REVOKE EXECUTE ON FUNCTION public.emit_rating_available_notifications() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_expired_requests() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_expired_engagements() FROM authenticated, anon, PUBLIC;
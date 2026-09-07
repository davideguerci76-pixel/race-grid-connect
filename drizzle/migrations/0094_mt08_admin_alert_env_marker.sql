CREATE OR REPLACE FUNCTION public.flag_rating(_rating_id uuid, _reason text)
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
           'env', CASE WHEN _r.is_test THEN 'test' ELSE 'live' END,
           'message', CASE WHEN _r.is_test
             THEN '[TEST] A review has been reported and is waiting for moderation.'
             ELSE 'A review has been reported and is waiting for moderation.' END
         ),
         _r.is_test
  FROM public.user_roles ur
  WHERE ur.role = 'admin';

  RETURN jsonb_build_object('ok', true, 'already_reported', false, 'flag_id', _flag_id, 'is_test', _r.is_test);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.flag_rating(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.flag_rating(uuid, text) TO authenticated;
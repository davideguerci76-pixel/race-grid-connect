
-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.rating_moderation_status AS ENUM ('active','flagged','frozen','deleted','approved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Columns on ratings
ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS moderation_status public.rating_moderation_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS flag_reason text,
  ADD COLUMN IF NOT EXISTS flagged_by uuid,
  ADD COLUMN IF NOT EXISTS flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderated_by uuid,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_suspicious boolean NOT NULL DEFAULT false;

-- 3. rating_flags table (audit / multiple reports per rating)
CREATE TABLE IF NOT EXISTS public.rating_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id uuid NOT NULL REFERENCES public.ratings(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.rating_flags TO authenticated;
GRANT ALL ON public.rating_flags TO service_role;

ALTER TABLE public.rating_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rating_flags_own_read" ON public.rating_flags;
CREATE POLICY "rating_flags_own_read" ON public.rating_flags
  FOR SELECT TO authenticated
  USING (reported_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "rating_flags_insert_self" ON public.rating_flags;
CREATE POLICY "rating_flags_insert_self" ON public.rating_flags
  FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid());

-- 4. flag_rating RPC
CREATE OR REPLACE FUNCTION public.flag_rating(_rating_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _r public.ratings%ROWTYPE;
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

  INSERT INTO public.rating_flags(rating_id, reported_by, reason)
  VALUES (_rating_id, _uid, _reason);

  IF _r.moderation_status = 'active' OR _r.moderation_status = 'approved' THEN
    UPDATE public.ratings
      SET moderation_status = 'flagged',
          flag_reason = _reason,
          flagged_by = _uid,
          flagged_at = now()
      WHERE id = _rating_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.flag_rating(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flag_rating(uuid, text) TO authenticated;

-- 5. admin_set_rating_moderation RPC
CREATE OR REPLACE FUNCTION public.admin_set_rating_moderation(_rating_id uuid, _action text)
RETURNS public.ratings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.ratings%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(_uid, 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;

  IF _action = 'delete' THEN
    DELETE FROM public.ratings WHERE id = _rating_id RETURNING * INTO _row;
    RETURN _row;
  ELSIF _action = 'freeze' THEN
    UPDATE public.ratings
      SET moderation_status = 'frozen', moderated_by = _uid, moderated_at = now()
      WHERE id = _rating_id RETURNING * INTO _row;
  ELSIF _action = 'approve' THEN
    UPDATE public.ratings
      SET moderation_status = 'approved',
          moderated_by = _uid,
          moderated_at = now(),
          flag_reason = NULL,
          flagged_by = NULL,
          flagged_at = NULL
      WHERE id = _rating_id RETURNING * INTO _row;
  ELSE
    RAISE EXCEPTION 'Unknown action: %', _action;
  END IF;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_rating_moderation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_rating_moderation(uuid, text) TO authenticated;

-- 6. Update aggregation: get_user_rating_summary excludes non-visible ratings
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
      AND r.moderation_status IN ('active','approved')
      AND (r.unlocked_at IS NOT NULL OR r.created_at < (public.sim_now() - interval '30 days'))
  )
  SELECT
    COUNT(*)::int,
    ROUND(AVG(COALESCE(overall, stars))::numeric, 2),
    ROUND(AVG(NULLIF((sub_scores->>'technical')::numeric, 0))::numeric, 2),
    ROUND(AVG(NULLIF((sub_scores->>'punctuality')::numeric, 0))::numeric, 2),
    ROUND(AVG(NULLIF((sub_scores->>'stress')::numeric, 0))::numeric, 2)
  FROM visible;
$function$;

-- 7. Update get_anonymous_reviews to include id + moderation_status and exclude non-visible
DROP FUNCTION IF EXISTS public.get_anonymous_reviews(uuid);
CREATE OR REPLACE FUNCTION public.get_anonymous_reviews(_target uuid)
 RETURNS TABLE(id uuid, stars integer, overall numeric, sub_scores jsonb, comment text, created_at timestamptz, moderation_status public.rating_moderation_status)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _allowed boolean;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  _allowed := (_uid = _target) OR EXISTS (
    SELECT 1 FROM public.review_unlocks WHERE user_id = _uid AND target_user_id = _target
  );
  IF NOT _allowed THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, r.stars, r.overall, r.sub_scores, r.comment, r.created_at, r.moderation_status
    FROM public.ratings r
    WHERE r.to_user_id = _target
      AND r.moderation_status IN ('active','approved','flagged')
      AND (r.unlocked_at IS NOT NULL OR r.created_at < (public.sim_now() - interval '30 days'))
    ORDER BY r.created_at DESC
    LIMIT 100;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_anonymous_reviews(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_anonymous_reviews(uuid) TO authenticated;

-- lovable-cron-fallback-reviewed: 96 runs/day; P0 health monitoring of cron/pg_net/email/ledger/capacity is genuinely time-based (staleness detection), one consolidated job, DB already kept awake by existing 1-minute dispatchers
-- OPS-MON-02 — OPERATIONAL BLACK BOX + P0 ALERTING + EMAIL DELIVERY HARDENING
-- Forward-only, additive. No business table is dropped/renamed; no product law is redefined.

-- =====================================================================
-- 1. OPERATIONAL EVENT LOG (append-only, server-authoritative)
-- =====================================================================
CREATE TABLE public.operational_event_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at           timestamptz NOT NULL DEFAULT now(),
  environment           text NOT NULL CHECK (environment IN ('live','test')),
  severity              text NOT NULL CHECK (severity IN ('INFO','WARN','ERROR')),
  event_type            text NOT NULL CHECK (event_type ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  result                text NOT NULL CHECK (result IN ('SUCCESS','FAILED','WARN')),
  actor_user_id         uuid,
  actor_type            text NOT NULL DEFAULT 'system' CHECK (actor_type IN ('user','admin','system')),
  entity_type           text,
  entity_id             uuid,
  secondary_entity_type text,
  secondary_entity_id   uuid,
  reference_id          text,
  error_code            text,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Minimal indexes: chronological export/filter, entity lookup. No index explosion.
CREATE INDEX operational_event_log_env_occurred_idx ON public.operational_event_log (environment, occurred_at);
CREATE INDEX operational_event_log_entity_idx ON public.operational_event_log (entity_id) WHERE entity_id IS NOT NULL;

-- Grants: Admin read via RLS; nobody inserts directly except service_role / SECURITY DEFINER authority.
GRANT SELECT ON public.operational_event_log TO authenticated;
GRANT ALL ON public.operational_event_log TO service_role;
ALTER TABLE public.operational_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read operational log"
  ON public.operational_event_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Append-only authority: history can never be rewritten from the application, whatever the role.
CREATE OR REPLACE FUNCTION public.tg_operational_event_log_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'operational_event_log is append-only (% denied)', TG_OP USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER operational_event_log_append_only
  BEFORE UPDATE OR DELETE ON public.operational_event_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_operational_event_log_append_only();

-- Single write authority. Never exposed to anon/authenticated.
CREATE OR REPLACE FUNCTION public.ops_log_event(
  p_environment text,
  p_event_type text,
  p_result text DEFAULT 'SUCCESS',
  p_severity text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_secondary_entity_type text DEFAULT NULL,
  p_secondary_entity_id uuid DEFAULT NULL,
  p_reference_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_type text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _actor uuid := COALESCE(p_actor_user_id, auth.uid());
  _actor_type text := COALESCE(p_actor_type, CASE WHEN _actor IS NULL THEN 'system' ELSE 'user' END);
  _sev text := COALESCE(p_severity, CASE p_result WHEN 'FAILED' THEN 'ERROR' WHEN 'WARN' THEN 'WARN' ELSE 'INFO' END);
BEGIN
  INSERT INTO public.operational_event_log
    (occurred_at, environment, severity, event_type, result, actor_user_id, actor_type,
     entity_type, entity_id, secondary_entity_type, secondary_entity_id, reference_id, error_code, metadata)
  VALUES
    (COALESCE(p_occurred_at, now()),
     CASE WHEN p_environment IN ('live','test') THEN p_environment ELSE 'live' END,
     _sev, p_event_type,
     CASE WHEN p_result IN ('SUCCESS','FAILED','WARN') THEN p_result ELSE 'SUCCESS' END,
     _actor, _actor_type,
     p_entity_type, p_entity_id, p_secondary_entity_type, p_secondary_entity_id,
     left(p_reference_id, 200), left(p_error_code, 120), COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.ops_log_event(text,text,text,text,text,uuid,text,uuid,text,text,jsonb,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_log_event(text,text,text,text,text,uuid,text,uuid,text,text,jsonb,uuid,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.ops_env(_is_test boolean)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN _is_test THEN 'test' ELSE 'live' END $$;

-- =====================================================================
-- 2. BUSINESS AUTHORITY TRIGGERS (same transaction as the authoritative write)
-- =====================================================================

-- ACCOUNT ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ops_profiles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'ACCOUNT_CREATED', 'SUCCESS',
      p_entity_type => 'profile', p_entity_id => NEW.id, p_actor_user_id => NEW.id,
      p_metadata => jsonb_build_object('user_type', NEW.user_type));
    RETURN NEW;
  END IF;
  IF NEW.blocked_at IS NOT NULL AND OLD.blocked_at IS NULL THEN
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'ACCOUNT_BLOCKED', 'WARN',
      p_entity_type => 'profile', p_entity_id => NEW.id);
  ELSIF NEW.blocked_at IS NULL AND OLD.blocked_at IS NOT NULL THEN
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'ACCOUNT_UNBLOCKED', 'SUCCESS',
      p_entity_type => 'profile', p_entity_id => NEW.id);
  END IF;
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'ACCOUNT_DELETED', 'SUCCESS',
      p_entity_type => 'profile', p_entity_id => NEW.id,
      p_metadata => jsonb_build_object('user_type', NEW.user_type, 'deletion_state', NEW.deletion_state));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_profiles AFTER INSERT OR UPDATE OF blocked_at, deleted_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_profiles();

-- AVAILABILITY ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ops_freelancer_profiles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _days int;
BEGIN
  IF NEW.calendar_last_updated_at IS DISTINCT FROM OLD.calendar_last_updated_at THEN
    SELECT count(*) INTO _days FROM public.availability a WHERE a.freelancer_id = NEW.user_id AND a.is_test = NEW.is_test;
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'AVAILABILITY_APPLIED', 'SUCCESS',
      p_entity_type => 'freelancer', p_entity_id => NEW.user_id,
      p_metadata => jsonb_build_object('available_days', _days));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_freelancer_profiles AFTER UPDATE OF calendar_last_updated_at ON public.freelancer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_freelancer_profiles();

CREATE OR REPLACE FUNCTION public.tg_ops_user_calendars()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.review_status IS DISTINCT FROM OLD.review_status THEN
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'CALENDAR_REVIEWED', 'SUCCESS',
      p_entity_type => 'user_calendar', p_entity_id => NEW.id, p_secondary_entity_type => 'user', p_secondary_entity_id => NEW.owner_id,
      p_metadata => jsonb_build_object('review_status', NEW.review_status));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_user_calendars AFTER UPDATE OF review_status ON public.user_calendars
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_user_calendars();

CREATE OR REPLACE FUNCTION public.tg_ops_recompute_queue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'RECOMPUTE_QUEUED', 'SUCCESS',
      p_entity_type => 'freelancer', p_entity_id => NEW.freelancer_id,
      p_metadata => jsonb_build_object('due_at', NEW.due_at));
  ELSIF NEW.last_error IS NOT NULL AND (NEW.attempts IS DISTINCT FROM OLD.attempts) THEN
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'RECOMPUTE_FAILED', 'FAILED',
      p_entity_type => 'freelancer', p_entity_id => NEW.freelancer_id, p_error_code => left(NEW.last_error, 120),
      p_metadata => jsonb_build_object('attempts', NEW.attempts));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_recompute_queue AFTER INSERT OR UPDATE OF attempts ON public.availability_recompute_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_recompute_queue();

-- PIT CALL ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ops_requests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _env text := public.ops_env(NEW.is_test);
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.ops_log_event(_env, 'PITCALL_CREATED', 'SUCCESS',
      p_entity_type => 'request', p_entity_id => NEW.id, p_secondary_entity_type => 'team', p_secondary_entity_id => NEW.team_id,
      p_metadata => jsonb_build_object('status', NEW.status, 'search_mode', NEW.search_mode, 'duration', NEW.duration,
                                       'start_date', NEW.start_date, 'end_date', NEW.end_date, 'repost_source_id', NEW.repost_source_id));
    RETURN NEW;
  END IF;
  IF NEW.activated_at IS NOT NULL AND OLD.activated_at IS NULL THEN
    PERFORM public.ops_log_event(_env, 'PITCALL_ACTIVATED', 'SUCCESS',
      p_entity_type => 'request', p_entity_id => NEW.id, p_secondary_entity_type => 'team', p_secondary_entity_id => NEW.team_id,
      p_metadata => jsonb_build_object('status', NEW.status, 'match_potential', NEW.match_potential_current));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('completed','closed','filled','paused') THEN
    PERFORM public.ops_log_event(_env, CASE NEW.status WHEN 'completed' THEN 'PITCALL_COMPLETED' WHEN 'closed' THEN 'PITCALL_CLOSED'
                                                       WHEN 'filled' THEN 'PITCALL_FILLED' ELSE 'PITCALL_PAUSED' END, 'SUCCESS',
      p_entity_type => 'request', p_entity_id => NEW.id, p_secondary_entity_type => 'team', p_secondary_entity_id => NEW.team_id,
      p_metadata => jsonb_build_object('from', OLD.status, 'refund_kind', NEW.refund_kind, 'refund_tokens', NEW.refund_tokens));
  END IF;
  IF NEW.red_cancelled_at IS NOT NULL AND OLD.red_cancelled_at IS NULL THEN
    PERFORM public.ops_log_event(_env, 'PITCALL_CANCELLED', 'SUCCESS',
      p_entity_type => 'request', p_entity_id => NEW.id, p_secondary_entity_type => 'team', p_secondary_entity_id => NEW.team_id,
      p_metadata => jsonb_build_object('red_cancel_tokens', NEW.red_cancel_tokens));
  END IF;
  IF OLD.search_mode = 'pool' AND NEW.search_mode = 'standard' THEN
    PERFORM public.ops_log_event(_env, 'PITCALL_UPGRADED', 'SUCCESS',
      p_entity_type => 'request', p_entity_id => NEW.id, p_secondary_entity_type => 'team', p_secondary_entity_id => NEW.team_id,
      p_metadata => jsonb_build_object('from', 'pool', 'to', 'standard'));
  END IF;
  IF NEW.modify_count > OLD.modify_count THEN
    PERFORM public.ops_log_event(_env, 'PITCALL_MODIFIED', 'SUCCESS',
      p_entity_type => 'request', p_entity_id => NEW.id, p_secondary_entity_type => 'team', p_secondary_entity_id => NEW.team_id,
      p_metadata => jsonb_build_object('modify_count', NEW.modify_count));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_requests
  AFTER INSERT OR UPDATE OF status, activated_at, red_cancelled_at, search_mode, modify_count ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_requests();

-- MATCHING: one event per recompute pass (never per candidate). recompute_matches is renamed to
-- recompute_matches_core and wrapped; body, signature, security and grants of the core are untouched.
ALTER FUNCTION public.recompute_matches(uuid, uuid) RENAME TO recompute_matches_core;

CREATE OR REPLACE FUNCTION public.recompute_matches(_freelancer_id uuid, _request_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int; _full int; _partial int; _is_test boolean; _touched int;
BEGIN
  _n := public.recompute_matches_core(_freelancer_id, _request_id);

  IF _request_id IS NOT NULL THEN
    SELECT r.is_test INTO _is_test FROM public.requests r WHERE r.id = _request_id;
    IF _is_test IS NULL THEN RETURN _n; END IF;  -- request deleted: nothing authoritative to log
    SELECT count(*) FILTER (WHERE NOT m.is_partial), count(*) FILTER (WHERE m.is_partial)
      INTO _full, _partial FROM public.matches m WHERE m.request_id = _request_id AND m.stale = false
       AND (_freelancer_id IS NULL OR m.freelancer_id = _freelancer_id);
    PERFORM public.ops_log_event(public.ops_env(_is_test), 'RECOMPUTE_COMPLETED', 'SUCCESS',
      p_entity_type => 'request', p_entity_id => _request_id,
      p_secondary_entity_type => CASE WHEN _freelancer_id IS NULL THEN NULL ELSE 'freelancer' END, p_secondary_entity_id => _freelancer_id,
      p_metadata => jsonb_build_object('full', _full, 'partial', _partial, 'returned', _n));
  ELSIF _freelancer_id IS NOT NULL THEN
    SELECT p.is_test INTO _is_test FROM public.profiles p WHERE p.id = _freelancer_id;
    IF _is_test IS NULL THEN RETURN _n; END IF;
    SELECT count(DISTINCT m.request_id) INTO _touched FROM public.matches m WHERE m.freelancer_id = _freelancer_id AND m.stale = false;
    PERFORM public.ops_log_event(public.ops_env(_is_test), 'RECOMPUTE_COMPLETED', 'SUCCESS',
      p_entity_type => 'freelancer', p_entity_id => _freelancer_id,
      p_metadata => jsonb_build_object('matched_requests', _touched, 'returned', _n));
  END IF;
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_matches(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_matches(uuid, uuid) TO service_role;

-- ENGAGEMENT / MATCH CONFIRMATION / NO-SHOW ------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ops_engagements()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _env text := public.ops_env(NEW.is_test); _kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.ops_log_event(_env, CASE WHEN NEW.status = 'proposed' THEN 'MATCH_CONFIRMATION_REQUESTED' ELSE 'ENGAGEMENT_CREATED' END, 'SUCCESS',
      p_entity_type => 'engagement', p_entity_id => NEW.id, p_secondary_entity_type => 'request', p_secondary_entity_id => NEW.request_id,
      p_metadata => jsonb_build_object('status', NEW.status, 'freelancer_id', NEW.freelancer_id, 'team_id', NEW.team_id,
                                       'proposed_by', NEW.proposed_by, 'start_date', NEW.start_date, 'end_date', NEW.end_date, 'match_id', NEW.match_id));
    RETURN NEW;
  END IF;
  IF OLD.status = 'proposed' AND NEW.status = 'confirmed' THEN
    PERFORM public.ops_log_event(_env, 'MATCH_CONFIRMATION_ACCEPTED', 'SUCCESS',
      p_entity_type => 'engagement', p_entity_id => NEW.id, p_secondary_entity_type => 'request', p_secondary_entity_id => NEW.request_id,
      p_metadata => jsonb_build_object('freelancer_id', NEW.freelancer_id, 'team_id', NEW.team_id, 'confirmed_at', NEW.confirmed_at));
  ELSIF OLD.status <> 'confirmed' AND NEW.status = 'confirmed' THEN
    PERFORM public.ops_log_event(_env, 'ENGAGEMENT_CONFIRMED', 'SUCCESS',
      p_entity_type => 'engagement', p_entity_id => NEW.id, p_secondary_entity_type => 'request', p_secondary_entity_id => NEW.request_id,
      p_metadata => jsonb_build_object('from', OLD.status));
  END IF;
  IF NEW.declined_at IS NOT NULL AND OLD.declined_at IS NULL THEN
    PERFORM public.ops_log_event(_env, 'MATCH_CONFIRMATION_DECLINED', 'SUCCESS',
      p_entity_type => 'engagement', p_entity_id => NEW.id, p_secondary_entity_type => 'request', p_secondary_entity_id => NEW.request_id,
      p_metadata => jsonb_build_object('freelancer_id', NEW.freelancer_id));
  END IF;
  IF NEW.expired_at IS NOT NULL AND OLD.expired_at IS NULL THEN
    PERFORM public.ops_log_event(_env, 'MATCH_CONFIRMATION_EXPIRED', 'WARN',
      p_entity_type => 'engagement', p_entity_id => NEW.id, p_secondary_entity_type => 'request', p_secondary_entity_id => NEW.request_id,
      p_metadata => jsonb_build_object('freelancer_id', NEW.freelancer_id, 'extension_count', NEW.extension_count));
  END IF;
  IF NEW.extension_count > OLD.extension_count THEN
    PERFORM public.ops_log_event(_env, 'MATCH_CONFIRMATION_EXTENDED', 'SUCCESS',
      p_entity_type => 'engagement', p_entity_id => NEW.id, p_secondary_entity_type => 'request', p_secondary_entity_id => NEW.request_id,
      p_metadata => jsonb_build_object('extension_count', NEW.extension_count, 'expires_at', NEW.expires_at));
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    _kind := COALESCE(NEW.cancellation_kind, 'unspecified');
    IF _kind = 'no_show' THEN
      PERFORM public.ops_log_event(_env, 'NO_SHOW_DECLARED', 'WARN',
        p_entity_type => 'engagement', p_entity_id => NEW.id, p_secondary_entity_type => 'request', p_secondary_entity_id => NEW.request_id,
        p_metadata => jsonb_build_object('freelancer_id', NEW.freelancer_id, 'team_id', NEW.team_id, 'cancelled_by', NEW.cancelled_by, 'from', OLD.status));
    ELSE
      PERFORM public.ops_log_event(_env, 'ENGAGEMENT_CANCELLED_' || upper(regexp_replace(_kind, '[^a-zA-Z0-9]', '_', 'g')), 'SUCCESS',
        p_entity_type => 'engagement', p_entity_id => NEW.id, p_secondary_entity_type => 'request', p_secondary_entity_id => NEW.request_id,
        p_metadata => jsonb_build_object('freelancer_id', NEW.freelancer_id, 'team_id', NEW.team_id, 'cancelled_by', NEW.cancelled_by, 'from', OLD.status));
    END IF;
  ELSIF NEW.no_show AND NOT OLD.no_show THEN
    PERFORM public.ops_log_event(_env, 'NO_SHOW_DECLARED', 'WARN',
      p_entity_type => 'engagement', p_entity_id => NEW.id, p_secondary_entity_type => 'request', p_secondary_entity_id => NEW.request_id,
      p_metadata => jsonb_build_object('freelancer_id', NEW.freelancer_id, 'team_id', NEW.team_id, 'status', NEW.status));
  END IF;
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    PERFORM public.ops_log_event(_env, 'ENGAGEMENT_COMPLETED', 'SUCCESS',
      p_entity_type => 'engagement', p_entity_id => NEW.id, p_secondary_entity_type => 'request', p_secondary_entity_id => NEW.request_id,
      p_metadata => jsonb_build_object('freelancer_id', NEW.freelancer_id, 'team_id', NEW.team_id));
  END IF;
  IF NEW.ghosting_released_at IS NOT NULL AND OLD.ghosting_released_at IS NULL THEN
    PERFORM public.ops_log_event(_env, 'ENGAGEMENT_GHOSTING_RELEASED', 'WARN',
      p_entity_type => 'engagement', p_entity_id => NEW.id, p_secondary_entity_type => 'request', p_secondary_entity_id => NEW.request_id,
      p_metadata => jsonb_build_object('freelancer_id', NEW.freelancer_id, 'team_id', NEW.team_id));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_engagements
  AFTER INSERT OR UPDATE OF status, declined_at, expired_at, extension_count, no_show, ghosting_released_at ON public.engagements
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_engagements();

-- SOS --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ops_sos_calls()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'SOS_TRIGGERED', 'WARN',
      p_entity_type => 'sos_call', p_entity_id => NEW.id, p_secondary_entity_type => 'request', p_secondary_entity_id => NEW.request_id,
      p_metadata => jsonb_build_object('team_id', NEW.team_id, 'auto_triggered', NEW.auto_triggered, 'target_count', NEW.target_count, 'min_pct', NEW.min_pct, 'radius_km', NEW.radius_km));
  ELSIF NEW.resolved_at IS NOT NULL AND OLD.resolved_at IS NULL THEN
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'SOS_RESOLVED', 'SUCCESS',
      p_entity_type => 'sos_call', p_entity_id => NEW.id, p_secondary_entity_type => 'engagement', p_secondary_entity_id => NEW.resolved_engagement_id,
      p_metadata => jsonb_build_object('request_id', NEW.request_id, 'team_id', NEW.team_id));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_sos_calls AFTER INSERT OR UPDATE OF resolved_at ON public.sos_calls
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_sos_calls();

-- RATINGS ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ops_ratings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'RATING_SUBMITTED', 'SUCCESS',
      p_entity_type => 'rating', p_entity_id => NEW.id, p_secondary_entity_type => 'engagement', p_secondary_entity_id => NEW.engagement_id,
      p_metadata => jsonb_build_object('from_user_id', NEW.from_user_id, 'to_user_id', NEW.to_user_id, 'stars', NEW.stars, 'overall', NEW.overall, 'auto_suspicious', NEW.auto_suspicious));
  ELSIF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'RATING_MODERATED', 'SUCCESS',
      p_entity_type => 'rating', p_entity_id => NEW.id, p_secondary_entity_type => 'engagement', p_secondary_entity_id => NEW.engagement_id,
      p_metadata => jsonb_build_object('from', OLD.moderation_status, 'to', NEW.moderation_status, 'moderated_by', NEW.moderated_by),
      p_actor_type => CASE WHEN NEW.moderated_by IS NOT NULL THEN 'admin' ELSE NULL END);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_ratings AFTER INSERT OR UPDATE OF moderation_status ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_ratings();

-- TOKENS / ECONOMY (ledger = economic authority; one event per ledger row) ------------
CREATE OR REPLACE FUNCTION public.tg_ops_token_transactions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _type text; _actor_type text := NULL;
BEGIN
  _type := CASE NEW.reason::text
    WHEN 'purchase' THEN 'TOKEN_PURCHASE'
    WHEN 'refund' THEN 'TOKEN_REFUND'
    WHEN 'admin_credit' THEN 'TOKEN_ADMIN_ADJUSTMENT'
    WHEN 'admin_debit' THEN 'TOKEN_ADMIN_ADJUSTMENT'
    WHEN 'rating_bonus' THEN 'RATING_BONUS_GRANTED'
    ELSE CASE WHEN NEW.delta < 0 THEN 'TOKEN_DEBIT' ELSE 'TOKEN_CREDIT' END END;
  IF NEW.reason::text IN ('admin_credit','admin_debit') THEN _actor_type := 'admin'; END IF;
  PERFORM public.ops_log_event(public.ops_env(NEW.is_test), _type, 'SUCCESS',
    p_entity_type => 'user', p_entity_id => NEW.user_id, p_secondary_entity_type => 'token_transaction', p_secondary_entity_id => NEW.id,
    p_reference_id => NEW.ref_id::text, p_actor_type => _actor_type,
    p_metadata => jsonb_build_object('delta', NEW.delta, 'reason', NEW.reason, 'ref_id', NEW.ref_id));
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_token_transactions AFTER INSERT ON public.token_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_token_transactions();

CREATE OR REPLACE FUNCTION public.tg_ops_token_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.failed_at IS NOT NULL AND OLD.failed_at IS NULL) OR (NEW.rejected_at IS NOT NULL AND OLD.rejected_at IS NULL) THEN
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'TOKEN_PURCHASE', 'FAILED',
      p_entity_type => 'team', p_entity_id => NEW.team_id, p_secondary_entity_type => 'token_order', p_secondary_entity_id => NEW.id,
      p_reference_id => NEW.provider_payment_id, p_error_code => COALESCE(left(NEW.rejection_reason, 120), NEW.status),
      p_metadata => jsonb_build_object('status', NEW.status, 'token_quantity', NEW.token_quantity, 'package_code', NEW.package_code,
                                       'total_amount_cents', NEW.total_amount_cents, 'currency', NEW.currency, 'provider_mode', NEW.provider_mode));
  ELSIF NEW.credited_at IS NOT NULL AND OLD.credited_at IS NULL THEN
    -- Economic SUCCESS is logged by the ledger row (TOKEN_PURCHASE via token_transactions). Here we only add the commercial reference.
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'TOKEN_ORDER_CREDITED', 'SUCCESS',
      p_entity_type => 'team', p_entity_id => NEW.team_id, p_secondary_entity_type => 'token_order', p_secondary_entity_id => NEW.id,
      p_reference_id => NEW.provider_payment_id,
      p_metadata => jsonb_build_object('token_quantity', NEW.token_quantity, 'package_code', NEW.package_code, 'total_amount_cents', NEW.total_amount_cents,
                                       'amount_collected_cents', NEW.amount_collected_cents, 'currency', NEW.currency, 'provider_mode', NEW.provider_mode,
                                       'credit_transaction_id', NEW.credit_transaction_id));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_token_orders AFTER UPDATE OF failed_at, rejected_at, credited_at ON public.token_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_token_orders();

-- NOTIFICATIONS: push terminal failure -----------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ops_push_deliveries()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'failed' AND NEW.attempts >= 3 AND (OLD.status <> 'failed' OR OLD.attempts < 3) THEN
    PERFORM public.ops_log_event(public.ops_env(NEW.is_test), 'NOTIFICATION_PUSH_FAILED', 'FAILED',
      p_entity_type => 'notification', p_entity_id => NEW.notification_id, p_secondary_entity_type => 'push_subscription', p_secondary_entity_id => NEW.subscription_id,
      p_error_code => left(NEW.last_error, 120), p_metadata => jsonb_build_object('attempts', NEW.attempts));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_push_deliveries AFTER UPDATE OF status, attempts ON public.push_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_push_deliveries();

-- ACP / ADMIN -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ops_platform_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.value_num IS DISTINCT FROM OLD.value_num THEN
    PERFORM public.ops_log_event('live', 'ACP_SETTING_CHANGED', 'SUCCESS',
      p_reference_id => NEW.key, p_actor_user_id => COALESCE(NEW.updated_by, auth.uid()), p_actor_type => 'admin',
      p_metadata => jsonb_build_object('key', NEW.key, 'category', NEW.category, 'old', OLD.value_num, 'new', NEW.value_num));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_platform_settings AFTER UPDATE OF value_num ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_platform_settings();

CREATE OR REPLACE FUNCTION public.tg_ops_matching_weights()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF to_jsonb(NEW) - 'updated_at' IS DISTINCT FROM to_jsonb(OLD) - 'updated_at' THEN
    PERFORM public.ops_log_event('live', 'ACP_SETTING_CHANGED', 'SUCCESS',
      p_reference_id => 'matching_weights', p_actor_type => 'admin',
      p_metadata => jsonb_build_object('key', 'matching_weights', 'new', to_jsonb(NEW) - 'updated_at' - 'id'));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_matching_weights AFTER UPDATE ON public.matching_weights
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_matching_weights();

CREATE OR REPLACE FUNCTION public.tg_ops_admin_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _env text; _type text; _result text := 'SUCCESS'; _meta jsonb;
BEGIN
  SELECT public.ops_env(COALESCE(s.is_test, false)) INTO _env FROM public.admin_env_state s WHERE s.admin_id = NEW.admin_id;
  _env := COALESCE(_env, 'live');
  IF NEW.action = 'BACKUP_ALL_LIVE' THEN
    _type := 'BACKUP_GENERATED'; _env := 'live';
    IF COALESCE(NEW.details->>'outcome', 'success') <> 'success' THEN _result := 'FAILED'; END IF;
    _meta := jsonb_strip_nulls(jsonb_build_object('outcome', NEW.details->>'outcome', 'file_sha256', NEW.details->>'file_sha256',
              'file_bytes', NEW.details->'file_bytes', 'dataset_count', NEW.details->'dataset_count', 'format_version', NEW.details->'format_version',
              'stage', NEW.details->>'stage', 'audit_id', NEW.id));
  ELSE
    _type := 'ADMIN_ACTION';
    _meta := jsonb_build_object('action', NEW.action, 'audit_id', NEW.id);
  END IF;
  PERFORM public.ops_log_event(_env, _type, _result,
    p_entity_type => CASE WHEN NEW.target_user_id IS NULL THEN NULL ELSE 'user' END, p_entity_id => NEW.target_user_id,
    p_reference_id => NEW.action, p_actor_user_id => NEW.admin_id, p_actor_type => 'admin', p_metadata => _meta, p_occurred_at => NEW.created_at);
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_ops_admin_audit_log AFTER INSERT ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_ops_admin_audit_log();

-- =====================================================================
-- 3. MON-02 — EMAIL DELIVERY STATE (emailed_at = accepted by provider, nothing else)
-- =====================================================================
ALTER TABLE public.notifications
  ADD COLUMN email_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN email_last_attempt_at timestamptz,
  ADD COLUMN email_next_attempt_at timestamptz,
  ADD COLUMN email_last_error text,
  ADD COLUMN email_status text CHECK (email_status IN ('failed_transient','failed_permanent','suppressed','skipped'));

CREATE INDEX notifications_email_pending_idx ON public.notifications (created_at)
  WHERE emailed_at IS NULL AND is_test = false;

-- Only dispatch when something is actually retryable now (no 1-minute POST storm on terminal failures).
CREATE OR REPLACE FUNCTION public.dispatch_notification_emails()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg public.email_hook_config%ROWTYPE;
  pending integer;
BEGIN
  SELECT * INTO cfg FROM public.email_hook_config WHERE id;
  IF NOT FOUND THEN RETURN; END IF;

  -- TEST notifications are marked as handled and never leave the platform
  UPDATE public.notifications SET emailed_at = now(), email_status = 'skipped'
   WHERE emailed_at IS NULL AND is_test;

  SELECT count(*) INTO pending
  FROM public.notifications
  WHERE emailed_at IS NULL AND is_test = false AND created_at > now() - interval '2 days'
    AND (email_status IS NULL OR email_status = 'failed_transient')
    AND email_attempts < 5
    AND (email_next_attempt_at IS NULL OR email_next_attempt_at <= now());

  IF pending = 0 THEN RETURN; END IF;

  PERFORM net.http_post(
    url := cfg.endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', cfg.secret),
    body := '{}'::jsonb
  );
END;
$$;

-- =====================================================================
-- 4. P0 ALERTING — state, dedupe, health checks, dispatch
-- =====================================================================
CREATE TABLE public.ops_alert_state (
  alert_key        text PRIMARY KEY,
  check_kind       text NOT NULL,
  environment      text NOT NULL DEFAULT 'live' CHECK (environment IN ('live','test')),
  status           text NOT NULL CHECK (status IN ('open','recovered')),
  opened_at        timestamptz NOT NULL,
  last_seen_at     timestamptz NOT NULL,
  recovered_at     timestamptz,
  last_notified_at timestamptz,
  notify_pending   boolean NOT NULL DEFAULT false,
  notify_kind      text CHECK (notify_kind IN ('open','reminder','recovered')),
  notify_attempts  integer NOT NULL DEFAULT 0,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ops_alert_state TO authenticated;
GRANT ALL ON public.ops_alert_state TO service_role;
ALTER TABLE public.ops_alert_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read alert state" ON public.ops_alert_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Known LIVE ledger baseline (F-BR-05): never auto-corrected, never re-alerted. Only NEW/CHANGED mismatches alert.
CREATE TABLE public.ops_ledger_baseline (
  user_id       uuid PRIMARY KEY,
  token_balance integer NOT NULL,
  ledger_sum    integer NOT NULL,
  difference    integer NOT NULL,
  source        text NOT NULL DEFAULT 'baseline',
  recorded_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ops_ledger_baseline TO authenticated;
GRANT ALL ON public.ops_ledger_baseline TO service_role;
ALTER TABLE public.ops_ledger_baseline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read ledger baseline" ON public.ops_ledger_baseline FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ops_ledger_baseline (user_id, token_balance, ledger_sum, difference, source)
SELECT p.id, p.token_balance, s.ledger_sum, p.token_balance - s.ledger_sum, 'baseline_f_br_05'
FROM public.profiles p
CROSS JOIN LATERAL (SELECT COALESCE(sum(t.delta), 0)::int AS ledger_sum FROM public.token_transactions t WHERE t.user_id = p.id AND t.is_test = false) s
WHERE p.is_test = false AND p.token_balance <> s.ledger_sum;

-- Alert state machine: open once → silent while persisting (24h reminder) → RECOVERED → re-open = new email.
CREATE OR REPLACE FUNCTION public.ops_alert_observe(
  p_key text, p_kind text, p_active boolean, p_payload jsonb,
  p_now timestamptz DEFAULT now(), p_env text DEFAULT 'live', p_dry_run boolean DEFAULT false
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st public.ops_alert_state%ROWTYPE; _action text := 'none';
BEGIN
  SELECT * INTO st FROM public.ops_alert_state WHERE alert_key = p_key FOR UPDATE;
  IF p_active THEN
    IF NOT FOUND OR st.status = 'recovered' THEN
      _action := 'opened';
      IF NOT p_dry_run THEN
        INSERT INTO public.ops_alert_state (alert_key, check_kind, environment, status, opened_at, last_seen_at, recovered_at, notify_pending, notify_kind, notify_attempts, payload, updated_at)
        VALUES (p_key, p_kind, p_env, 'open', p_now, p_now, NULL, true, 'open', 0, COALESCE(p_payload,'{}'::jsonb), p_now)
        ON CONFLICT (alert_key) DO UPDATE SET status='open', opened_at=EXCLUDED.opened_at, last_seen_at=EXCLUDED.last_seen_at, recovered_at=NULL,
          notify_pending=true, notify_kind='open', notify_attempts=0, payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at;
      END IF;
    ELSE
      IF st.last_notified_at IS NOT NULL AND st.last_notified_at < p_now - interval '24 hours' AND NOT st.notify_pending THEN
        _action := 'reminder';
        IF NOT p_dry_run THEN
          UPDATE public.ops_alert_state SET last_seen_at=p_now, notify_pending=true, notify_kind='reminder', notify_attempts=0, payload=COALESCE(p_payload,'{}'::jsonb), updated_at=p_now WHERE alert_key=p_key;
        END IF;
      ELSIF NOT p_dry_run THEN
        UPDATE public.ops_alert_state SET last_seen_at=p_now, payload=COALESCE(p_payload,'{}'::jsonb), updated_at=p_now WHERE alert_key=p_key;
      END IF;
    END IF;
  ELSIF FOUND AND st.status = 'open' THEN
    _action := 'recovered';
    IF NOT p_dry_run THEN
      UPDATE public.ops_alert_state SET status='recovered', recovered_at=p_now, notify_pending=true, notify_kind='recovered', notify_attempts=0, updated_at=p_now WHERE alert_key=p_key;
      PERFORM public.ops_log_event(p_env, 'OPERATIONAL_ALERT_RECOVERED', 'SUCCESS', p_reference_id => p_key,
        p_metadata => jsonb_build_object('check_kind', p_kind, 'opened_at', st.opened_at, 'recovered_at', p_now));
    END IF;
  END IF;
  RETURN _action;
END;
$$;
REVOKE ALL ON FUNCTION public.ops_alert_observe(text,text,boolean,jsonb,timestamptz,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_alert_observe(text,text,boolean,jsonb,timestamptz,text,boolean) TO service_role;

-- Expected interval (minutes) from a cron schedule: supports "* * * * *", "*/N", "a-b/N", "M * * * *", "M H * * *".
CREATE OR REPLACE FUNCTION public.ops_cron_interval_minutes(p_schedule text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE f text[]; m text; h text;
BEGIN
  f := regexp_split_to_array(btrim(p_schedule), '\s+');
  IF array_length(f, 1) <> 5 THEN RETURN NULL; END IF;
  m := f[1]; h := f[2];
  IF m = '*' THEN RETURN 1; END IF;
  IF m ~ '^(\*|\d+-\d+)/\d+$' THEN RETURN split_part(m, '/', 2)::int; END IF;
  IF m ~ '^\d+$' THEN
    IF h = '*' THEN RETURN 60; END IF;
    IF h ~ '^\d+$' THEN RETURN 1440; END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- P0 health evaluation. Dry-run returns the evaluation without persisting anything (TEST validation).
CREATE OR REPLACE FUNCTION public.ops_health_check(p_now timestamptz DEFAULT now(), p_dry_run boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  _out jsonb := '[]'::jsonb;
  _j record; _iv int; _last timestamptz; _thr interval; _active boolean; _payload jsonb; _act text;
  _fail3 int; _statuses text; _last_err text; _net_ok boolean;
  _perm int; _trans int;
  _l record; _key text;
  _cap timestamptz;
BEGIN
  -- A. CRON HEALTH ------------------------------------------------------------
  FOR _j IN SELECT jobid, jobname, schedule FROM cron.job WHERE active LOOP
    _iv := public.ops_cron_interval_minutes(_j.schedule);
    IF _iv IS NULL THEN CONTINUE; END IF;
    _thr := make_interval(mins => 2 * _iv + GREATEST(10, _iv / 2));
    SELECT max(end_time) INTO _last FROM cron.job_run_details d WHERE d.jobid = _j.jobid AND d.status = 'succeeded';
    SELECT count(*) FILTER (WHERE status = 'failed') INTO _fail3
      FROM (SELECT status FROM cron.job_run_details d WHERE d.jobid = _j.jobid AND d.status IN ('succeeded','failed') ORDER BY start_time DESC LIMIT 3) x;
    IF _last IS NULL AND _fail3 = 0 THEN CONTINUE; END IF;  -- never ran yet: nothing to judge
    _active := (_last IS NULL OR _last < p_now - _thr) OR _fail3 >= 3;
    _payload := jsonb_build_object('job', _j.jobname, 'schedule', _j.schedule, 'expected_interval_min', _iv,
                                   'threshold_min', extract(epoch FROM _thr)/60, 'last_success_at', _last, 'consecutive_failures', _fail3, 'detected_at', p_now);
    _key := 'cron:' || _j.jobname;
    _act := public.ops_alert_observe(_key, 'cron_health', _active, _payload, p_now, 'live', p_dry_run);
    IF _act = 'opened' AND NOT p_dry_run THEN
      PERFORM public.ops_log_event('live', 'CRON_HEALTH_WARNING', 'WARN', p_reference_id => _key, p_metadata => _payload);
    END IF;
    _out := _out || jsonb_build_object('key', _key, 'active', _active, 'action', _act, 'payload', _payload);
  END LOOP;

  -- B. PG_NET / INTERNAL PUBLIC ENDPOINTS ---------------------------------------
  SELECT count(*) FILTER (WHERE NOT ok), string_agg(COALESCE(status_code::text, 'none'), ',' ORDER BY id DESC), max(err), bool_or(ok) FILTER (WHERE rn = 1)
    INTO _fail3, _statuses, _last_err, _net_ok
  FROM (SELECT id, status_code, row_number() OVER (ORDER BY id DESC) rn,
               (status_code BETWEEN 200 AND 299 AND NOT COALESCE(timed_out, false) AND error_msg IS NULL) AS ok,
               COALESCE(error_msg, CASE WHEN status_code >= 400 THEN left(content::text, 160) END) AS err
          FROM net._http_response ORDER BY id DESC LIMIT 3) r;
  IF _statuses IS NOT NULL THEN
    _active := (_fail3 >= 3);
    _payload := jsonb_build_object('consecutive_failures', _fail3, 'last_statuses', _statuses, 'last_error', _last_err, 'latest_ok', _net_ok, 'detected_at', p_now,
                                   'endpoint', 'internal /api/public/* (pg_net does not retain the URL per response)');
    _act := public.ops_alert_observe('pgnet:internal_endpoints', 'pgnet_health', _active, _payload, p_now, 'live', p_dry_run);
    IF _act = 'opened' AND NOT p_dry_run THEN
      PERFORM public.ops_log_event('live', 'PGNET_ENDPOINT_FAILURE', 'FAILED', p_reference_id => 'pgnet:internal_endpoints', p_error_code => left(_last_err, 120), p_metadata => _payload);
    END IF;
    _out := _out || jsonb_build_object('key', 'pgnet:internal_endpoints', 'active', _active, 'action', _act, 'payload', _payload);
  END IF;

  -- C. NOTIFICATION EMAIL FAILURES (LIVE, last 24h, not suppressed) -----------------
  SELECT count(*) FILTER (WHERE email_status = 'failed_permanent'), count(*) FILTER (WHERE email_status = 'failed_transient')
    INTO _perm, _trans
  FROM public.notifications
  WHERE is_test = false AND emailed_at IS NULL AND email_last_attempt_at > p_now - interval '24 hours';
  _active := (_perm >= 1 OR _trans >= 3);
  _payload := jsonb_build_object('permanent_failures_24h', _perm, 'transient_failures_24h', _trans, 'detected_at', p_now);
  _act := public.ops_alert_observe('email:notification_delivery', 'email_delivery', _active, _payload, p_now, 'live', p_dry_run);
  IF _act = 'opened' AND NOT p_dry_run THEN
    PERFORM public.ops_log_event('live', 'NOTIFICATION_EMAIL_FAILURE_ALERT', 'FAILED', p_reference_id => 'email:notification_delivery', p_metadata => _payload);
  END IF;
  _out := _out || jsonb_build_object('key', 'email:notification_delivery', 'active', _active, 'action', _act, 'payload', _payload);

  -- D. TOKEN LEDGER — NEW mismatches only (baseline F-BR-05 excluded) ---------------
  FOR _l IN
    SELECT p.id AS user_id, p.token_balance, s.ledger_sum, (p.token_balance - s.ledger_sum) AS diff, b.difference AS baseline_diff
    FROM public.profiles p
    CROSS JOIN LATERAL (SELECT COALESCE(sum(t.delta), 0)::int AS ledger_sum FROM public.token_transactions t WHERE t.user_id = p.id AND t.is_test = false) s
    LEFT JOIN public.ops_ledger_baseline b ON b.user_id = p.id
    WHERE p.is_test = false AND (p.token_balance <> s.ledger_sum OR b.user_id IS NOT NULL)
  LOOP
    _key := 'ledger:' || _l.user_id::text;
    _active := (_l.diff <> 0 AND _l.diff IS DISTINCT FROM _l.baseline_diff);
    _payload := jsonb_build_object('user_id', _l.user_id, 'token_balance', _l.token_balance, 'ledger_sum', _l.ledger_sum, 'difference', _l.diff,
                                   'baseline_difference', _l.baseline_diff, 'detected_at', p_now);
    _act := public.ops_alert_observe(_key, 'token_ledger', _active, _payload, p_now, 'live', p_dry_run);
    IF _act = 'opened' AND NOT p_dry_run THEN
      PERFORM public.ops_log_event('live', 'TOKEN_LEDGER_MISMATCH', 'FAILED', p_entity_type => 'user', p_entity_id => _l.user_id, p_reference_id => _key, p_metadata => _payload);
      -- Record the newly detected state so the same mismatch is not re-alerted every cycle (no auto-remediation).
      INSERT INTO public.ops_ledger_baseline (user_id, token_balance, ledger_sum, difference, source, recorded_at)
      VALUES (_l.user_id, _l.token_balance, _l.ledger_sum, _l.diff, 'detected', p_now)
      ON CONFLICT (user_id) DO UPDATE SET token_balance = EXCLUDED.token_balance, ledger_sum = EXCLUDED.ledger_sum, difference = EXCLUDED.difference, source = 'detected', recorded_at = p_now;
    END IF;
    IF _active OR _act <> 'none' THEN
      _out := _out || jsonb_build_object('key', _key, 'active', _active, 'action', _act, 'payload', _payload);
    END IF;
  END LOOP;

  -- E. CAPACITY ALERT SELF-CHECK (daily job → stale after 36h) --------------------
  SELECT last_checked_at INTO _cap FROM public.platform_capacity_state WHERE id;
  IF FOUND THEN
    _active := (_cap IS NULL OR _cap < p_now - interval '36 hours');
    _payload := jsonb_build_object('last_checked_at', _cap, 'threshold_hours', 36, 'detected_at', p_now);
    _act := public.ops_alert_observe('capacity:self_check', 'capacity_self_check', _active, _payload, p_now, 'live', p_dry_run);
    IF _act = 'opened' AND NOT p_dry_run THEN
      PERFORM public.ops_log_event('live', 'CAPACITY_CHECK_STALE', 'WARN', p_reference_id => 'capacity:self_check', p_metadata => _payload);
    END IF;
    _out := _out || jsonb_build_object('key', 'capacity:self_check', 'active', _active, 'action', _act, 'payload', _payload);
  END IF;

  RETURN _out;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ops_health_check failed: %', SQLERRM;
  RETURN jsonb_build_array(jsonb_build_object('error', SQLERRM));
END;
$$;
REVOKE ALL ON FUNCTION public.ops_health_check(timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_health_check(timestamptz, boolean) TO service_role;

-- Pending alerts for the ops mail route (LIVE only, max 10 per run, attempts capped at 5).
CREATE OR REPLACE FUNCTION public.ops_alerts_take_pending()
RETURNS SETOF public.ops_alert_state LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    UPDATE public.ops_alert_state s SET notify_attempts = s.notify_attempts + 1, updated_at = now()
    WHERE s.alert_key IN (SELECT alert_key FROM public.ops_alert_state WHERE notify_pending AND environment = 'live' AND notify_attempts < 5 ORDER BY updated_at LIMIT 10)
    RETURNING s.*;
END;
$$;
REVOKE ALL ON FUNCTION public.ops_alerts_take_pending() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_alerts_take_pending() TO service_role;

CREATE OR REPLACE FUNCTION public.ops_alert_mark_notified(p_key text, p_sent boolean, p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st public.ops_alert_state%ROWTYPE;
BEGIN
  SELECT * INTO st FROM public.ops_alert_state WHERE alert_key = p_key FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_sent THEN
    UPDATE public.ops_alert_state SET notify_pending = false, last_notified_at = now(), updated_at = now() WHERE alert_key = p_key;
    PERFORM public.ops_log_event(st.environment, 'OPERATIONAL_ALERT_SENT', 'SUCCESS', p_reference_id => p_key,
      p_metadata => jsonb_build_object('check_kind', st.check_kind, 'notify_kind', st.notify_kind, 'attempt', st.notify_attempts));
  ELSE
    -- Terminal after 5 attempts: stop retrying, keep the evidence in the log.
    IF st.notify_attempts >= 5 THEN
      UPDATE public.ops_alert_state SET notify_pending = false, updated_at = now() WHERE alert_key = p_key;
    END IF;
    PERFORM public.ops_log_event(st.environment, 'OPERATIONAL_ALERT_FAILED', 'FAILED', p_reference_id => p_key, p_error_code => left(p_error, 120),
      p_metadata => jsonb_build_object('check_kind', st.check_kind, 'notify_kind', st.notify_kind, 'attempt', st.notify_attempts, 'terminal', st.notify_attempts >= 5));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.ops_alert_mark_notified(text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_alert_mark_notified(text, boolean, text) TO service_role;

-- POST to the ops mail route only when something is pending (logically separate from the notification dispatcher).
CREATE OR REPLACE FUNCTION public.dispatch_ops_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg public.email_hook_config%ROWTYPE; endpoint text;
BEGIN
  SELECT * INTO cfg FROM public.email_hook_config WHERE id;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ops_alert_state WHERE notify_pending AND environment = 'live' AND notify_attempts < 5) THEN RETURN; END IF;
  endpoint := replace(cfg.endpoint, '/api/public/notification-email', '/api/public/ops-alert');
  PERFORM net.http_post(url := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', cfg.secret), body := '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_ops_alerts failed: %', SQLERRM;
END;
$$;

-- One consolidated P0 job: evaluate health, then dispatch pending alert emails (96 runs/day).
SELECT cron.schedule('ops-health-check', '*/15 * * * *', $$SELECT public.ops_health_check(); SELECT public.dispatch_ops_alerts();$$);

-- =====================================================================
-- 5. BACKUP ALL integration — LIVE operational log up to the snapshot time (service_role only)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.backup_operational_event_log_live_export(p_until timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.occurred_at, t.id), '[]'::jsonb)
  FROM public.operational_event_log t WHERE t.environment = 'live' AND t.occurred_at <= p_until;
$$;
REVOKE ALL ON FUNCTION public.backup_operational_event_log_live_export(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_operational_event_log_live_export(timestamptz) TO service_role;

COMMENT ON TABLE public.operational_event_log IS 'OPS-MON-02 operational black box: append-only, server-authoritative timeline of significant business/operational events (LIVE+TEST tagged). Never replayed automatically.';
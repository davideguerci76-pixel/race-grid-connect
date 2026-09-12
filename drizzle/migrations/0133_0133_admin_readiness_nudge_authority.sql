-- UAT-ONBOARD-05 — Admin readiness nudge authority (single + bulk share ONE path).
-- Product law (approved 2026-09-12):
--   * cooldown = 14 days, per Freelancer, per environment, on kind='readiness_nudge' regardless of reason(s);
--   * no Admin force-send / cooldown bypass;
--   * eligibility re-evaluated server-side immediately before the insert via activation_status_for(uid) (unchanged);
--   * environment is forced by the caller-resolved admin env (_is_test); candidate ids outside it are never sent.
-- The last nudge is derived from the append-only notifications table itself (no new persistence).

CREATE OR REPLACE FUNCTION public.readiness_nudge_cooldown_days()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 14 $$;

REVOKE ALL ON FUNCTION public.readiness_nudge_cooldown_days() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.readiness_nudge_cooldown_days() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_readiness_nudge(
  _admin_id uuid,
  _is_test boolean,
  _candidate_ids uuid[],
  _filter_reason text DEFAULT NULL,
  _filter_role text DEFAULT NULL,
  _mode text DEFAULT 'single',
  _dry_run boolean DEFAULT true,
  _batch_id uuid DEFAULT NULL
)
RETURNS TABLE (user_id uuid, outcome text, reasons jsonb, primary_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid uuid;
  _p record;
  _st jsonb;
  _rs jsonb;
  _primary text;
  _last timestamptz;
  _cooldown interval := (public.readiness_nudge_cooldown_days() || ' days')::interval;
  _msg text;
  _nid uuid;
  _n_sent int := 0; _n_ready int := 0; _n_cool int := 0; _n_inel int := 0; _n_filter int := 0; _n_failed int := 0;
BEGIN
  IF _admin_id IS NULL OR _is_test IS NULL THEN
    RAISE EXCEPTION 'NUDGE_BAD_ARGS' USING ERRCODE = '22023';
  END IF;
  IF _mode NOT IN ('single', 'bulk') THEN
    RAISE EXCEPTION 'NUDGE_BAD_MODE' USING ERRCODE = '22023';
  END IF;
  IF _filter_reason IS NOT NULL AND _filter_reason NOT IN ('missing_role','missing_phone','missing_availability','stale_availability') THEN
    RAISE EXCEPTION 'NUDGE_BAD_FILTER' USING ERRCODE = '22023';
  END IF;
  -- Admin authority is re-checked here too (defence in depth; the server fn already asserts it).
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _admin_id AND ur.role = 'admin') THEN
    RAISE EXCEPTION 'NUDGE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Serialise sends per environment: double-click / concurrent bulk / retry cannot race the cooldown check.
  IF NOT _dry_run THEN
    PERFORM pg_advisory_xact_lock(hashtext('readiness_nudge'), CASE WHEN _is_test THEN 1 ELSE 0 END);
  END IF;

  FOREACH _cid IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(_candidate_ids, ARRAY[]::uuid[])) AS x) LOOP
    -- 1) Existence / environment / account state. Anything outside the admin env is dropped without distinction.
    SELECT p.id, p.blocked_at, p.deleted_at, fp.role_group
      INTO _p
    FROM public.profiles p
    LEFT JOIN public.freelancer_profiles fp ON fp.user_id = p.id
    WHERE p.id = _cid
      AND p.is_test = _is_test
      AND p.user_type = 'freelancer';

    IF _p.id IS NULL OR _p.blocked_at IS NOT NULL OR _p.deleted_at IS NOT NULL THEN
      _n_inel := _n_inel + 1;
      user_id := _cid; outcome := 'skipped_ineligible'; reasons := '[]'::jsonb; primary_reason := NULL; RETURN NEXT;
      CONTINUE;
    END IF;

    -- 2) Optional role filter (mirrors the ACP filter server-side).
    IF _filter_role IS NOT NULL AND COALESCE(_p.role_group, '') <> _filter_role THEN
      _n_filter := _n_filter + 1;
      user_id := _cid; outcome := 'skipped_filter'; reasons := '[]'::jsonb; primary_reason := NULL; RETURN NEXT;
      CONTINUE;
    END IF;

    -- 3) READY re-evaluation via the single authority (semantics untouched).
    _st := public.activation_status_for(_cid);
    _rs := COALESCE(_st->'reasons', '[]'::jsonb);
    IF COALESCE((_st->>'ready')::boolean, false) OR NOT COALESCE((_st->>'is_freelancer')::boolean, false) OR jsonb_array_length(_rs) = 0 THEN
      _n_ready := _n_ready + 1;
      user_id := _cid; outcome := 'skipped_ready'; reasons := _rs; primary_reason := NULL; RETURN NEXT;
      CONTINUE;
    END IF;

    -- 4) Optional reason filter (Nudge All on a filtered target only).
    IF _filter_reason IS NOT NULL AND NOT (_rs ? _filter_reason) THEN
      _n_filter := _n_filter + 1;
      user_id := _cid; outcome := 'skipped_filter'; reasons := _rs; primary_reason := NULL; RETURN NEXT;
      CONTINUE;
    END IF;

    _primary := CASE
      WHEN _rs ? 'missing_role' THEN 'missing_role'
      WHEN _rs ? 'missing_phone' THEN 'missing_phone'
      WHEN _rs ? 'missing_availability' THEN 'missing_availability'
      ELSE 'stale_availability' END;

    -- 5) Cooldown: last readiness nudge in THIS environment, derived from the append-only notifications table.
    SELECT max(n.created_at) INTO _last
    FROM public.notifications n
    WHERE n.user_id = _cid AND n.kind = 'readiness_nudge' AND n.is_test = _is_test;

    IF _last IS NOT NULL AND _last > now() - _cooldown THEN
      _n_cool := _n_cool + 1;
      user_id := _cid; outcome := 'skipped_cooldown'; reasons := _rs; primary_reason := _primary; RETURN NEXT;
      CONTINUE;
    END IF;

    IF _dry_run THEN
      _n_sent := _n_sent + 1;
      user_id := _cid; outcome := 'eligible'; reasons := _rs; primary_reason := _primary; RETURN NEXT;
      CONTINUE;
    END IF;

    -- 6) Send: one notification row; email/push are drained by the existing dispatchers.
    BEGIN
      _msg := 'Complete the last steps to be Ready to Match on PITCALL: '
        || array_to_string(ARRAY(
             SELECT CASE r
               WHEN 'missing_role' THEN 'add your professional role'
               WHEN 'missing_phone' THEN 'add the phone number a Team needs to contact you after you accept a Pit Call'
               WHEN 'missing_availability' THEN 'add your availability so you can appear in matches'
               WHEN 'stale_availability' THEN 'review and confirm your future availability'
             END
             FROM jsonb_array_elements_text(_rs) AS r), '; ')
        || '.';

      INSERT INTO public.notifications (user_id, kind, payload, is_test)
      VALUES (
        _cid,
        'readiness_nudge',
        jsonb_build_object(
          'event', 'readiness_nudge',
          'reasons', _rs,
          'primary_reason', _primary,
          'message', _msg,
          'mode', _mode,
          'batch_id', _batch_id
        ),
        _is_test
      )
      RETURNING id INTO _nid;

      INSERT INTO public.admin_audit_log (admin_id, target_user_id, action, details)
      VALUES (_admin_id, _cid, 'readiness_nudge_sent',
        jsonb_build_object('is_test', _is_test, 'reasons', _rs, 'primary_reason', _primary, 'mode', _mode, 'batch_id', _batch_id, 'notification_id', _nid));

      _n_sent := _n_sent + 1;
      user_id := _cid; outcome := 'sent'; reasons := _rs; primary_reason := _primary; RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      _n_failed := _n_failed + 1;
      INSERT INTO public.admin_audit_log (admin_id, target_user_id, action, details)
      VALUES (_admin_id, _cid, 'readiness_nudge_failed',
        jsonb_build_object('is_test', _is_test, 'mode', _mode, 'batch_id', _batch_id, 'sqlstate', SQLSTATE, 'error', left(SQLERRM, 200)));
      user_id := _cid; outcome := 'failed'; reasons := _rs; primary_reason := _primary; RETURN NEXT;
    END;
  END LOOP;

  -- Batch summary (bulk sends only): who / when / env / filter / counts.
  IF NOT _dry_run AND _mode = 'bulk' THEN
    INSERT INTO public.admin_audit_log (admin_id, target_user_id, action, details)
    VALUES (_admin_id, NULL, 'readiness_nudge_bulk',
      jsonb_build_object('is_test', _is_test, 'batch_id', _batch_id, 'filter_reason', _filter_reason, 'filter_role', _filter_role,
        'candidates', COALESCE(cardinality(_candidate_ids), 0),
        'sent', _n_sent, 'skipped_ready', _n_ready, 'skipped_cooldown', _n_cool,
        'skipped_ineligible', _n_inel, 'skipped_filter', _n_filter, 'failed', _n_failed));
  END IF;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_readiness_nudge(uuid, boolean, uuid[], text, text, text, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_readiness_nudge(uuid, boolean, uuid[], text, text, text, boolean, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_readiness_nudge(uuid, boolean, uuid[], text, text, text, boolean, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_readiness_nudge(uuid, boolean, uuid[], text, text, text, boolean, uuid) TO service_role;
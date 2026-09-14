-- OPS-MON-02 hardening: the operational log must NEVER abort the business transaction that fires it.
-- Any failure inside ops_log_event (constraint, type, unexpected state) degrades to a WARNING + NULL.
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
     CASE WHEN _sev IN ('INFO','WARN','ERROR') THEN _sev ELSE 'INFO' END,
     p_event_type,
     CASE WHEN p_result IN ('SUCCESS','FAILED','WARN') THEN p_result ELSE 'SUCCESS' END,
     _actor,
     CASE WHEN _actor_type IN ('user','admin','system') THEN _actor_type ELSE 'system' END,
     p_entity_type, p_entity_id, p_secondary_entity_type, p_secondary_entity_id,
     left(p_reference_id, 200), left(p_error_code, 120), COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ops_log_event degraded (% / %): %', p_event_type, p_result, SQLERRM;
  RETURN NULL;
END;
$$;
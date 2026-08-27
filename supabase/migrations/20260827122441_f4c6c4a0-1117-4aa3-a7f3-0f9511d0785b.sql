DO $mig$
DECLARE _def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _def FROM pg_proc WHERE proname = 'recompute_matches';
  IF position('e.match_id = m.id' in _def) > 0 THEN
    RAISE NOTICE 'already patched';
    RETURN;
  END IF;
  _def := replace(
    _def,
    'AND NOT EXISTS (SELECT 1 FROM final f WHERE f.freelancer_id = m.freelancer_id AND f.request_id = m.request_id)',
    'AND NOT EXISTS (SELECT 1 FROM final f WHERE f.freelancer_id = m.freelancer_id AND f.request_id = m.request_id)'
    || ' AND NOT EXISTS (SELECT 1 FROM public.engagements e WHERE e.match_id = m.id AND e.status IN (''proposed'',''confirmed'',''completed''))'
  );
  EXECUTE _def;
END
$mig$;
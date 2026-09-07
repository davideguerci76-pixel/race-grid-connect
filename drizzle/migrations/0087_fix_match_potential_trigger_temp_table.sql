CREATE OR REPLACE FUNCTION public.tg_refresh_match_potential()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _src text;
BEGIN
  _src := CASE TG_OP
    WHEN 'INSERT' THEN 'SELECT DISTINCT request_id FROM new_rows'
    WHEN 'DELETE' THEN 'SELECT DISTINCT request_id FROM old_rows'
    ELSE 'SELECT request_id FROM new_rows UNION SELECT request_id FROM old_rows'
  END;

  EXECUTE format($q$
    WITH ids AS (%s)
    UPDATE public.requests r
       SET match_potential_current = public.classify_match_potential(
             (SELECT COUNT(*)::int FROM public.matches m
               WHERE m.request_id = r.id AND m.stale = false))
      FROM ids i
     WHERE r.id = i.request_id
       AND r.match_potential_current IS DISTINCT FROM public.classify_match_potential(
             (SELECT COUNT(*)::int FROM public.matches m
               WHERE m.request_id = r.id AND m.stale = false))
  $q$, _src);

  RETURN NULL;
END;
$$;
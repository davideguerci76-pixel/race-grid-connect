-- legal_acceptances e client_error_log sono append-only per legge di prodotto:
-- le loro righe TEST spariscono con la cancellazione a cascata dell'account.
CREATE OR REPLACE FUNCTION public.purge_test_environment()
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _live_before jsonb;
  _live_after jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT jsonb_build_object(
    'profiles',    (SELECT count(*) FROM public.profiles          WHERE is_test = false),
    'requests',    (SELECT count(*) FROM public.requests          WHERE is_test = false),
    'matches',     (SELECT count(*) FROM public.matches           WHERE is_test = false),
    'engagements', (SELECT count(*) FROM public.engagements       WHERE is_test = false),
    'availability',(SELECT count(*) FROM public.availability      WHERE is_test = false),
    'ratings',     (SELECT count(*) FROM public.ratings           WHERE is_test = false),
    'notifications',(SELECT count(*) FROM public.notifications    WHERE is_test = false),
    'tokens',      (SELECT count(*) FROM public.token_transactions WHERE is_test = false),
    'pool',        (SELECT count(*) FROM public.team_pool         WHERE is_test = false),
    'sos',         (SELECT count(*) FROM public.sos_calls         WHERE is_test = false),
    'calendars',   (SELECT count(*) FROM public.user_calendars    WHERE is_test = false),
    'match_history',(SELECT count(*) FROM public.match_history    WHERE is_test = false),
    'token_orders',(SELECT count(*) FROM public.token_orders      WHERE is_test = false)
  ) INTO _live_before;

  DELETE FROM public.rating_flags rf USING public.ratings r WHERE rf.rating_id = r.id AND r.is_test;
  DELETE FROM public.ratings WHERE is_test;
  DELETE FROM public.sos_call_targets t USING public.sos_calls s WHERE t.sos_id = s.id AND s.is_test;
  DELETE FROM public.sos_calls WHERE is_test;
  DELETE FROM public.match_unlocks mu USING public.profiles p WHERE mu.team_id = p.id AND p.is_test;
  DELETE FROM public.pool_search_unlocks pu USING public.profiles p WHERE pu.team_id = p.id AND p.is_test;
  DELETE FROM public.request_tier_unlocks ru USING public.profiles p WHERE ru.team_id = p.id AND p.is_test;
  DELETE FROM public.request_team_reveals rr USING public.profiles p WHERE rr.user_id = p.id AND p.is_test;
  DELETE FROM public.team_reveals tr USING public.profiles p WHERE (tr.user_id = p.id OR tr.team_id = p.id) AND p.is_test;
  DELETE FROM public.review_unlocks vu USING public.profiles p WHERE (vu.user_id = p.id OR vu.target_user_id = p.id) AND p.is_test;
  DELETE FROM public.team_pool WHERE is_test;
  DELETE FROM public.engagements WHERE is_test;
  DELETE FROM public.match_history WHERE is_test;
  DELETE FROM public.matches WHERE is_test;
  DELETE FROM public.requests WHERE is_test;
  DELETE FROM public.availability WHERE is_test;
  DELETE FROM public.user_calendars WHERE is_test;
  DELETE FROM public.push_deliveries WHERE is_test;
  DELETE FROM public.push_subscriptions WHERE is_test;
  DELETE FROM public.notifications WHERE is_test;
  DELETE FROM public.token_order_events e USING public.token_orders o WHERE e.order_id = o.id AND o.is_test;
  DELETE FROM public.token_orders WHERE is_test;
  DELETE FROM public.billing_details bd USING public.profiles p WHERE bd.user_id = p.id AND p.is_test;
  DELETE FROM public.token_transactions WHERE is_test;
  DELETE FROM public.calendar_day_notes WHERE is_test;
  DELETE FROM public.availability_opportunity_state WHERE is_test;
  DELETE FROM public.hot_partial_state WHERE is_test;
  DELETE FROM public.team_match_notification_state WHERE is_test;
  DELETE FROM public.availability_recompute_queue WHERE is_test;
  DELETE FROM public.freelancer_contacts fc USING public.profiles p WHERE fc.user_id = p.id AND p.is_test;
  DELETE FROM public.freelancer_profiles WHERE is_test;
  DELETE FROM public.team_profiles WHERE is_test;
  DELETE FROM public.admin_audit_log al USING public.profiles p WHERE al.target_user_id = p.id AND p.is_test;

  SELECT jsonb_build_object(
    'profiles',    (SELECT count(*) FROM public.profiles          WHERE is_test = false),
    'requests',    (SELECT count(*) FROM public.requests          WHERE is_test = false),
    'matches',     (SELECT count(*) FROM public.matches           WHERE is_test = false),
    'engagements', (SELECT count(*) FROM public.engagements       WHERE is_test = false),
    'availability',(SELECT count(*) FROM public.availability      WHERE is_test = false),
    'ratings',     (SELECT count(*) FROM public.ratings           WHERE is_test = false),
    'notifications',(SELECT count(*) FROM public.notifications    WHERE is_test = false),
    'tokens',      (SELECT count(*) FROM public.token_transactions WHERE is_test = false),
    'pool',        (SELECT count(*) FROM public.team_pool         WHERE is_test = false),
    'sos',         (SELECT count(*) FROM public.sos_calls         WHERE is_test = false),
    'calendars',   (SELECT count(*) FROM public.user_calendars    WHERE is_test = false),
    'match_history',(SELECT count(*) FROM public.match_history    WHERE is_test = false),
    'token_orders',(SELECT count(*) FROM public.token_orders      WHERE is_test = false)
  ) INTO _live_after;

  IF _live_before IS DISTINCT FROM _live_after THEN
    RAISE EXCEPTION 'PURGE ABORTED: LIVE data changed. before=% after=%', _live_before, _live_after;
  END IF;

  RETURN QUERY SELECT p.id FROM public.profiles p WHERE p.is_test;
END;
$$;
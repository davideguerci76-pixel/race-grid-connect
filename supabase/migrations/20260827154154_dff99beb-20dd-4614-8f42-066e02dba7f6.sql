REVOKE ALL ON FUNCTION public.emit_potential_match_notifications(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.emit_pitcall_outcome_notifications(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.freelancer_match_actionable(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_potential_match_notifications(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.emit_pitcall_outcome_notifications(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.freelancer_match_actionable(uuid, uuid) TO service_role;
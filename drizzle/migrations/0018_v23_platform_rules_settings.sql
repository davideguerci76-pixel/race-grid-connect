INSERT INTO public.platform_settings (key, value_num, category, label, description, unit, sort_order)
VALUES
  ('strong_match_threshold', 5, 'match_potential', 'Strong match threshold', 'Number of Full + Partial matches required for a Pit Call to reach STRONG Match Potential.', 'matches', 900),
  ('max_modify_per_pitcall', 3, 'request_modify', 'Maximum modifies per Pit Call', 'Maximum number of modifications allowed on a single Pit Call.', 'edits', 910),
  ('daily_recheck_budget', 7, 'request_modify', 'Team rolling 24h recheck budget', 'Maximum shared recheck units available to a Team within a rolling 24-hour window.', 'units', 911),
  ('red_cancel_budget_cost', 2, 'request_modify', 'RED cancel budget cost', 'Recheck-budget units consumed by an eligible RED cancellation.', 'units', 912),
  ('post_review_window_minutes', 5, 'request_modify', 'Post review window', 'Time available to review Match Potential immediately after posting.', 'minutes', 913),
  ('team_match_update_notification_hours', 12, 'notifications', 'Team match update aggregation interval', 'Aggregation interval for non-milestone Team match updates.', 'hours', 920),
  ('availability_recompute_delay_minutes', 5, 'calendar', 'Availability recompute delay', 'Delay after the last calendar edit before deferred matching recomputation.', 'minutes', 930)
ON CONFLICT (key) DO NOTHING;
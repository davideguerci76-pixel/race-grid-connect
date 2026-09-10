-- ACC-DEL-01.A follow-up: the retention safety gate applies to LIVE accounts only.
-- TEST/DEMO accounts remain fully purgeable (Reset & Seed / purge_test_environment),
-- and no LIVE append-only exception is introduced.
CREATE OR REPLACE FUNCTION public.account_retention_records(_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN COALESCE((SELECT is_test FROM public.profiles WHERE id = _user_id), false)
      THEN jsonb_build_object('token_orders', 0, 'token_transactions', 0, 'legal_acceptances', 0)
    ELSE jsonb_build_object(
      'token_orders',       (SELECT count(*) FROM public.token_orders       WHERE team_id = _user_id OR created_by = _user_id),
      'token_transactions', (SELECT count(*) FROM public.token_transactions WHERE user_id = _user_id),
      'legal_acceptances',  (SELECT count(*) FROM public.legal_acceptances  WHERE user_id = _user_id)
    )
  END
$$;
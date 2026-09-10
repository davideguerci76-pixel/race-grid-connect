-- Gli ordini token restano immutabili e non cancellabili in LIVE.
-- Solo le righe TEST possono essere rimosse, per consentire il purge dell'ambiente di test.
CREATE OR REPLACE FUNCTION public.tg_token_orders_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(OLD.is_test, false) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'token orders cannot be deleted';
END;
$$;
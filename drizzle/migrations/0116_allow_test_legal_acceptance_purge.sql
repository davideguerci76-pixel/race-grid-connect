-- Le accettazioni legali restano immutabili per gli account reali.
-- Le righe degli account di prova devono poter essere eliminate insieme all'account.
CREATE OR REPLACE FUNCTION public.tg_legal_acceptances_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND COALESCE(OLD.is_test, false) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'legal_acceptances is append-only';
END;
$$;
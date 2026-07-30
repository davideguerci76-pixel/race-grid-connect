-- Explicit deny for inserts/deletes on matching_weights (singleton config row)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='matching_weights' AND policyname='matching_weights_deny_insert') THEN
    CREATE POLICY "matching_weights_deny_insert" ON public.matching_weights AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='matching_weights' AND policyname='matching_weights_deny_delete') THEN
    CREATE POLICY "matching_weights_deny_delete" ON public.matching_weights AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);
  END IF;
END $$;

REVOKE INSERT, DELETE ON public.matching_weights FROM authenticated, anon;
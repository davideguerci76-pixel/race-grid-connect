DROP POLICY IF EXISTS "ratings_read_parties_only" ON public.ratings;
CREATE POLICY "ratings_read_parties_only" ON public.ratings
FOR SELECT TO authenticated
USING (
  from_user_id = auth.uid()
  OR (to_user_id = auth.uid() AND unlocked_at IS NOT NULL)
);
DROP POLICY IF EXISTS "ratings_read_visible" ON public.ratings;
DROP POLICY IF EXISTS "Ratings visible to parties" ON public.ratings;

CREATE POLICY "ratings_read_visible"
ON public.ratings
FOR SELECT
TO authenticated
USING (
  unlocked_at IS NOT NULL
  OR from_user_id = auth.uid()
  OR to_user_id = auth.uid()
);
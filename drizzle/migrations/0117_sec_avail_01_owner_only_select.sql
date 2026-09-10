DROP POLICY "Availability read scoped" ON public.availability;

CREATE POLICY "Availability read scoped" ON public.availability
FOR SELECT TO authenticated
USING (
  is_test = env_is_test()
  AND NOT user_is_blocked(auth.uid())
  AND auth.uid() = freelancer_id
);
DROP POLICY "Approved calendars are readable by signed-in users" ON public.user_calendars;

CREATE POLICY "Calendars read scoped" ON public.user_calendars
FOR SELECT TO authenticated
USING (
  review_status = 'approved'
  AND (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.engagements e
      WHERE e.freelancer_id = user_calendars.owner_id
        AND e.team_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.freelancer_id = user_calendars.owner_id
        AND m.team_id = auth.uid()
        AND m.revealed_by_team = true
    )
  )
);
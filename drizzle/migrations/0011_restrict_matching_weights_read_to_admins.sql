DROP POLICY IF EXISTS weights_read ON public.matching_weights;

CREATE POLICY weights_admin_read ON public.matching_weights
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
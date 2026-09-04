-- Project-level default privileges grant everything on new public tables;
-- token orders must be read-only for teams and invisible to anon.
REVOKE ALL ON public.token_orders FROM anon;
REVOKE ALL ON public.token_orders FROM authenticated;
GRANT SELECT ON public.token_orders TO authenticated;

REVOKE ALL ON public.token_order_events FROM anon;
REVOKE ALL ON public.token_order_events FROM authenticated;

GRANT ALL ON public.token_orders TO service_role;
GRANT ALL ON public.token_order_events TO service_role;
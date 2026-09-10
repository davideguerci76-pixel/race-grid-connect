-- Il purge di dataset TEST grandi supera il timeout di default: gli diamo una finestra dedicata.
ALTER FUNCTION public.purge_test_environment() SET statement_timeout TO '300s';
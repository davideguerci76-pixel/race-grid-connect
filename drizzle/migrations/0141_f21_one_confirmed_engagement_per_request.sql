-- F-21: defence-in-depth DB invariant.
-- At most one engagement in status 'confirmed' per request.
-- Deliberately scoped to 'confirmed' only: multiple 'completed' engagements
-- per request are legitimate (partial coverage, SOS replacement history).
CREATE UNIQUE INDEX IF NOT EXISTS engagements_one_confirmed_per_request
  ON public.engagements (request_id)
  WHERE status = 'confirmed' AND request_id IS NOT NULL;
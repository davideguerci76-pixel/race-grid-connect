-- STEP 11.2 — Team anonymity remediation.
-- Before: any authenticated user could read team_profiles identity columns
-- (team_name, bio, website, location) for every team in their environment, and
-- requests.team_id is Data-API readable => a freelancer could de-anonymise the
-- owner of any active Pit Call.
-- After: readable only by the owner or by a viewer that already earned
-- disclosure (paid team reveal, per-request reveal, confirmed/completed
-- engagement, or pool membership). Server code keeps using the service role for
-- its own already-gated projections.

create or replace function public.can_view_team_identity(_team uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    auth.uid() = _team
    or exists (
      select 1 from public.team_reveals tr
      where tr.team_id = _team and tr.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.request_team_reveals rtr
      join public.requests r on r.id = rtr.request_id
      where r.team_id = _team and rtr.user_id = auth.uid()
    )
    or exists (
      select 1 from public.engagements e
      where e.team_id = _team
        and e.freelancer_id = auth.uid()
        and e.status in ('confirmed', 'completed')
    )
    or exists (
      select 1 from public.team_pool tp
      where tp.team_id = _team and tp.freelancer_id = auth.uid()
    )
$$;

revoke all on function public.can_view_team_identity(uuid) from public, anon;
grant execute on function public.can_view_team_identity(uuid) to authenticated;

drop policy if exists "Team profiles viewable by authenticated" on public.team_profiles;

create policy "Team profiles viewable when authorised"
on public.team_profiles
for select
to authenticated
using (is_test = public.env_is_test() and public.can_view_team_identity(user_id));

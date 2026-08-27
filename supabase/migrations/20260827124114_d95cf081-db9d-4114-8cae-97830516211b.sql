revoke select on public.team_profiles from authenticated;

grant select (
  user_id, team_name, initials, team_type, location, primary_discipline,
  founded_year, size, bio, website, updated_at,
  location_lat, location_lng, location_city, location_region,
  location_country, location_place_id, is_test
) on public.team_profiles to authenticated;

create or replace function public.my_team_vat()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select vat_number from public.team_profiles where user_id = auth.uid()
$$;

revoke all on function public.my_team_vat() from public, anon;
grant execute on function public.my_team_vat() to authenticated;
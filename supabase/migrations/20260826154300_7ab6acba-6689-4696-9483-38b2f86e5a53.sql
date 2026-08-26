-- Matching engine: silently skip cross-environment pairs instead of erroring
CREATE OR REPLACE FUNCTION public.tg_env_pair_skip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _f boolean; _t boolean;
BEGIN
  SELECT is_test INTO _f FROM public.profiles WHERE id = NEW.freelancer_id;
  SELECT is_test INTO _t FROM public.profiles WHERE id = NEW.team_id;
  IF COALESCE(_f,false) <> COALESCE(_t,false) THEN
    RETURN NULL; -- never create a LIVE<->TEST match
  END IF;
  NEW.is_test := COALESCE(_f,false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_env_guard_matches ON public.matches;
CREATE TRIGGER trg_env_guard_matches BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.tg_env_pair_skip();
DROP TRIGGER IF EXISTS trg_env_guard_match_history ON public.match_history;
CREATE TRIGGER trg_env_guard_match_history BEFORE INSERT OR UPDATE ON public.match_history
  FOR EACH ROW EXECUTE FUNCTION public.tg_env_pair_skip();

-- Public market statistics ignore TEST data entirely
CREATE OR REPLACE FUNCTION public.market_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with base as (
  select
    (select count(*) from public.match_history where not is_test) as total_matches,
    (select count(*) from public.engagements where status in ('confirmed','completed') and not is_test) as confirmed_engagements,
    (select count(*) from public.engagements where status = 'completed' and not is_test) as completed_engagements,
    (select count(*) from public.requests where is_active and status = 'active' and not is_test) as active_requests,
    (select count(*) from public.freelancer_profiles where not is_test) as freelancers,
    (select count(*) from public.team_profiles where not is_test) as teams,
    (select count(distinct freelancer_id) from public.availability where day >= current_date and not is_test) as available_freelancers,
    (select round(avg(day_rate)) from public.freelancer_profiles where day_rate is not null and day_rate > 0 and not is_test) as avg_day_rate,
    (select count(*) from public.sos_calls where resolved_at is null and not is_test) as open_sos
),
days as (
  select d::date as day from generate_series(current_date, current_date + interval '89 days', interval '1 day') d
),
demand as (
  select dd.day, count(*)::int as demand
  from days dd
  join public.requests r
    on r.is_active and r.status = 'active' and not r.is_test
   and dd.day between r.start_date and r.end_date
  group by dd.day
),
supply as (
  select a.day, count(distinct a.freelancer_id)::int as supply
  from public.availability a
  where a.day >= current_date and a.day < current_date + interval '90 days' and not a.is_test
  group by a.day
),
joined as (
  select dd.day,
         coalesce(de.demand,0) as demand,
         coalesce(su.supply,0) as supply,
         coalesce(de.demand,0) - coalesce(su.supply,0) as gap
  from days dd
  left join demand de on de.day = dd.day
  left join supply su on su.day = dd.day
),
trend as (
  select to_char(m.mon,'YYYY-MM') as month,
         (select count(*) from public.requests r where date_trunc('month', r.created_at) = m.mon and not r.is_test)::int as requests,
         (select count(*) from public.match_history mm where date_trunc('month', mm.first_matched_at) = m.mon and not mm.is_test)::int as matches,
         (select count(*) from public.engagements e where date_trunc('month', e.created_at) = m.mon and e.status in ('confirmed','completed') and not e.is_test)::int as engagements
  from (select generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') as mon) m
),
disciplines as (
  select r.discipline::text as discipline, count(*)::int as requests
  from public.requests r
  where r.created_at > now() - interval '180 days' and not r.is_test
  group by 1 order by 2 desc limit 8
),
roles as (
  select coalesce(r.role_group, 'other') as role_group, count(*)::int as requests
  from public.requests r
  where r.created_at > now() - interval '180 days' and not r.is_test
  group by 1 order by 2 desc limit 8
),
countries as (
  select c.country,
         sum(c.demand)::int as demand,
         sum(c.supply)::int as supply,
         sum(c.teams)::int as teams,
         (sum(c.demand) - sum(c.supply))::int as gap,
         avg(c.lat) as lat,
         avg(c.lng) as lng
  from (
    select coalesce(r.location_country,'—') as country, 1 as demand, 0 as supply, 0 as teams, r.location_lat as lat, r.location_lng as lng
    from public.requests r
    where r.is_active and r.status = 'active' and r.location_country is not null and not r.is_test
    union all
    select coalesce(fp.location_country,'—'), 0, 1, 0, fp.location_lat, fp.location_lng
    from public.freelancer_profiles fp
    where fp.location_country is not null and not fp.is_test
      and exists (select 1 from public.availability a where a.freelancer_id = fp.user_id and a.day >= current_date)
    union all
    select coalesce(tp.location_country,'—'), 0, 0, 1, tp.location_lat, tp.location_lng
    from public.team_profiles tp
    where tp.location_country is not null and not tp.is_test
  ) c
  group by c.country
  order by (sum(c.demand) + sum(c.supply)) desc
  limit 40
)
select jsonb_build_object(
  'generated_at', now(),
  'totals', to_jsonb(b),
  'hot_days_demand', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from joined where gap > 0 order by gap desc, day asc limit 10) x), '[]'::jsonb),
  'hot_days_supply', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from joined where gap < 0 order by gap asc, day asc limit 10) x), '[]'::jsonb),
  'trend', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from trend order by month) x), '[]'::jsonb),
  'top_disciplines', coalesce((select jsonb_agg(to_jsonb(x)) from disciplines x), '[]'::jsonb),
  'top_role_groups', coalesce((select jsonb_agg(to_jsonb(x)) from roles x), '[]'::jsonb),
  'by_country', coalesce((select jsonb_agg(to_jsonb(x)) from countries x), '[]'::jsonb)
)
from base b
$function$;
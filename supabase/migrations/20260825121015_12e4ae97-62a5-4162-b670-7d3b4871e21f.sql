CREATE TABLE public.match_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  freelancer_id uuid NOT NULL,
  team_id uuid NOT NULL,
  request_id uuid NOT NULL,
  best_score numeric NOT NULL DEFAULT 0,
  first_matched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (freelancer_id, request_id)
);

GRANT SELECT ON public.match_history TO authenticated;
GRANT ALL ON public.match_history TO service_role;

ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own match history"
ON public.match_history FOR SELECT TO authenticated
USING (auth.uid() = freelancer_id OR auth.uid() = team_id);

CREATE INDEX idx_match_history_freelancer ON public.match_history(freelancer_id);
CREATE INDEX idx_match_history_team ON public.match_history(team_id);

CREATE OR REPLACE FUNCTION public.tg_log_match_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.match_history (freelancer_id, team_id, request_id, best_score, first_matched_at)
  VALUES (NEW.freelancer_id, NEW.team_id, NEW.request_id, COALESCE(NEW.final_score, NEW.score, 0), COALESCE(NEW.created_at, now()))
  ON CONFLICT (freelancer_id, request_id) DO UPDATE
    SET best_score = GREATEST(public.match_history.best_score, EXCLUDED.best_score);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_log_match_history() FROM PUBLIC, anon;

CREATE TRIGGER trg_log_match_history
AFTER INSERT ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.tg_log_match_history();

INSERT INTO public.match_history (freelancer_id, team_id, request_id, best_score, first_matched_at)
SELECT m.freelancer_id, m.team_id, m.request_id, COALESCE(m.final_score, m.score, 0), m.created_at
FROM public.matches m
ON CONFLICT (freelancer_id, request_id) DO NOTHING;

INSERT INTO public.match_history (freelancer_id, team_id, request_id, best_score, first_matched_at)
SELECT e.freelancer_id, e.team_id, e.request_id, 0, e.created_at
FROM public.engagements e
WHERE e.request_id IS NOT NULL
ON CONFLICT (freelancer_id, request_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.market_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
with base as (
  select
    (select count(*) from public.match_history) as total_matches,
    (select count(*) from public.engagements where status in ('confirmed','completed')) as confirmed_engagements,
    (select count(*) from public.engagements where status = 'completed') as completed_engagements,
    (select count(*) from public.requests where is_active and status = 'active') as active_requests,
    (select count(*) from public.freelancer_profiles) as freelancers,
    (select count(*) from public.team_profiles) as teams,
    (select count(distinct freelancer_id) from public.availability where day >= current_date) as available_freelancers,
    (select round(avg(day_rate)) from public.freelancer_profiles where day_rate is not null and day_rate > 0) as avg_day_rate,
    (select count(*) from public.sos_calls where resolved_at is null) as open_sos
),
days as (
  select d::date as day from generate_series(current_date, current_date + interval '89 days', interval '1 day') d
),
demand as (
  select dd.day, count(*)::int as demand
  from days dd
  join public.requests r
    on r.is_active and r.status = 'active'
   and dd.day between r.start_date and r.end_date
  group by dd.day
),
supply as (
  select a.day, count(distinct a.freelancer_id)::int as supply
  from public.availability a
  where a.day >= current_date and a.day < current_date + interval '90 days'
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
         (select count(*) from public.requests r where date_trunc('month', r.created_at) = m.mon)::int as requests,
         (select count(*) from public.match_history mm where date_trunc('month', mm.first_matched_at) = m.mon)::int as matches,
         (select count(*) from public.engagements e where date_trunc('month', e.created_at) = m.mon and e.status in ('confirmed','completed'))::int as engagements
  from (select generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') as mon) m
),
disciplines as (
  select r.discipline::text as discipline, count(*)::int as requests
  from public.requests r
  where r.created_at > now() - interval '180 days'
  group by 1 order by 2 desc limit 8
),
roles as (
  select coalesce(r.role_group, 'other') as role_group, count(*)::int as requests
  from public.requests r
  where r.created_at > now() - interval '180 days'
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
    where r.is_active and r.status = 'active' and r.location_country is not null
    union all
    select coalesce(fp.location_country,'—'), 0, 1, 0, fp.location_lat, fp.location_lng
    from public.freelancer_profiles fp
    where fp.location_country is not null
      and exists (select 1 from public.availability a where a.freelancer_id = fp.user_id and a.day >= current_date)
    union all
    select coalesce(tp.location_country,'—'), 0, 0, 1, tp.location_lat, tp.location_lng
    from public.team_profiles tp
    where tp.location_country is not null
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
$fn$;

REVOKE EXECUTE ON FUNCTION public.market_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.market_stats() TO anon, authenticated, service_role;
create or replace function public.market_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with base as (
  select
    (select count(*) from public.matches) as total_matches,
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
         (select count(*) from public.matches mm where date_trunc('month', mm.created_at) = m.mon)::int as matches,
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
)
select jsonb_build_object(
  'generated_at', now(),
  'totals', (select to_jsonb(base) from base),
  'hot_days_demand', (select coalesce(jsonb_agg(to_jsonb(x) order by x.gap desc), '[]'::jsonb) from (select * from joined where gap > 0 order by gap desc limit 10) x),
  'hot_days_supply', (select coalesce(jsonb_agg(to_jsonb(y) order by y.gap asc), '[]'::jsonb) from (select * from joined where supply > 0 and gap < 0 order by gap asc limit 10) y),
  'trend', (select coalesce(jsonb_agg(to_jsonb(t) order by t.month), '[]'::jsonb) from trend t),
  'top_disciplines', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from disciplines d),
  'top_role_groups', (select coalesce(jsonb_agg(to_jsonb(rr)), '[]'::jsonb) from roles rr)
);
$$;

revoke all on function public.market_stats() from public;
grant execute on function public.market_stats() to anon, authenticated, service_role;
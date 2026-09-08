import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Archive, CheckCircle2, ChevronRight, Flag, Users } from "lucide-react";
import { PitCallDates } from "@/components/championship-dates";
import { PoolBadge } from "@/components/pool-badge";
import { disciplineLabel, roleLabel } from "@/lib/paddock";
import { requestStatusLabel } from "@/lib/labels";
import { CardBody, CardHeader, CardShell, Fact, FactGrid } from "@/components/cards/primitives";

/**
 * TEAM-SIDE Pit Call history row (Family 9). Whole card links to the results page.
 * Match count is the server value (1 once a confirmed engagement exists — legacy rule preserved).
 */
export function TeamRequestHistoryCard({ request: r, engagement: eng }: { request: any; engagement?: any }) {
  const { t } = useTranslation();
  const active = r.status === "active" || r.status === "paused" || r.status === "pending_review";
  return (
    <Link to="/dashboard/requests/$id/matches" params={{ id: r.id }} className="group block">
      <CardShell tone={eng ? "confirmed" : "neutral"} className="transition-colors group-hover:border-racing-red">
        <CardHeader
          icon={eng ? <CheckCircle2 className="size-4" /> : active ? <Flag className="size-4" /> : <Archive className="size-4" />}
          tone={eng ? "success" : active ? "info" : "muted"}
          title={requestStatusLabel(r.status)}
          subtitle={`${roleLabel(r.role)} · ${disciplineLabel(r.discipline)}`}
          right={
            <div className="text-right">
              <div className="text-[28px] font-black italic leading-none tracking-tighter text-racing-red">{eng ? 1 : (r.matches_count ?? 0)}</div>
              <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">{t("sweep_engage.matches.matches_label")}</div>
            </div>
          }
        >
          {(r as any).search_mode === "pool" && <div className="mt-1"><PoolBadge /></div>}
        </CardHeader>
        <CardBody>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[17px] font-bold leading-tight">{r.title}</div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-racing-red" />
          </div>
          <FactGrid cols={2}>
            <Fact label={t("cards.dates")} value={<span className="font-mono text-[12px] font-medium"><PitCallDates request={r} /></span>} />
            {eng && (
              <Fact
                icon={<Users />}
                label={t("sweep_engage.matches.confirmed_match")}
                tone="success"
                value={eng.freelancer?.display_name ?? t("sweep_engage.matches.freelancer_fallback")}
              />
            )}
          </FactGrid>
        </CardBody>
      </CardShell>
    </Link>
  );
}

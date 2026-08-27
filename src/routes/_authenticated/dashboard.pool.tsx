import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, Mail, Phone, Unlock } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BackButton } from "@/components/back-button";
import { PoolBadge } from "@/components/pool-badge";
import { RatingIcons } from "@/components/rating-icons";
import { addPoolMemberByCode, getMyPool, getPoolMatches, unlockPoolSearch } from "@/lib/pool.functions";
import { getMyRequests } from "@/lib/paddock.functions";
import { levelLabel, parseSubRoles, roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/dashboard/pool")({
  head: () => ({
    meta: [
      { title: "My Pool — Trusted freelancers | PitCall" },
      { name: "description", content: "Manage your trusted motorsport freelancers pool and run reduced-cost pit call searches inside it." },
      { property: "og:title", content: "My Pool — Trusted freelancers | PitCall" },
      { property: "og:description", content: "Manage your trusted motorsport freelancers pool and run reduced-cost pit call searches inside it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PoolPage,
});

function PoolPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listPool = useServerFn(getMyPool);
  const addByCode = useServerFn(addPoolMemberByCode);
  const listRequests = useServerFn(getMyRequests);

  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState<string>("");

  const { data: pool = [], isLoading } = useQuery({ queryKey: ["my-pool"], queryFn: () => listPool() });
  const { data: requests = [] } = useQuery({ queryKey: ["my-requests"], queryFn: () => listRequests() });

  const addMut = useMutation({
    mutationFn: () => addByCode({ data: { code: code.trim() } }),
    onSuccess: () => {
      toast.success(t("pool.added"));
      setCode("");
      qc.invalidateQueries({ queryKey: ["my-pool"] });
      qc.invalidateQueries({ queryKey: ["ratable-engagements"] });
    },
    onError: (e) => toastError(e, "pool.add_failed"),
  });

  const openRequests = useMemo(
    () => (requests as any[]).filter((r) => r.status === "active" || r.status === "paused"),
    [requests],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-10">
        <div className="label-mono">[MY POOL]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("pool.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("pool.sub")}</p>

        {/* Add by code */}
        <div className="mt-8 border border-border bg-card p-5">
          <div className="label-mono">[{t("pool.add_by_code")}]</div>
          <p className="mt-1 text-xs text-muted-foreground">{t("pool.add_by_code_hint")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="PIT-XXXXXX"
              className="w-56 border border-border bg-background px-3 py-2 font-mono text-sm uppercase"
            />
            <button
              onClick={() => addMut.mutate()}
              disabled={addMut.isPending || code.trim().length < 3}
              className="bg-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-50"
            >
              {t("pool.add_button")}
            </button>
          </div>
        </div>

        {/* Pool list */}
        <section className="mt-10">
          <div className="mb-3 flex items-end justify-between border-b border-border pb-2">
            <div className="label-mono">[{t("pool.members")}]</div>
            <div className="font-mono text-[11px] uppercase text-muted-foreground">
              {t("pool.count", { count: (pool as any[]).length })}
            </div>
          </div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">{t("sweep_engage.common.loading")}</div>
          ) : (pool as any[]).length === 0 ? (
            <div className="border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              {t("pool.empty")}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {(pool as any[]).map((m) => {
                const phoneLabel = [m.phone_dial_code, m.phone_number].filter(Boolean).join(" ").trim();
                const telHref = [m.phone_dial_code, m.phone_number].filter(Boolean).join("").replace(/\s+/g, "");
                return (
                  <div key={m.id} className="border border-sky-400/40 bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-lg font-black italic tracking-tighter">{m.name}</div>
                        {m.headline && <div className="text-xs text-muted-foreground">{m.headline}</div>}
                        <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                          {m.role_group && roleGroupLabel(m.role_group)}
                          {m.location && <> · 📍 {m.location}</>}
                        </div>
                        <div className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
                          {m.source === "code" ? t("pool.source_code") : t("pool.source_engagement")}
                          {m.pit_code && <> · {m.pit_code}</>}
                        </div>
                        <div className="mt-3 grid gap-1 border border-sky-400/30 bg-sky-400/5 p-2 font-mono text-[11px]">
                          {m.contact_email ? (
                            <a href={`mailto:${m.contact_email}`} className="flex min-w-0 items-center gap-2 text-racing-red hover:underline">
                              <Mail className="size-3 shrink-0" /> <span className="truncate">{m.contact_email}</span>
                            </a>
                          ) : (
                            <div className="text-muted-foreground">{t("pool.no_email")}</div>
                          )}
                          {m.phone_number ? (
                            <a href={`tel:${telHref}`} className="flex items-center gap-2 text-racing-red hover:underline">
                              <Phone className="size-3 shrink-0" /> {phoneLabel || m.phone_number}
                            </a>
                          ) : (
                            <div className="text-muted-foreground">{t("pool.no_phone")}</div>
                          )}
                        </div>
                      </div>
                      <PoolBadge />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Pool search */}
        <section className="mt-12">
          <div className="mb-3 border-b border-border pb-2">
            <div className="label-mono">[{t("pool.search_title")}]</div>
            <p className="mt-1 text-xs text-muted-foreground">{t("pool.search_hint")}</p>
          </div>
          <select
            value={requestId}
            onChange={(e) => setRequestId(e.target.value)}
            className="w-full max-w-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("pool.select_pitcall")}</option>
            {openRequests.map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.title} · {r.start_date} → {r.end_date}
              </option>
            ))}
          </select>

          {requestId && <PoolSearchResults requestId={requestId} />}
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}

function PoolSearchResults({ requestId }: { requestId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fetchMatches = useServerFn(getPoolMatches);
  const unlockFn = useServerFn(unlockPoolSearch);

  const { data, isLoading } = useQuery({
    queryKey: ["pool-matches", requestId],
    queryFn: () => fetchMatches({ data: { request_id: requestId } }),
  });

  const unlockMut = useMutation({
    mutationFn: () => unlockFn({ data: { request_id: requestId } }),
    onSuccess: (r) => {
      toast.success(t("pool.unlocked", { cost: r.tokens_spent, balance: r.balance }));
      qc.invalidateQueries({ queryKey: ["pool-matches", requestId] });
      qc.invalidateQueries({ queryKey: ["token-balance"] });
    },
    onError: (e) => toastError(e, "pool.unlock_failed"),
  });

  if (isLoading || !data) return <div className="mt-4 text-sm text-muted-foreground">{t("sweep_engage.common.loading")}</div>;

  if (!data.unlocked) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-2 border-sky-400/60 bg-sky-400/5 p-5">
        <div>
          <div className="label-mono text-sky-300">[{t("pool.locked_title")}]</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("pool.locked_desc", { count: data.pool_size, cost: data.cost })}
          </p>
        </div>
        <button
          onClick={() => unlockMut.mutate()}
          disabled={unlockMut.isPending}
          className="bg-racing-red px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
        >
          <Unlock className="mr-1 inline size-3" /> {t("pool.unlock_button", { cost: data.cost })}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <PoolColumn title={t("pool.column_full")} items={data.items_full} />
      <PoolColumn title={t("pool.column_partial")} items={data.items_partial} partial />
    </div>
  );
}

function PoolColumn({ title, items, partial = false }: { title: string; items: any[]; partial?: boolean }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className={`label-mono mb-3 border-b pb-2 ${partial ? "border-racing-yellow/40 text-racing-yellow" : "border-racing-red/40 text-racing-red"}`}>
        [{title}] · {items.length}
      </div>
      {items.length === 0 ? (
        <div className="border border-dashed border-border bg-card p-8 text-center text-xs text-muted-foreground">
          {t("pool.no_results")}
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((m) => (
            <div key={m.match_id} className={`border p-4 ${partial ? "border-racing-yellow/50 bg-racing-yellow/5" : "border-border bg-card"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-2xl font-black italic tracking-tighter ${partial ? "text-racing-yellow" : "text-racing-red"}`}>
                    {Math.round(m.skills_score)}%
                  </div>
                  <div className="text-lg font-bold">{m.name}</div>
                  {m.profile?.headline && <div className="text-xs text-muted-foreground">{m.profile.headline}</div>}
                  <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                    {m.profile?.role_group && roleGroupLabel(m.profile.role_group)}
                    {parseSubRoles(m.profile?.sub_roles ?? []).length
                      ? ` · ${parseSubRoles(m.profile?.sub_roles ?? []).map((sr: any) => `${subRoleLabel(sr.sub_role)} (${levelLabel(sr.level)})`).join(", ")}`
                      : ""}
                  </div>
                  {m.profile?.location && (
                    <div className="font-mono text-[11px] uppercase text-muted-foreground">📍 {m.profile.location}</div>
                  )}
                  {partial && (
                    <div className="mt-2 space-y-2">
                      <div className="inline-flex items-center gap-2 border border-racing-yellow/60 bg-racing-yellow/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-racing-yellow">
                        <Clock className="size-3" /> {t("pool.missing_days", { count: m.missing_days })}
                      </div>
                      {Array.isArray(m.missing_dates) && m.missing_dates.length > 0 && (
                        <div className="border border-racing-yellow/50 bg-background/60 p-2 font-mono text-[10px] uppercase tracking-widest text-racing-yellow">
                          <div className="mb-1">{t(m.missing_dates.length === 1 ? "pool.missing_dates_one" : "pool.missing_dates_many")}</div>
                          <div className="flex flex-wrap gap-1">
                            {m.missing_dates.map((day: string) => (
                              <time key={day} dateTime={day} className="border border-racing-yellow/40 bg-racing-yellow/10 px-2 py-0.5">
                                {day}
                              </time>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {m.rating?.count > 0 && (
                    <div className="mt-2">
                      <RatingIcons variant="wrench" value={m.rating.average} count={m.rating.count} size={14} />
                    </div>
                  )}
                </div>
                <PoolBadge />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

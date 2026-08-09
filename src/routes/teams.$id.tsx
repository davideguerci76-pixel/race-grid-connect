import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { initialsFor, disciplineLabel, skillLabel } from "@/lib/paddock";
import { roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { AnonymousReviewsSection, ProfileRatingBadge } from "@/components/anonymous-reviews";
import { Lock } from "lucide-react";
import { BackButton } from "@/components/back-button";

type Search = { req?: string };

export const Route = createFileRoute("/teams/$id")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    req: typeof s.req === "string" ? s.req : undefined,
  }),
  component: TeamProfile,
  notFoundComponent: NotFoundComponent,
});

function NotFoundComponent() {
  const { t } = useTranslation();
  return <div className="flex min-h-screen items-center justify-center">{t("sweep_public.team_detail.not_found")}</div>;
}

function TeamProfile() {
  const { id } = Route.useParams();
  const { req: revealedReqId } = Route.useSearch();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const [confirmFull, setConfirmFull] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["team-detail", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: tp }, { data: requests }, { data: fullReveal }, { data: reqReveals }, { data: cancelStats }] = await Promise.all([
        supabase.from("team_profiles").select("*").eq("user_id", id).maybeSingle(),
        supabase.from("requests").select("*").eq("team_id", id).eq("is_active", true).order("start_date"),
        supabase.from("team_reveals").select("team_id").eq("user_id", user!.id).eq("team_id", id).maybeSingle(),
        supabase.from("request_team_reveals").select("request_id").eq("user_id", user!.id),
        supabase.rpc("team_cancellation_stats", { _team_id: id }),
      ]);
      const stats = Array.isArray(cancelStats) ? (cancelStats[0] as any) : (cancelStats as any);
      return {
        tp,
        requests: requests ?? [],
        fullUnlocked: !!fullReveal,
        revealedRequestIds: new Set((reqReveals ?? []).map((r) => r.request_id)),
        cancelStats: stats ?? { count: 0, avg_days_notice: null },
      };
    },
  });

  const unlockFull = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reveal_team", { _team_id: id });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      setConfirmFull(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ["team-detail", id] });
      qc.invalidateQueries({ queryKey: ["dashboard-profile"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (authLoading) return <div className="flex min-h-screen items-center justify-center">{t("common.loading")}</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
        <div className="container-page py-16 text-center">
          <div className="label-mono">[LOCKED]</div>
          <h1 className="mt-2 text-3xl font-black uppercase italic tracking-tighter">{t("sweep_public.team_detail.sign_in_title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("sweep_public.team_detail.sign_in_desc")}</p>
          <Link to="/auth" className="mt-6 inline-block bg-racing-red px-6 py-3 text-xs font-bold uppercase tracking-widest text-white">{t("sweep_public.team_detail.sign_in_button")}</Link>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (isLoading || !data) return <div className="flex min-h-screen items-center justify-center">{t("common.loading")}</div>;
  if (!data.tp) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="container-page py-16 text-center">
          <div className="label-mono">[NOT FOUND]</div>
          <h1 className="mt-2 text-3xl font-black uppercase italic tracking-tighter">{t("sweep_public.team_detail.not_found")}</h1>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const { tp, requests, fullUnlocked, revealedRequestIds } = data;
  const isOwner = user.id === id;
  const canSeeFull = isOwner || fullUnlocked;
  const contextRequest = revealedReqId ? requests.find((r) => r.id === revealedReqId) : null;
  const hasRequestReveal = revealedReqId ? revealedRequestIds.has(revealedReqId) : false;
  const canSeeAnything = canSeeFull || hasRequestReveal || (revealedReqId && contextRequest);

  if (!canSeeAnything) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="container-page py-16">
          <div className="text-center">
            <div className="label-mono">[LOCKED]</div>
            <h1 className="mt-2 text-3xl font-black uppercase italic tracking-tighter">{t("sweep_public.team_detail.team_hidden_title")}</h1>
            <div className="mt-3 flex justify-center"><ProfileRatingBadge userId={id} variant="headset" isOwner={isOwner} /></div>
            <p className="mt-2 text-sm text-muted-foreground">{t("sweep_public.team_detail.team_hidden_desc")}</p>
            <button onClick={() => setConfirmFull(true)} className="mt-6 inline-block bg-racing-red px-6 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110">
              {t("sweep_public.team_detail.unlock_full_button")}
            </button>
          </div>
          <div className="mx-auto mt-10 max-w-2xl">
            <AnonymousReviewsSection targetUserId={id} variant="headset" isOwner={isOwner} />
          </div>
        </div>
        {confirmFull && <ConfirmModal onCancel={() => setConfirmFull(false)} onConfirm={() => unlockFull.mutate()} pending={unlockFull.isPending} error={error} />}
        <SiteFooter />
      </div>
    );
  }

  const visibleRequests = canSeeFull ? requests : (contextRequest ? [contextRequest] : []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="border border-border bg-card p-8">
          <div className="flex gap-4">
            <div className="flex size-20 items-center justify-center bg-racing-yellow font-mono text-xl font-black text-carbon">
              {tp.initials ?? initialsFor(tp.team_name)}
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">{tp.team_name}</h1>
              <div className="mt-1 text-sm text-muted-foreground">
                {tp.team_type ?? t("sweep_public.team_detail.racing_team_default")} · {tp.location ?? "—"}
                {tp.founded_year ? ` · ${t("sweep_public.team_detail.established", { year: tp.founded_year })}` : ""}
                {tp.size ? ` · ${tp.size}` : ""}
              </div>
              {tp.primary_discipline && (
                <span className="mt-2 inline-block border border-racing-red/40 bg-racing-red/10 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-racing-red">
                  {disciplineLabel(tp.primary_discipline)}
                </span>
              )}
              {canSeeFull && tp.website && (
                <div className="mt-2 text-xs"><a href={tp.website} target="_blank" rel="noopener" className="text-racing-red hover:underline">{tp.website}</a></div>
              )}
              <div className="mt-2"><ProfileRatingBadge userId={id} variant="headset" isOwner={isOwner} /></div>
            </div>
          </div>
          {tp.bio && <p className="mt-6 text-sm text-muted-foreground">{tp.bio}</p>}
          {data.cancelStats && Number(data.cancelStats.count ?? 0) > 0 && (
            <div className="mt-4 flex items-start gap-2 border border-racing-red/40 bg-racing-red/10 p-3 font-mono text-[11px] text-racing-red">
              <span className="font-black">{t("sweep_public.team_detail.cancellation_history")}</span>
              <span>
                {t(Number(data.cancelStats.count) === 1 ? "sweep_public.team_detail.late_cancellation" : "sweep_public.team_detail.late_cancellation_plural", { count: data.cancelStats.count })}
              </span>
            </div>
          )}
        </div>

        {!canSeeFull && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-racing-yellow/40 bg-racing-yellow/5 p-5">
            <div>
              <div className="label-mono text-racing-yellow">{t("sweep_public.team_detail.partial_access_title")}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("sweep_public.team_detail.partial_access_desc")}
              </p>
            </div>
            <button onClick={() => setConfirmFull(true)} className="bg-racing-red px-4 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110">
              {t("sweep_public.team_detail.unlock_full_profile_button")}
            </button>
          </div>
        )}

        <div className="mt-8">
          <div className="label-mono mb-3">{canSeeFull ? t("sweep_public.team_detail.active_pit_calls") : t("sweep_public.team_detail.requested_position")}</div>
          {visibleRequests.length === 0 ? (
            <div className="border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t("sweep_public.team_detail.no_active_pit_calls")}</div>
          ) : (
            <div className="grid gap-3">
              {visibleRequests.map((r) => (
                <div key={r.id} className="border border-border bg-card p-4">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span className="border border-racing-red/40 bg-racing-red/10 px-2 py-0.5 font-mono text-[10px] uppercase text-racing-red">{disciplineLabel(r.discipline)}</span>
                    <span className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{r.sub_role ? subRoleLabel(r.sub_role) : roleGroupLabel(r.role_group)}</span>
                  </div>
                  <div className="font-bold">{r.title}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.start_date} → {r.end_date}{r.circuit ? ` · ${r.circuit}` : ""}</div>
                  {r.skills && r.skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.skills.map((s: string) => (
                        <span key={s} className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{skillLabel(s)}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {!canSeeFull && requests.length > visibleRequests.length && (
            <div className="mt-4 flex items-center gap-3 border border-dashed border-border p-4 text-sm text-muted-foreground">
              <Lock className="size-4" />
              {t("sweep_public.team_detail.locked_other_pitcalls", { count: requests.length - visibleRequests.length })}
            </div>
          )}
        </div>
        <div className="mt-8">
          <AnonymousReviewsSection targetUserId={id} variant="headset" isOwner={isOwner} />
        </div>
      </div>
      {confirmFull && <ConfirmModal onCancel={() => setConfirmFull(false)} onConfirm={() => unlockFull.mutate()} pending={unlockFull.isPending} error={error} />}
      <SiteFooter />
    </div>
  );
}

function ConfirmModal({ onCancel, onConfirm, pending, error }: { onCancel: () => void; onConfirm: () => void; pending: boolean; error: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !pending && onCancel()}>
      <div className="w-full max-w-md border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="label-mono">{t("sweep_public.team_detail.modal.title")}</div>
        <h2 className="mt-1 text-2xl font-black uppercase italic tracking-tighter">{t("sweep_public.team_detail.modal.heading")}</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {t("sweep_public.team_detail.modal.desc")}
        </p>
        {error && <div className="mt-3 border border-racing-red/40 bg-racing-red/10 p-3 text-xs text-racing-red">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={pending} className="border border-border px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-muted">
            {t("sweep_public.team_detail.modal.cancel")}
          </button>
          <button type="button" onClick={onConfirm} disabled={pending} className="bg-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60">
            {pending ? t("sweep_public.team_detail.modal.unlocking") : t("sweep_public.team_detail.modal.unlock_button")}
          </button>
        </div>
      </div>
    </div>
  );
}

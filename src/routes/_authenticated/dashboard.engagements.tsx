import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RatingStars } from "@/components/rating-stars";
import { getMyEngagements, confirmEngagement, markEngagementComplete, submitRating, markAllNotificationsRead } from "@/lib/paddock.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard/engagements")({
  component: EngagementsPage,
});

function EngagementsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getMyEngagements);
  const confirmFn = useServerFn(confirmEngagement);
  const completeFn = useServerFn(markEngagementComplete);
  const rateFn = useServerFn(submitRating);
  const markRead = useServerFn(markAllNotificationsRead);

  const { data: rows = [] } = useQuery({ queryKey: ["engagements"], queryFn: () => getFn() });

  useEffect(() => {
    markRead().then(() => qc.invalidateQueries({ queryKey: ["unread-notifications"] })).catch(() => {});
  }, [markRead, qc]);
  const [ratingFor, setRatingFor] = useState<string | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");

  const confirmMut = useMutation({ mutationFn: (id: string) => confirmFn({ data: { id } }), onSuccess: () => { toast.success("Confirmed"); qc.invalidateQueries(); } });
  const completeMut = useMutation({ mutationFn: (id: string) => completeFn({ data: { id } }), onSuccess: () => { toast.success("Marked complete"); qc.invalidateQueries(); } });
  const rateMut = useMutation({
    mutationFn: (v: { engagement_id: string; to_user_id: string }) => rateFn({ data: { ...v, stars, comment: comment || null } }),
    onSuccess: () => { toast.success(t("rating.submitted")); setRatingFor(null); setComment(""); qc.invalidateQueries(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="label-mono">[ENGAGEMENTS]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("engagements.title")}</h1>

        <div className="mt-8 grid gap-3">
          {rows.length === 0 && <div className="border border-border bg-card p-12 text-center text-sm text-muted-foreground">—</div>}
          {rows.map((e: any) => {
            const isFreelancer = user?.id === e.freelancer_id;
            const other = isFreelancer ? e.team : e.freelancer;
            const otherId = isFreelancer ? e.team_id : e.freelancer_id;
            const iMarked = isFreelancer ? e.freelancer_marked_complete : e.team_marked_complete;
            const tp = e.team_profile;
            const fp = e.freelancer_profile;
            const req = e.request;
            const match = e.match;
            const pct = match ? Math.round(Number(match.match_score ?? 0)) : null;
            const perfect = match?.is_perfect;
            const skillsSoft: string[] = req?.skills ?? [];
            const skillsHard: string[] = req?.skills_hard ?? [];
            const languages: any[] = req?.languages ?? [];
            const education: string[] = req?.education ?? [];
            const missing: any[] = match?.missing_criteria ?? [];
            return (
              <div key={e.id} className={`border p-5 ${perfect ? "border-racing-yellow bg-racing-yellow/5" : "border-border bg-card"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      {pct !== null && (
                        <div className={`text-2xl font-black italic tracking-tighter ${perfect ? "text-racing-yellow" : "text-racing-red"}`}>
                          {pct}% <span className="font-mono text-[10px] uppercase tracking-widest">{perfect ? "Perfect" : "Match"}</span>
                        </div>
                      )}
                      <div className="font-bold">{isFreelancer ? (tp?.team_name ?? other?.display_name) : (fp?.headline ? `${other?.display_name}` : other?.display_name)}</div>
                    </div>
                    {isFreelancer && tp && (
                      <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                        {tp.team_type && <span>{tp.team_type}</span>}
                        {tp.location && <span> · {tp.location}</span>}
                        {tp.primary_discipline && <span> · {t(`discipline.${tp.primary_discipline}`, { defaultValue: tp.primary_discipline })}</span>}
                      </div>
                    )}
                    {!isFreelancer && fp && (
                      <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                        {fp.role && <span>{t(`role.${fp.role}`, { defaultValue: fp.role })}</span>}
                        {fp.location && <span> · {fp.location}</span>}
                        {typeof fp.day_rate === "number" && <span> · €{fp.day_rate}/day</span>}
                      </div>
                    )}
                  </div>
                  <span className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest">
                    {t(`engagements.status.${e.status}`)}
                  </span>
                </div>

                {req && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="label-mono mb-1">[REQUEST]</div>
                    <div className="text-sm font-bold">{req.title}</div>
                    <div className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">
                      {t(`role.${req.role}`, { defaultValue: req.role })} · {t(`discipline.${req.discipline}`, { defaultValue: req.discipline })} · {req.start_date} → {req.end_date}
                      {(req.budget_min || req.budget_max) && <span> · €{req.budget_min ?? "?"}–{req.budget_max ?? "?"}/{req.budget_unit}</span>}
                    </div>
                    {(skillsHard.length > 0 || skillsSoft.length > 0) && (
                      <div className="mt-2">
                        <div className="label-mono mb-1">[SKILLS]</div>
                        <div className="flex flex-wrap gap-1">
                          {skillsHard.map((s) => (
                            <span key={`h-${s}`} className="border border-racing-red bg-racing-red/10 px-2 py-0.5 font-mono text-[10px] uppercase text-racing-red">{t(`skills.${s}`, { defaultValue: s })} · hard</span>
                          ))}
                          {skillsSoft.filter((s) => !skillsHard.includes(s)).map((s) => (
                            <span key={`s-${s}`} className="border border-racing-yellow bg-racing-yellow/10 px-2 py-0.5 font-mono text-[10px] uppercase text-racing-yellow">{t(`skills.${s}`, { defaultValue: s })}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {languages.length > 0 && (
                      <div className="mt-2">
                        <div className="label-mono mb-1">[LANGUAGES]</div>
                        <div className="flex flex-wrap gap-1">
                          {languages.map((l: any, i: number) => (
                            <span key={i} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${l.hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}>
                              {t(`languages.${l.code}`, { defaultValue: l.code })} ({t(`language_levels.${l.level}`, { defaultValue: l.level })}){l.hard ? " · hard" : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {education.length > 0 && (
                      <div className="mt-2">
                        <div className="label-mono mb-1">[EDUCATION]</div>
                        <div className="flex flex-wrap gap-1">
                          {education.map((ed) => (
                            <span key={ed} className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{t(`education_options.${ed}`, { defaultValue: ed })}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {req.notes && <p className="mt-2 text-xs text-muted-foreground">{req.notes}</p>}
                  </div>
                )}

                {missing.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="label-mono mb-1">Missing / partial criteria</div>
                    <div className="flex flex-wrap gap-1">
                      {missing.map((c: any, i: number) => (
                        <span key={i} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${c.hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}>
                          {c.kind === "role" ? `Role: ${c.label ?? ""}` : c.kind === "skill" ? `Skill: ${c.label}` : c.kind === "language" ? `Lang: ${c.code} (${c.level})` : c.kind === "education" ? "Education" : c.kind === "day_rate" ? "Day rate over budget" : c.kind === "location" ? `Location: ${c.label ?? "distant"}` : (c.kind ?? "criterion")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                  <div className="font-mono text-xs text-muted-foreground">
                    {e.start_date} → {e.end_date} · {e.currency} {e.fee ?? "—"}
                  </div>
                </div>
                {e.notes && <p className="mt-2 text-sm text-muted-foreground">{e.notes}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {e.status === "proposed" && e.proposed_by !== user?.id && (
                    <button onClick={() => confirmMut.mutate(e.id)} className="bg-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:brightness-110">
                      {t("engagements.confirm")}
                    </button>
                  )}
                  {e.status === "confirmed" && !iMarked && (
                    <button onClick={() => completeMut.mutate(e.id)} className="bg-foreground px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-background hover:bg-racing-red hover:text-white">
                      {t("engagements.mark_complete")}
                    </button>
                  )}
                  {e.status === "completed" && (
                    ratingFor === e.id ? (
                      <div className="w-full border border-border bg-background p-4">
                        <div className="label-mono mb-2">{t("engagements.rate_them", { name: other?.display_name })}</div>
                        <RatingStars value={stars} onChange={setStars} />
                        <textarea rows={2} value={comment} onChange={(v) => setComment(v.target.value)} placeholder={t("rating.comment_placeholder")} className="mt-3 w-full border border-border bg-background px-3 py-2 text-sm" maxLength={500} />
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => rateMut.mutate({ engagement_id: e.id, to_user_id: otherId })} className="bg-racing-red px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white">{t("rating.submit")}</button>
                          <button onClick={() => setRatingFor(null)} className="border border-border px-4 py-2 text-[11px] font-bold uppercase tracking-widest">{t("common.cancel")}</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setRatingFor(e.id)} className="bg-racing-yellow px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-carbon hover:brightness-110">
                        {t("engagements.rate")}
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

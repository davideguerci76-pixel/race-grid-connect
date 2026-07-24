import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Unlock, Mail, Phone, Star, ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getRequestMatches, unlockMatch, requestMatchConfirmation } from "@/lib/paddock.functions";
import { roleLabel, disciplineLabel } from "@/lib/paddock";

export const Route = createFileRoute("/_authenticated/dashboard/requests/$id/matches")({
  component: RequestMatchesPage,
});

function RequestMatchesPage() {
  const { id } = useParams({ from: "/_authenticated/dashboard/requests/$id/matches" });
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const fetchMatches = useServerFn(getRequestMatches);
  const unlockFn = useServerFn(unlockMatch);

  const { data, isLoading } = useQuery({
    queryKey: ["request-matches", id, page],
    queryFn: () => fetchMatches({ data: { request_id: id, page } }),
  });

  const unlockMut = useMutation({
    mutationFn: (match_id: string) => unlockFn({ data: { match_id } }),
    onSuccess: (r) => {
      toast.success(`Candidate unlocked. Balance: ${r.balance} tokens`);
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["token-balance"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Unlock failed"),
  });

  const confirmFn = useServerFn(requestMatchConfirmation);
  const confirmMut = useMutation({
    mutationFn: (match_id: string) => confirmFn({ data: { match_id } }),
    onSuccess: () => {
      toast.success("Confirmation request sent to freelancer");
      qc.invalidateQueries({ queryKey: ["request-matches", id] });
      qc.invalidateQueries({ queryKey: ["engagements"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-10">
        <Link to="/dashboard/requests" className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> Back to requests
        </Link>

        {isLoading && <div className="text-sm text-muted-foreground">Loading matches…</div>}

        {data && (
          <>
            <div className="border border-border bg-card p-5">
              <div className="label-mono">[REQUEST]</div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">{data.request.title}</h1>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {roleLabel(data.request.role)} · {disciplineLabel(data.request.discipline)} · {data.request.start_date} → {data.request.end_date}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                <span className="font-bold text-racing-yellow">Free preview:</span> the top 3 candidates by match score are unlocked automatically. Every other candidate costs 1 token to unlock.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {data.pagination.total} candidate{data.pagination.total === 1 ? "" : "s"}
              </div>
              {data.pagination.totalPages > 1 && (
                <div className="flex items-center gap-2 font-mono text-xs">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="border border-border px-3 py-1 uppercase tracking-widest disabled:opacity-30"
                  >
                    Prev
                  </button>
                  <span>Page {page} / {data.pagination.totalPages}</span>
                  <button
                    disabled={page >= data.pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="border border-border px-3 py-1 uppercase tracking-widest disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3">
              {data.items.length === 0 && (
                <div className="border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                  No candidates match this request yet.
                </div>
              )}
              {data.items.map((m) => (
                <MatchCard
                  key={m.match_id}
                  match={m}
                  requestFilled={data.request.status === "filled"}
                  onUnlock={() => unlockMut.mutate(m.match_id)}
                  onConfirm={() => {
                    if (confirm("Send a confirmation request to this freelancer? If they accept, the job will be marked as filled and contacts will be exchanged automatically.")) {
                      confirmMut.mutate(m.match_id);
                    }
                  }}
                  loading={unlockMut.isPending || confirmMut.isPending}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}

function MatchCard({ match, onUnlock, onConfirm, loading, requestFilled }: { match: any; onUnlock: () => void; onConfirm: () => void; loading: boolean; requestFilled: boolean }) {
  const pct = Math.round(match.match_score);
  const perfect = match.is_perfect;

  return (
    <div className={`border p-5 ${perfect ? "border-racing-yellow bg-racing-yellow/5" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {match.unlocked ? <Unlock className="size-4 text-racing-yellow" /> : <Lock className="size-4 text-muted-foreground" />}
          <div>
            <div className={`text-3xl font-black italic tracking-tighter ${perfect ? "text-racing-yellow" : "text-racing-red"}`}>
              {pct}% <span className="text-sm font-mono uppercase tracking-widest">{perfect ? "Perfect match" : "Match"}</span>
            </div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {match.overlap_days} day{match.overlap_days === 1 ? "" : "s"} of overlap
              {match.free_preview && match.unlocked && <span className="ml-2 text-racing-yellow">· FREE PREVIEW</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!match.unlocked && (
            <button
              onClick={onUnlock}
              disabled={loading}
              className="flex items-center gap-2 bg-racing-red px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110 disabled:opacity-60"
            >
              <Unlock className="size-3" /> Unlock profile (1 token)
            </button>
          )}
          {match.unlocked && !requestFilled && (
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex items-center gap-2 bg-racing-yellow px-4 py-2 text-xs font-bold uppercase tracking-widest text-carbon hover:brightness-110 disabled:opacity-60"
            >
              Request confirmation
            </button>
          )}
          {requestFilled && (
            <span className="border border-racing-yellow bg-racing-yellow/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-racing-yellow">
              Request filled
            </span>
          )}
        </div>
      </div>

      {match.unlocked && match.profile ? (
        <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center border border-border bg-secondary font-black uppercase">
                {match.profile.display_name?.slice(0, 2) ?? "?"}
              </div>
              <div>
                <div className="text-lg font-bold">{match.profile.display_name}</div>
                {match.profile.role && <div className="font-mono text-[11px] uppercase text-muted-foreground">{roleLabel(match.profile.role)}</div>}
              </div>
            </div>
            {match.profile.headline && <p className="mt-3 text-sm">{match.profile.headline}</p>}
            {match.profile.bio && <p className="mt-2 text-xs text-muted-foreground">{match.profile.bio}</p>}
            <div className="mt-3 space-y-1 font-mono text-[11px] uppercase text-muted-foreground">
              {match.profile.location && <div>📍 {match.profile.location}</div>}
              {match.profile.day_rate != null && <div>€{match.profile.day_rate}/day</div>}
              <div>Travels: {match.profile.travels ? "yes" : "no"}</div>
            </div>
          </div>
          <div>
            <div className="label-mono mb-1">[CONTACT]</div>
            {match.profile.contact_email && (
              <div className="flex items-center gap-2 font-mono text-xs"><Mail className="size-3" /> {match.profile.contact_email}</div>
            )}
            {match.profile.phone_number && (
              <div className="mt-1 flex items-center gap-2 font-mono text-xs"><Phone className="size-3" /> {match.profile.phone_dial_code} {match.profile.phone_number}</div>
            )}
            {match.profile.disciplines?.length > 0 && (
              <>
                <div className="label-mono mb-1 mt-3">[DISCIPLINES]</div>
                <div className="flex flex-wrap gap-1">
                  {match.profile.disciplines.map((d: string) => (
                    <span key={d} className="border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase">{disciplineLabel(d)}</span>
                  ))}
                </div>
              </>
            )}
            {match.profile.skills?.length > 0 && (
              <>
                <div className="label-mono mb-1 mt-3">[SKILLS]</div>
                <div className="flex flex-wrap gap-1">
                  {match.profile.skills.map((s: string) => (
                    <span key={s} className="border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase">{s}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 border-t border-border pt-4">
          <div className="label-mono mb-2 flex items-center gap-2"><Star className="size-3 text-racing-yellow" /> Missing / partial criteria</div>
          {match.missing_criteria.length === 0 ? (
            <div className="font-mono text-[11px] text-racing-yellow">All soft criteria satisfied — 100% match</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {match.missing_criteria.map((c: any, i: number) => (
                <span key={i} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${c.hard ? "border-racing-red text-racing-red" : "border-border text-muted-foreground"}`}>
                  {formatCriterion(c)}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 rounded border border-border bg-background/50 p-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Full profile, contact email and phone are hidden until you unlock.
          </div>
        </div>
      )}
    </div>
  );
}

function formatCriterion(c: any): string {
  switch (c.kind) {
    case "role": return `Role: ${c.label ?? ""}`;
    case "skill": return `Skill: ${c.label}`;
    case "language": return `Lang: ${c.code} (${c.level})`;
    case "education": return "Education";
    case "day_rate": return "Day rate over budget";
    case "location": return `Location: ${c.label ?? "distant"}`;
    default: return c.kind ?? "criterion";
  }
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Unlock } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BackButton } from "@/components/back-button";
import { PoolMemberCard } from "@/components/cards/pool-member-card";
import { CandidateMatchCard } from "@/components/cards/candidate-match-card";
import { addPoolMemberByCode, getMyPool, getPoolMatches, removePoolMember, unlockPoolSearch } from "@/lib/pool.functions";
import { getMyRequests } from "@/lib/paddock.functions";
import { toastError } from "@/lib/errors";
import { useAuth } from "@/hooks/use-auth";
import { confirmDialog } from "@/hooks/use-confirm";
import { supabase } from "@/integrations/supabase/client";

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
  const { user } = useAuth();
  const navigate = useNavigate();

  // Team-only screen: resolve the account type before painting anything.
  const { data: roleProfile } = useQuery({
    queryKey: ["pool-role-profile", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("profiles").select("user_type").eq("id", user!.id).maybeSingle()).data,
  });
  const isTeam = roleProfile?.user_type === "team";

  useEffect(() => {
    if (roleProfile && roleProfile.user_type !== "team") navigate({ to: "/dashboard/calendar" });
  }, [roleProfile, navigate]);

  const listPool = useServerFn(getMyPool);
  const addByCode = useServerFn(addPoolMemberByCode);
  const removeMember = useServerFn(removePoolMember);
  const listRequests = useServerFn(getMyRequests);

  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState<string>("");

  const { data: pool = [], isLoading } = useQuery({ queryKey: ["my-pool"], queryFn: () => listPool(), enabled: isTeam });
  const { data: requests = [] } = useQuery({ queryKey: ["my-requests"], queryFn: () => listRequests(), enabled: isTeam });

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

  const removeMut = useMutation({
    mutationFn: (freelancerId: string) => removeMember({ data: { freelancer_id: freelancerId } }),
    onSuccess: () => {
      toast.success(t("pool.removed"));
      qc.invalidateQueries({ queryKey: ["my-pool"] });
      qc.invalidateQueries({ queryKey: ["pool-matches"] });
    },
    onError: (e) => {
      // Server-side deny: the freelancer is still part of an active My Pool search.
      if (e instanceof Error && e.message.includes("POOL_ACTIVE_DEPENDENCY")) {
        toast.warning(t("pool.remove_blocked_active"));
        return;
      }
      toastError(e, "pool.remove_failed");
    },
  });

  const askRemove = async (m: any) => {
    if (await confirmDialog(t("pool.remove_confirm", { name: m.name }), { destructive: true })) removeMut.mutate(m.freelancer_id);
  };

  const openRequests = useMemo(
    () => (requests as any[]).filter((r) => r.status === "active" || r.status === "paused"),
    [requests],
  );

  // Role resolution gate: nothing Team-specific is painted until the server has
  // confirmed the account type (a freelancer landing here is redirected above).
  if (!isTeam) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SiteHeader />
        <div className="container-page py-12">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-10 w-72 animate-pulse rounded bg-muted" />
          <div className="mt-8 h-64 w-full animate-pulse rounded bg-muted/60" />
        </div>
        <SiteFooter />
      </div>
    );
  }

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
              {(pool as any[]).map((m) => (
                <PoolMemberCard
                  key={m.id}
                  member={m}
                  onRemove={() => askRemove(m)}
                  removing={removeMut.isPending && removeMut.variables === m.freelancer_id}
                />
              ))}
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

  // Locked state exists only for genuine Pool-origin pit calls; standard pit calls are compared for free.
  if (data.pool_origin && !data.unlocked) {
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
    <>
      {!data.pool_origin && (
        <p className="mt-3 text-xs text-muted-foreground">{t("pool.standard_free_note")}</p>
      )}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <PoolColumn title={t("pool.column_full")} items={data.items_full} />
        <PoolColumn title={t("pool.column_partial")} items={data.items_partial} partial />
      </div>
    </>
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
          {items.map((m) => <CandidateMatchCard key={m.match_id} match={m} mode="pool" />)}
        </div>
      )}
    </div>
  );
}

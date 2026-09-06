import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminGetBillingAccount, adminListBillingAccounts } from "@/lib/admin-billing.functions";

export const Route = createFileRoute("/_authenticated/admin/billing")({
  component: AdminBillingPage,
  head: () => ({
    meta: [
      { title: "Billing & Payments — PITCALL Admin" },
      { name: "description", content: "Administrative view of PITCALL accounts with real economic activity: orders, payments and correlated token accounting." },
      { property: "og:title", content: "Billing & Payments — PITCALL Admin" },
      { property: "og:description", content: "Administrative view of PITCALL accounts with real economic activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function money(cents: number | null | undefined, currency: string) {
  if (cents == null) return "—";
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function when(v: string | null | undefined) {
  return v ? new Date(v).toLocaleString() : "—";
}

function AdminBillingPage() {
  const list = useServerFn(adminListBillingAccounts);
  const getOne = useServerFn(adminGetBillingAccount);
  const [openId, setOpenId] = useState<string | null>(null);

  const accounts = useQuery({ queryKey: ["admin-billing-accounts"], queryFn: () => list({}) });

  const detail = useMutation({ mutationFn: (user_id: string) => getOne({ data: { user_id } }) });

  const openDetail = (id: string) => {
    setOpenId(id);
    detail.mutate(id);
  };

  const rows = accounts.data?.accounts ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-lg font-bold uppercase tracking-wide">Billing &amp; Payments</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Accounts with real economic activity in the {accounts.data?.env_is_test ? "TEST" : "LIVE"} environment.
          Token ledger, payment history and billing identity are shown separately — they are not the same record.
        </p>
      </header>

      {accounts.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {accounts.isError && <p className="text-sm text-racing-red">Failed to load billing accounts.</p>}

      {!accounts.isLoading && rows.length === 0 && (
        <p className="border border-border p-4 text-sm text-muted-foreground">No account has economic activity in this environment yet.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 uppercase text-[10px] text-muted-foreground">
              <tr>
                <th className="p-2">Account</th>
                <th className="p-2">Type</th>
                <th className="p-2">Billing identity</th>
                <th className="p-2">Country</th>
                <th className="p-2">Completion</th>
                <th className="p-2">Orders</th>
                <th className="p-2">Collected</th>
                <th className="p-2">Last activity</th>
                <th className="p-2">Env</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a: any) => (
                <tr key={a.user_id} className="border-t border-border">
                  <td className="p-2 font-medium">{a.display_name}</td>
                  <td className="p-2">{a.user_type}</td>
                  <td className="p-2">
                    {a.billing_name ?? <span className="text-muted-foreground">not provided</span>}
                    {a.tax_id && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{a.tax_id}</span>}
                  </td>
                  <td className="p-2">{a.country ?? "—"}</td>
                  <td className="p-2">{a.billing_completeness}%</td>
                  <td className="p-2">{a.orders_count}</td>
                  <td className="p-2">{money(a.collected_cents, a.currency)}</td>
                  <td className="p-2">{when(a.last_activity_at)}</td>
                  <td className="p-2">{a.is_test ? "TEST" : "LIVE"}</td>
                  <td className="p-2">
                    <button onClick={() => openDetail(a.user_id)} className="text-racing-red hover:underline">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <section className="border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase">Account detail</h2>
            <button onClick={() => setOpenId(null)} className="text-xs text-muted-foreground hover:underline">Close</button>
          </div>

          {detail.isPending && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
          {detail.data && (
            <div className="mt-4 space-y-6 text-xs">
              <div>
                <h3 className="mb-2 font-bold uppercase text-muted-foreground">Billing identity (current)</h3>
                {detail.data.billing ? (
                  <div className="grid gap-1 sm:grid-cols-2">
                    {Object.entries(detail.data.billing as Record<string, any>)
                      .filter(([k]) => !["user_id", "created_at", "updated_at"].includes(k))
                      .map(([k, v]) => (
                        <div key={k}>
                          <span className="text-muted-foreground">{k}:</span> <span className="font-mono">{String(v ?? "—")}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No billing details provided by this account.</p>
                )}
                <p className="mt-2 text-[10px] text-muted-foreground">
                  These are the current details. Each order keeps its own snapshot of the details as they were at purchase time.
                </p>
              </div>

              <div>
                <h3 className="mb-2 font-bold uppercase text-muted-foreground">Orders &amp; payments</h3>
                <div className="space-y-3">
                  {detail.data.orders.length === 0 && <p className="text-muted-foreground">No orders.</p>}
                  {detail.data.orders.map((o: any) => (
                    <div key={o.id} className="border border-border p-3">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span className="font-mono text-[10px]">{o.id}</span>
                        <span className="font-bold uppercase">{o.status}</span>
                        <span>{o.token_quantity} tokens</span>
                        <span>{money(o.amount_collected_cents ?? o.total_amount_cents, o.currency)}</span>
                        <span>{o.provider} / {o.provider_mode}</span>
                        <span>{o.is_test ? "TEST" : "LIVE"}</span>
                      </div>
                      <div className="mt-1 grid gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-2">
                        <span>created: {when(o.created_at)}</span>
                        <span>payment confirmed: {when(o.payment_confirmed_at)}</span>
                        <span>credited: {when(o.credited_at)}</span>
                        <span>cancelled: {when(o.cancelled_at)}</span>
                        <span>payment id: {o.provider_payment_id ?? "—"}</span>
                        <span>session id: {o.provider_session_id ?? "—"}</span>
                      </div>
                      <div className="mt-2 border-t border-border pt-2">
                        <span className="text-muted-foreground">Correlated token accounting: </span>
                        {o.token_transaction ? (
                          <span>
                            {o.token_transaction.delta > 0 ? "+" : ""}
                            {o.token_transaction.delta} · {o.token_transaction.reason} · {when(o.token_transaction.created_at)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">none (no tokens credited by this order)</span>
                        )}
                      </div>
                      {o.billing_snapshot && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-muted-foreground">Billing snapshot at purchase time</summary>
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px]">{JSON.stringify(o.billing_snapshot, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

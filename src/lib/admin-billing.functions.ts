import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logAdminAction } from "@/lib/admin-helpers";

/**
 * ACP Billing & Payments — administrative view of PITCALL economic activity.
 * It reads ONLY real records: token_orders (order/payment authority) and, for
 * correlation, the token_transactions row an order actually credited.
 * It never invents fiscal documents, invoice numbers or tax computations.
 */

type OrderRow = {
  id: string;
  team_id: string;
  is_test: boolean;
  status: string;
  package_code: string;
  package_label_key: string;
  token_quantity: number;
  currency: string;
  base_amount_cents: number;
  total_amount_cents: number | null;
  amount_collected_cents: number | null;
  provider: string;
  provider_mode: string;
  provider_session_id: string | null;
  provider_payment_id: string | null;
  credit_transaction_id: string | null;
  billing_snapshot: any;
  created_at: string;
  payment_confirmed_at: string | null;
  credited_at: string | null;
  cancelled_at: string | null;
  failed_at: string | null;
  expired_at: string | null;
};

const COLLECTED_STATUSES = new Set(["paid", "payment_confirmed", "credited"]);

export const adminListBillingAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { currentAdminEnv } = await import("@/lib/admin-env.server");
    const envIsTest = await currentAdminEnv(supabaseAdmin, context.userId);

    const { data: orders, error } = await supabaseAdmin
      .from("token_orders")
      .select(
        "id, team_id, is_test, status, token_quantity, currency, base_amount_cents, total_amount_cents, amount_collected_cents, created_at, payment_confirmed_at, credited_at",
      )
      .eq("is_test", envIsTest)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (orders ?? []) as any[];
    const ids = Array.from(new Set(rows.map((o) => o.team_id)));
    if (!ids.length) return { env_is_test: envIsTest, accounts: [] as any[] };

    const [{ data: profiles }, { data: teams }, { data: billing }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, user_type, is_test").in("id", ids),
      supabaseAdmin.from("team_profiles").select("user_id, team_name").in("user_id", ids),
      supabaseAdmin
        .from("billing_details")
        .select("user_id, subject_type, billing_name, country, tax_id, address, city, postal_code")
        .in("user_id", ids),
    ]);

    const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const tMap = new Map((teams ?? []).map((t: any) => [t.user_id, t]));
    const bMap = new Map((billing ?? []).map((b: any) => [b.user_id, b]));

    const accounts = ids.map((id) => {
      const mine = rows.filter((o) => o.team_id === id);
      const collected = mine
        .filter((o) => COLLECTED_STATUSES.has(o.status))
        .reduce((sum, o) => sum + Number(o.amount_collected_cents ?? o.total_amount_cents ?? 0), 0);
      const b = bMap.get(id);
      const filled = b
        ? ["billing_name", "country", "address", "city", "postal_code"].filter((k) => !!b[k]).length
        : 0;
      const last = mine[0];
      return {
        user_id: id,
        user_type: pMap.get(id)?.user_type ?? "team",
        display_name: tMap.get(id)?.team_name ?? pMap.get(id)?.display_name ?? "—",
        billing_name: b?.billing_name ?? null,
        subject_type: b?.subject_type ?? null,
        country: b?.country ?? null,
        tax_id: b?.tax_id ?? null,
        billing_completeness: b ? Math.round((filled / 5) * 100) : 0,
        orders_count: mine.length,
        collected_cents: collected,
        currency: last?.currency ?? "EUR",
        statuses: Array.from(new Set(mine.map((o) => o.status))),
        last_activity_at: last?.created_at ?? null,
        is_test: !!last?.is_test,
      };
    });

    accounts.sort((a, b) => String(b.last_activity_at).localeCompare(String(a.last_activity_at)));
    return { env_is_test: envIsTest, accounts };
  });

export const adminGetBillingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { currentAdminEnv } = await import("@/lib/admin-env.server");
    const envIsTest = await currentAdminEnv(supabaseAdmin, context.userId);

    // ACP data minimisation: only the fields an administrator needs to verify a
    // fiscal identity. Contact channels (billing_email, pec, billing_phone) and
    // the SDI code are never returned to the admin surface.
    const BILLING_ADMIN_COLUMNS =
      "user_id, subject_type, billing_name, country, region, city, postal_code, address, tax_id, updated_at";

    const [{ data: profile }, { data: team }, { data: billing }, { data: orders }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, user_type, is_test").eq("id", data.user_id).maybeSingle(),
      supabaseAdmin.from("team_profiles").select("team_name").eq("user_id", data.user_id).maybeSingle(),
      supabaseAdmin.from("billing_details").select(BILLING_ADMIN_COLUMNS).eq("user_id", data.user_id).maybeSingle(),
      supabaseAdmin
        .from("token_orders")
        .select(
          "id, team_id, is_test, status, package_code, package_label_key, token_quantity, currency, base_amount_cents, total_amount_cents, amount_collected_cents, provider, provider_mode, provider_session_id, provider_payment_id, credit_transaction_id, created_at, payment_confirmed_at, credited_at, cancelled_at, failed_at, expired_at",
        )
        .eq("team_id", data.user_id)
        .eq("is_test", envIsTest)
        .order("created_at", { ascending: false }),
    ]);

    const orderRows = (orders ?? []) as unknown as OrderRow[];
    const txIds = orderRows.map((o) => o.credit_transaction_id).filter(Boolean) as string[];
    let txMap = new Map<string, any>();
    if (txIds.length) {
      const { data: txs } = await supabaseAdmin
        .from("token_transactions")
        .select("id, delta, reason, created_at")
        .in("id", txIds);
      txMap = new Map((txs ?? []).map((t: any) => [t.id, t]));
    }

    // Reading another account's fiscal identity is an auditable administrative act.
    await logAdminAction(context.userId, data.user_id, "billing_account_viewed", {
      env_is_test: envIsTest,
      orders_count: orderRows.length,
      billing_present: !!billing,
    });

    return {
      env_is_test: envIsTest,
      account: {
        user_id: data.user_id,
        user_type: (profile as any)?.user_type ?? null,
        display_name: (team as any)?.team_name ?? (profile as any)?.display_name ?? "—",
        is_test: (profile as any)?.is_test ?? null,
      },
      billing: billing ?? null,
      orders: orderRows.map((o) => ({
        ...o,
        token_transaction: o.credit_transaction_id ? txMap.get(o.credit_transaction_id) ?? null : null,
      })),
    };
  });


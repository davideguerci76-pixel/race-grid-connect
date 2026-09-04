import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// STEP S3 — Token order foundation.
//
// AUTHORITY SPLIT
//   COMMERCIAL (PITCALL): package code, token quantity, base tax-exclusive
//     price, currency, availability, team entitlement. Snapshotted on the order.
//   PAYMENT (future provider): payment lifecycle, provider identifiers, amount
//     actually collected. It never decides tokens, package or target team.
//   TAX (future provider engine, e.g. Stripe Tax): tax amount only. No rate is
//     hardcoded anywhere in PITCALL.
//   FISCAL DOCUMENT: out of scope. Nothing here issues an invoice.
//
// Purchase is switched OFF server-side (platform_settings
// flag_token_purchase_enabled = 0); this path refuses even when called directly.
// ---------------------------------------------------------------------------

const CODE_RE = /^[a-z0-9_]{3,40}$/;

export type TokenOrderSummary = {
  id: string;
  package_code: string;
  token_quantity: number;
  base_amount_cents: number;
  currency: string;
  discount_pct: number;
  status: string;
  provider: string;
  provider_mode: string;
  created_at: string;
  credited_at: string | null;
};

/**
 * Creates a token order. The browser may supply nothing but a package code —
 * amount, quantity, currency, discount, package version, team id, environment
 * and provider mode are all resolved server-side by create_token_order().
 * Any other key in the payload is a protocol error (.strict()).
 */
export const createTokenOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ package_code: z.string().regex(CODE_RE, "invalid_code") }).strict().parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: orderId, error } = await context.supabase.rpc("create_token_order", {
      _package_code: data.package_code,
    });
    if (error) {
      // Expected, non-exceptional outcome while purchase is disabled.
      if (error.message.includes("token_purchase_disabled")) {
        return { ok: false as const, reason: "purchase_disabled" as const };
      }
      if (error.message.includes("package_not_available")) {
        return { ok: false as const, reason: "package_not_available" as const };
      }
      throw new Error(error.message);
    }
    return { ok: true as const, order_id: orderId as unknown as string };
  });

/** Read-only history of the signed-in team's own orders (RLS scoped). */
export const listMyTokenOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TokenOrderSummary[]> => {
    const { data, error } = await context.supabase
      .from("token_orders")
      .select(
        "id, package_code, token_quantity, base_amount_cents, currency, discount_pct, status, provider, provider_mode, created_at, credited_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as TokenOrderSummary[];
  });

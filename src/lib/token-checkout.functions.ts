import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// STEP S4 — Stripe TEST checkout.
//
// AUTHORITY: PITCALL prices and decides tokens; Stripe only collects. The
// checkout session is built exclusively from the immutable order snapshot
// created by create_token_order() — the browser supplies only a package code.
// The order gate (public.token_purchase_allowed) refuses outside the authorised
// environment, so a normal/LIVE team never reaches Stripe.
//
// LIVE is structurally impossible here: only STRIPE_TEST_SECRET_KEY is read and
// the key must start with sk_test_.
// No tax rate is computed in PITCALL. Stripe Tax is NOT configured, so sessions
// are created tax-exclusive with no automatic_tax.
// Crediting NEVER happens here; only the signed webhook can credit.
// ---------------------------------------------------------------------------

const CODE_RE = /^[a-z0-9_]{3,40}$/;

const ALLOWED_ORIGINS = [
  "https://pitcall.net",
  "https://www.pitcall.net",
  "http://localhost:8080",
];

function safeOrigin(origin: string | undefined): string {
  if (!origin) return ALLOWED_ORIGINS[0]!;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin)) return origin;
  return ALLOWED_ORIGINS[0]!;
}

export type CheckoutResult =
  | { ok: true; url: string; order_id: string }
  | { ok: false; reason: "purchase_disabled" | "package_not_available" | "provider_unavailable" };

export const startTokenCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        package_code: z.string().regex(CODE_RE, "invalid_code"),
        origin: z.string().max(200).optional(),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    const secretKey = process.env["STRIPE_TEST_SECRET_KEY"];
    if (!secretKey || !secretKey.startsWith("sk_test_")) {
      console.error("token-checkout: missing or non-test Stripe key");
      return { ok: false, reason: "provider_unavailable" };
    }

    // 1. PITCALL creates the priced order (gate + snapshot live in the DB).
    const { data: orderId, error } = await context.supabase.rpc("create_token_order", {
      _package_code: data.package_code,
    });
    if (error) {
      if (error.message.includes("token_purchase_disabled")) return { ok: false, reason: "purchase_disabled" };
      if (error.message.includes("package_not_available")) return { ok: false, reason: "package_not_available" };
      throw new Error(error.message);
    }

    // 2. Read back the immutable snapshot (RLS: own order only).
    const { data: order, error: readErr } = await context.supabase
      .from("token_orders")
      .select("id, package_code, token_quantity, base_amount_cents, currency")
      .eq("id", orderId as unknown as string)
      .single();
    if (readErr || !order) throw new Error(readErr?.message ?? "order_not_found");

    const origin = safeOrigin(data.origin);
    const body = new URLSearchParams();
    body.set("mode", "payment");
    body.set("client_reference_id", order.id);
    body.set("metadata[pitcall_order_id]", order.id);
    body.set("payment_intent_data[metadata][pitcall_order_id]", order.id);
    body.set("success_url", `${origin}/dashboard/tokens?checkout=success&order=${order.id}`);
    body.set("cancel_url", `${origin}/dashboard/tokens?checkout=cancel&order=${order.id}`);
    body.set("line_items[0][quantity]", "1");
    body.set("line_items[0][price_data][currency]", String(order.currency).toLowerCase());
    body.set("line_items[0][price_data][unit_amount]", String(order.base_amount_cents));
    body.set(
      "line_items[0][price_data][product_data][name]",
      `PITCALL ${order.token_quantity} tokens (${order.package_code})`,
    );

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `pitcall_order_${order.id}`,
      },
      body: body.toString(),
    });
    const json = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
    if (!res.ok || !json.url || !json.id) {
      console.error(`token-checkout: stripe error ${res.status} ${json.error?.message ?? ""}`);
      return { ok: false, reason: "provider_unavailable" };
    }

    // 3. Record the session; status moves created -> payment_pending.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("attach_token_order_session", {
      _order_id: order.id,
      _provider: "stripe",
      _session_id: json.id,
    });

    return { ok: true, url: json.url, order_id: order.id };
  });

/** Whether the purchase path is authorised for this session (server authority). */
export const getTokenPurchaseAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ enabled: boolean }> => {
    const { data, error } = await context.supabase.rpc("my_token_purchase_enabled");
    if (error) return { enabled: false };
    return { enabled: data === true };
  });

/** Read-only order status for the return page. It NEVER credits anything. */
export const getMyTokenOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ order_id: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("token_orders")
      .select("id, status, token_quantity, base_amount_cents, currency, credited_at")
      .eq("id", data.order_id)
      .maybeSingle();
    return row ?? null;
  });

/** User-initiated cancel when returning from a cancelled Stripe checkout. */
export const cancelMyTokenOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ order_id: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_token_order", { _order_id: data.order_id });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

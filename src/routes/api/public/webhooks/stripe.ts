import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Stripe TEST webhook endpoint.
 *
 * Authority boundary (S3 locked):
 *  - Stripe is ONLY the payment provider.
 *  - Token quantity, team, currency and base amount come exclusively from the
 *    immutable PITCALL order snapshot (`token_orders`), never from Stripe metadata.
 *  - Crediting happens only through `confirm_token_order_payment` (service_role only),
 *    which owns replay protection, advisory locking and the state machine.
 *
 * LIVE is not supported here: any event whose livemode is true is rejected.
 */

const TOLERANCE_SECONDS = 300;

function verifyStripeSignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const signatures = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const exp = Buffer.from(expected, "utf8");
  return signatures.some((sig) => {
    const got = Buffer.from(sig, "utf8");
    return got.length === exp.length && timingSafeEqual(got, exp);
  });
}

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_TEST_WEBHOOK_SECRET"];
        if (!secret) {
          console.error("stripe-webhook: STRIPE_TEST_WEBHOOK_SECRET is not configured");
          return new Response("Webhook not configured", { status: 503 });
        }

        const body = await request.text();
        if (!verifyStripeSignature(body, request.headers.get("stripe-signature"), secret)) {
          console.error("stripe-webhook: invalid signature");
          return new Response("Invalid signature", { status: 400 });
        }

        let event: {
          id?: string;
          type?: string;
          livemode?: boolean;
          data?: { object?: Record<string, unknown> };
        };
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        if (!event.id || !event.type) return new Response("Invalid event", { status: 400 });

        // Hard TEST-only boundary.
        if (event.livemode === true) {
          console.error(`stripe-webhook: rejected livemode event ${event.id}`);
          return new Response("Live mode is disabled", { status: 400 });
        }

        const handled = new Set([
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
          "payment_intent.succeeded",
        ]);
        if (!handled.has(event.type)) {
          // Acknowledge so Stripe stops retrying, but do nothing.
          return new Response("ignored", { status: 200 });
        }

        const obj = (event.data?.object ?? {}) as Record<string, unknown>;
        const metadata = (obj["metadata"] ?? {}) as Record<string, unknown>;
        const orderId = typeof metadata["pitcall_order_id"] === "string" ? metadata["pitcall_order_id"] : null;
        if (!orderId) {
          console.error(`stripe-webhook: event ${event.id} has no pitcall_order_id metadata`);
          return new Response("ignored", { status: 200 });
        }

        const paymentStatus = obj["payment_status"] ?? obj["status"];
        const paid = paymentStatus === "paid" || paymentStatus === "succeeded" || paymentStatus === "no_payment_required";
        if (!paid) {
          console.error(`stripe-webhook: event ${event.id} not paid (${String(paymentStatus)})`);
          return new Response("ignored", { status: 200 });
        }

        const paymentId =
          (typeof obj["payment_intent"] === "string" && obj["payment_intent"]) ||
          (typeof obj["id"] === "string" && obj["id"]) ||
          null;
        const amount = obj["amount_total"] ?? obj["amount_received"] ?? obj["amount"];
        const currency = typeof obj["currency"] === "string" ? obj["currency"].toUpperCase() : null;

        if (!paymentId || typeof amount !== "number" || currency !== "EUR") {
          console.error(`stripe-webhook: event ${event.id} failed basic coherence checks`);
          return new Response("ignored", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("confirm_token_order_payment", {
          _order_id: orderId,
          _provider: "stripe",
          _provider_mode: "test",
          _provider_event_id: event.id,
          _event_type: event.type,
          _provider_payment_id: paymentId,
          _amount_collected_cents: amount,
          _tax_amount_cents: (obj["total_details"] as { amount_tax?: number } | undefined)?.amount_tax ?? 0,
          _payload: JSON.parse(body) as unknown as import("@/integrations/supabase/types").Json,
        });

        if (error) {
          console.error(`stripe-webhook: confirm failed for ${orderId}: ${error.message}`);
          // 500 lets Stripe retry; the RPC is replay-safe.
          return new Response("processing error", { status: 500 });
        }

        return Response.json({ received: true, result: data });
      },
    },
  },
});

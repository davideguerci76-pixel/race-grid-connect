import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logAdminAction } from "@/lib/admin-helpers";

// ---------------------------------------------------------------------------
// STEP S2.B — Token package authority.
// Authoritative economic terms live in public.token_packages (price_cents is the
// TAX-EXCLUSIVE base commercial price). platform_settings.token_price_eur stays a
// nominal reference used ONLY for derived display values and coherence reporting;
// it never rewrites price_cents.
// No purchase flow, no payment provider, no tax logic in this module.
// ---------------------------------------------------------------------------

const CODE_RE = /^[a-z0-9_]{3,40}$/;

export type TokenPackageDisplay = {
  code: string;
  label_key: string;
  token_quantity: number;
  discount_pct: number;
  price_cents: number;
  currency: "EUR";
  sort_order: number;
  version: number;
  // derived, server-computed (display only)
  reference_price_cents: number;
  savings_cents: number;
  effective_price_per_token_cents: number;
  expected_price_cents: number;
  coherent_with_reference: boolean;
};

async function referenceTokenPriceCents(supabase: any): Promise<number> {
  const { data } = await supabase
    .from("platform_settings")
    .select("value_num")
    .eq("key", "token_price_eur")
    .maybeSingle();
  const eur = Number(data?.value_num ?? 2);
  return Math.round(eur * 100);
}

/**
 * ECONOMIC CONSISTENCY LAW (server authority, mirrored by a DB trigger):
 *   expected_price_cents = ROUND(nominal_token_price_cents * token_quantity * (100 - discount_pct) / 100)
 * All arithmetic in integer cents. A package whose price_cents differs from
 * expected_price_cents cannot be written.
 */
export function expectedPriceCents(refCents: number, qty: number, discountPct: number): number {
  return Math.round((refCents * qty * (100 - discountPct)) / 100);
}

function derive(row: any, refCents: number): TokenPackageDisplay {
  const qty = Number(row.token_quantity);
  const price = Number(row.price_cents);
  const discount = Number(row.discount_pct);
  const reference = refCents * qty;
  const expected = expectedPriceCents(refCents, qty, discount);
  return {
    code: row.code,
    label_key: row.label_key,
    token_quantity: qty,
    discount_pct: discount,
    price_cents: price,
    currency: row.currency,
    sort_order: Number(row.sort_order),
    version: Number(row.version),
    reference_price_cents: reference,
    savings_cents: Math.max(0, reference - price),
    effective_price_per_token_cents: Math.round(price / qty),
    expected_price_cents: expected,
    coherent_with_reference: expected === price,
  };
}

function assertCoherent(refCents: number, qty: number, discountPct: number, priceCents: number) {
  const expected = expectedPriceCents(refCents, qty, discountPct);
  if (expected !== priceCents) {
    throw new Error(
      `economic_incoherence: ${qty} tokens at ${discountPct}% discount must cost ${(expected / 100).toFixed(2)} EUR (received ${(priceCents / 100).toFixed(2)} EUR)`,
    );
  }
}


/** Authenticated read of active packages, economic terms resolved server-side. */
export const listTokenPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TokenPackageDisplay[]> => {
    const [{ data, error }, refCents] = await Promise.all([
      context.supabase
        .from("token_packages")
        .select("code, label_key, token_quantity, discount_pct, price_cents, currency, sort_order, version")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      referenceTokenPriceCents(context.supabase),
    ]);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => derive(r, refCents));
  });

/** Admin view: includes inactive packages plus coherence reporting. */
export const adminListTokenPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const refCents = await referenceTokenPriceCents(supabaseAdmin);
    const { data, error } = await supabaseAdmin
      .from("token_packages")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      ...derive(r, refCents),
      id: r.id,
      is_active: r.is_active,
      updated_at: r.updated_at,
      updated_by: r.updated_by,
    }));
  });

const economicFields = {
  token_quantity: z.number().int().positive().max(100_000),
  discount_pct: z.number().min(0).max(100),
  price_cents: z.number().int().positive().max(100_000_000),
  currency: z.literal("EUR"),
};

export const adminCreateTokenPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        code: z.string().regex(CODE_RE, "invalid_code"),
        label_key: z.string().min(1).max(120),
        sort_order: z.number().int().min(0).max(10_000),
        is_active: z.boolean().default(true),
        ...economicFields,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const refCents = await referenceTokenPriceCents(supabaseAdmin);
    assertCoherent(refCents, data.token_quantity, data.discount_pct, data.price_cents);
    const { data: row, error } = await (supabaseAdmin.from("token_packages") as any)
      .insert({ ...data, version: 1, updated_by: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await logAdminAction(context.userId, null, "token_package_create", {
      code: row.code,
      before: null,
      after: {
        token_quantity: row.token_quantity,
        price_cents: row.price_cents,
        discount_pct: Number(row.discount_pct),
        currency: row.currency,
        is_active: row.is_active,
        version: row.version,
      },
    });
    return { ok: true, code: row.code, version: row.version };
  });

/** Optimistic-locking update: rejects stale writes instead of overwriting. */
export const adminUpdateTokenPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        code: z.string().regex(CODE_RE, "invalid_code"),
        expected_version: z.number().int().min(1),
        label_key: z.string().min(1).max(120).optional(),
        sort_order: z.number().int().min(0).max(10_000).optional(),
        is_active: z.boolean().optional(),
        token_quantity: economicFields.token_quantity.optional(),
        discount_pct: economicFields.discount_pct.optional(),
        price_cents: economicFields.price_cents.optional(),
        currency: economicFields.currency.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before, error: readErr } = await supabaseAdmin
      .from("token_packages")
      .select("*")
      .eq("code", data.code)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!before) throw new Error("token package not found");

    const { code, expected_version, ...patch } = data;
    const economicChanged = (["token_quantity", "price_cents", "discount_pct", "currency", "is_active"] as const).some(
      (k) => patch[k as keyof typeof patch] !== undefined && (patch as any)[k] !== (before as any)[k] &&
        !(typeof (patch as any)[k] === "number" && Number((patch as any)[k]) === Number((before as any)[k])),
    );

    const refCents = await referenceTokenPriceCents(supabaseAdmin);
    assertCoherent(
      refCents,
      Number(patch.token_quantity ?? (before as any).token_quantity),
      Number(patch.discount_pct ?? (before as any).discount_pct),
      Number(patch.price_cents ?? (before as any).price_cents),
    );

    const nextVersion = economicChanged ? Number((before as any).version) + 1 : Number((before as any).version);



    const { data: rows, error } = await (supabaseAdmin.from("token_packages") as any)
      .update({ ...patch, version: nextVersion, updated_by: context.userId })
      .eq("code", code)
      .eq("version", expected_version)
      .select("*");
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      // Expected concurrency outcome, not a fault: the write is rejected (no
      // overwrite, no merge, no retry) and reported as data so the ACP can show
      // a plain message instead of surfacing a runtime error.
      return {
        ok: false as const,
        conflict: "stale_version" as const,
        code,
        current_version: Number((before as any).version),
        expected_version,
      };
    }

    const after = rows[0];

    if (economicChanged) {
      await logAdminAction(context.userId, null, "token_package_update", {
        code,
        before: {
          token_quantity: (before as any).token_quantity,
          price_cents: (before as any).price_cents,
          discount_pct: Number((before as any).discount_pct),
          currency: (before as any).currency,
          is_active: (before as any).is_active,
          version: (before as any).version,
        },
        after: {
          token_quantity: after.token_quantity,
          price_cents: after.price_cents,
          discount_pct: Number(after.discount_pct),
          currency: after.currency,
          is_active: after.is_active,
          version: after.version,
        },
        operation:
          (before as any).is_active !== after.is_active ? (after.is_active ? "activate" : "deactivate") : "update",
      });
    }

    return { ok: true, code, version: after.version };
  });

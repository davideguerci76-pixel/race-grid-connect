import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logAdminAction } from "@/lib/admin-helpers";

// ---------------------------------------------------------------------------
// STEP S2.E — Token package authority with DERIVED discount.
// Modifiable authorities: platform_settings.token_price_eur (nominal price of 1
// token), token_packages.token_quantity, token_packages.price_cents (TAX-EXCLUSIVE
// base commercial price). Everything else (nominal package value, saving, discount
// percentage, effective price per token) is DERIVED server-side and never accepted
// as input. No purchase flow, no payment provider, no tax logic in this module.
// ---------------------------------------------------------------------------

const CODE_RE = /^[a-z0-9_]{3,40}$/;

export type TokenPackageDisplay = {
  code: string;
  label_key: string;
  token_quantity: number;
  price_cents: number;
  currency: "EUR";
  sort_order: number;
  version: number;
  // derived, server-computed (display only)
  nominal_token_price_cents: number;
  nominal_value_cents: number;
  savings_cents: number;
  discount_pct: number;
  effective_price_per_token_cents: number;
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
 * DERIVATION LAW (server authority; the DB mirrors discount_pct with the same rule):
 *   nominal_value_cents            = nominal_token_price_cents * token_quantity
 *   savings_cents                  = MAX(0, nominal_value_cents - price_cents)
 *   discount_pct                   = savings_cents / nominal_value_cents * 100, rounded
 *                                    HALF-UP to 2 decimals (display only)
 *   effective_price_per_token_cents = ROUND(price_cents / token_quantity)   [half-up]
 * All monetary arithmetic is done on integer cents; only the percentage is fractional.
 */
export function derivedDiscountPct(nominalValueCents: number, priceCents: number): number {
  if (nominalValueCents <= 0) return 0;
  const saving = nominalValueCents - priceCents;
  const pct = (saving / nominalValueCents) * 100;
  return Math.min(100, Math.max(0, Math.round(pct * 100) / 100));
}

function derive(row: any, refCents: number): TokenPackageDisplay {
  const qty = Number(row.token_quantity);
  const price = Number(row.price_cents);
  const nominal = refCents * qty;
  return {
    code: row.code,
    label_key: row.label_key,
    token_quantity: qty,
    price_cents: price,
    currency: row.currency,
    sort_order: Number(row.sort_order),
    version: Number(row.version),
    nominal_token_price_cents: refCents,
    nominal_value_cents: nominal,
    savings_cents: Math.max(0, nominal - price),
    discount_pct: derivedDiscountPct(nominal, price),
    effective_price_per_token_cents: qty > 0 ? Math.round(price / qty) : 0,
  };
}


/** Authenticated read of active packages, economic terms resolved server-side. */
export const listTokenPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TokenPackageDisplay[]> => {
    const [{ data, error }, refCents] = await Promise.all([
      context.supabase
        .from("token_packages")
        .select("code, label_key, token_quantity, price_cents, currency, sort_order, version")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      referenceTokenPriceCents(context.supabase),
    ]);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => derive(r, refCents));
  });

/** Admin view: includes inactive packages. */
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

// discount_pct is intentionally absent: it is derived, never an input.
const economicFields = {
  token_quantity: z.number().int().positive().max(100_000),
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
      // Unknown keys (notably a tampered discount_pct) are rejected outright.
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
        currency: row.currency,
        is_active: row.is_active,
        label_key: row.label_key,
        sort_order: row.sort_order,
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
        price_cents: economicFields.price_cents.optional(),
        currency: economicFields.currency.optional(),
      })
      // discount_pct is derived: sending it is a protocol error, not a silent no-op.
      .strict()
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
    // ROW-LEVEL versioning: any persisted field change bumps version (S2.D F-1).
    const rowChanged = (
      ["token_quantity", "price_cents", "currency", "is_active", "label_key", "sort_order"] as const
    ).some((k) => {
      const next = (patch as any)[k];
      if (next === undefined) return false;
      const prev = (before as any)[k];
      if (typeof next === "number") return Number(next) !== Number(prev);
      return next !== prev;
    });

    const nextVersion = rowChanged ? Number((before as any).version) + 1 : Number((before as any).version);

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

    if (rowChanged) {
      await logAdminAction(context.userId, null, "token_package_update", {
        code,
        before: {
          token_quantity: (before as any).token_quantity,
          price_cents: (before as any).price_cents,
          currency: (before as any).currency,
          is_active: (before as any).is_active,
          label_key: (before as any).label_key,
          sort_order: (before as any).sort_order,
          version: (before as any).version,
        },
        after: {
          token_quantity: after.token_quantity,
          price_cents: after.price_cents,
          currency: after.currency,
          is_active: after.is_active,
          label_key: after.label_key,
          sort_order: after.sort_order,
          version: after.version,
        },
        operation:
          (before as any).is_active !== after.is_active ? (after.is_active ? "activate" : "deactivate") : "update",
      });
    }


    return { ok: true as const, code, version: after.version };
  });

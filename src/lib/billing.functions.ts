import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Billing details are a private administrative registry (name, address, tax id).
 * They are NOT a fiscal workflow: no VAT calculation, no invoicing, no SdI.
 * Authority: the owner reads/writes only their own row (RLS `user_id = auth.uid()`);
 * Admin reads them through the ACP with the existing admin authority.
 */

const billingSchema = z.object({
  subject_type: z.enum(["individual", "company"]),
  billing_name: z.string().trim().max(200).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  postal_code: z.string().trim().max(20).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  tax_id: z.string().trim().max(40).optional().nullable(),
  sdi_code: z.string().trim().max(16).optional().nullable(),
  pec: z.string().trim().max(160).optional().nullable(),
  billing_email: z.string().trim().max(160).optional().nullable(),
  billing_phone: z.string().trim().max(40).optional().nullable(),
});

export type BillingDetailsInput = z.infer<typeof billingSchema>;

const clean = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s.length ? s : null;
};

export const getMyBillingDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("billing_details")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const updateMyBillingDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => billingSchema.parse(data))
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      subject_type: data.subject_type,
      billing_name: clean(data.billing_name),
      country: clean(data.country),
      address: clean(data.address),
      city: clean(data.city),
      postal_code: clean(data.postal_code),
      region: clean(data.region),
      tax_id: clean(data.tax_id)?.toUpperCase() ?? null,
      sdi_code: clean(data.sdi_code)?.toUpperCase() ?? null,
      pec: clean(data.pec),
      billing_email: clean(data.billing_email),
      billing_phone: clean(data.billing_phone),
    };
    const { data: row, error } = await context.supabase
      .from("billing_details")
      .upsert(payload as never, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

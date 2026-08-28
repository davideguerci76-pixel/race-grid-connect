import { z } from "zod";

export async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export async function logAdminAction(admin_id: string, target_user_id: string | null, action: string, details: any = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_log").insert({ admin_id, target_user_id, action, details } as never);
}

export const freelancerPatch = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().trim().max(120).optional(),
  first_name: z.string().trim().max(80).nullable().optional(),
  last_name: z.string().trim().max(80).nullable().optional(),
  token_balance: z.number().int().min(0).max(1_000_000).optional(),
  headline: z.string().trim().max(200).nullable().optional(),
  role_group: z.string().trim().max(80).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  day_rate: z.number().int().min(0).max(1_000_000).nullable().optional(),
  currency: z.string().trim().max(8).optional(),
  disciplines: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  education: z.string().trim().max(400).nullable().optional(),
  years_experience: z.number().int().min(0).max(80).nullable().optional(),
  bio: z.string().trim().max(4000).nullable().optional(),
  phone_dial_code: z.string().trim().max(8).nullable().optional(),
  phone_number: z.string().trim().max(40).nullable().optional(),
});

export const teamPatch = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().trim().max(120).optional(),
  token_balance: z.number().int().min(0).max(1_000_000).optional(),
  team_name: z.string().trim().max(160).optional(),
  team_type: z.string().trim().max(80).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  primary_discipline: z.string().trim().max(80).nullable().optional(),
  website: z.string().trim().max(300).nullable().optional(),
  vat_number: z.string().trim().max(60).nullable().optional(),
  size: z.string().trim().max(60).nullable().optional(),
  founded_year: z.number().int().min(1800).max(2200).nullable().optional(),
  bio: z.string().trim().max(4000).nullable().optional(),
});


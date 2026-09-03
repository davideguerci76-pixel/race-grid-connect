import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROFILE_COLUMNS =
  "user_id, role, headline, disciplines, travels, location, bio, skills, years_experience, updated_at, education, experiences, languages, calendar_last_updated_at, calendar_last_confirmed_at, role_group, sub_roles, location_city, location_region, location_country, location_place_id, is_test";

/** Authenticated profile view; the database read is kept behind the server boundary. */
export const getFreelancerProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { user_id: string }) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: envTest, error: envError } = await (context.supabase.rpc as any)("env_is_test");
    if (envError) throw new Error(envError.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profile, error: profileError }, { data: availability, error: availabilityError }] = await Promise.all([
      supabaseAdmin
        .from("freelancer_profiles")
        .select(PROFILE_COLUMNS)
        .eq("user_id", data.user_id)
        .eq("is_test", Boolean(envTest))
        .maybeSingle(),
      supabaseAdmin
        .from("availability")
        .select("day")
        .eq("freelancer_id", data.user_id)
        .eq("is_test", Boolean(envTest))
        .gte("day", new Date().toISOString().slice(0, 10))
        .limit(60),
    ]);
    if (profileError) throw new Error(profileError.message);
    if (availabilityError) throw new Error(availabilityError.message);
    return { profile: profile as any, availability: availability ?? [] };
  });

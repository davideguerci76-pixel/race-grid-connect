// Server-only helper: resolves which environment (LIVE / TEST) an admin is currently working in.
export async function currentAdminEnv(admin: any, userId: string): Promise<boolean> {
  const { data } = await admin
    .from("admin_env_state")
    .select("is_test")
    .eq("admin_id", userId)
    .maybeSingle();
  return !!data?.is_test;
}

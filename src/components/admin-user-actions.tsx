import { confirmDialog } from "@/hooks/use-confirm";
import { toastError } from "@/lib/errors";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  Eye,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  UserRound,
  X,
  Lock,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import {
  adminDeleteUser,
  adminForceLogout,
  adminGetUserCalendar,
  adminGetUserDetail,
  adminImpersonateUser,
  adminListAuditLog,
  adminSendPasswordReset,
  adminSetBlocked,
} from "@/lib/admin.functions";

function dateOf(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function AdminUserActions({
  userId,
  name,
  blocked,
  protectedAccount = false,
  invalidateKey,
}: {
  userId: string;
  name: string;
  blocked: boolean;
  protectedAccount?: boolean;
  invalidateKey: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [panel, setPanel] = useState<null | "profile" | "calendar">(null);
  const [busy, setBusy] = useState<string | null>(null);

  const setBlockedFn = useServerFn(adminSetBlocked);
  const deleteFn = useServerFn(adminDeleteUser);
  const resetFn = useServerFn(adminSendPasswordReset);
  const logoutFn = useServerFn(adminForceLogout);
  const impersonateFn = useServerFn(adminImpersonateUser);

  async function run(key: string, fn: () => Promise<any>, successMsg: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(successMsg);
      qc.invalidateQueries({ queryKey: [invalidateKey] });
    } catch (e: any) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  }

  const onSuspend = () =>
    await confirmDialog(t("admin_user_actions.confirm_suspend", { defaultValue: "Suspend {{name}}? The account will not be able to sign in.", name })) &&
    run("suspend", () => setBlockedFn({ data: { user_id: userId, blocked: true } }), t("admin_user_actions.suspended", { defaultValue: "Account suspended" }));

  const onReactivate = () =>
    run("reactivate", () => setBlockedFn({ data: { user_id: userId, blocked: false } }), t("admin_user_actions.reactivated", { defaultValue: "Account reactivated" }));

  const onDelete = () =>
    await confirmDialog(t("admin_user_actions.confirm_delete", { defaultValue: "Permanently delete {{name}} and all related data? This cannot be undone.", name })) &&
    run("delete", () => deleteFn({ data: { user_id: userId } }), t("admin_user_actions.deleted", { defaultValue: "User deleted" }));

  const onReset = () =>
    run(
      "reset",
      () => resetFn({ data: { user_id: userId, redirect_to: `${window.location.origin}/reset-password` } }),
      t("admin_user_actions.reset_sent", { defaultValue: "Password reset email sent" }),
    );

  const onForceLogout = () =>
    await confirmDialog(t("admin_user_actions.confirm_logout", { defaultValue: "Revoke all active sessions for {{name}}?", name })) &&
    run("logout", () => logoutFn({ data: { user_id: userId } }), t("admin_user_actions.logged_out", { defaultValue: "All sessions revoked" }));

  async function onImpersonate() {
    if (
      !await confirmDialog(
        t("admin_user_actions.confirm_impersonate", {
          defaultValue:
            "Sign in as {{name}}? This action is recorded in the audit log and will replace your current session in the new tab.",
          name,
        }),
      )
    )
      return;
    setBusy("impersonate");
    try {
      const res: any = await impersonateFn({ data: { user_id: userId, redirect_to: `${window.location.origin}/dashboard` } });
      window.open(res.url, "_blank", "noopener");
      toast.success(t("admin_user_actions.impersonating", { defaultValue: "Impersonation session opened in a new tab" }));
    } catch (e: any) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  }

  const item = "flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center gap-1 border border-border px-2 py-1 text-[10px] font-bold uppercase hover:bg-secondary">
            {busy ? <Loader2 className="size-3 animate-spin" /> : <MoreHorizontal className="size-3" />}
            {t("admin_user_actions.manage", { defaultValue: "Manage" })}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-widest text-racing-red">{name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={item} onSelect={() => setPanel("profile")}>
            <UserRound className="size-3.5" /> {t("admin_user_actions.view_profile", { defaultValue: "View profile" })}
          </DropdownMenuItem>
          <DropdownMenuItem className={item} onSelect={() => setPanel("calendar")}>
            <CalendarDays className="size-3.5" /> {t("admin_user_actions.view_calendar", { defaultValue: "View calendar" })}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={item} onSelect={onReset}>
            <Mail className="size-3.5" /> {t("admin_user_actions.send_reset", { defaultValue: "Send password reset" })}
          </DropdownMenuItem>
          <DropdownMenuItem className={item} onSelect={onForceLogout} disabled={protectedAccount}>
            <LogOut className="size-3.5" /> {t("admin_user_actions.force_logout", { defaultValue: "Force logout" })}
          </DropdownMenuItem>
          <DropdownMenuItem className={item} onSelect={onImpersonate} disabled={protectedAccount}>
            <Eye className="size-3.5" /> {t("admin_user_actions.impersonate", { defaultValue: "Login as user" })}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {blocked ? (
            <DropdownMenuItem className={`${item} text-emerald-500`} onSelect={onReactivate} disabled={protectedAccount}>
              <RotateCcw className="size-3.5" /> {t("admin_user_actions.reactivate", { defaultValue: "Reactivate" })}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className={item} onSelect={onSuspend} disabled={protectedAccount}>
              <Lock className="size-3.5" /> {t("admin_user_actions.suspend", { defaultValue: "Suspend" })}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className={`${item} text-racing-red`} onSelect={onDelete} disabled={protectedAccount}>
            <Trash2 className="size-3.5" /> {t("admin_user_actions.delete", { defaultValue: "Delete" })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {panel === "profile" && <ProfileModal userId={userId} onClose={() => setPanel(null)} />}
      {panel === "calendar" && <CalendarModal userId={userId} onClose={() => setPanel(null)} />}
    </>
  );
}

function Shell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/70 p-4" onClick={onClose}>
      <div className="mt-10 w-full max-w-4xl border border-border bg-card p-5 text-left" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-racing-red">{subtitle ?? "ADMIN"}</div>
            <h2 className="text-xl font-black uppercase italic tracking-tighter">{title}</h2>
          </div>
          <button onClick={onClose} className="border border-border p-1 hover:bg-secondary">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  const display =
    value == null || value === "" ? "—" : Array.isArray(value) ? (value.length ? value.join(", ") : "—") : typeof value === "object" ? JSON.stringify(value) : String(value);
  return (
    <div className="border border-border/60 p-2">
      <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words text-xs">{display}</div>
    </div>
  );
}

function ProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const detailFn = useServerFn(adminGetUserDetail);
  const auditFn = useServerFn(adminListAuditLog);
  const { data, isLoading } = useQuery({ queryKey: ["admin-user-detail", userId], queryFn: () => detailFn({ data: { user_id: userId } }) });
  const { data: audit } = useQuery({ queryKey: ["admin-user-audit", userId], queryFn: () => auditFn({ data: { user_id: userId } }) });
  const d: any = data;

  return (
    <Shell
      title={d?.profile?.display_name ?? "…"}
      subtitle={t("admin_user_actions.view_profile", { defaultValue: "View profile" })}
      onClose={onClose}
    >
      {isLoading || !d ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow">Account</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Email" value={d.auth?.email} />
              <Field label="Type" value={d.profile.user_type} />
              <Field label="Status" value={d.profile.blocked_at ? "Suspended" : "Active"} />
              <Field label="Tokens" value={d.profile.token_balance} />
              <Field label="Roles" value={d.roles} />
              <Field label="Language" value={d.profile.preferred_language} />
              <Field label="Email confirmed" value={d.auth?.email_confirmed_at} />
              <Field label="Last sign-in" value={d.auth?.last_sign_in_at} />
              <Field label="Registered" value={d.profile.created_at} />
            </div>
          </section>

          {d.freelancer && (
            <section>
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow">Professional</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Pit code" value={d.freelancer.pit_code} />
                <Field label="First name" value={d.profile.first_name} />
                <Field label="Last name" value={d.profile.last_name} />
                <Field label="Macro role" value={d.freelancer.role_group} />
                <Field label="Sub roles" value={d.freelancer.sub_roles} />
                <Field label="Headline" value={d.freelancer.headline} />
                <Field label="Disciplines" value={d.freelancer.disciplines} />
                <Field label="Skills" value={d.freelancer.skills} />
                <Field label="Languages" value={d.freelancer.languages} />
                <Field label="Day rate" value={d.freelancer.day_rate ? `${d.freelancer.currency ?? ""} ${d.freelancer.day_rate}` : null} />
                <Field label="Experience (yrs)" value={d.freelancer.years_experience} />
                <Field label="Travels" value={String(d.freelancer.travels)} />
                <Field label="Location" value={d.freelancer.location} />
                <Field label="Education" value={d.freelancer.education} />
                <Field label="Phone" value={d.contact?.phone_number ? `${d.contact.phone_dial_code ?? ""} ${d.contact.phone_number}` : null} />
                <Field label="Calendar updated" value={d.freelancer.calendar_last_updated_at} />
              </div>
              {d.freelancer.bio && <div className="mt-2 border border-border/60 p-2 text-xs">{d.freelancer.bio}</div>}
            </section>
          )}

          {d.team && (
            <section>
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow">Team</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Team name" value={d.team.team_name} />
                <Field label="VAT number" value={d.team.vat_number} />
                <Field label="Type" value={d.team.team_type} />
                <Field label="Primary discipline" value={d.team.primary_discipline} />
                <Field label="Size" value={d.team.size} />
                <Field label="Founded" value={d.team.founded_year} />
                <Field label="Location" value={d.team.location} />
                <Field label="Website" value={d.team.website} />
              </div>
              {d.team.bio && <div className="mt-2 border border-border/60 p-2 text-xs">{d.team.bio}</div>}
            </section>
          )}

          <section>
            <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-racing-yellow">
              {t("admin_user_actions.audit", { defaultValue: "Admin action log" })}
            </h3>
            {!audit || (audit as any[]).length === 0 ? (
              <div className="border border-dashed border-border p-4 text-center text-xs text-muted-foreground">—</div>
            ) : (
              <div className="space-y-1">
                {(audit as any[]).map((a) => (
                  <div key={a.id} className="flex items-center justify-between border border-border/60 px-2 py-1 text-[11px]">
                    <span className="font-mono uppercase text-racing-red">{a.action}</span>
                    <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}

function CalendarModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const calFn = useServerFn(adminGetUserCalendar);
  const { data, isLoading } = useQuery({ queryKey: ["admin-user-calendar", userId], queryFn: () => calFn({ data: { user_id: userId } }) });
  const d: any = data;

  const engagedDays: Date[] = [];
  for (const e of (d?.engagements ?? []) as any[]) {
    if (e.status === "cancelled") continue;
    const start = dateOf(e.start_date);
    const end = dateOf(e.end_date);
    for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) engagedDays.push(new Date(cur));
  }

  return (
    <Shell
      title={d?.display_name ?? "…"}
      subtitle={t("admin_user_actions.view_calendar", { defaultValue: "View calendar" })}
      onClose={onClose}
    >
      {isLoading || !d ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-4">
          {d.user_type === "freelancer" ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Available days" value={d.days.length} />
                <Field label="Engaged days" value={engagedDays.length} />
                <Field label="Calendar updated" value={d.calendar_last_updated_at} />
              </div>
              <div className="pointer-events-none opacity-95">
                <AvailabilityCalendar
                  selected={(d.days as string[]).map(dateOf)}
                  onSelect={() => {}}
                  disabled={() => true}
                  showBulkActions={false}
                  blocked={engagedDays}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Pit Calls & engagements</div>
              {(d.requests ?? []).length === 0 && engagedDays.length === 0 ? (
                <div className="border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No dated activity yet.</div>
              ) : (
                <div className="space-y-1">
                  {(d.requests ?? []).map((r: any) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border border-border/60 px-2 py-1 text-xs">
                      <span className="font-bold uppercase">{r.title}</span>
                      <span className="font-mono text-muted-foreground">
                        {r.season_dates?.length ? `${r.season_dates.length} season days` : `${r.start_date} → ${r.end_date}`}
                      </span>
                      <span className="font-mono text-[10px] uppercase text-racing-red">{r.status}</span>
                    </div>
                  ))}
                  {(d.engagements ?? []).map((e: any) => (
                    <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 border border-emerald-500/40 px-2 py-1 text-xs">
                      <span className="font-bold uppercase">Engagement</span>
                      <span className="font-mono text-muted-foreground">
                        {e.start_date} → {e.end_date}
                      </span>
                      <span className="font-mono text-[10px] uppercase text-emerald-500">{e.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <KeyRound className="size-3" /> read-only view
            </span>
          </div>
        </div>
      )}
    </Shell>
  );
}

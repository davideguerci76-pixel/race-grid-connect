import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount, exportMyData } from "@/lib/privacy.functions";
import { openCookiePreferences } from "@/lib/iubenda";
import { PRIVACY_EMAIL } from "@/config/iubenda";

export function PrivacyDataSection() {
  const { t } = useTranslation();
  const runExport = useServerFn(exportMyData);
  const runDelete = useServerFn(deleteMyAccount);
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);

  async function handleExport() {
    setBusy("export");
    try {
      const data = await runExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pitcall-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("privacy.export_done", { defaultValue: "Your data export has been downloaded." }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setBusy("delete");
    try {
      await runDelete({ data: { confirm: "DELETE" } });
      await supabase.auth.signOut();
      toast.success(t("privacy.delete_done", { defaultValue: "Your account has been deleted." }));
      window.location.href = "/";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Deletion failed";
      toast.error(
        msg.includes("ACTIVE_ENGAGEMENTS")
          ? t("privacy.delete_blocked", {
              defaultValue: "You still have active engagements. Close or cancel them before deleting your account.",
            })
          : msg,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border border-border bg-card p-6">
      <h2 className="font-mono text-xs uppercase tracking-widest text-racing-red">
        {t("privacy.section_title", { defaultValue: "Privacy and data" })}
      </h2>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        {t("privacy.section_desc", {
          defaultValue:
            "You control your data. Download everything Pit Call stores about you, manage your cookie preferences, or permanently delete your account.",
        })}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={busy !== null}
          className="border border-border px-5 py-3 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-secondary disabled:opacity-60"
        >
          {t("privacy.export", { defaultValue: "Export my data" })}
        </button>
        <button
          type="button"
          onClick={openCookiePreferences}
          className="border border-border px-5 py-3 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-secondary"
        >
          {t("consent.preferences", { defaultValue: "Cookie preferences" })}
        </button>
        <Link
          to="/legal/$doc"
          params={{ doc: "privacy" }}
          className="border border-border px-5 py-3 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-secondary"
        >
          {t("footer.privacy")}
        </Link>
      </div>

      <div className="mt-8 border border-destructive/40 bg-destructive/5 p-5">
        <div className="font-mono text-[10px] uppercase tracking-widest text-destructive">
          {t("privacy.danger_zone", { defaultValue: "Danger zone" })}
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {t("privacy.delete_desc", {
            defaultValue:
              "Deleting your account removes your profile, contacts, availability and calendars. Ratings you wrote about others stay on the platform without your free text. Unused tokens are forfeited. This cannot be undone.",
          })}
        </p>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-4 border border-destructive px-5 py-3 text-xs font-bold uppercase tracking-widest text-destructive transition-colors hover:bg-destructive hover:text-white"
          >
            {t("privacy.delete_account", { defaultValue: "Delete my account" })}
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="label-mono block">
              {t("privacy.delete_confirm_label", { defaultValue: "Type DELETE to confirm" })}
            </label>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full max-w-xs border border-border bg-background px-4 py-3 font-mono uppercase focus:border-racing-red focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={confirm.trim().toUpperCase() !== "DELETE" || busy !== null}
                onClick={handleDelete}
                className="bg-destructive px-5 py-3 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-50"
              >
                {t("privacy.delete_confirm", { defaultValue: "Permanently delete" })}
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setConfirm(""); }}
                className="border border-border px-5 py-3 text-xs font-bold uppercase tracking-widest hover:bg-secondary"
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("privacy.contact", { defaultValue: "Data requests" })}: {PRIVACY_EMAIL}
      </p>
    </div>
  );
}

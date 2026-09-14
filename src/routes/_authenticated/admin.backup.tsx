import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/backup")({
  component: AdminBackup,
});

const MIN_LEN = 12;
const REAUTH_WINDOW_S = 300;

type Step = "idle" | "warning" | "reauth" | "password" | "confirm" | "running" | "done";

type Amr = { method?: string; timestamp?: number }[];

/** Client-side hint only — the server is the authority. */
function reauthAgeFromToken(accessToken: string | undefined): number | null {
  if (!accessToken) return null;
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    const amr = payload.amr as Amr | undefined;
    if (!Array.isArray(amr) || !amr.length) return null;
    const latest = Math.max(...amr.map((a) => a.timestamp ?? 0));
    return latest ? Math.floor(Date.now() / 1000) - latest : null;
  } catch {
    return null;
  }
}

function strength(pw: string): { label: string; tone: string } {
  if (pw.length < MIN_LEN) return { label: `Too short (min ${MIN_LEN})`, tone: "text-racing-red" };
  if (pw.length < 16) return { label: "Acceptable", tone: "text-amber-500" };
  if (pw.length < 24) return { label: "Strong", tone: "text-emerald-500" };
  return { label: "Very strong passphrase", tone: "text-emerald-500" };
}

const ERROR_COPY: Record<string, string> = {
  UNAUTHENTICATED: "Your session is not valid. Sign in again.",
  FORBIDDEN: "Admin role required.",
  NO_REAUTH_EVIDENCE: "Your session carries no recent re-authentication evidence. Sign in again and retry within 5 minutes.",
  REAUTH_STALE: "Re-authentication is older than 5 minutes. Sign in again and retry.",
  BACKUP_PASSWORD_TOO_SHORT: `Backup password must be at least ${MIN_LEN} characters.`,
  BACKUP_VERIFY_FAILED: "The generated backup failed its own decrypt+verify check and was NOT delivered.",
  BACKUP_FAILED: "Backup generation failed. Nothing was delivered.",
};

function AdminBackup() {
  const { session, user } = useAuth();
  const [step, setStep] = useState<Step>("idle");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [ack, setAck] = useState(false);
  const [loginPw, setLoginPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ filename: string; sha256: string; bytes: number; datasets: string } | null>(null);
  const [reauthAge, setReauthAge] = useState<number | null>(null);

  const providers: string[] = (user?.app_metadata?.providers as string[] | undefined) ?? (user?.app_metadata?.provider ? [user.app_metadata.provider as string] : []);
  const hasGoogle = providers.includes("google") || providers.length === 0;
  const hasEmail = providers.includes("email") || providers.length === 0;
  const s = useMemo(() => strength(pw), [pw]);
  const pwOk = pw.length >= MIN_LEN && pw === pw2;

  useEffect(() => {
    setReauthAge(reauthAgeFromToken(session?.access_token));
  }, [session?.access_token]);

  const reset = () => {
    setPw(""); setPw2(""); setLoginPw(""); setAck(false); setBusy(false); setStep("idle");
  };

  const refreshReauth = async () => {
    const { data } = await supabase.auth.getSession();
    const age = reauthAgeFromToken(data.session?.access_token);
    setReauthAge(age);
    return age;
  };

  const reauthGoogle = async () => {
    setBusy(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if ((r as any)?.error) throw (r as any).error;
      if ((r as any)?.redirected) return; // full-page flow: come back to Admin → Backup within 5 minutes
      const age = await refreshReauth();
      if (age !== null && age <= REAUTH_WINDOW_S) setStep("password");
      else toast.error("Re-authentication could not be confirmed. Try again.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const reauthPassword = async () => {
    if (!user?.email) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: loginPw });
      setLoginPw("");
      if (error) throw error;
      const age = await refreshReauth();
      if (age !== null && age <= REAUTH_WINDOW_S) setStep("password");
      else toast.error("Re-authentication could not be confirmed. Try again.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    setStep("running");
    setBusy(true);
    const password = pw;
    setPw(""); setPw2("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("UNAUTHENTICATED");
      const res = await fetch("/api/admin/backup-all", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ backup_password: password }),
      });
      if (!res.ok) {
        let code = "BACKUP_FAILED";
        try { code = ((await res.json()) as { error?: string }).error ?? code; } catch { /* binary/no body */ }
        throw new Error(code);
      }
      const blob = await res.blob();
      const filename = res.headers.get("x-pitcall-backup-filename") ?? "pitcall-backup-live.pitbackup";
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      setResult({ filename, sha256: res.headers.get("x-pitcall-backup-sha256") ?? "", bytes: blob.size, datasets: res.headers.get("x-pitcall-backup-datasets") ?? "?" });
      setStep("done");
    } catch (e) {
      const code = e instanceof Error ? e.message : "BACKUP_FAILED";
      toast.error(ERROR_COPY[code] ?? `Backup failed (${code})`);
      setStep("idle");
    } finally {
      setBusy(false);
    }
  };

  const open = step !== "idle";

  return (
    <div className="max-w-3xl space-y-6">
      <div className="border border-border p-5">
        <div className="text-[11px] font-bold uppercase tracking-widest text-racing-red">Disaster recovery</div>
        <h2 className="text-xl font-black italic tracking-tighter">Backup All (LIVE)</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Generates one encrypted PITCALL package containing the complete LIVE business data, a snapshot of the real database
          architecture and an integrity manifest. The Admin TEST/LIVE switch has no effect: this backup is always LIVE-only and read-only.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Requires a valid Admin role and a re-authentication not older than 5 minutes (checked server-side).</li>
          <li>Encrypted with a backup password you choose for this file only — scrypt + AES-256-GCM.</li>
          <li>PITCALL does not store this backup password. If you lose it, this backup cannot be recovered.</li>
          <li>Secrets, API keys, passwords and session tokens are never included.</li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => setStep("warning")} className="bg-racing-red text-white hover:brightness-110">
            BACKUP ALL (LIVE)
          </Button>
          <span className="text-xs text-muted-foreground">
            Re-auth status: {reauthAge === null ? "no evidence in session" : reauthAge <= REAUTH_WINDOW_S ? `fresh (${reauthAge}s ago)` : `stale (${Math.round(reauthAge / 60)} min ago)`}
          </span>
        </div>
      </div>

      {result && (
        <div className="border border-emerald-600/40 bg-emerald-500/5 p-5 text-sm">
          <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-500">Backup delivered</div>
          <div className="mt-2 font-mono text-xs break-all">{result.filename}</div>
          <div className="mt-1 text-xs text-muted-foreground">{(result.bytes / 1024).toFixed(1)} KB · {result.datasets} datasets · SHA-256</div>
          <div className="font-mono text-[11px] break-all">{result.sha256}</div>
          <p className="mt-3 text-xs">
            This backup contains sensitive PITCALL business and user data. Store the encrypted backup and its password securely and separately.
          </p>
        </div>
      )}

      <OpsLogExportCard />

      <Dialog open={open} onOpenChange={(o) => { if (!o && step !== "running") reset(); }}>
        <DialogContent className="sm:max-w-lg">
          {step === "warning" && (
            <>
              <DialogHeader>
                <DialogTitle className="uppercase tracking-tight">Security warning</DialogTitle>
                <DialogDescription>
                  This backup contains sensitive PITCALL business and user data. Store the encrypted backup and its password securely and separately.
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                You will be asked to re-authenticate, then to choose a backup password. The file is encrypted before download and is unusable without that password.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={reset}>Cancel</Button>
                <Button onClick={() => setStep(reauthAge !== null && reauthAge <= REAUTH_WINDOW_S ? "password" : "reauth")}>Continue</Button>
              </DialogFooter>
            </>
          )}

          {step === "reauth" && (
            <>
              <DialogHeader>
                <DialogTitle className="uppercase tracking-tight">Re-authentication required</DialogTitle>
                <DialogDescription>Confirm your identity again. The server accepts a backup request only within 5 minutes of a fresh sign-in.</DialogDescription>
              </DialogHeader>
              {hasGoogle && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">If a full page sign-in opens, come back to Admin → Backup within 5 minutes.</p>
                  <Button onClick={reauthGoogle} disabled={busy} className="w-full">Re-authenticate with Google</Button>
                </div>
              )}
              {hasEmail && (
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void reauthPassword(); }}>
                  <Label htmlFor="reauth-pw">Account password for {user?.email}</Label>
                  <Input id="reauth-pw" type="password" autoComplete="current-password" value={loginPw} onChange={(e) => setLoginPw(e.target.value)} />
                  <Button type="submit" disabled={busy || !loginPw} className="w-full">Re-authenticate</Button>
                </form>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={reset}>Cancel</Button>
              </DialogFooter>
            </>
          )}

          {step === "password" && (
            <>
              <DialogHeader>
                <DialogTitle className="uppercase tracking-tight">Backup password</DialogTitle>
                <DialogDescription>Choose a password or long passphrase for this backup only. Minimum {MIN_LEN} characters; longer is better.</DialogDescription>
              </DialogHeader>
              <form className="space-y-3" autoComplete="off" onSubmit={(e) => { e.preventDefault(); if (pwOk) setStep("confirm"); }}>
                <div className="space-y-1">
                  <Label htmlFor="bk-pw">Backup password</Label>
                  <Input id="bk-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
                  <div className={`text-xs ${s.tone}`}>{pw ? s.label : ""}</div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bk-pw2">Confirm backup password</Label>
                  <Input id="bk-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
                  {pw2 && pw !== pw2 && <div className="text-xs text-racing-red">Passwords do not match.</div>}
                </div>
                <div className="border border-racing-red/50 bg-racing-red/5 p-3 text-xs">
                  PITCALL does not store this backup password. If you lose it, this backup cannot be recovered. There is no "forgot backup password".
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
                  <Button type="submit" disabled={!pwOk}>Continue</Button>
                </DialogFooter>
              </form>
            </>
          )}

          {step === "confirm" && (
            <>
              <DialogHeader>
                <DialogTitle className="uppercase tracking-tight">Final confirmation</DialogTitle>
                <DialogDescription>Generate, encrypt and download the LIVE backup now?</DialogDescription>
              </DialogHeader>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>I understand that PITCALL does not store this backup password and that a lost password makes this backup unrecoverable. I will store the file and the password securely and separately.</span>
              </label>
              <DialogFooter>
                <Button variant="outline" onClick={reset}>Cancel</Button>
                <Button disabled={!ack} onClick={run} className="bg-racing-red text-white hover:brightness-110">Generate encrypted backup</Button>
              </DialogFooter>
            </>
          )}

          {step === "running" && (
            <>
              <DialogHeader>
                <DialogTitle className="uppercase tracking-tight">Generating…</DialogTitle>
                <DialogDescription>Exporting LIVE data, snapshotting the architecture, encrypting and verifying. Keep this page open.</DialogDescription>
              </DialogHeader>
            </>
          )}

          {step === "done" && (
            <>
              <DialogHeader>
                <DialogTitle className="uppercase tracking-tight">Backup downloaded</DialogTitle>
                <DialogDescription>The encrypted file was verified with your password before delivery. The password is no longer held anywhere in PITCALL.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={reset}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// OPS-MON-02 — Operational event log ("black box") export as readable TXT. Read-only, Admin-only (server-side).
function OpsLogExportCard() {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const [env, setEnv] = useState<"live" | "test">("live");
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("UNAUTHENTICATED");
      const qs = new URLSearchParams({ env, from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` });
      const res = await fetch(`/api/admin/ops-log?${qs}`, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) {
        let code = "EXPORT_FAILED";
        try { code = ((await res.json()) as { error?: string }).error ?? code; } catch { /* no body */ }
        throw new Error(code);
      }
      const blob = await res.blob();
      const filename = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `pitcall-ops-log-${env}.txt`;
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      toast.success(`Operational log exported (${(blob.size / 1024).toFixed(1)} KB)`);
    } catch (e) {
      const code = e instanceof Error ? e.message : "EXPORT_FAILED";
      toast.error(ERROR_COPY[code] ?? `Export failed (${code})`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border p-5">
      <div className="text-[11px] font-bold uppercase tracking-widest text-racing-red">Operational black box</div>
      <h2 className="text-xl font-black italic tracking-tighter">Operational event log export</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Append-only chronological record of what happened on the platform (registrations, Pit Calls, engagements, tokens, ratings,
        notifications, cron health, alerts). Exported as a readable TXT file for review or post-backup reconstruction. The LIVE log is also
        included in every Backup All package up to its snapshot time.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-xs">Environment</Label>
          <select value={env} onChange={(e) => setEnv(e.target.value as "live" | "test")} className="mt-1 h-9 w-full border border-border bg-background px-2 text-sm">
            <option value="live">LIVE</option>
            <option value="test">TEST</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">From (UTC)</Label>
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">To (UTC)</Label>
          <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="mt-1" />
        </div>
        <div className="flex items-end">
          <Button onClick={download} disabled={busy || !from || !to} variant="outline" className="w-full">
            {busy ? "Exporting…" : "EXPORT TXT"}
          </Button>
        </div>
      </div>
    </div>
  );
}

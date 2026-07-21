import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { adminListTeams, adminSetTokens, adminSetBlocked, adminDeleteUser } from "@/lib/admin.functions";
import { exportToExcel } from "@/lib/export-xlsx";

export const Route = createFileRoute("/_authenticated/admin/teams")({
  component: AdminTeams,
});

function AdminTeams() {
  const list = useServerFn(adminListTeams);
  const setTokens = useServerFn(adminSetTokens);
  const setBlocked = useServerFn(adminSetBlocked);
  const delUser = useServerFn(adminDeleteUser);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-teams"], queryFn: () => list() });
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((r: any) => {
      if (!s) return true;
      return [r.display_name, r.email, r.team?.team_name, r.team?.location, r.team?.primary_discipline]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(s));
    });
  }, [data, q]);

  async function onEditTokens(user_id: string, current: number) {
    const v = prompt("New token balance:", String(current));
    if (v == null) return;
    const n = parseInt(v);
    if (isNaN(n) || n < 0) return toast.error("Invalid number");
    try {
      await setTokens({ data: { user_id, balance: n } });
      toast.success("Tokens updated");
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function onToggleBlock(user_id: string, blocked: boolean) {
    if (!confirm(blocked ? "Unblock this user?" : "Block this user?")) return;
    try {
      await setBlocked({ data: { user_id, blocked: !blocked } });
      toast.success(blocked ? "Unblocked" : "Blocked");
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function onDelete(user_id: string, name: string) {
    if (!confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    try {
      await delUser({ data: { user_id } });
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search team, contact, email…"
          className="min-w-[220px] flex-1 border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={() =>
            exportToExcel("teams", "Teams", rows.map((r: any) => ({
              Team: r.team?.team_name ?? r.display_name,
              Contact: r.display_name,
              Email: r.email ?? "",
              Discipline: r.team?.primary_discipline ?? "",
              Location: r.team?.location ?? "",
              Website: r.team?.website ?? "",
              Tokens: r.token_balance,
              Status: r.blocked_at ? "Blocked" : "Active",
              Roles: (r.roles ?? []).join(", "),
              CreatedAt: r.created_at,
            })))
          }
          className="border border-border px-3 py-2 text-[11px] font-bold uppercase tracking-widest hover:bg-secondary"
        >
          Export to Excel
        </button>
        <div className="ml-auto text-xs text-muted-foreground self-center">{rows.length} teams</div>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-auto border border-border">
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="bg-secondary text-[10px] font-bold uppercase tracking-widest">
              <tr>
                <th className="px-2 py-2 text-left">Team</th>
                <th className="px-2 py-2 text-left">Contact</th>
                <th className="px-2 py-2 text-left">Email</th>
                <th className="px-2 py-2 text-left">Discipline</th>
                <th className="px-2 py-2 text-left">Location</th>
                <th className="px-2 py-2 text-left">Website</th>
                <th className="px-2 py-2 text-right">Tokens</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-border/60 hover:bg-secondary/40">
                  <td className="px-2 py-2 font-bold">{r.team?.team_name ?? r.display_name}</td>
                  <td className="px-2 py-2">{r.display_name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.email}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.team?.primary_discipline ?? "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.team?.location ?? "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.team?.website ?? "—"}</td>
                  <td className="px-2 py-2 text-right font-bold">{r.token_balance}</td>
                  <td className="px-2 py-2">
                    {r.blocked_at ? <span className="text-racing-red">Blocked</span> : <span className="text-emerald-500">Active</span>}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <a href={`/teams/${r.id}`} target="_blank" rel="noreferrer" className="border border-border px-2 py-1 text-[10px] font-bold uppercase hover:bg-secondary">View</a>
                      <button onClick={() => onEditTokens(r.id, r.token_balance)} className="border border-border px-2 py-1 text-[10px] font-bold uppercase hover:bg-secondary">Tokens</button>
                      {(r.email ?? "").toLowerCase() !== "davideguerci76@gmail.com" && (
                        <>
                          <button onClick={() => onToggleBlock(r.id, !!r.blocked_at)} className="border border-border px-2 py-1 text-[10px] font-bold uppercase hover:bg-secondary">
                            {r.blocked_at ? "Unblock" : "Block"}
                          </button>
                          <button onClick={() => onDelete(r.id, r.team?.team_name ?? r.display_name)} className="border border-racing-red px-2 py-1 text-[10px] font-bold uppercase text-racing-red hover:bg-racing-red/10">Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

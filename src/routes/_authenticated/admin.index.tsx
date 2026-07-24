import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  adminListFreelancers,
  adminSetTokens,
  adminSetBlocked,
  adminDeleteUser,
} from "@/lib/admin.functions";
import { exportToExcel } from "@/lib/export-xlsx";
import { useSort, Th } from "@/lib/use-sort";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminFreelancers,
});

function AdminFreelancers() {
  const list = useServerFn(adminListFreelancers);
  const setTokens = useServerFn(adminSetTokens);
  const setBlocked = useServerFn(adminSetBlocked);
  const delUser = useServerFn(adminDeleteUser);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-freelancers"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((r: any) => {
      if (role && r.freelancer?.role !== role) return false;
      if (!s) return true;
      return [r.display_name, r.email, r.freelancer?.role, r.freelancer?.location, ...(r.freelancer?.skills ?? [])]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(s));
    });
  }, [data, q, role]);

  const roles = useMemo(
    () => Array.from(new Set((data ?? []).map((r: any) => r.freelancer?.role).filter(Boolean))).sort(),
    [data],
  );

  const { sorted, toggle, indicator } = useSort<any>(rows);

  async function onEditTokens(user_id: string, current: number) {
    const v = prompt("New token balance:", String(current));
    if (v == null) return;
    const n = parseInt(v);
    if (isNaN(n) || n < 0) return toast.error("Invalid number");
    try {
      await setTokens({ data: { user_id, balance: n } });
      toast.success("Tokens updated");
      qc.invalidateQueries({ queryKey: ["admin-freelancers"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function onToggleBlock(user_id: string, blocked: boolean) {
    if (!confirm(blocked ? "Unblock this user?" : "Block this user?")) return;
    try {
      await setBlocked({ data: { user_id, blocked: !blocked } });
      toast.success(blocked ? "Unblocked" : "Blocked");
      qc.invalidateQueries({ queryKey: ["admin-freelancers"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function onDelete(user_id: string, name: string) {
    if (!confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    try {
      await delUser({ data: { user_id } });
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["admin-freelancers"] });
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
          placeholder="Search name, email, skill…"
          className="min-w-[220px] flex-1 border border-border bg-background px-3 py-2 text-sm"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="border border-border bg-background px-3 py-2 text-sm">
          <option value="">All roles</option>
          {roles.map((r: any) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button
          onClick={() =>
            exportToExcel("freelancers", "Freelancers", rows.map((r: any) => ({
              Name: r.display_name,
              Email: r.email ?? "",
              Role: r.freelancer?.role ?? "",
              Disciplines: (r.freelancer?.disciplines ?? []).join(", "),
              Skills: (r.freelancer?.skills ?? []).join(", "),
              Languages: (r.freelancer?.languages ?? []).map((l: any) => `${l.code === "other" ? (l.custom || "Other") : l.code}(${l.level})`).join(", "),
              Education: r.freelancer?.education ?? "",
              Location: r.freelancer?.location ?? "",
              Phone: r.freelancer?.phone_number ? `${r.freelancer?.phone_dial_code ?? ""} ${r.freelancer?.phone_number}`.trim() : "",
              DayRate: r.freelancer?.day_rate ?? "",
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
        <div className="ml-auto text-xs text-muted-foreground self-center">{rows.length} freelancers</div>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-auto border border-border">
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="bg-secondary text-[10px] font-bold uppercase tracking-widest">
              <tr>
                <Th onClick={() => toggle("display_name")} label={`Name${indicator("display_name")}`} />
                <Th onClick={() => toggle("email")} label={`Email${indicator("email")}`} />
                <Th onClick={() => toggle("freelancer.role")} label={`Role${indicator("freelancer.role")}`} />
                <Th onClick={() => toggle("freelancer.disciplines")} label={`Disciplines${indicator("freelancer.disciplines")}`} />
                <Th onClick={() => toggle("freelancer.skills")} label={`Skills${indicator("freelancer.skills")}`} />
                <Th onClick={() => toggle("freelancer.languages")} label={`Languages${indicator("freelancer.languages")}`} />
                <Th onClick={() => toggle("freelancer.location")} label={`Location${indicator("freelancer.location")}`} />
                <Th onClick={() => toggle("freelancer.phone_number")} label={`Phone${indicator("freelancer.phone_number")}`} />
                <Th onClick={() => toggle("freelancer.day_rate")} label={`Rate${indicator("freelancer.day_rate")}`} align="right" />
                <Th onClick={() => toggle("token_balance")} label={`Tokens${indicator("token_balance")}`} align="right" />
                <Th onClick={() => toggle("blocked_at")} label={`Status${indicator("blocked_at")}`} />
                <th className="px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r: any) => (
                <tr key={r.id} className="border-t border-border/60 hover:bg-secondary/40">
                  <td className="px-2 py-2">{r.display_name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.email}</td>
                  <td className="px-2 py-2">{r.freelancer?.role ?? "—"}</td>
                  <td className="px-2 py-2 text-muted-foreground">{(r.freelancer?.disciplines ?? []).join(", ")}</td>
                  <td className="px-2 py-2 text-muted-foreground">{(r.freelancer?.skills ?? []).slice(0, 5).join(", ")}{(r.freelancer?.skills ?? []).length > 5 ? "…" : ""}</td>
                  <td className="px-2 py-2 text-muted-foreground">{(r.freelancer?.languages ?? []).map((l: any) => `${l.code === "other" ? (l.custom || "Other") : l.code}(${l.level?.[0] ?? "?"})`).join(", ")}</td>
                  <td className="px-2 py-2 text-muted-foreground">{r.freelancer?.location ?? "—"}</td>
                  <td className="px-2 py-2 font-mono text-muted-foreground">{r.freelancer?.phone_number ? `${r.freelancer?.phone_dial_code ?? ""} ${r.freelancer?.phone_number}`.trim() : "—"}</td>
                  <td className="px-2 py-2 text-right">{r.freelancer?.day_rate ?? "—"}</td>
                  <td className="px-2 py-2 text-right font-bold">{r.token_balance}</td>
                  <td className="px-2 py-2">
                    {r.blocked_at ? (
                      <span className="text-racing-red">Blocked</span>
                    ) : (
                      <span className="text-emerald-500">Active</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <a
                        href={`/freelancers/${r.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="border border-border px-2 py-1 text-[10px] font-bold uppercase hover:bg-secondary"
                      >
                        View
                      </a>
                      <button onClick={() => onEditTokens(r.id, r.token_balance)} className="border border-border px-2 py-1 text-[10px] font-bold uppercase hover:bg-secondary">Tokens</button>
                      {(r.email ?? "").toLowerCase() !== "davideguerci76@gmail.com" && (
                        <>
                          <button onClick={() => onToggleBlock(r.id, !!r.blocked_at)} className="border border-border px-2 py-1 text-[10px] font-bold uppercase hover:bg-secondary">
                            {r.blocked_at ? "Unblock" : "Block"}
                          </button>
                          <button onClick={() => onDelete(r.id, r.display_name)} className="border border-racing-red px-2 py-1 text-[10px] font-bold uppercase text-racing-red hover:bg-racing-red/10">Delete</button>
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

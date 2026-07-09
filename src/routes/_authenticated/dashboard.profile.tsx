import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DISCIPLINES, ROLES, type Discipline, type FreelancerRole } from "@/lib/paddock";

export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: p }, { data: fp }, { data: tp }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
        supabase.from("freelancer_profiles").select("*").eq("user_id", user!.id).maybeSingle(),
        supabase.from("team_profiles").select("*").eq("user_id", user!.id).maybeSingle(),
      ]);
      return { ...p, freelancerProfile: fp, teamProfile: tp };
    },
  });

  const isFreelancer = profile?.user_type === "freelancer";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-12">
        <div className="label-mono">[PROFILE]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{t("nav.profile")}</h1>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          {/* Personal Info */}
          <div className="border border-border bg-card p-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-racing-red">Personal Info</h2>
            <PersonalInfoSection profile={profile} />
          </div>

          {/* Role-specific info */}
          <div className="border border-border bg-card p-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-racing-red">
              {isFreelancer ? "Freelancer Info" : "Team Info"}
            </h2>
            {isFreelancer ? (
              <FreelancerSection profile={profile?.freelancerProfile} />
            ) : (
              <TeamSection profile={profile?.teamProfile} />
            )}
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function PersonalInfoSection({ profile }: { profile: any }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Updated");
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="mt-4 space-y-3">
      <div className="text-sm">
        <span className="text-muted-foreground">Email:</span>
        <span className="ml-2 font-mono">{profile?.email ?? "—"}</span>
      </div>
      <div className="text-sm">
        <span className="text-muted-foreground">User type:</span>
        <span className="ml-2 font-mono uppercase">{profile?.user_type ?? "—"}</span>
      </div>
      {editing ? (
        <div className="flex gap-2">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="flex-1 border border-border bg-background px-3 py-2 text-sm"
            placeholder="Display name"
          />
          <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-racing-red px-4 py-2 text-xs font-bold uppercase text-white">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="border border-border px-4 py-2 text-xs font-bold uppercase">
            Cancel
          </button>
        </div>
      ) : (
        <div className="text-sm">
          <span className="text-muted-foreground">Display name:</span>
          <span className="ml-2 font-mono">{profile?.display_name ?? "—"}</span>
          <button onClick={() => { setDisplayName(profile?.display_name ?? ""); setEditing(true); }} className="ml-2 text-xs text-racing-red hover:underline">
            Edit
          </button>
        </div>
      )}
      <div className="text-sm">
        <span className="text-muted-foreground">Tokens:</span>
        <span className="ml-2 font-mono text-racing-red font-bold">{profile?.token_balance ?? 0}</span>
      </div>
    </div>
  );
}

function FreelancerSection({ profile }: { profile: any }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    role: profile?.role ?? "other",
    headline: profile?.headline ?? "",
    disciplines: profile?.disciplines ?? [],
    day_rate: profile?.day_rate ?? "",
    location: profile?.location ?? "",
    bio: profile?.bio ?? "",
    travels: profile?.travels ?? true,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      const { error } = await supabase.from("freelancer_profiles").upsert({
        user_id: user.id,
        role: form.role as FreelancerRole,
        headline: form.headline || null,
        disciplines: form.disciplines,
        day_rate: form.day_rate ? parseInt(form.day_rate) : null,
        location: form.location || null,
        bio: form.bio || null,
        travels: form.travels,
      }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Updated");
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="mt-4 space-y-3">
      {editing ? (
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Headline</label>
            <input
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
              placeholder="e.g. F1 Mechanic with 10 years experience"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Disciplines</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {DISCIPLINES.map((d) => (
                <label key={d} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={form.disciplines.includes(d)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setForm({ ...form, disciplines: [...form.disciplines, d] });
                      } else {
                        setForm({ ...form, disciplines: form.disciplines.filter((x: Discipline) => x !== d) });
                      }
                    }}
                    className="accent-racing-red"
                  />
                  <span className="text-xs uppercase">{d}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Day Rate (EUR)</label>
            <input
              type="number"
              value={form.day_rate}
              onChange={(e) => setForm({ ...form, day_rate: e.target.value })}
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
              placeholder="e.g. 450"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Location</label>
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
              placeholder="e.g. Milan, Italy"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={3}
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
              placeholder="Short bio..."
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.travels}
              onChange={(e) => setForm({ ...form, travels: e.target.checked })}
              className="accent-racing-red"
            />
            <span className="text-sm">Available to travel for race weekends</span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-racing-red px-4 py-2 text-xs font-bold uppercase text-white">
              Save
            </button>
            <button onClick={() => setEditing(false)} className="border border-border px-4 py-2 text-xs font-bold uppercase">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-sm">
            <span className="text-muted-foreground">Role:</span>
            <span className="ml-2 font-mono uppercase">{profile?.role ?? "—"}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Headline:</span>
            <span className="ml-2">{profile?.headline ?? "—"}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Disciplines:</span>
            <span className="ml-2 font-mono uppercase">{profile?.disciplines?.join(", ") ?? "—"}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Day rate:</span>
            <span className="ml-2 font-mono">{profile?.day_rate ? `€${profile.day_rate}/day` : "—"}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Location:</span>
            <span className="ml-2">{profile?.location ?? "—"}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Travels:</span>
            <span className="ml-2">{profile?.travels ? "Yes" : "No"}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Bio:</span>
            <p className="mt-1">{profile?.bio ?? "—"}</p>
          </div>
          <button onClick={() => setEditing(true)} className="mt-2 text-xs text-racing-red hover:underline">
            Edit Freelancer Info
          </button>
        </>
      )}
    </div>
  );
}

function TeamSection({ profile }: { profile: any }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    team_name: profile?.team_name ?? "",
    team_type: profile?.team_type ?? "",
    location: profile?.location ?? "",
    primary_discipline: profile?.primary_discipline ?? "",
    bio: profile?.bio ?? "",
    website: profile?.website ?? "",
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("team_profiles").upsert({
        user_id: profile?.user_id,
        team_name: form.team_name,
        team_type: form.team_type || null,
        location: form.location || null,
        primary_discipline: form.primary_discipline || null,
        bio: form.bio || null,
        website: form.website || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Updated");
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="mt-4 space-y-3">
      {editing ? (
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Team Name</label>
            <input
              value={form.team_name}
              onChange={(e) => setForm({ ...form, team_name: e.target.value })}
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Team Type</label>
            <input
              value={form.team_type}
              onChange={(e) => setForm({ ...form, team_type: e.target.value })}
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
              placeholder="e.g. F2 Team, GT Team, Factory"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Location</label>
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Primary Discipline</label>
            <select
              value={form.primary_discipline}
              onChange={(e) => setForm({ ...form, primary_discipline: e.target.value })}
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select...</option>
              {DISCIPLINES.map((d) => (
                <option key={d} value={d}>{d.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={3}
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Website</label>
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="mt-1 w-full border border-border bg-background px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-racing-red px-4 py-2 text-xs font-bold uppercase text-white">
              Save
            </button>
            <button onClick={() => setEditing(false)} className="border border-border px-4 py-2 text-xs font-bold uppercase">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-sm">
            <span className="text-muted-foreground">Team name:</span>
            <span className="ml-2 font-bold">{profile?.team_name ?? "—"}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Type:</span>
            <span className="ml-2">{profile?.team_type ?? "—"}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Location:</span>
            <span className="ml-2">{profile?.location ?? "—"}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Discipline:</span>
            <span className="ml-2 font-mono uppercase">{profile?.primary_discipline ?? "—"}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Website:</span>
            <span className="ml-2">{profile?.website ? <a href={profile.website} target="_blank" rel="noopener" className="text-racing-red hover:underline">{profile.website}</a> : "—"}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Bio:</span>
            <p className="mt-1">{profile?.bio ?? "—"}</p>
          </div>
          <button onClick={() => setEditing(true)} className="mt-2 text-xs text-racing-red hover:underline">
            Edit Team Info
          </button>
        </>
      )}
    </div>
  );
}

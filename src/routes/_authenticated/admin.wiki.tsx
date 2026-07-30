import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Calendar, MapPin, Clock, ListChecks, Siren, Coins } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/wiki")({
  component: PlatformWiki,
});

function Section({
  icon: Icon,
  title,
  tag,
  children,
}: {
  icon: any;
  title: string;
  tag: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-racing-red" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-racing-red">{tag}</span>
      </div>
      <h2 className="mb-3 text-xl font-black uppercase italic tracking-tighter">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-secondary">
          <tr>
            {headers.map((h) => (
              <th key={h} className="border-b border-border px-3 py-2 text-left font-mono font-bold uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlatformWiki() {
  return (
    <div className="space-y-6">
      <div className="border-l-4 border-racing-red bg-racing-red/5 p-4">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-racing-red" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-racing-red">
            [PLATFORM MANUAL — READ ONLY]
          </span>
        </div>
        <h1 className="mt-1 text-3xl font-black uppercase italic tracking-tighter">Platform Wiki</h1>
        <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
          Internal single source of truth. Summarises the entire business and product logic of the platform. Read-only,
          admin-only. Numeric parameters mentioned as "configurable" live in{" "}
          <span className="font-mono">Admin → Tokens</span> and <span className="font-mono">Admin → Matching</span>.
        </p>
      </div>

      <Section icon={Calendar} tag="[01 · CALENDAR]" title="Freelancer availability calendar — day states">
        <p>
          Each day of the freelancer's calendar has exactly one of three states. The state defines both the colour and
          the interaction rules.
        </p>
        <Table
          headers={["State", "Colour", "Meaning", "Interaction"]}
          rows={[
            ["Default", "Black / neutral", "No declared availability.", "Click to toggle to Available."],
            ["Available", "Green", "Freelancer is offering this day to the marketplace and appears in matching.", "Click to toggle back to Default."],
            [
              "Engaged / Locked",
              "Red",
              "Day belongs to a confirmed engagement OR to an engagement cancelled late by the freelancer (freelancer_late / no_show). Slot is protected against double-booking.",
              "Not clickable. Tooltip shows the reason (engaged vs locked-late).",
            ],
          ]}
        />
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          <li>Bulk actions available: select/deselect entire month, select/deselect date range.</li>
          <li>Overlap guard: accepting a new match server-side rejects a proposal whose dates cross any Locked day.</li>
        </ul>
      </Section>

      <Section icon={MapPin} tag="[02 · GEOLOCATION]" title="Geographic matching — 3-state relevance switch">
        <p>Each Job Request declares how strictly location affects matching, and against which anchor:</p>
        <Table
          headers={["Relevance", "Behaviour", "Score impact"]}
          rows={[
            ["Not relevant", "Location is ignored in matching. Full location weight is granted to every candidate.", "Neutral: no penalty, no bonus."],
            [
              "Relevant (soft)",
              "Distance is measured but not exclusionary. Candidates inside radius get full weight; up to 1.2× radius get half weight; beyond that, zero location score.",
              "Weighted, non-blocking.",
            ],
            [
              "Mandatory (hard)",
              "Candidates outside the radius are excluded from the results entirely (hard filter).",
              "Blocking.",
            ],
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Anchor selector: <span className="font-mono">This Location</span> uses the coordinates of the specific request
          (e.g. the circuit). <span className="font-mono">Team Location</span> uses the team's headquarters address.
          Distance is computed as <span className="font-mono">haversine</span> great-circle distance (line-of-sight
          kilometres), never road distance.
        </p>
      </Section>

      <Section icon={Clock} tag="[03 · LIFECYCLE]" title="Query lifecycle & cancellation windows">
        <p className="font-bold uppercase text-racing-yellow">Natural closure</p>
        <p>
          A scheduled job (<span className="font-mono">close_expired_requests</span>) runs periodically. Any{" "}
          <span className="font-mono">active</span> / <span className="font-mono">paused</span> request whose first
          required day has already passed with no confirmed engagement is set to{" "}
          <span className="font-mono">completed</span> and archived as <span className="font-mono">Unfilled</span>.
        </p>
        <p className="font-bold uppercase text-racing-yellow">Grace cancellation (24h · zero penalty)</p>
        <p>
          Either party can cancel a confirmed engagement without any penalty if BOTH conditions are true:
        </p>
        <ul className="list-disc pl-5">
          <li>Less than 24 hours have passed since <span className="font-mono">confirmed_at</span>.</li>
          <li>The first required day has not yet started.</li>
        </ul>
        <p>
          The engagement is stamped <span className="font-mono">cancellation_kind = 'grace'</span>. The request reopens
          (status returns to <span className="font-mono">active</span>) and previously waitlisted freelancers are
          notified.
        </p>
        <p className="font-bold uppercase text-racing-red">Late team cancellation (Negative CV)</p>
        <p>
          Team cancels outside the grace window → <span className="font-mono">cancellation_kind = 'team_late'</span>.
          The team's public profile shows an aggregate CV line: total count of late cancellations and the average days
          of notice. The request is closed as <span className="font-mono">completed · unfilled</span>. Freelancer's
          calendar is freed automatically.
        </p>
        <p className="font-bold uppercase text-racing-red">Late freelancer cancellation (Locked slot)</p>
        <p>
          Freelancer cancels outside the grace window →{" "}
          <span className="font-mono">cancellation_kind = 'freelancer_late'</span> or{" "}
          <span className="font-mono">'no_show'</span>. The originally engaged days remain{" "}
          <span className="font-bold text-racing-red">Locked Red</span> on the freelancer's calendar — they cannot be
          re-offered, protecting the team's confidence in booked slots. The request reopens and same-day flows (SOS
          Call, no-show 1-star rating) are unlocked.
        </p>
      </Section>

      <Section icon={ListChecks} tag="[04 · MATCH ACCEPTANCE]" title="First-Come, First-Served & waitlist">
        <p>
          When a team proposes a match to a freelancer, the freelancer sees an{" "}
          <span className="font-mono">Accept</span> button. Rules:
        </p>
        <ul className="list-disc pl-5">
          <li>
            The <span className="font-bold">first freelancer</span> whose acceptance succeeds server-side wins the slot.
            The engagement flips to <span className="font-mono">confirmed</span>.
          </li>
          <li>
            The corresponding request is immediately marked <span className="font-mono">filled</span> and every other
            still-<span className="font-mono">proposed</span> engagement on the same request is auto-cancelled.
          </li>
          <li>
            Reserve freelancers receive a <span className="font-mono">match_taken</span> notification with a
            "waitlisted" flag. Their Accept button disappears in real time (Supabase Realtime subscription).
          </li>
          <li>
            Overlap guard: the RPC rejects an acceptance that would collide with any existing confirmed engagement or
            Locked (late-cancelled) slot on the freelancer's calendar (SQL error <span className="font-mono">23505</span>).
          </li>
        </ul>
      </Section>

      <Section icon={Siren} tag="[05 · SOS CALL]" title="Emergency SOS Call — high-affinity broadcast">
        <p>
          Last-resort emergency broadcast for single-race requests that are unfilled on the first required day.
          Configurable in <span className="font-mono">Admin → Tokens → matching</span>:{" "}
          <span className="font-mono">sos_min_match_pct</span> (default 75%).
        </p>
        <p className="font-bold uppercase text-racing-yellow">Activation conditions (ALL must be true)</p>
        <ul className="list-disc pl-5">
          <li>The request is single-race (<span className="font-mono">duration ≠ full_season</span>).</li>
          <li>Today (simulated clock) equals the first required day.</li>
          <li>No confirmed engagement exists on the request.</li>
          <li>Team is the request owner.</li>
        </ul>
        <p className="font-bold uppercase text-racing-yellow">Behaviour</p>
        <ul className="list-disc pl-5">
          <li>
            Selects every freelancer whose <span className="font-mono">skills_score ≥ sos_min_match_pct</span> AND who is
            free on the first required day AND who passes the request's geographic radius (mandatory-style, always
            applied for SOS regardless of the request's original relevance setting).
          </li>
          <li>Inserts SOS notifications with an <span className="font-mono">Accept now</span> CTA in the notification centre and a dashboard banner.</li>
          <li>
            The first freelancer to accept skips the propose step and creates a <span className="font-mono">confirmed</span> engagement
            directly. All other targets receive a <span className="font-mono">sos_taken</span> notification.
          </li>
          <li>
            Auto-triggered path: when a freelancer late-cancels on the same day as the first required day, SOS fires
            automatically for the same request.
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          A same-day freelancer cancel also unlocks a <span className="font-mono">Rate no-show</span> action for the team,
          which submits a 1-star rating bypassing the standard double-blind waiting window.
        </p>
      </Section>

      <Section icon={Coins} tag="[06 · REFUNDS & TRIVIO]" title="Token refund policy & the strategic trivio">
        <p className="font-bold uppercase text-racing-yellow">Hard Skill Penalty formula</p>
        <p>
          The percentage of tokens refunded on a zero-match request is computed as:
        </p>
        <div className="border border-border bg-secondary/40 p-3 font-mono text-xs">
          refund_pct = max( refund_min_pct , 100 − ( hard_filter_count × refund_hard_penalty_pct ) )
        </div>
        <p className="text-xs text-muted-foreground">
          Both parameters are configurable in <span className="font-mono">Admin → Tokens → refunds</span>. Defaults:{" "}
          <span className="font-mono">refund_min_pct = 20</span>,{" "}
          <span className="font-mono">refund_hard_penalty_pct = 10</span>. The refund is rounded to the nearest integer,
          with a floor of 1 token whenever any refund is due.
        </p>
        <p>
          Hard filters counted: <span className="font-mono">role_hard</span>,{" "}
          <span className="font-mono">travel_required</span>, each entry in <span className="font-mono">skills_hard</span>,
          any <span className="font-mono">education</span> requirement, mandatory location relevance, and each language
          / experience requirement flagged <span className="font-mono">hard</span>.
        </p>
        <p className="font-bold uppercase text-racing-yellow">The Trivio (zero total matches)</p>
        <Table
          headers={["Option", "Action", "Refund", "Post-state"]}
          rows={[
            [
              "1 — Keep searching",
              "Leave the request live; wait for a new 100% match to appear.",
              "None. The search stays alive.",
              "Request stays active. Standard FCFS resumes as candidates surface.",
            ],
            [
              "2 — Refund & close",
              "Accept the full refund quote and archive the request as completed · unfilled.",
              "Full quote (see formula above).",
              "Final. Request cannot be reopened.",
            ],
            [
              "3 — Unlock partials",
              "Reveal freelancers available only for part of the required dates.",
              "HALVED refund (refund_partial = round(refund_full / 2), min 1).",
              "Request stays open. If a full match later confirms, no extra refund. If the team later engages a partial, no extra refund.",
            ],
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Token integration rule: taking Option 3 disables any subsequent refund on the same request — the halved amount
          is the total compensation for that request's outcome.
        </p>
      </Section>

      <div className="border border-dashed border-border p-4 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        End of manual · last-updated live from source · read only
      </div>
    </div>
  );
}

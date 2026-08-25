import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { BookOpen, Calendar, MapPin, Clock, ListChecks, Siren, Coins, ShieldCheck, Users, Download, Sliders } from "lucide-react";

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

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function PlatformWiki() {
  const ref = useRef<HTMLDivElement>(null);
  const stamp = new Date().toISOString().slice(0, 10);

  function downloadDocx() {
    const body = ref.current?.innerHTML ?? "";
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Platform Wiki</title><style>body{font-family:Arial,sans-serif;font-size:11pt;color:#111}h1{font-size:20pt}h2{font-size:14pt;border-bottom:1px solid #999}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px;font-size:9pt;text-align:left}</style></head><body>${body}</body></html>`;
    download(`platform-wiki-${stamp}.doc`, html, "application/msword");
  }

  function downloadTxt() {
    const text = (ref.current?.innerText ?? "").replace(/\n{3,}/g, "\n\n");
    download(`platform-wiki-${stamp}.txt`, text, "text/plain;charset=utf-8");
  }

  return (
    <div className="space-y-6" ref={ref}>
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
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={downloadDocx}
            className="inline-flex items-center gap-2 bg-racing-red px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:brightness-110"
          >
            <Download className="size-3" /> Download Wiki (Word)
          </button>
          <button
            onClick={downloadTxt}
            className="inline-flex items-center gap-2 border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"
          >
            <Download className="size-3" /> Download Wiki (TXT)
          </button>
        </div>
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
        <p>Each Pit Call declares how strictly location affects matching, and against which anchor:</p>
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
          Anchor selector: <span className="font-mono">This Location</span> uses the coordinates of the specific Pit Call
          (e.g. the circuit). <span className="font-mono">Team Location</span> uses the team's headquarters address.
          Distance is computed as <span className="font-mono">haversine</span> great-circle distance (line-of-sight
          kilometres), never road distance.
        </p>
      </Section>

      <Section icon={Clock} tag="[03 · LIFECYCLE]" title="Query lifecycle & cancellation windows">
        <p className="font-bold uppercase text-racing-yellow">Natural closure</p>
        <p>
          A scheduled job (<span className="font-mono">close_expired_requests</span>) runs periodically. Any{" "}
          <span className="font-mono">active</span> / <span className="font-mono">paused</span> Pit Call whose first
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
          The engagement is stamped <span className="font-mono">cancellation_kind = 'grace'</span>. The Pit Call reopens
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
          re-offered, protecting the team's confidence in booked slots. The Pit Call reopens and same-day flows (SOS
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
            still-<span className="font-mono">proposed</span> engagement on the same Pit Call is auto-cancelled.
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

      <Section icon={ShieldCheck} tag="[07 · ADMIN · PIT CALL CONTROL]" title="Iron match rule, suspension & reopening — Admin panel">
        <p>
          Everything below is monitored and operated from <span className="font-mono">Admin → Pit Calls</span>. That tab
          is the single audit surface for the lifecycle of every Pit Call and its match register.
        </p>

        <p className="font-bold uppercase text-racing-yellow">A · The iron match rule (first responder wins)</p>
        <ul className="list-disc pl-5">
          <li>
            A Pit Call has exactly <span className="font-bold">one</span> assignable slot. The first freelancer whose
            confirmation is accepted by <span className="font-mono">accept_match_confirmation</span> becomes the{" "}
            <span className="font-bold">First responder (FCFS winner)</span> and is highlighted in yellow on the row
            detail, with the exact <span className="font-mono">confirmed_at</span> timestamp.
          </li>
          <li>
            From that instant the Pit Call is <span className="font-mono">filled</span> and the row shows the{" "}
            <span className="font-bold text-racing-red">Slots closed</span> badge. No other freelancer can confirm — the
            RPC rejects the attempt server-side, not just in the UI.
          </li>
        </ul>

        <p className="font-bold uppercase text-racing-yellow">B · Database of contacted-but-locked-out freelancers</p>
        <ul className="list-disc pl-5">
          <li>
            <span className="font-mono">Contacted but locked out</span> lists every freelancer the team proposed the
            match to who never confirmed, with the outcome tag:
            <span className="font-mono"> Slot closed first</span> (their proposal was auto-cancelled when the winner
            confirmed) or <span className="font-mono">Locked (pending)</span> (still proposed, but confirmation is
            blocked).
          </li>
          <li>
            The <span className="font-mono">Match register</span> column lists the full ranked candidate pool with the
            final score and any partial-availability gap, so an admin can reconstruct why a given freelancer was or was
            not contacted.
          </li>
        </ul>

        <p className="font-bold uppercase text-racing-red">C · Withdrawal & automatic reopening</p>
        <ul className="list-disc pl-5">
          <li>
            Every withdrawal on a confirmed engagement is logged with who withdrew (team or freelancer), the{" "}
            <span className="font-mono">cancellation_kind</span> (grace / team_late / freelancer_late / no_show), the
            timestamp and the free-text reason.
          </li>
          <li>
            <span className="font-mono">grace</span> and <span className="font-mono">freelancer_late</span> withdrawals
            reopen the Pit Call automatically (<span className="font-mono">status → active</span>). Every previously
            matched freelancer receives a <span className="font-mono">match_reopened</span> notification, and the FCFS
            rule restarts: the first of the queue to confirm takes over the slot.
          </li>
          <li>
            <span className="font-mono">team_late</span> does NOT reopen: the Pit Call is archived as{" "}
            <span className="font-mono">completed · unfilled</span> and the team gets a Negative CV entry.
          </li>
          <li>
            Reopened Pit Calls are flagged with the yellow <span className="font-mono">Reopened</span> badge and are
            filterable via the status filter.
          </li>
        </ul>

        <p className="font-bold uppercase text-racing-yellow">D · Admin controls & statistics</p>
        <Table
          headers={["Control", "Effect"]}
          rows={[
            ["Reopen", "Sets status = active, is_active = true and recomputes matches for that Pit Call."],
            ["Suspend", "Sets status = paused. Hidden from matching; no new confirmations possible. Reversible."],
            ["Close", "Sets status = closed. Terminal for the marketplace; kept for audit and statistics."],
            ["Delete", "Hard-deletes the Pit Call and its match register. Blocked while a confirmed engagement exists."],
          ]}
        />
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          <li>Search by title, team or location; filter by status, Hot or Reopened; sort by recency, match count or start date.</li>
          <li>
            KPI strip: Total, Active, <span className="font-bold text-racing-red">Hot</span> (open Pit Call with 5+
            candidates and no confirmation), Paused, Filled, Reopened, Closed.
          </li>
        </ul>

        <p className="font-bold uppercase text-racing-yellow">E · General availability calendar</p>
        <ul className="list-disc pl-5">
          <li>
            Month grid (Monday-first). Each day carries a <span className="font-bold">counter badge</span> with the
            number of freelancers who declared that day available; the cell shading scales with the count. Hovering a day
            reveals a sample of the names.
          </li>
          <li>
            Filters map onto every field of the freelancer profile: macro-role, sub-role, minimum seniority, discipline,
            skills (multiple), education, language, travel availability, maximum day rate, country and name search. The
            counters recompute live for the filtered population; blocked accounts are always excluded.
          </li>
          <li>Use it to gauge coverage before approving or reopening a Pit Call on a given date window.</li>
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
          <li>The Pit Call is single-race (<span className="font-mono">duration ≠ full_season</span>).</li>
          <li>Today (simulated clock) equals the first required day.</li>
          <li>No confirmed engagement exists on the Pit Call.</li>
          <li>Team is the Pit Call owner.</li>
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
              "Leave the Pit Call live; wait for a new 100% match to appear.",
              "None. The search stays alive.",
              "Pit Call stays active. Standard FCFS resumes as candidates surface.",
            ],
            [
              "2 — Refund & close",
              "Accept the full refund quote and archive the Pit Call as completed · unfilled.",
              "Full quote (see formula above).",
              "Final. The Pit Call cannot be reopened.",
            ],
            [
              "3 — Unlock partials",
              "Reveal freelancers available only for part of the required dates.",
              "HALVED refund (refund_partial = round(refund_full / 2), min 1).",
              "Pit Call stays open. If a full match later confirms, no extra refund. If the team later engages a partial, no extra refund.",
            ],
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Token integration rule: taking Option 3 disables any subsequent refund on the same request — the halved amount
          is the total compensation for that request's outcome.
        </p>
      </Section>


      <Section icon={Users} tag="[08 · MY POOL]" title="My Pool — private circle of trusted freelancers">
        <p>
          Every team owns a private <span className="font-bold">My Pool</span>: the shortlist of freelancers it already
          worked with or explicitly invited. Pool membership changes what the team sees and what a search costs.
        </p>
        <p className="font-bold uppercase text-racing-yellow">A · How a freelancer enters the pool</p>
        <Table
          headers={["Entry path", "Trigger", "Source tag"]}
          rows={[
            ["Completed engagement", "A confirmed engagement between the team and the freelancer reaches status completed. A database trigger inserts the pool row automatically.", "engagement"],
            ["Pit Code invitation", "The team types the freelancer's unique Pit Code in Dashboard → My Pool. The RPC add_pool_member_by_code resolves the code and adds the member instantly.", "code"],
          ]}
        />
        <p className="text-xs text-muted-foreground">
          The <span className="font-mono">Pit Code</span> is a unique, permanent identifier generated for every
          freelancer profile. It is visible to the freelancer in their own dashboard, is shown in{" "}
          <span className="font-mono">Admin → Freelancers</span> in a dedicated column, and is the only way to join a
          pool without a completed engagement. Pool composition per team is inspectable from the{" "}
          <span className="font-mono">Pool</span> column in <span className="font-mono">Admin → Teams</span> (name,
          surname, phone, email and Pit Code of each member).
        </p>
        <p className="font-bold uppercase text-racing-yellow">B · Pool search mode on a Pit Call</p>
        <ul className="list-disc pl-5">
          <li>
            When composing a Pit Call the team chooses <span className="font-mono">Standard</span> (whole marketplace) or{" "}
            <span className="font-mono">My Pool</span> (only its own circle). The choice is stored on the request as{" "}
            <span className="font-mono">search_mode</span>.
          </li>
          <li>
            The cost box updates live: the pool search is cheaper than a standard Pit Call. Both prices are configurable
            in <span className="font-mono">Admin → Tokens</span> and are read at posting time, never hard-coded in the UI.
          </li>
          <li>
            In pool mode the matching engine restricts candidates to <span className="font-mono">team_pool</span> members
            and the pool unlock is applied automatically at posting: no additional per-match unlock is charged.
          </li>
        </ul>
        <p className="font-bold uppercase text-racing-yellow">C · Names in clear & badge</p>
        <ul className="list-disc pl-5">
          <li>
            Pool members are never redacted for the owning team: full name is shown in clear on every match card, next to
            the dedicated <span className="font-bold text-racing-yellow">POOL</span> badge.
          </li>
          <li>Direct contacts (phone, email) still follow the standard rule: revealed only once the match is confirmed.</li>
          <li>For every other team the same freelancer stays anonymous until unlocked in the normal way.</li>
        </ul>
        <p className="font-bold uppercase text-racing-yellow">D · Rating & pool closure of a Pit Call</p>
        <ul className="list-disc pl-5">
          <li>
            Concluding a Pit Call with a pool freelancer follows the same lifecycle as a standard one: propose → confirm →
            complete → double-blind rating.
          </li>
          <li>
            The double-blind rating window opens as soon as the relationship becomes a pool relationship (engagement
            completed), so trusted circles accumulate reputation faster.
          </li>
          <li>Late cancellations by a pool member follow the same Negative CV and Locked-slot rules as everyone else.</li>
        </ul>
      </Section>

      <Section icon={Sliders} tag="[09 · TOKEN ECONOMY]" title="Dynamic token economy — everything configurable from Admin">
        <p>
          No token price is hard-coded. Every cost, bonus and threshold lives in the{" "}
          <span className="font-mono">platform_settings</span> table and is edited live in{" "}
          <span className="font-mono">Admin → Tokens</span>, grouped by category (posting, unlocks, refunds, matching,
          bonuses). Changes take effect immediately for every new operation; already-charged operations are never
          re-priced retroactively.
        </p>
        <Table
          headers={["Category", "What it drives"]}
          rows={[
            ["Posting", "Cost of a single-race Pit Call, a full-season Pit Call, and the reduced cost of a My Pool search."],
            ["Unlocks", "Progressive per-block cost of revealing matches beyond the free tier, single-request team reveal vs full team profile reveal, and the cost of opening anonymous review text."],
            ["Refunds", "refund_min_pct and refund_hard_penalty_pct used by the zero-match trivio formula."],
            ["Matching", "sos_min_match_pct, partial-match thresholds and penalties, calendar-freshness influence."],
            ["Bonuses", "Signup bonus and the token bonus credited when a rating is submitted."],
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Every debit and credit is written to <span className="font-mono">token_transactions</span> with a reason code,
          including manual admin adjustments made by editing a balance inline in the Freelancers or Teams table
          (<span className="font-mono">admin_credit</span> / <span className="font-mono">admin_debit</span>).
        </p>
      </Section>

      <Section icon={ListChecks} tag="[10 · MATCH COLUMNS & BADGES]" title="Double match columns, badges and sorting">
        <p className="font-bold uppercase text-racing-yellow">A · The two match columns</p>
        <Table
          headers={["Column", "Content", "Token behaviour"]}
          rows={[
            ["Perfect matches (100%)", "Candidates available on every required day and passing every hard filter.", "First free tier is included in the Pit Call price; further reveals are charged per progressive block."],
            ["Partial matches", "Candidates missing part of the required days, scored with a proportional penalty and shown with the missing-days gap.", "Unlockable only after taking Option 3 of the trivio, or directly when the team accepts the partial-coverage view."],
          ]}
        />
        <p className="font-bold uppercase text-racing-yellow">B · Badge legend</p>
        <Table
          headers={["Badge", "Meaning"]}
          rows={[
            ["POOL (yellow)", "Freelancer already belongs to the team's My Pool: name in clear, reduced friction."],
            ["PERFECT (green)", "100% date coverage and all hard requirements satisfied."],
            ["PARTIAL (amber)", "Availability gap; the badge carries the number of missing days and the coverage percentage."],
            ["LOCKED (grey/blur)", "Candidate exists but is not unlocked yet: identity blurred, cost shown on the unlock button."],
            ["NEGATIVE CV (red)", "Counterparty has late cancellations or no-shows on record."],
            ["CALENDAR STALE (yellow)", "Availability not confirmed recently; the freshness factor lowers the final score."],
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Sorting rule: final score first (weighted score × freshness × penalties), then rating average, then recency.
          Pool members are surfaced above equal-score non-pool candidates.
        </p>
      </Section>

      <Section icon={ShieldCheck} tag="[11 · ADMIN CONTROL SURFACE]" title="Admin Control Panel — full capability map">
        <Table
          headers={["Tab", "What the admin can do"]}
          rows={[
            ["Freelancers", "Full inline editing of every field (name, macro-role, disciplines, skills, location, phone, day rate, token balance) with a per-row Save changes button. Dedicated Pit Code column. Block/unblock, delete, Excel export. Admin-only day-rate statistics strip (average, median, min, max) — this data is never shown on public market pages."],
            ["Teams", "Full inline editing (team name, contact, discipline, location, website, VAT, token balance) with per-row Save changes. Dedicated Pool column opening a modal with the complete pool roster: name, surname, phone, email and Pit Code. Block/unblock, delete, Excel export."],
            ["Pit Calls", "Lifecycle audit: reopen, suspend, close, delete; match register, FCFS winner, locked-out candidates, KPI strip and the general availability calendar."],
            ["Permissions", "Grant or revoke the admin role."],
            ["Matching", "Weight sliders for every scoring dimension, including calendar freshness and seniority tolerance."],
            ["Tokens", "Live editing of every operational cost and bonus (see section 09)."],
            ["Reviews", "Moderation queue with filters (all / flagged / frozen / auto-suspicious). Clicking a comment opens a modal with the full text, sub-scores, engagement reference and flag reason. Actions: approve, freeze, delete."],
            ["Calendars", "Review and approve imported season calendars."],
            ["Wiki", "This manual, downloadable as Word (.doc) or plain text."],
          ]}
        />
        <p className="text-xs text-muted-foreground">
          The Time Machine banner (simulated clock offset) applies to every date-dependent job: rating windows,
          anti-ghosting escalations, calendar-stale notifications and Pit Call expiry.
        </p>
      </Section>

      <div className="border border-dashed border-border p-4 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        End of manual · last-updated live from source · read only
      </div>
    </div>
  );
}

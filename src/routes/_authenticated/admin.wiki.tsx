import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import {
  Bell, BookOpen, Calendar, CircleDollarSign, Coins, Download, FlaskConical,
  Gauge, ListChecks, MapPin, ShieldCheck, Siren, Sliders, Tags, UserRoundCheck, Users,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/wiki")({ component: PlatformWiki });

type SectionProps = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tag: string;
  children: React.ReactNode;
};

function Section({ id, icon: Icon, title, tag, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-24 border border-border bg-card p-5">
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
        <thead className="bg-secondary"><tr>{headers.map((header) => <th key={header} className="border-b border-border px-3 py-2 text-left font-mono font-bold uppercase tracking-wider">{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} className="border-b border-border/60">{row.map((cell, j) => <td key={j} className="px-3 py-2 align-top">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const sections = [
  ["calendar", "01", "Calendar & availability"], ["matching", "02", "Matching law"],
  ["confirmation", "03", "Request Confirmation"], ["cancellation", "04", "Cancellation & SOS"],
  ["refunds", "05", "Refunds"], ["pool", "06", "My Pool"], ["tokens", "07", "Tokens & billing"],
  ["readiness", "08", "READY to Match"], ["taxonomy", "09", "Taxonomy"],
  ["notifications", "10", "Notifications"], ["accounts", "11", "Account authority"],
  ["environments", "12", "LIVE, TEST & demos"], ["admin", "13", "ACP control surface"],
] as const;

function PlatformWiki() {
  const ref = useRef<HTMLDivElement>(null);
  const stamp = new Date().toISOString().slice(0, 10);
  const downloadDocx = () => {
    const body = ref.current?.innerHTML ?? "";
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>PITCALL Platform Wiki</title><style>body{font-family:Arial,sans-serif;font-size:11pt;color:#111}h1{font-size:20pt}h2{font-size:14pt;border-bottom:1px solid #999}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px;font-size:9pt;text-align:left}</style></head><body>${body}</body></html>`;
    download(`pitcall-platform-wiki-${stamp}.doc`, html, "application/msword");
  };
  const downloadTxt = () => download(`pitcall-platform-wiki-${stamp}.txt`, (ref.current?.innerText ?? "").replace(/\n{3,}/g, "\n\n"), "text/plain;charset=utf-8");

  return (
    <div className="space-y-6" ref={ref}>
      <header className="border-l-4 border-racing-red bg-racing-red/5 p-4">
        <div className="flex items-center gap-2"><BookOpen className="size-4 text-racing-red" /><span className="font-mono text-[10px] font-bold uppercase tracking-widest text-racing-red">[PLATFORM MANUAL · READ ONLY]</span></div>
        <h1 className="mt-1 text-3xl font-black uppercase italic tracking-tighter">PITCALL Operations Wiki</h1>
        <p className="mt-2 max-w-4xl text-xs text-muted-foreground">Internal operations manual — verified against the current implementation on 12 September 2026. Runtime authority remains in server rules and environment-aware settings. Matching configuration, Platform Rules, Tokens, Billing and Launch are separate ACP control surfaces.</p>
        <nav aria-label="Wiki section map" className="mt-4 flex flex-wrap gap-2">
          {sections.map(([id, number, label]) => <a key={id} href={`#${id}`} className="border border-border bg-background px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider hover:border-racing-red hover:text-racing-red">{number} · {label}</a>)}
        </nav>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={downloadDocx} className="inline-flex items-center gap-2 bg-racing-red px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:brightness-110"><Download className="size-3" /> Download Wiki (Word)</button>
          <button onClick={downloadTxt} className="inline-flex items-center gap-2 border border-border px-3 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-secondary"><Download className="size-3" /> Download Wiki (TXT)</button>
        </div>
      </header>

      <Section id="calendar" icon={Calendar} tag="[01 · CALENDAR]" title="Calendar, availability and freshness">
        <p>Freelancer availability is operational data, not a static profile field. A day can be available, busy/private, protected by a pending Request Confirmation, tied to a confirmed PITCALL engagement, or locked by a late Freelancer cancellation or Team-declared no-show. Protected and locked dates cannot be overwritten.</p>
        <Table headers={["Surface", "Current behaviour"]} rows={[
          ["Freelancer calendar", "Available days feed matching. Busy notes remain private. Frozen dates stay available-looking but cannot be removed while confirmation is pending. Confirmed and locked PITCALL dates are non-editable."],
          ["Freshness", "Availability older than the configurable availability_max_age_days is stale and excluded from matching. The live authority is currently 60 days. Confirm availability refreshes all open days; automatic reminders prompt review."],
          ["Calendar tools", "Quick Fill, range/month tools, ICS import, Merge/Replace, Saved/My Calendars and Apply calendar preserve protected dates."],
          ["Platform calendars", "Imported championship calendars are moderated in ACP. Approved calendars become read-only platform calendars and can award the configured approval reward."],
          ["Team calendar", "Shows current PITCALL operational dates and confirmed crew engagements; it is distinct from a Freelancer’s availability calendar."],
        ]} />
      </Section>

      <Section id="matching" icon={Gauge} tag="[02 · MATCHING]" title="Full, Partial, relevance, coverage and ranking">
        <Table headers={["Concept", "Current law"]} rows={[
          ["Full Match", "Every required day is covered. Professional relevance does not determine Full status."],
          ["Partial Match", "Some days are missing, but the temporal rule is met: a single block covers at least 50% of requested days; a full season misses no more than 20%; a My Pool member follows the Pool any-coverage rule."],
          ["Professional relevance", "A separate percentage based on professional requirements. Candidates below 50% remain visible, keep their date-based Full/Partial status and count toward coverage."],
          ["Coverage", "The number of non-stale Full and Partial matches: HIGH COVERAGE, TARGETED COVERAGE, or NO CURRENT COVERAGE ON THE SELECTED DATES. The internal strong value is legacy storage, not Team-facing terminology."],
          ["Ranking", "Deterministic: professional score, the implemented rank vector and a stable fallback. Rating, recency and Pool membership are not generic tie-breakers."],
        ]} />
        <p>The configurable <span className="font-mono">professional_relevance_threshold</span> is not a visibility gate and is not read by match recomputation, Full/Partial classification or coverage. It is used for <span className="font-mono">ever_relevant_match</span>, low-relevance refund eligibility, eligible My Pool expansion, non-Pool HOT Partial and Availability Opportunity notifications, informational snapshots, and ACP Platform Rules editing.</p>
        <p>Full and Partial results have separate lists and the same tiered detail-unlock model. Free preview and paid tiers are server-authorised. HOT Partial highlights missing required days; Availability Opportunities alert eligible Freelancers when opening dates could create a match.</p>
        <p>Geographic matching remains a separate three-state rule: not relevant, soft relevance, or mandatory radius, using the selected Pit Call or Team location anchor.</p>
      </Section>

      <Section id="confirmation" icon={ListChecks} tag="[03 · REQUEST CONFIRMATION]" title="Proposal, response and first acceptance">
        <p>A Team sends a Request Confirmation from an eligible match. The proposed card contains status, role, dates, budget reference and notes. The Team remains anonymised to the Freelancer where the current reveal law requires it.</p>
        <ul className="list-disc pl-5"><li><b>Confirm:</b> accepts the job. The first valid server-side acceptance wins, the Pit Call becomes filled, competing proposals close and contacts are exchanged.</li><li><b>Ask More Time:</b> becomes available only near expiry, is limited, and never extends beyond the Pit Call start.</li><li><b>Decline:</b> closes that proposal and leaves the Freelancer’s dates free.</li><li>The proposal starts as <span className="font-mono">Proposed</span>; confirmed, declined and expired outcomes are retained for lifecycle history.</li></ul>
      </Section>

      <Section id="cancellation" icon={Siren} tag="[04 · CANCELLATION & SOS]" title="Grace, late cancellation and SOS recovery">
        <Table headers={["Flow", "Result"]} rows={[
          ["Grace · either party", "Within 24 hours of confirmation and before the first day: Engagement cancelled without penalty; Pit Call goes back to Active; matching is re-run; other candidates may receive match_reopened; a new Request Confirmation can be sent; no tokens move."],
          ["Late · Freelancer", "Engagement cancelled and the Freelancer’s dates remain blocked. Before the first day, the Pit Call goes back to Active and matching is re-run; after the first day has passed, it is archived/completed. No tokens move."],
          ["Late · Team", "Engagement cancelled; Pit Call archived/completed and never goes back to Active; Freelancer dates are released; the late cancellation enters the Team’s public statistic. No automatic refund and no token movement."],
          ["SOS / no-show", "Team-only and separate from Cancel. From the eligible single-event window, the Team may declare a confirmed Freelancer no-show. Their days remain blocked, the Pit Call enters SOS recovery and eligible nearby Freelancers receive the SOS; first valid acceptance wins."],
        ]} />
        <p>No-show is not a Freelancer action and is not a third Freelancer cancellation option. SOS has its own targeting, exclusivity and acceptance flow; it does not use the ordinary grace/late cancellation path.</p>
      </Section>

      <Section id="refunds" icon={CircleDollarSign} tag="[05 · REFUNDS]" title="Keep searching or close with an eligible refund">
        <p>Refunds are request-level economic outcomes. They never unlock results, hide candidates, change Full/Partial classification or change coverage.</p>
        <Table headers={["Outcome", "Meaning"]} rows={[
          ["Keep searching", "The Pit Call remains active and can receive future matches."],
          ["Zero-match refund", "An eligible non-Pool Pit Call with no matches can be closed using the current server quote."],
          ["Low-relevance refund", "For an eligible non-Pool Pit Call that had matches but none ever reached the professional relevance threshold. Stored as refund_kind = low_relevance; it is not a match status."],
          ["Partial-related refund", "When the current quote marks a partial-only result eligible, closing uses the quoted policy outcome."],
          ["Identical repost", "An identical repost is non-refundable."],
        ]} />
        <p>The server calculates each quote from current policy settings and request history. The ACP must rely on the displayed quote rather than hardcoded percentages.</p>
      </Section>

      <Section id="pool" icon={Users} tag="[06 · MY POOL]" title="Private Team network and marketplace expansion">
        <p>A Team owns its My Pool. A Freelancer enters through a completed engagement or the Freelancer’s Pit Code. Pool membership is Team-specific.</p>
        <ul className="list-disc pl-5"><li>Pool Search is limited to that Team’s members, uses its configured posting cost and admits members under the Pool coverage rule.</li><li>The owning Team sees Pool member names and the POOL badge before confirmation; direct contact details remain protected until confirmation.</li><li>Pool preview is free under the current unlock law.</li><li>An eligible Pool-only Pit Call can use Upgrade to Standard / Expand outside Pool once, paying the displayed difference. Eligibility requires a qualifying outside-Pool opportunity under the current relevance threshold.</li><li>Expansion is not a Partial unlock and does not change Partial visibility.</li></ul>
      </Section>

      <Section id="tokens" icon={Coins} tag="[07 · TOKENS, BILLING & LAUNCH]" title="Server-authorised economy and separate launch gates">
        <p>Operational costs, packages and thresholds are server-authoritative. ACP Tokens manages action costs and rewards; Billing & Payments manages token packages, <span className="font-mono">token_price_eur</span>, package discounts and order operations. Stripe checkout and webhook confirmation credit successful purchases. Expired orders and the maximum number of open orders are controlled by current settings.</p>
        <Table headers={["Control", "Effect"]} rows={[
          ["TOKEN PURCHASE MASTER OFF", "Token purchases are unavailable in every environment under the purchase authority. Existing balances and non-purchase actions are separate."],
          ["PIT CALL CREATION OFF", "Closes LIVE Pit Call creation. TEST/DEMO follows the separate environment-aware creation gate."],
          ["Unlock tiers", "Team detail access uses free preview plus server-priced rank tiers. Partial results use the same model; no refund action unlocks them."],
          ["Ledger", "Every debit and credit is recorded with a reason code. There is no purchaseTokensDemo flow."],
        ]} />
      </Section>

      <Section id="readiness" icon={UserRoundCheck} tag="[08 · READY TO MATCH]" title="Activation status and operational nudges">
        <p>READY to Match requires a macro-role, a syntactically valid phone number and at least one active availability day. It is an activation/readiness indicator, not a hard matching filter and not a professional score.</p>
        <ul className="list-disc pl-5"><li>The Activation Card shows Registered, Ready or Not Ready and the current causes.</li><li>ACP Pool Health exposes readiness and reason filters.</li><li>Admins may send one Nudge or Nudge All. The <span className="font-mono">readiness_nudge</span> cooldown is 14 days per Freelancer and environment, with no force-send or bypass.</li><li>Readiness nudges are manual. Automatic calendar-stale reminders are a separate scheduled flow.</li></ul>
      </Section>

      <Section id="taxonomy" icon={Tags} tag="[09 · TAXONOMY]" title="Approved role, sub-role and skill authority">
        <p>The current taxonomy is implemented, approved and tested. It defines macro-roles, sub-roles, skills and their active associations used by profiles, Pit Calls and matching.</p>
        <p>ACP Taxonomy is the operational surface for current labels, activation and relationships. Matching weights belong to Matching; platform-wide thresholds belong to Platform Rules. Previous proposed models are not current authority.</p>
      </Section>

      <Section id="notifications" icon={Bell} tag="[10 · NOTIFICATIONS]" title="In-app state, links and delivery channels">
        <p>The Notification Center maintains per-notification read state, unread badge/count and contextual deep-links. Operational flows include calendar reminders, manual readiness nudges, Request Confirmation events, Engagement lifecycle, SOS, anti-ghosting, HOT Partial and Availability Opportunities.</p>
        <p>Eligible notifications can dispatch through in-app, email and web push according to current preferences and scheduled processors. Admin/support should diagnose from the notification kind, recipient, environment, delivery status and deep-link rather than assuming every event uses every channel.</p>
      </Section>

      <Section id="accounts" icon={ShieldCheck} tag="[11 · ACCOUNT & PROFILE AUTHORITY]" title="Identity fields, deletion and blockers">
        <ul className="list-disc pl-5"><li><span className="font-mono">user_type</span> is immutable after signup.</li><li>Team name and locked identity fields follow their current profile authority; permitted corrections are handled through the relevant Admin controls.</li><li>Self-service account deletion is blocked by active Engagements or open Pit Calls. Users must resolve those obligations first.</li><li>Deletion removes account-owned operational data while preserving only economic or legal records required by the current retention law.</li><li>Admin account actions remain authenticated, audited and environment-scoped.</li></ul>
      </Section>

      <Section id="environments" icon={FlaskConical} tag="[12 · LIVE, TEST & DEMOS]" title="Four distinct operating contexts">
        <Table headers={["Context", "Meaning"]} rows={[
          ["LIVE", "The real product and real users."],
          ["TEST", "An isolated environment for controlled testing. Environment guards prevent cross-scope data and actions."],
          ["Internal Demo Mode", "Deterministic TEST scenarios managed in Testing Lab through Reset, Seed and Verify. Demo anchor logic belongs only to these scenarios; there is no global Time Machine."],
          ["Guided Demo Pit Call", "A separate Team walkthrough using local deterministic data and real-looking creation/results UI. It creates no Pit Call, real match, contact, Request Confirmation, Engagement or SOS; spends no tokens; ends at Match Results; can be replayed; only its minimal completion marker is stored."],
        ]} />
      </Section>

      <Section id="admin" icon={Sliders} tag="[13 · ACP CONTROL SURFACE]" title="Current Admin capability map">
        <Table headers={["Area", "Operational purpose"]} rows={[
          ["Freelancers", "Profiles, account actions, tokens, Pit Code, availability access, readiness/Pool Health and Nudge/Nudge All."],
          ["Teams", "Team profiles, account actions, balances and Team-owned Pool inspection."],
          ["Pit Calls", "Lifecycle audit, current status controls, match register, winner and availability context."],
          ["Permissions", "Server-authorised Admin role management."],
          ["Matching", "Matching weight configuration."],
          ["Taxonomy", "Approved role, sub-role and skill structure."],
          ["Tokens", "Operational costs, rewards and token settings."],
          ["Billing & Payments", "Packages, pricing, discounts and payment-order operations."],
          ["Platform Rules", "Cross-feature limits and thresholds, including professional relevance."],
          ["Reviews", "Rating moderation and investigation."],
          ["Calendars", "Imported calendar moderation and approval reward."],
          ["Wiki", "This dated operations manual and its exports."],
          ["Launch", "Separate Pit Call creation, purchase and platform-capacity controls."],
          ["Testing Lab", "TEST-only deterministic scenarios, Reset/Seed/Verify and Demo Guide sub-route."],
        ]} />
        <p>The LIVE/TEST selector scopes supported ACP work. Platform Capacity appears in the relevant Admin surface. Demo anchor dates are scenario tools, not a clock applied to production jobs.</p>
      </Section>

      <div className="border border-dashed border-border p-4 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">End of manual · verified 2026-09-12 · read only</div>
    </div>
  );
}

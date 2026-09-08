import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Award, Building2, CalendarCheck, CalendarPlus, Eye, Flag, Lock, Mail, MapPin, Phone, Plane, Wallet } from "lucide-react";
import { PitCallDates } from "@/components/championship-dates";
import { CalendarQuickButtons } from "@/components/match-quick-actions";
import { MatchRequestActions, MatchRequestDeadline } from "@/components/match-request-actions";
import { PitCallRevealDetail, PitCallRevealTeaser } from "@/components/pitcall-reveal-detail";
import { disciplineLabel, initialsFor } from "@/lib/paddock";
import { teamTypeLabel } from "@/lib/labels";
import { roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { ActionRow, CardBody, CardFooter, CardHeader, CardShell, Fact, FactGrid, IdentityRow, Section, StatusChip, cardBtn, type CardTone } from "@/components/cards/primitives";
import { CriteriaOutcome, MissingDays, RelevanceScore, coverageOf, useCoverageText } from "@/components/cards/match-signals";

/**
 * Counterparty match card on /dashboard/matches (Families 5–8).
 * Freelancer-side: anonymous Team → reveal → pending confirmation → confirmed.
 * The isFreelancer=false branch mirrors the legacy Team-side counterparty rendering
 * (kept for parity; Teams are normally routed to the request history instead).
 */
export function FreelancerMatchCard({
  match: m,
  isFreelancer,
  revealCost,
  revealCta,
  onReveal,
  revealPending,
}: {
  match: any;
  isFreelancer: boolean;
  revealCost: number;
  revealCta: string;
  onReveal: () => void;
  revealPending: boolean;
}) {
  const { t } = useTranslation();
  const cp = m.counterparty;
  const pct = Math.round(Number(m.match_score ?? 0));
  const perfect = !!m.is_perfect;
  const isConfirmed = !!m.isConfirmed;
  const matchTaken = !!m.matchTaken;
  const pending = isFreelancer && !!m.pending_engagement_id && !matchTaken && !isConfirmed;
  const showName = isConfirmed;
  const cov = coverageOf(m);
  const { title: covTitle, days: covDays } = useCoverageText(cov);
  const req = m.request ?? {};
  const name = isFreelancer ? (cp?.team_name ?? t("sweep_engage.matches.team_fallback")) : (cp?.legal_name ?? t("sweep_engage.matches.freelancer_fallback"));

  // STATE (header) — lifecycle first, coverage second.
  let tone: CardTone = perfect ? "perfect" : cov.isPartial ? "partial" : "neutral";
  let headerTone: "success" | "warn" | "danger" | "muted" | "info" = perfect || cov.isPartial ? "warn" : "success";
  let headerTitle: ReactNode = perfect ? t("sweep_engage.matches.perfect_match") : covTitle;
  let headerSub: ReactNode = covDays;
  let headerIcon: ReactNode = <CalendarCheck className="size-4" />;
  if (isConfirmed) {
    tone = "confirmed"; headerTone = "success"; headerTitle = t("sweep_engage.matches.match_confirmed_badge"); headerSub = covDays;
  } else if (pending) {
    tone = "partial"; headerTone = "warn"; headerTitle = t("mcard.confirmation_requested"); headerSub = <MatchRequestDeadline expiresAt={m.pending_engagement?.expires_at} />;
    headerIcon = <Flag className="size-4" />;
  } else if (matchTaken) {
    tone = "neutral"; headerTone = "muted"; headerTitle = t("sweep_engage.matches.assigned_elsewhere"); headerSub = covDays;
  }

  const roleLine = `${req?.sub_role ? subRoleLabel(req.sub_role) : roleGroupLabel(req?.role_group)} · ${disciplineLabel(req?.discipline)}`;

  return (
    <CardShell tone={tone}>
      <CardHeader icon={headerIcon} tone={headerTone} title={headerTitle} subtitle={headerSub} right={<RelevanceScore pct={pct} perfect={perfect} />} />

      {/* ACTIONS */}
      <ActionRow>
        {m.revealedByMe ? (
          <StatusChip tone="danger"><Eye className="size-3.5" /> {t("matches.already_revealed")}</StatusChip>
        ) : (
          <button type="button" onClick={onReveal} disabled={revealPending || matchTaken} className={cardBtn.primary}>
            <Eye className="size-3.5" /> {revealCta}
          </button>
        )}
        {pending && (
          <MatchRequestActions
            engagementId={m.pending_engagement_id}
            expiresAt={m.pending_engagement?.expires_at}
            extensionCount={m.pending_engagement?.extension_count ?? 0}
            pitcallStart={req?.start_date ?? null}
          />
        )}
        {isFreelancer && matchTaken && <StatusChip tone="muted">{t("sweep_engage.matches.assigned_elsewhere")}</StatusChip>}
        {isFreelancer && isConfirmed && <StatusChip tone="success">{t("sweep_engage.matches.match_confirmed_badge")}</StatusChip>}
      </ActionRow>

      <CardBody>
        <MissingDays c={cov} />

        {/* IDENTITY */}
        <IdentityRow
          avatar={showName ? initialsFor(isFreelancer ? (cp?.team_name ?? "?") : (cp?.legal_name ?? "?")) : <Lock className="size-4" />}
          avatarTone={showName ? "success" : "muted"}
          name={showName ? name : <span className="text-muted-foreground">{t("matches.hidden_name")}</span>}
          meta={
            <>
              {isFreelancer && cp?.team_type && <span>{teamTypeLabel(cp.team_type)}</span>}
              {!isFreelancer && cp?.headline && <span>{cp.headline}</span>}
            </>
          }
          hiddenNote={
            m.revealedByMe && cp && !isConfirmed
              ? (isFreelancer ? t("sweep_engage.matches.team_name_hidden") : t("sweep_engage.matches.name_contacts_hidden"))
              : undefined
          }
        />

        {/* PIT CALL (the object of the match) */}
        <Section icon={<Flag />} title={req?.title ?? t("cards.pitcall")}>
          <div className="grid gap-1 text-muted-foreground">
            <div>{roleLine}</div>
            <div className="font-mono text-[12px]"><PitCallDates request={req} /></div>
          </div>
        </Section>

        {/* FACTS (revealed counterparty data) */}
        {m.revealedByMe && cp && (
          <FactGrid cols={4}>
            {cp.location && <Fact icon={<MapPin />} label={t("sweep_engage.matches.location_label")} value={cp.location} />}
            {!isFreelancer && typeof cp.day_rate === "number" && <Fact icon={<Wallet />} label={t("sweep_engage.matches.day_rate_label")} value={`€${cp.day_rate}`} />}
            {!isFreelancer && cp.travels !== null && <Fact icon={<Plane />} label={t("sweep_engage.matches.travels_label")} value={cp.travels ? t("sweep_engage.matches.yes") : t("sweep_engage.matches.no")} />}
            {!isFreelancer && isConfirmed && cp.contact_email && <Fact icon={<Mail />} label="Email" value={<span className="break-all">{cp.contact_email}</span>} />}
            {!isFreelancer && isConfirmed && cp.phone_number && <Fact icon={<Phone />} label={t("phone.label")} value={`${cp.phone_dial_code ?? ""} ${cp.phone_number}`} />}
          </FactGrid>
        )}
        {m.revealedByMe && cp?.bio && (
          <Section icon={<Building2 />} title={isFreelancer ? t("cards.team") : t("cards.profile")}>
            <p className="text-muted-foreground">{cp.bio}</p>
          </Section>
        )}

        {/* CRITERIA */}
        <Section icon={<Award />} title={t("sweep_engage.matches.criteria")}>
          <CriteriaOutcome missing={m.missing_criteria ?? []} allOkText={t("sweep_engage.matches.perfect_criteria")} />
        </Section>

        {/* REVEAL (freelancer-side Pit Call details, economics owned by the reveal component) */}
        {isFreelancer && (m.revealedByMe ? <PitCallRevealDetail detail={m.requestDetail} /> : <PitCallRevealTeaser cost={revealCost} />)}
      </CardBody>

      {isConfirmed && req?.start_date && req?.end_date && (
        <CardFooter>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground"><CalendarPlus className="size-3.5" /> {t("cards.calendar")}</span>
          <CalendarQuickButtons
            event={{
              title: t("sweep_engage.matches.calendar_title", { title: req?.title ?? "PitCall" }),
              startDate: req.start_date,
              endDate: req.end_date,
              location: req?.location ?? req?.circuit ?? null,
              description: req?.notes ?? "",
            }}
          />
        </CardFooter>
      )}
    </CardShell>
  );
}

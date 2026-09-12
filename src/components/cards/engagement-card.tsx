import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Award, Ban, CalendarPlus, CalendarRange, CalendarX, CheckCircle2, Clock, Contact, Eye, Flag, Lock, Mail, MapPin, Phone, ShieldCheck, StickyNote, Wallet, XCircle } from "lucide-react";
import { PitCallDates } from "@/components/championship-dates";
import { useDateFormat } from "@/lib/date-locale";
import { CalendarQuickButtons, ContactQuickButtons } from "@/components/match-quick-actions";
import { MatchRequestActions, MatchRequestDeadline } from "@/components/match-request-actions";
import { disciplineLabel, educationLabel, engagementStatusLabel, languageLabel, languageLevelLabel, skillLabel, teamTypeLabel } from "@/lib/labels";
import { roleGroupLabel, subRoleLabel } from "@/lib/roles";
import {
  ActionRow, AlertStrip, CardBody, CardFooter, CardHeader, CardShell, Chip, Chips, DetailsToggle, Fact, FactGrid, IdentityRow, Section, StatusChip, cardBtn, type CardTone, type StateTone,
} from "@/components/cards/primitives";
import { CriteriaOutcome, RelevanceScore } from "@/components/cards/match-signals";
import { HelpHint } from "@/components/help-hint";

type Actions = {
  onReveal: () => void;
  revealPending: boolean;
  revealCost: number;
  onWithdraw: () => void;
  withdrawPending: boolean;
  
  onCancel: (inGrace: boolean) => void;
  onAnswerContact: (contacted: boolean) => void;
  answerContactPending: boolean;
  onTeamConfirmContact: () => void;
  teamConfirmPending: boolean;
  onAddToPool: () => void;
  addToPoolPending: boolean;
  locallyPooled: boolean;
};

/**
 * Engagement card (Family 10): STATE-FIRST. Every lifecycle action, anti-ghosting
 * check, contact and rating slot from the legacy card is preserved; the route keeps
 * all mutations and passes callbacks. `fee` is the Pit Call max budget captured at
 * proposal time (server: request_match_confirmation) and is labelled as such.
 */
export function EngagementCard({
  e,
  userId,
  highlighted,
  actions,
  ratingSlot,
}: {
  e: any;
  userId: string | undefined;
  highlighted: boolean;
  actions: Actions;
  ratingSlot: ReactNode;
}) {
  const { t } = useTranslation();
  const { formatDate } = useDateFormat();
  const isFreelancer = userId === e.freelancer_id;
  const other = isFreelancer ? e.team : e.freelancer;
  
  const tp = e.team_profile;
  const fp = e.freelancer_profile;
  const req = e.request;
  const match = e.match;
  const pct = match ? Math.round(Number(match.match_score ?? 0)) : null;
  const perfect = !!match?.is_perfect;
  const skillsSoft: string[] = req?.skills ?? [];
  const skillsHard: string[] = req?.skills_hard ?? [];
  const languages: any[] = req?.languages ?? [];
  const education: string[] = req?.education ?? [];
  // Temporal availability is NOT a preferred requirement: the matching engine emits a
  // `missing_days` entry inside missing_criteria, which is rendered separately below.
  const missing: any[] = (match?.missing_criteria ?? []).filter((c: any) => c?.kind !== "missing_days");
  const coverage = e.coverage ?? null;

  // Teams always see their own Pit Call; freelancers must pay the reveal.
  const detailsUnlocked = !isFreelancer || !!e.revealedByMe;
  const status: string = e.status;
  const isProposed = status === "proposed";
  const isConfirmed = status === "confirmed";
  const isCompleted = status === "completed";
  const active = isConfirmed || isCompleted;
  const ghosted = e.cancellation_kind === "team_ghosting";

  // ---- STATE (header)
  const tone: CardTone = ghosted ? "danger" : isConfirmed ? "confirmed" : isProposed ? "partial" : isCompleted ? "full" : perfect ? "perfect" : "neutral";
  const headerTone: StateTone = ghosted || status === "cancelled" || status === "declined" ? "danger" : isProposed ? "warn" : active ? "success" : "muted";
  const headerIcon = ghosted || status === "cancelled" || status === "declined" ? <XCircle className="size-4" /> : isProposed ? <Clock className="size-4" /> : active ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />;

  const name = isFreelancer ? (tp?.team_name ?? other?.display_name ?? t("sweep_engage.matches.team_fallback")) : (other?.display_name ?? t("sweep_engage.matches.freelancer_fallback"));
  const nameHidden = isFreelancer && !tp?.team_name;
  const initials = String(name).split(/\s+/).map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();

  // ---- cancel window (unchanged logic)
  const confirmedAt = e.confirmed_at ? new Date(e.confirmed_at).getTime() : null;
  const graceEnd = confirmedAt ? confirmedAt + 24 * 3600 * 1000 : null;
  const firstDay = new Date(e.start_date + "T00:00:00").getTime();
  const now = Date.now();
  const inGrace = graceEnd !== null && now < graceEnd && now < firstDay;
  const cancelLabel = inGrace
    ? t("sweep_engage.engagements.cancel_grace_label", { hours: Math.max(0, Math.round((graceEnd! - now) / 3600000)) })
    : isFreelancer ? t("sweep_engage.engagements.cancel_late_freelancer_label") : t("sweep_engage.engagements.cancel_late_team_label");

  const budgetText = detailsUnlocked && (req?.budget_min || req?.budget_max) ? `€${req.budget_min ?? "?"}–${req.budget_max ?? "?"}/${req.budget_unit}` : null;

  return (
    <CardShell tone={tone} id={`engagement-${e.id}`} highlighted={highlighted}>
      <CardHeader
        icon={headerIcon}
        tone={headerTone}
        title={engagementStatusLabel(status)}
        subtitle={isProposed ? <MatchRequestDeadline expiresAt={e.expires_at} /> : req?.title}
        right={pct !== null ? <RelevanceScore pct={pct} perfect={perfect} size="md" /> : undefined}
      />

      {/* ACTIONS — lifecycle */}
      <ActionRow>
        {isProposed && e.proposed_by !== userId && (
          <MatchRequestActions engagementId={e.id} expiresAt={e.expires_at} extensionCount={e.extension_count ?? 0} pitcallStart={req?.start_date ?? e.start_date} />
        )}
        {isProposed && e.proposed_by === userId && (
          <button type="button" onClick={actions.onWithdraw} disabled={actions.withdrawPending} className={cardBtn.danger}>
            {t("engagements.withdraw")}
          </button>
        )}
        {isConfirmed && (
          <span className="inline-flex items-center gap-1">
            <button type="button" onClick={() => actions.onCancel(inGrace)} className={inGrace ? cardBtn.ghost : cardBtn.danger}>{cancelLabel}</button>
            {!inGrace && isFreelancer && (
              <HelpHint titleKey="help.action.cancel_late.title" bodyKey="help.action.cancel_late.body" />
            )}
            {!inGrace && !isFreelancer && (
              <HelpHint titleKey="help.action.cancel_late_team.title" bodyKey="help.action.cancel_late_team.body" />
            )}
          </span>
        )}
        {!isFreelancer && isCompleted && (
          e.in_pool || actions.locallyPooled ? (
            <StatusChip tone="info"><ShieldCheck className="size-3.5" /> {t("pool.in_my_pool")}</StatusChip>
          ) : (
            <button type="button" onClick={actions.onAddToPool} disabled={actions.addToPoolPending} className={cardBtn.pool}>{t("pool.add_to_my_pool")}</button>
          )
        )}
        {ratingSlot}
      </ActionRow>

      {/* ALERTS — anti-ghosting */}
      {ghosted && (
        <AlertStrip tone="danger" icon={<AlertTriangle className="size-4" />} title={t("sweep_engage.engagements.team_no_followup_title")}>
          {t("sweep_engage.engagements.team_no_followup_body")}
        </AlertStrip>
      )}
      {isConfirmed && isFreelancer && e.freelancer_contacted !== true && (
        <AlertStrip
          tone="warn"
          icon={<Phone className="size-4" />}
          title={t("sweep_engage.engagements.contact_check_title")}
          actions={
            <>
              <button type="button" disabled={actions.answerContactPending} onClick={() => actions.onAnswerContact(true)} className={cardBtn.primary}>{t("sweep_engage.engagements.team_contacted_me")}</button>
              {e.contact_check_sent_at && (
                <button type="button" disabled={actions.answerContactPending} onClick={() => actions.onAnswerContact(false)} className={cardBtn.ghost}>{t("sweep_engage.engagements.not_yet")}</button>
              )}
            </>
          }
        >
          {e.contact_check_sent_at ? t("sweep_engage.engagements.contact_check_followup") : t("sweep_engage.engagements.contact_check_initial")}
        </AlertStrip>
      )}
      {isConfirmed && !isFreelancer && !e.team_confirmed_contact && (
        <AlertStrip
          tone="warn"
          icon={<Phone className="size-4" />}
          title={t("sweep_engage.engagements.confirm_contacted_title")}
          actions={<button type="button" disabled={actions.teamConfirmPending} onClick={actions.onTeamConfirmContact} className={cardBtn.primary}>{t("sweep_engage.engagements.i_contacted_freelancer")}</button>}
        >
          {t("sweep_engage.engagements.confirm_contacted_body")}
        </AlertStrip>
      )}
      {isConfirmed && !isFreelancer && e.team_reminder2_sent_at && !e.team_confirmed_contact && (
        <AlertStrip tone="danger" icon={<AlertTriangle className="size-4" />} title={t("sweep_engage.engagements.urgent_contact_title")}>
          {t("sweep_engage.engagements.urgent_contact_body")}
        </AlertStrip>
      )}

      <CardBody>
        {/* IDENTITY */}
        <IdentityRow
          avatar={nameHidden ? <Lock className="size-4" /> : initials}
          avatarTone={active ? "success" : "muted"}
          name={nameHidden ? <span className="text-muted-foreground">{name}</span> : name}
          meta={
            isFreelancer && tp ? (
              <>{[tp.team_type && teamTypeLabel(tp.team_type), tp.location, tp.primary_discipline && disciplineLabel(tp.primary_discipline)].filter(Boolean).join(" · ")}</>
            ) : !isFreelancer && fp ? (
              <>{[fp.role_group && roleGroupLabel(fp.role_group), fp.headline].filter(Boolean).join(" · ")}</>
            ) : undefined
          }
          hiddenNote={nameHidden ? t("sweep_engage.matches.team_name_hidden") : undefined}
        />

        {/* FACTS */}
        <FactGrid cols={4}>
          <Fact icon={<CalendarRange />} label={t("cards.dates")} value={<span className="font-mono text-[12px]">{req ? <PitCallDates request={req} dates={e.covered_days} /> : `${e.start_date} → ${e.end_date}`}</span>} />
          {req && <Fact icon={<Flag />} label={t("cards.role")} value={`${req.sub_role ? subRoleLabel(req.sub_role) : roleGroupLabel(req.role_group)}`} sub={disciplineLabel(req.discipline)} />}
          {!isFreelancer && fp?.location && <Fact icon={<MapPin />} label={t("cards.location")} value={fp.location} />}
          {!isFreelancer && typeof fp?.day_rate === "number" && <Fact icon={<Wallet />} label={t("cards.day_rate")} value={`€${fp.day_rate}/day`} />}
          {budgetText && <Fact icon={<Wallet />} label={t("reveal.budget")} value={budgetText} />}
          <Fact icon={<Wallet />} label={t("cards.budget_ref")} value={`${e.currency ?? ""} ${e.fee ?? "—"}`.trim()} sub={t("cards.budget_ref_hint")} />
        </FactGrid>

        {/* CONTACT — team side, confirmed/completed (server-authorised) */}
        {active && !isFreelancer && (
          <Section icon={<Contact />} title={t("sweep_engage.engagements.freelancer_contact_title")} tone="warn">
            <div className="grid gap-1">
              <div><span className="text-muted-foreground">{t("sweep_engage.engagements.name_label")}:</span> <b>{other?.display_name ?? fp?.headline ?? t("sweep_engage.matches.freelancer_fallback")}</b></div>
              {e.freelancer_contact?.email && (
                <div className="flex items-center gap-2"><Mail className="size-3.5 text-muted-foreground" /><a href={`mailto:${e.freelancer_contact.email}`} className="break-all font-mono text-racing-red hover:underline">{e.freelancer_contact.email}</a></div>
              )}
              {e.freelancer_contact?.phone_number && (
                <div className="flex items-center gap-2"><Phone className="size-3.5 text-muted-foreground" /><span className="font-mono">{e.freelancer_contact.phone_dial_code ?? ""} {e.freelancer_contact.phone_number}</span></div>
              )}
              {!e.freelancer_contact?.email && !e.freelancer_contact?.phone_number && <div className="text-muted-foreground">{t("cards.contacts_none")}</div>}
            </div>
            <div className="mt-2">
              <ContactQuickButtons
                contact={{
                  fullName: other?.display_name ?? t("sweep_engage.matches.freelancer_fallback"),
                  organization: fp?.role ? String(fp.role) : undefined,
                  title: fp?.headline ?? undefined,
                  email: e.freelancer_contact?.email ?? undefined,
                  phone: e.freelancer_contact?.phone_number ? `${e.freelancer_contact?.phone_dial_code ?? ""} ${e.freelancer_contact.phone_number}`.trim() : undefined,
                  notes: req?.title ? `PitCall — ${req.title}` : undefined,
                }}
              />
            </div>
          </Section>
        )}

        {/* PIT CALL — reveal gate + requirements */}
        {req && (
          <Section icon={<Flag />} title={req.title}>
            {isFreelancer && !detailsUnlocked && e.match?.id && (
              <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-background/40 p-3">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("matches.hidden_name")}</span>
                <button type="button" onClick={actions.onReveal} disabled={actions.revealPending} className={cardBtn.primary}>
                  <Eye className="size-3.5" /> {actions.revealCost > 0 ? t("matches.reveal_1_token", { count: actions.revealCost }) : t("matches.reveal_cta_free")}
                </button>
              </div>
            )}
            {detailsUnlocked && (skillsHard.length > 0 || skillsSoft.length > 0 || languages.length > 0 || education.length > 0 || req.notes) ? (
              <DetailsToggle>
                {(skillsHard.length > 0 || skillsSoft.length > 0) && (
                  <Section title={t("mcard.skills")}>
                    <Chips>
                      {skillsHard.map((s) => <Chip key={`h-${s}`} tone="hard">{skillLabel(s)} · hard</Chip>)}
                      {skillsSoft.filter((s) => !skillsHard.includes(s)).map((s) => <Chip key={`s-${s}`} tone="soft">{skillLabel(s)}</Chip>)}
                    </Chips>
                  </Section>
                )}
                {languages.length > 0 && (
                  <Section title={t("mcard.languages")}>
                    <Chips>{languages.map((l: any, i: number) => <Chip key={i} tone={l.hard ? "hard" : "muted"}>{languageLabel(l.code, l.custom)} ({languageLevelLabel(l.level)}){l.hard ? " · hard" : ""}</Chip>)}</Chips>
                  </Section>
                )}
                {education.length > 0 && (
                  <Section title={t("reveal.education")}><Chips>{education.map((ed) => <Chip key={ed}>{educationLabel(ed)}</Chip>)}</Chips></Section>
                )}
                {req.notes && <Section icon={<StickyNote />} title={t("cards.notes")}><p className="text-muted-foreground">{req.notes}</p></Section>}
              </DetailsToggle>
            ) : null}
          </Section>
        )}

        {/* TEMPORAL COVERAGE — independent dimension, snapshot of the engagement */}
        {coverage && coverage.missing_days > 0 && (
          <Section icon={<CalendarX />} title={t("cards.coverage_partial")}>
            <div className="rounded-lg border border-racing-yellow/50 bg-racing-yellow/5 px-3 py-2">
              <div className="text-[12.5px] font-bold text-racing-yellow">
                {t("cards.days_of", { covered: coverage.covered_days, required: coverage.required_days })}
                {" · "}
                {t(coverage.missing_days === 1 ? "cards.missing_day_one" : "cards.missing_day_other", { count: coverage.missing_days })}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {coverage.missing_dates.map((day: string) => (
                  <time key={day} dateTime={day} className="rounded border border-racing-yellow/40 bg-racing-yellow/10 px-2 py-0.5 font-mono text-[11px] text-racing-yellow">
                    {formatDate(day + "T00:00:00")}
                  </time>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* PREFERRED / MANDATORY CRITERIA — never mixed with temporal availability */}
        {missing.length > 0 && (
          <Section icon={<Award />} title={t("sweep_engage.matches.missing_criteria")}>
            <CriteriaOutcome missing={missing} />
          </Section>
        )}


        {e.notes && <Section icon={<StickyNote />} title={t("cards.notes")}><p className="text-muted-foreground">{e.notes}</p></Section>}
      </CardBody>

      {active && (
        <CardFooter>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground"><CalendarPlus className="size-3.5" /> {t("cards.calendar")}</span>
          <CalendarQuickButtons
            event={{
              title: t("sweep_engage.matches.calendar_title", { title: req?.title ?? other?.display_name ?? "PitCall" }),
              startDate: e.start_date,
              endDate: e.end_date,
              location: req?.location ?? req?.circuit ?? null,
              description: req ? `${req.title}${req.notes ? `\n\n${req.notes}` : ""}` : "",
            }}
          />
        </CardFooter>
      )}
    </CardShell>
  );
}

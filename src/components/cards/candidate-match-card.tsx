import { useTranslation } from "react-i18next";
import { Award, Briefcase, CalendarCheck, EyeOff, Lock, Mail, MapPin, Phone, Plane, Star, Unlock, Wallet } from "lucide-react";
import { RatingIcons } from "@/components/rating-icons";
import { PoolBadge } from "@/components/pool-badge";
import { disciplineLabel, educationLabel, skillLabel } from "@/lib/paddock";
import { levelLabel, parseSubRoles, roleGroupLabel, subRoleLabel } from "@/lib/roles";
import {
  ActionRow,
  CardBody,
  CardHeader,
  CardShell,
  Chip,
  Chips,
  DetailsToggle,
  Fact,
  FactGrid,
  IdentityRow,
  Pill,
  Section,
  StatusChip,
  cardBtn,
  type CardTone,
} from "@/components/cards/primitives";
import { CriteriaOutcome, MissingDays, RankPill, RelevanceScore, coverageOf, useCoverageText } from "@/components/cards/match-signals";

/**
 * TEAM-SIDE candidate card (Family 1/2: request matches Full/Partial · Family 12: pool-search results).
 * Anatomy: coverage state → CTA → missing days → identity → facts → criteria → details.
 * Professional relevance (%) and temporal coverage (days) are never merged.
 */
export function CandidateMatchCard({
  match,
  mode = "request",
  onUnlock,
  onConfirm,
  loading = false,
  requestFilled = false,
  perProfileCost = 0,
}: {
  match: any;
  /** "request": standard Pit Call results with unlock/confirmation flow. "pool": My Pool search (names in clear, no unlock CTA). */
  mode?: "request" | "pool";
  onUnlock?: () => void;
  onConfirm?: () => void;
  loading?: boolean;
  requestFilled?: boolean;
  perProfileCost?: number;
}) {
  const { t } = useTranslation();
  const pct = Math.round(Number(match?.skills_score ?? match?.match_score ?? 0));
  const perfect = !!match?.is_perfect;
  const blurred = !!match?.blurred;
  const unlocked = mode === "pool" ? true : !!match?.unlocked;
  const profile = match?.profile ?? null;
  const cov = coverageOf(match);
  const { title: covTitle, days: covDays } = useCoverageText(cov);
  const missingCriteria = Array.isArray(match?.missing_criteria) ? match.missing_criteria : [];
  const subRoles = parseSubRoles(profile?.sub_roles);
  const disciplines: string[] = Array.isArray(profile?.disciplines) ? profile.disciplines : [];
  const skills: string[] = Array.isArray(profile?.skills) ? profile.skills : [];
  const languages: any[] = Array.isArray(profile?.languages) ? profile.languages : [];
  const experiences: any[] = Array.isArray(profile?.experiences) ? profile.experiences : [];
  const displayName = mode === "pool" ? match?.name : profile?.display_name;
  const showIdentity = typeof displayName === "string" && displayName.trim().length > 0;
  const phoneLabel = [profile?.phone_dial_code, profile?.phone_number].filter(Boolean).join(" ").trim();
  const telHref = [profile?.phone_dial_code, profile?.phone_number].filter(Boolean).join("").replace(/\s+/g, "");
  const hasContacts = !!(profile?.contact_email || profile?.phone_number);
  const inPool = mode === "pool" || !!match?.in_pool;

  const tone: CardTone = perfect ? "perfect" : cov.isPartial ? (cov.edgeOnly ? "partial" : "danger") : mode === "pool" ? "pool" : "full";
  const headerTone = perfect || cov.isPartial ? "warn" : "success";
  const roleText = profile?.role_group
    ? `${roleGroupLabel(profile.role_group)}${subRoles.length ? " · " + subRoles.map((sr) => `${subRoleLabel(sr.sub_role)} (${levelLabel(sr.level)})`).join(", ") : ""}`
    : null;
  const initials = showIdentity ? String(displayName).split(/\s+/).map((s: string) => s[0]).join("").slice(0, 2).toUpperCase() : null;

  return (
    <CardShell tone={tone}>
      {/* 1 · STATE */}
      <CardHeader
        icon={<CalendarCheck className="size-4" />}
        tone={headerTone}
        title={perfect ? t("mcard.label_perfect") : covTitle}
        subtitle={covDays}
        right={<RelevanceScore pct={pct} perfect={perfect} />}
      >
        <div className="mt-1 flex flex-wrap gap-1.5">
          {match?.top_three && <Pill tone="warn">{t("sweep_engage.request_matches.top3_free")}</Pill>}
          {match?.free_preview && !match?.top_three && match?.unlocked && <Pill tone="warn">{t("sweep_engage.request_matches.unlocked_tag")}</Pill>}
        </div>
      </CardHeader>

      {/* 2 · ACTION (request mode only; pool-search has no per-card CTA by product design) */}
      {mode === "request" && (
        <ActionRow>
          {blurred && (
            <button type="button" onClick={onUnlock} disabled={loading} className={cardBtn.secondary}>
              <Unlock className="size-3.5" /> {t("sweep_engage.request_matches.unlock_details_button", { cost: perProfileCost })}
            </button>
          )}
          {match?.unlocked && !requestFilled && (
            match?.confirmation_requested ? (
              <StatusChip tone="warn">{t("mcard.confirmation_requested")}</StatusChip>
            ) : match?.confirmation_closed ? (
              <StatusChip tone="muted">{t(match.confirmation_closed === "expired" ? "mcard.confirmation_expired" : "mcard.confirmation_declined")}</StatusChip>
            ) : (
              <button type="button" onClick={onConfirm} disabled={loading} className={cardBtn.primary}>
                {t("sweep_engage.request_matches.request_confirmation_button")}
              </button>
            )
          )}
          {requestFilled && <StatusChip tone="warn">{t("sweep_engage.request_matches.match_already_assigned")}</StatusChip>}
        </ActionRow>
      )}

      <CardBody>
        {/* 3 · ALERT — missing days (partial only) */}
        <MissingDays c={cov} />

        {/* 4 · IDENTITY */}
        <IdentityRow
          avatar={showIdentity ? initials : unlocked ? <EyeOff className="size-4" /> : <Lock className="size-4" />}
          avatarTone={inPool ? "info" : showIdentity ? "success" : "muted"}
          name={
            <span className={showIdentity ? "" : "text-muted-foreground"}>
              {showIdentity ? displayName : t("sweep_engage.request_matches.hidden_freelancer")}
            </span>
          }
          meta={
            <>
              {roleText}
              {mode === "pool" && match?.profile?.headline && <span className="block">{match.profile.headline}</span>}
              {mode === "request" && profile?.headline && unlocked && <span className="block">{profile.headline}</span>}
            </>
          }
          pills={
            <>
              {inPool && <PoolBadge />}
              <RankPill rank={match?.rank} tier={match?.tier} />
            </>
          }
          hiddenNote={mode === "request" && !showIdentity ? t("cards.identity_hidden_freelancer") : undefined}
        />

        {/* 5 · FACTS */}
        {(profile?.location || profile?.day_rate != null || profile || match?.rating?.count > 0) && (
          <FactGrid cols={4}>
            {profile?.location && <Fact icon={<MapPin />} label={t("cards.location")} value={profile.location} />}
            {profile?.day_rate != null && <Fact icon={<Wallet />} label={t("cards.day_rate")} value={t("sweep_engage.request_matches.day_rate_per_day", { rate: profile.day_rate })} />}
            {profile && <Fact icon={<Plane />} label={t("mcard.travels")} value={profile.travels ? t("mcard.yes") : t("mcard.no")} />}
            {match?.rating?.count > 0 && (
              <Fact icon={<Star />} label={t("mcard.rating")} value={<RatingIcons variant="wrench" value={match.rating.average} count={match.rating.count} size={14} />} />
            )}
          </FactGrid>
        )}

        {/* 6 · CRITERIA (always visible: decision data) */}
        {mode === "request" && (
          <Section icon={<Award />} title={t("mcard.criteria")}>
            <CriteriaOutcome missing={missingCriteria} allOkText={t("sweep_engage.request_matches.all_criteria_satisfied_100")} />
          </Section>
        )}

        {/* 7 · DETAILS — secondary profile data + contacts */}
        {mode === "request" && (
          <DetailsToggle>
            {unlocked && profile ? (
              <>
                {profile.bio && (
                  <Section title={t("mcard.headline")}>
                    <p className="text-muted-foreground">{profile.bio}</p>
                  </Section>
                )}
                {disciplines.length > 0 && (
                  <Section title={t("mcard.disciplines")}><Chips>{disciplines.map((d) => <Chip key={d}>{disciplineLabel(d)}</Chip>)}</Chips></Section>
                )}
                {skills.length > 0 && (
                  <Section title={t("mcard.skills")}><Chips>{skills.map((s) => <Chip key={s}>{skillLabel(s)}</Chip>)}</Chips></Section>
                )}
                {languages.length > 0 && (
                  <Section title={t("mcard.languages")}>
                    <Chips>
                      {languages.map((l: any, i: number) => (
                        <Chip key={i}>{typeof l === "string" ? l : `${l?.custom || l?.code || ""}${l?.level ? ` · ${l.level}` : ""}`}</Chip>
                      ))}
                    </Chips>
                  </Section>
                )}
                {(experiences.length > 0 || profile.education) && (
                  <Section icon={<Briefcase />} title={t("mcard.exp_edu")}>
                    <div className="text-muted-foreground">
                      {experiences.map((e: any, i: number) => (
                        <span key={i}>{i > 0 && " · "}{disciplineLabel(e?.discipline)} · {e?.years ?? 0} {t("mcard.years_short")}</span>
                      ))}
                      {profile.education && <span>{experiences.length > 0 ? " · " : ""}{educationLabel(profile.education)}</span>}
                    </div>
                  </Section>
                )}
                <Section icon={<Mail />} title={t("mcard.contact")}>
                  {hasContacts ? (
                    <div className="grid gap-1">
                      {profile.contact_email && (
                        <a href={`mailto:${profile.contact_email}`} className="inline-flex items-center gap-2 break-all text-racing-red hover:underline"><Mail className="size-3.5 shrink-0" />{profile.contact_email}</a>
                      )}
                      {profile.phone_number && (
                        <a href={`tel:${telHref}`} className="inline-flex items-center gap-2 text-racing-red hover:underline"><Phone className="size-3.5 shrink-0" />{phoneLabel || profile.phone_number}</a>
                      )}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">{t("sweep_engage.matches.name_contacts_hidden")}</div>
                  )}
                </Section>
              </>
            ) : (
              <Section icon={<Lock />} title={t("mcard.contact")}>
                <p className="text-muted-foreground">{t("sweep_engage.request_matches.tech_details_hidden_note", { cost: perProfileCost })}</p>
              </Section>
            )}
          </DetailsToggle>
        )}
      </CardBody>
    </CardShell>
  );
}

/** Locked tier placeholder (Family 3). Purely visual; nothing behind it is fetched. */
export function LockedCandidateCard({ rank }: { rank: number }) {
  const { t } = useTranslation();
  return (
    <CardShell tone="locked">
      <div className="relative p-5">
        <div className="pointer-events-none select-none blur-md" aria-hidden>
          <div className="text-3xl font-black italic tracking-tighter text-muted-foreground">??%</div>
          <div className="mt-2 h-4 w-40 rounded bg-secondary" />
          <div className="mt-2 h-3 w-64 rounded bg-secondary" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <StatusChip tone="muted" className="bg-background/80 backdrop-blur">
            <EyeOff className="size-3" /> {t("sweep_engage.request_matches.rank_tier_locked", { rank })}
          </StatusChip>
        </div>
      </div>
    </CardShell>
  );
}

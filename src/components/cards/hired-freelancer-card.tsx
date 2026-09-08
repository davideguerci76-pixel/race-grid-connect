import { useTranslation } from "react-i18next";
import { CalendarPlus, CheckCircle2, Contact, Mail, MapPin, Phone } from "lucide-react";
import { CalendarQuickButtons, ContactQuickButtons } from "@/components/match-quick-actions";
import { disciplineLabel } from "@/lib/paddock";
import { roleGroupLabel, subRoleLabel } from "@/lib/roles";
import { CardBody, CardFooter, CardHeader, CardShell, Fact, FactGrid, IdentityRow, Section } from "@/components/cards/primitives";

/**
 * TEAM-SIDE confirmed match card (Family 4) shown on the Pit Call results page once a
 * freelancer has confirmed. Contacts are already authorised by the server at this point.
 */
export function HiredFreelancerCard({ hired, request }: { hired: any; request: any }) {
  const { t } = useTranslation();
  const name = hired?.display_name ?? "";
  const initials = name ? name.slice(0, 2).toUpperCase() : "?";
  const tel = hired?.phone_number ? `${hired.phone_dial_code ?? ""}${hired.phone_number}`.replace(/\s+/g, "") : null;

  return (
    <CardShell tone="confirmed" className="mt-6">
      <CardHeader icon={<CheckCircle2 className="size-4" />} tone="success" title={t("sweep_engage.request_matches.confirmed_match_title", { defaultValue: "Confirmed match" })} subtitle={request?.title} />
      <CardBody>
        <IdentityRow
          avatar={initials}
          avatarTone="success"
          name={name}
          meta={
            <>
              {hired?.role_group && roleGroupLabel(hired.role_group)}
              {hired?.headline && <span className="block">{hired.headline}</span>}
            </>
          }
        />
        <FactGrid cols={3}>
          {hired?.location && <Fact icon={<MapPin />} label={t("cards.location")} value={hired.location} />}
          <Fact
            icon={<Mail />}
            label={t("mcard.contact")}
            value={
              hired?.contact_email ? (
                <a href={`mailto:${hired.contact_email}`} className="break-all text-racing-red hover:underline">{hired.contact_email}</a>
              ) : (
                <span className="font-normal text-muted-foreground">{t("sweep_engage.request_matches.no_email_on_file")}</span>
              )
            }
          />
          <Fact
            icon={<Phone />}
            label={t("phone.label", { defaultValue: "Phone" })}
            value={
              hired?.phone_number ? (
                <a href={`tel:${tel}`} className="text-racing-red hover:underline">{hired.phone_dial_code} {hired.phone_number}</a>
              ) : (
                <span className="font-normal text-muted-foreground">{t("sweep_engage.request_matches.no_phone_on_file")}</span>
              )
            }
          />
        </FactGrid>
      </CardBody>
      <CardFooter className="grid gap-3 md:grid-cols-2">
        <Section icon={<CalendarPlus />} title={t("sweep_engage.request_matches.add_match_dates_to_calendar")} className="bg-transparent">
          <CalendarQuickButtons
            event={{
              title: `Match — ${request.title}`,
              startDate: request.start_date,
              endDate: request.end_date,
              location: request.location ?? request.circuit ?? null,
              description: `${roleGroupLabel(request.role_group)}${request.sub_role ? ` · ${subRoleLabel(request.sub_role)}` : ""} · ${disciplineLabel(request.discipline)}\nFreelancer: ${name}${hired?.contact_email ? `\nEmail: ${hired.contact_email}` : ""}${hired?.phone_number ? `\nPhone: ${hired.phone_dial_code ?? ""} ${hired.phone_number}` : ""}`,
            }}
          />
        </Section>
        <Section icon={<Contact />} title={t("sweep_engage.request_matches.save_freelancer_contact")} className="bg-transparent">
          <ContactQuickButtons
            contact={{
              fullName: name || t("sweep_engage.matches.freelancer_fallback"),
              email: hired?.contact_email ?? null,
              phone: tel,
              title: hired?.role_group ? roleGroupLabel(hired.role_group) : null,
              notes: t("sweep_engage.request_matches.pitcall_match_confirmed_note", { title: request.title }),
            }}
          />
        </Section>
      </CardFooter>
    </CardShell>
  );
}

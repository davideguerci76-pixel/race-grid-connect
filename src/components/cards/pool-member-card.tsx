import { useTranslation } from "react-i18next";
import { Hash, Mail, MapPin, Phone, ShieldCheck, Tag } from "lucide-react";
import { PoolBadge } from "@/components/pool-badge";
import { roleGroupLabel } from "@/lib/roles";
import { CardBody, CardHeader, CardShell, Fact, FactGrid, IdentityRow } from "@/components/cards/primitives";

/**
 * TEAM-SIDE My Pool member card (Family 11). Contacts are already authorised
 * server-side for pool members; absent values are stated, never blanked.
 */
export function PoolMemberCard({ member }: { member: any }) {
  const { t } = useTranslation();
  const phoneLabel = [member.phone_dial_code, member.phone_number].filter(Boolean).join(" ").trim();
  const telHref = [member.phone_dial_code, member.phone_number].filter(Boolean).join("").replace(/\s+/g, "");
  const initials = String(member.name ?? "?").split(/\s+/).map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <CardShell tone="pool">
      <CardHeader
        icon={<ShieldCheck className="size-4" />}
        tone="info"
        title={t("pool.badge")}
        subtitle={member.source === "code" ? t("pool.source_code") : t("pool.source_engagement")}
        right={<PoolBadge />}
      />
      <CardBody>
        <IdentityRow
          avatar={initials}
          avatarTone="info"
          name={member.name}
          meta={
            <>
              {member.role_group && roleGroupLabel(member.role_group)}
              {member.headline && <span className="block">{member.headline}</span>}
            </>
          }
        />
        <FactGrid cols={4}>
          {member.location && <Fact icon={<MapPin />} label={t("cards.location")} value={member.location} />}
          {member.pit_code && <Fact icon={<Hash />} label={t("cards.pool_code")} value={<span className="font-mono">{member.pit_code}</span>} />}
          <Fact
            icon={<Mail />}
            label={t("mcard.contact")}
            value={
              member.contact_email ? (
                <a href={`mailto:${member.contact_email}`} className="break-all text-racing-red hover:underline">{member.contact_email}</a>
              ) : (
                <span className="font-normal text-muted-foreground">{t("pool.no_email")}</span>
              )
            }
          />
          <Fact
            icon={<Phone />}
            label={t("phone.label")}
            value={
              member.phone_number ? (
                <a href={`tel:${telHref}`} className="text-racing-red hover:underline">{phoneLabel || member.phone_number}</a>
              ) : (
                <span className="font-normal text-muted-foreground">{t("pool.no_phone")}</span>
              )
            }
          />
          {!member.location && !member.pit_code && <Fact icon={<Tag />} label={t("cards.pool_source")} value={member.source === "code" ? t("pool.source_code") : t("pool.source_engagement")} />}
        </FactGrid>
      </CardBody>
    </CardShell>
  );
}

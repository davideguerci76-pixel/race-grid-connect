import { useTranslation } from "react-i18next";
import { CalendarPlus, Apple, UserPlus, Contact } from "lucide-react";
import {
  buildGoogleCalendarUrl,
  buildGoogleContactsUrl,
  downloadIcs,
  downloadVCard,
  type CalendarEvent,
  type ContactCard,
} from "@/lib/calendar-contacts";

const btn =
  "inline-flex items-center gap-2 border border-border bg-background px-3 py-2 font-mono text-[10px] uppercase tracking-widest hover:border-racing-red hover:text-racing-red transition-colors";

export function CalendarQuickButtons({ event, className }: { event: CalendarEvent; className?: string }) {
  const { t } = useTranslation();
  const gcalUrl = buildGoogleCalendarUrl(event);
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      <a href={gcalUrl} target="_blank" rel="noopener noreferrer" className={btn}>
        <CalendarPlus className="size-3.5" /> {t("sweep_engage.quick_actions.google_calendar")}
      </a>
      <button type="button" onClick={() => downloadIcs(event)} className={btn}>
        <Apple className="size-3.5" /> {t("sweep_engage.quick_actions.apple_calendar")}
      </button>
    </div>
  );
}

export function ContactQuickButtons({ contact, className }: { contact: ContactCard; className?: string }) {
  const { t } = useTranslation();
  const gUrl = buildGoogleContactsUrl(contact);
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      <button type="button" onClick={() => downloadVCard(contact)} className={btn}>
        <Contact className="size-3.5" /> {t("sweep_engage.quick_actions.save_vcard")}
      </button>
      <a href={gUrl} target="_blank" rel="noopener noreferrer" className={btn}>
        <UserPlus className="size-3.5" /> {t("sweep_engage.quick_actions.save_google_contacts")}
      </a>
    </div>
  );
}

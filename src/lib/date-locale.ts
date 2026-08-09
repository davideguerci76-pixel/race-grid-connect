import { useTranslation } from "react-i18next";
import { enUS, it, es, fr, de, type Locale } from "date-fns/locale";

/** BCP47 tags used by Intl for each supported UI language. */
export const LOCALE_TAGS: Record<string, string> = {
  en: "en-GB",
  it: "it-IT",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
};

export const DATE_FNS_LOCALES: Record<string, Locale> = { en: enUS, it, es, fr, de };

export function localeTagFor(lang?: string | null) {
  const code = (lang ?? "en").slice(0, 2).toLowerCase();
  return LOCALE_TAGS[code] ?? LOCALE_TAGS.en;
}

export function dateFnsLocaleFor(lang?: string | null) {
  const code = (lang ?? "en").slice(0, 2).toLowerCase();
  return DATE_FNS_LOCALES[code] ?? enUS;
}

type DateLike = Date | string | number | null | undefined;

function toDate(d: DateLike): Date | null {
  if (d === null || d === undefined) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Date/time formatting bound to the active UI language (never the browser locale),
 * so month and weekday names follow the language selected in the app.
 */
export function useDateFormat() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const tag = localeTagFor(lang);

  const format = (d: DateLike, opts: Intl.DateTimeFormatOptions, fallback = "—") => {
    const date = toDate(d);
    if (!date) return fallback;
    try {
      return new Intl.DateTimeFormat(tag, opts).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  };

  return {
    lang,
    tag,
    dateFnsLocale: dateFnsLocaleFor(lang),
    /** e.g. 12 Mar 2026 */
    formatDate: (d: DateLike, fallback?: string) =>
      format(d, { day: "2-digit", month: "short", year: "numeric" }, fallback),
    /** e.g. 12 March 2026 */
    formatLongDate: (d: DateLike, fallback?: string) =>
      format(d, { day: "numeric", month: "long", year: "numeric" }, fallback),
    /** e.g. 12 Mar 2026, 14:30 */
    formatDateTime: (d: DateLike, fallback?: string) =>
      format(d, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }, fallback),
    /** e.g. March 2026 */
    formatMonthYear: (d: DateLike, fallback?: string) => format(d, { month: "long", year: "numeric" }, fallback),
    formatCustom: format,
  };
}

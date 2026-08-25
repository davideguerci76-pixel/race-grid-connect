import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { searchPlaces, type GeoResult } from "@/lib/geocode.functions";

export type LocationPick = {
  text: string;
  lat: number | null;
  lng: number | null;
  city: string | null;
  region: string | null;
  country: string | null;
  placeId: string;
};

/**
 * Address autocomplete backed by Nominatim / OpenStreetMap (open source, no API key).
 */
export function LocationAutocomplete({
  value,
  onChange,
  onPick,
  placeholder = "City, Country",
  className,
  includeAllPlaces = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (p: LocationPick) => void;
  placeholder?: string;
  className?: string;
  /** Pit Calls may target a named circuit; profiles remain limited to settlements. */
  includeAllPlaces?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const search = useServerFn(searchPlaces);
  const [input, setInput] = useState(value);
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const debRef = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const reqRef = useRef(0);

  useEffect(() => { setInput(value); }, [value]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const runQuery = useCallback(async (text: string) => {
    if (text.trim().length < 2) { setSuggestions([]); setOpen(false); return; }
    const id = ++reqRef.current;
    try {
      const results = await search({
        data: { q: text, lang: i18n.language, citiesOnly: !includeAllPlaces },
      });
      if (!mountedRef.current || id !== reqRef.current) return;
      setSuggestions(results);
      setFailed(results.length === 0 ? false : false);
      setOpen(results.length > 0);
    } catch {
      if (!mountedRef.current || id !== reqRef.current) return;
      setSuggestions([]);
      setFailed(true);
    }
  }, [search, i18n.language, includeAllPlaces]);

  const query = (text: string) => {
    if (debRef.current) window.clearTimeout(debRef.current);
    debRef.current = window.setTimeout(() => { void runQuery(text); }, 350);
  };

  const pick = (s: GeoResult) => {
    setInput(s.text);
    onChange(s.text);
    setOpen(false);
    setSuggestions([]);
    onPick?.({
      text: s.text,
      lat: s.lat,
      lng: s.lng,
      city: s.city,
      region: s.region,
      country: s.country,
      placeId: s.id,
    });
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        value={input}
        onChange={(e) => { setInput(e.target.value); onChange(e.target.value); query(e.target.value); }}
        onFocus={() => { if (suggestions.length) setOpen(true); }}
        placeholder={placeholder}
        className={className ?? "mt-1 w-full border border-border bg-background px-3 py-2 text-sm"}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-label={placeholder}
      />
      {failed && (
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase text-racing-red" role="alert">
          {t("location.unavailable", { defaultValue: "Location suggestions unavailable" })}
          <button type="button" onClick={() => { setFailed(false); void runQuery(input); }} className="underline">
            {t("location.retry", { defaultValue: "Retry" })}
          </button>
        </p>
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto border border-border bg-card shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pick(s)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary"
            >
              {s.text}
            </button>
          ))}
          <div className="border-t border-border px-3 py-1.5 text-right text-[9px] uppercase text-muted-foreground">
            {t("location.powered_by_osm", { defaultValue: "© OpenStreetMap contributors" })}
          </div>
        </div>
      )}
    </div>
  );
}

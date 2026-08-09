import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const CHANNEL = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

// Google's official inline dynamic loader. Idempotent and callback-free —
// works with `importLibrary('places')` without needing `libraries=` or
// `callback=` URL params. On a failed script load the bootstrap flag is reset
// so a later attempt (focus, keystroke, retry button) can try again.
let bootstrapped = false;
function bootstrapMaps() {
  if (typeof window === "undefined") return;
  const w = window as any;
  if (w.google?.maps?.importLibrary) { bootstrapped = true; return; }
  if (bootstrapped) return;
  if (!BROWSER_KEY) return;
  bootstrapped = true;
  // eslint-disable-next-line
  ((g: any) => {
    let h: Promise<any> | undefined;
    const c = "google" as const;
    const l = "importLibrary";
    const q = "__ib__";
    const m = document;
    let b: any = window;
    b = b[c] || (b[c] = {});
    const d: any = b.maps || (b.maps = {});
    const r = new Set<string>();
    const e = new URLSearchParams();
    const u = () => h || (h = new Promise<void>((f, n) => {
      const a = m.createElement("script");
      e.set("libraries", [...r].join(","));
      for (const k in g) e.set(k.replace(/[A-Z]/g, (t) => "_" + t[0].toLowerCase()), g[k]);
      e.set("callback", c + ".maps." + q);
      a.src = `https://maps.googleapis.com/maps/api/js?` + e.toString();
      d[q] = f;
      a.onerror = () => {
        h = undefined;
        bootstrapped = false;
        try { a.remove(); } catch { /* ignore */ }
        try { delete d[l]; } catch { /* ignore */ }
        n(new Error("Google Maps could not load."));
      };
      a.nonce = (m.querySelector("script[nonce]") as HTMLScriptElement | null)?.nonce || "";
      m.head.append(a);
    }));
    if (d[l]) { /* already loaded */ }
    else d[l] = (f: string, ...n: any[]) => (r.add(f), u().then(() => d[l](f, ...n)));
  })({ key: BROWSER_KEY, v: "weekly", ...(CHANNEL ? { channel: CHANNEL } : {}) });
}

let placesPromise: Promise<any> | null = null;
async function loadPlaces(): Promise<any> {
  if (placesPromise) return placesPromise;
  placesPromise = (async () => {
    bootstrapMaps();
    const w = window as any;
    if (!w.google?.maps?.importLibrary) throw new Error("Google Maps not available");
    return await w.google.maps.importLibrary("places");
  })().catch((err) => {
    placesPromise = null;
    throw err;
  });
  return placesPromise;
}

export type LocationPick = {
  text: string;
  lat: number | null;
  lng: number | null;
  city: string | null;
  region: string | null;
  country: string | null;
  placeId: string;
};

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
  /** Job Requests may target a named circuit; profiles remain limited to geographic areas. */
  includeAllPlaces?: boolean;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState(value);
  const [suggestions, setSuggestions] = useState<Array<{ text: string; placeId: string }>>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const placesRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const debRef = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const attemptRef = useRef(0);
  const pendingRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => { setInput(value); }, [value]);

  const ensureLoaded = useCallback(async (): Promise<any | null> => {
    if (placesRef.current) return placesRef.current;
    try {
      const places = await loadPlaces();
      if (!mountedRef.current) return null;
      placesRef.current = places;
      sessionRef.current = new places.AutocompleteSessionToken();
      setReady(true);
      setLoadFailed(false);
      attemptRef.current = 0;
      return places;
    } catch {
      if (!mountedRef.current) return null;
      setReady(false);
      setLoadFailed(true);
      // Exponential backoff, capped — the input keeps working the moment it recovers.
      const attempt = Math.min(attemptRef.current++, 4);
      window.setTimeout(() => { if (mountedRef.current) void ensureLoaded(); }, 1000 * 2 ** attempt);
      return null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void ensureLoaded();
    return () => { mountedRef.current = false; };
  }, [ensureLoaded]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const runQuery = useCallback(async (text: string, retry = true) => {
    if (text.trim().length < 2) { setSuggestions([]); return; }
    const places = placesRef.current ?? (await ensureLoaded());
    if (!places) { pendingRef.current = text; return; }
    try {
      if (!sessionRef.current) sessionRef.current = new places.AutocompleteSessionToken();
      const request: Record<string, unknown> = { input: text, sessionToken: sessionRef.current };
      if (!includeAllPlaces) {
        request.includedPrimaryTypes = ["locality", "administrative_area_level_1", "administrative_area_level_2", "country"];
      }
      const { suggestions: s } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      if (!mountedRef.current) return;
      const mapped = (s ?? [])
        .filter((x: any) => x.placePrediction)
        .map((x: any) => ({
          text: x.placePrediction.text?.toString?.() ?? x.placePrediction.text ?? "",
          placeId: x.placePrediction.placeId,
        }));
      setSuggestions(mapped);
      setLoadFailed(false);
      setOpen(true);
    } catch {
      // A stale session token or a transient quota blip: refresh the token and retry once.
      if (retry) {
        try { sessionRef.current = new places.AutocompleteSessionToken(); } catch { /* ignore */ }
        await runQuery(text, false);
        return;
      }
      if (mountedRef.current) setSuggestions([]);
    }
  }, [ensureLoaded, includeAllPlaces]);

  // Replay the last keystroke typed while the library was still loading.
  useEffect(() => {
    if (ready && pendingRef.current) {
      const text = pendingRef.current;
      pendingRef.current = null;
      void runQuery(text);
    }
  }, [ready, runQuery]);

  const query = (text: string) => {
    if (debRef.current) window.clearTimeout(debRef.current);
    debRef.current = window.setTimeout(() => { void runQuery(text); }, 200);
  };

  const pick = async (s: { text: string; placeId: string }) => {
    setInput(s.text);
    onChange(s.text);
    setOpen(false);
    const places = placesRef.current;
    let lat: number | null = null;
    let lng: number | null = null;
    let emitted = false;
    if (places && onPick) {
      try {
        const place = new places.Place({ id: s.placeId });
        await place.fetchFields({ fields: ["id", "formattedAddress", "location", "addressComponents"] });
        const loc = (place as any).location;
        if (loc) {
          lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
          lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
        }
        const components = Array.isArray((place as any).addressComponents) ? (place as any).addressComponents : [];
        const component = (...types: string[]) => {
          const found = components.find((item: any) => types.some((type) => item.types?.includes(type)));
          return found?.longText ?? found?.shortText ?? null;
        };
        const text = (place as any).formattedAddress || s.text;
        onPick({
          text,
          lat,
          lng,
          city: component("locality", "postal_town", "administrative_area_level_3"),
          region: component("administrative_area_level_1", "administrative_area_level_2"),
          country: component("country"),
          placeId: (place as any).id || s.placeId,
        });
        emitted = true;
      } catch { /* ignore */ }
    }
    if (!emitted) {
      onPick?.({ text: s.text, lat, lng, city: null, region: null, country: null, placeId: s.placeId });
    }
    if (places) {
      try { sessionRef.current = new places.AutocompleteSessionToken(); } catch { /* ignore */ }
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        value={input}
        onChange={(e) => { setInput(e.target.value); onChange(e.target.value); query(e.target.value); }}
        onFocus={() => { void ensureLoaded(); if (suggestions.length) setOpen(true); }}
        placeholder={placeholder}
        className={className ?? "mt-1 w-full border border-border bg-background px-3 py-2 text-sm"}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-label={placeholder}
      />
      {loadFailed && (
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase text-racing-red" role="alert">
          {t("location.unavailable", { defaultValue: "Location suggestions are reconnecting…" })}
          <button
            type="button"
            onClick={() => { attemptRef.current = 0; void ensureLoaded().then(() => { if (input) void runQuery(input); }); }}
            className="underline"
          >
            {t("location.retry", { defaultValue: "Retry" })}
          </button>
        </p>
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto border border-border bg-card shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => pick(s)}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary"
            >
              {s.text}
            </button>
          ))}
          <div className="border-t border-border px-3 py-1.5 text-right text-[9px] uppercase text-muted-foreground">
            {t("location.powered_by", { defaultValue: "Powered by Google" })}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const CHANNEL = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

// Google's official inline dynamic loader. Idempotent and callback-free —
// works with `importLibrary('places')` without needing `libraries=` or
// `callback=` URL params.
let bootstrapped = false;
function bootstrapMaps() {
  if (bootstrapped) return;
  if (typeof window === "undefined") return;
  const w = window as any;
  if (w.google?.maps?.importLibrary) { bootstrapped = true; return; }
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
    const u = () => h || (h = new Promise<void>(async (f, n) => {
      const a = m.createElement("script");
      e.set("libraries", [...r].join(","));
      for (const k in g) e.set(k.replace(/[A-Z]/g, (t) => "_" + t[0].toLowerCase()), g[k]);
      e.set("callback", c + ".maps." + q);
      a.src = `https://maps.googleapis.com/maps/api/js?` + e.toString();
      d[q] = f;
      a.onerror = () => { h = undefined; n(new Error("Google Maps could not load.")); };
      a.nonce = (m.querySelector("script[nonce]") as HTMLScriptElement | null)?.nonce || "";
      m.head.append(a);
    }));
    if (d[l]) { /* already loaded */ }
    else d[l] = (f: string, ...n: any[]) => (r.add(f), u().then(() => d[l](f, ...n)));
  })({ key: BROWSER_KEY, v: "weekly", ...(CHANNEL ? { channel: CHANNEL } : {}) });
}

async function loadPlaces(): Promise<any> {
  bootstrapMaps();
  const w = window as any;
  if (!w.google?.maps?.importLibrary) throw new Error("Google Maps not available");
  return await w.google.maps.importLibrary("places");
}

export function LocationAutocomplete({
  value,
  onChange,
  placeholder = "City, Country",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [input, setInput] = useState(value);
  const [suggestions, setSuggestions] = useState<Array<{ text: string; placeId: string }>>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const placesRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const debRef = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInput(value); }, [value]);

  useEffect(() => {
    let cancelled = false;
    loadPlaces()
      .then((places) => {
        if (cancelled) return;
        placesRef.current = places;
        sessionRef.current = new places.AutocompleteSessionToken();
        setReady(true);
      })
      .catch(() => setReady(false));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const query = (text: string) => {
    if (debRef.current) window.clearTimeout(debRef.current);
    debRef.current = window.setTimeout(async () => {
      if (!ready || text.trim().length < 2) { setSuggestions([]); return; }
      try {
        const places = placesRef.current;
        const { suggestions: s } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text,
          sessionToken: sessionRef.current,
          includedPrimaryTypes: ["locality", "administrative_area_level_1", "administrative_area_level_2", "country"],
        });
        const mapped = (s ?? [])
          .filter((x: any) => x.placePrediction)
          .map((x: any) => ({
            text: x.placePrediction.text?.toString?.() ?? x.placePrediction.text ?? "",
            placeId: x.placePrediction.placeId,
          }));
        setSuggestions(mapped);
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 200);
  };

  const pick = (s: { text: string; placeId: string }) => {
    setInput(s.text);
    onChange(s.text);
    setOpen(false);
    const places = placesRef.current;
    if (places) sessionRef.current = new places.AutocompleteSessionToken();
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
      />
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
        </div>
      )}
    </div>
  );
}

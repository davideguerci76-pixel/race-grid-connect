import { useEffect, useRef, useState } from "react";

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const CHANNEL = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

let mapsLoader: Promise<any> | null = null;
function loadMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  const w = window as any;
  if (w.google?.maps?.importLibrary) return Promise.resolve(w.google.maps);
  if (mapsLoader) return mapsLoader;
  if (!BROWSER_KEY) return Promise.reject(new Error("Missing Google Maps browser key"));
  mapsLoader = new Promise((resolve, reject) => {
    w.__lovableMapsInit = () => resolve((window as any).google.maps);
    const s = document.createElement("script");
    const channel = CHANNEL ? `&channel=${encodeURIComponent(CHANNEL)}` : "";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${BROWSER_KEY}&v=weekly&libraries=places&loading=async&callback=__lovableMapsInit${channel}`;
    s.async = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return mapsLoader;
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
  const sessionRef = useRef<any>(null);
  const debRef = useRef<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInput(value); }, [value]);

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(async (maps) => {
        const places = await maps.importLibrary("places");
        if (cancelled) return;
        sessionRef.current = new places.AutocompleteSessionToken();
        (window as any).__lovablePlaces = places;
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
        const places = (window as any).__lovablePlaces;
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
    // reset session for billing
    const places = (window as any).__lovablePlaces;
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

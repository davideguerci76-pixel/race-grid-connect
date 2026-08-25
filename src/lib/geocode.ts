export type GeoResult = {
  id: string;
  text: string;
  lat: number | null;
  lng: number | null;
  city: string | null;
  region: string | null;
  country: string | null;
};

/**
 * Open-source geocoding via Nominatim (OpenStreetMap). No API key, no billing.
 * Called directly from the browser (Nominatim allows CORS), so it does not
 * depend on any server function endpoint.
 */
export async function searchPlaces(opts: {
  q: string;
  lang?: string;
  citiesOnly?: boolean;
  signal?: AbortSignal;
}): Promise<GeoResult[]> {
  const q = opts.q.trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: "8",
    "accept-language": (opts.lang || "en").slice(0, 8),
  });
  if (opts.citiesOnly) params.set("featureType", "settlement");

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);

  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) return [];

  return (json as any[]).map((r) => {
    const a = r?.address ?? {};
    return {
      id: String(r?.place_id ?? `${r?.lat},${r?.lon}`),
      text: String(r?.display_name ?? ""),
      lat: r?.lat != null ? Number(r.lat) : null,
      lng: r?.lon != null ? Number(r.lon) : null,
      city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet ?? null,
      region: a.state ?? a.region ?? a.county ?? null,
      country: a.country ?? null,
    };
  });
}

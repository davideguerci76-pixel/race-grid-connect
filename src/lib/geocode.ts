import { searchPlacesServer, type GeoResult } from "./geocode.functions";

export type { GeoResult };

const cache = new Map<string, { at: number; results: GeoResult[] }>();
const TTL_MS = 5 * 60 * 1000;

/**
 * Address autocomplete. The actual OpenStreetMap/Nominatim call happens on our
 * own server (see geocode.functions.ts), so the user's IP and search text are
 * never sent to a third party from the browser.
 */
export async function searchPlaces(opts: {
  q: string;
  lang?: string;
  citiesOnly?: boolean;
  signal?: AbortSignal;
}): Promise<GeoResult[]> {
  const q = opts.q.trim();
  if (q.length < 2) return [];

  const key = `${opts.citiesOnly ? "c" : "a"}|${(opts.lang || "en").slice(0, 8)}|${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.results;

  const results = await searchPlacesServer({
    data: { q, lang: opts.lang, citiesOnly: opts.citiesOnly },
  });

  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), results });
  return results;
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  q: z.string().trim().min(2).max(120),
  lang: z.string().trim().min(2).max(8).optional(),
  citiesOnly: z.boolean().optional(),
});

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
 * Proxied through the server so we can send a proper User-Agent and cache.
 */
export const searchPlaces = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<GeoResult[]> => {
    const params = new URLSearchParams({
      q: data.q,
      format: "jsonv2",
      addressdetails: "1",
      limit: "8",
      "accept-language": data.lang || "en",
    });
    if (data.citiesOnly) params.set("featureType", "settlement");

    let res: Response;
    try {
      res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
          "User-Agent": "PitCall/1.0 (motorsport freelancer platform)",
          Accept: "application/json",
        },
      });
    } catch {
      return [];
    }
    if (!res.ok) return [];
    const json = (await res.json()) as any[];
    return (Array.isArray(json) ? json : []).map((r) => {
      const a = r.address ?? {};
      return {
        id: String(r.place_id ?? `${r.lat},${r.lon}`),
        text: String(r.display_name ?? ""),
        lat: r.lat != null ? Number(r.lat) : null,
        lng: r.lon != null ? Number(r.lon) : null,
        city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet ?? null,
        region: a.state ?? a.region ?? a.county ?? null,
        country: a.country ?? null,
      };
    });
  });

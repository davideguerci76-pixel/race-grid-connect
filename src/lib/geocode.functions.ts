import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  q: z.string().min(2).max(120),
  lang: z.string().max(8).optional(),
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
 * Server-side proxy for Nominatim / OpenStreetMap.
 *
 * GDPR: the browser never contacts openstreetmap.org, so no end-user IP or
 * search string is disclosed to a third party. The lookup is first-party and
 * therefore does not require prior cookie/consent handling.
 */
export const searchPlacesServer = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<GeoResult[]> => {
    const q = data.q.trim();
    if (q.length < 2) return [];

    const params = new URLSearchParams({
      q,
      format: "jsonv2",
      addressdetails: "1",
      limit: "8",
      "accept-language": (data.lang || "en").slice(0, 8),
    });
    if (data.citiesOnly) params.set("featureType", "settlement");

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          // Required by the Nominatim usage policy.
          "User-Agent": "PitCall/1.0 (https://pitcall.net; privacy@pitcall.net)",
        },
      });
      if (!res.ok) return [];
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
    } catch {
      return [];
    }
  });

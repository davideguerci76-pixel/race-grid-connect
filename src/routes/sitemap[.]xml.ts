import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { freelancers, teams } from "@/lib/mock-data";

const BASE_URL = "";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries = [
          { path: "/", priority: "1.0" },
          { path: "/bacheca", priority: "0.9" },
          { path: "/freelance", priority: "0.8" },
          { path: "/scuderie", priority: "0.8" },
          { path: "/registrati", priority: "0.7" },
          ...freelancers.map((f) => ({ path: `/freelance/${f.id}`, priority: "0.6" })),
          ...teams.map((t) => ({ path: `/scuderia/${t.id}`, priority: "0.6" })),
        ];
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...entries.map((e) => `  <url><loc>${BASE_URL}${e.path}</loc><priority>${e.priority}</priority></url>`),
          `</urlset>`,
        ].join("\n");
        return new Response(xml, {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});

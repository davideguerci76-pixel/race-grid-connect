// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const fallbackBackendUrl = "https://vhxbhdryexeowlgbuwng.supabase.co";
const fallbackPublishableKey = "sb_publishable_VF2T4JmiJtxvbouWZ5oluA_BSz35c0N";

// Load ALL env vars (no prefix) into process.env for server-side code only.
// These are NOT injected into the client bundle.
const serverEnv = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        // The generated Workbox worker owns caching; push handlers are imported
        // from public/push-sw.js so we never hand-write the app shell worker.
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        devOptions: { enabled: false },
        filename: "sw.js",
        manifest: false,
        manifestFilename: "manifest.webmanifest",
        workbox: {
          importScripts: ["/push-sw.js"],
          globPatterns: ["**/*.{js,css,woff2,png,svg,ico}"],
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/_serverFn\//, /^\/lovable\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: { cacheName: "pitcall-html", networkTimeoutSeconds: 5 },
            },
            {
              urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/assets/"),
              handler: "CacheFirst",
              options: { cacheName: "pitcall-assets", expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve(process.cwd(), "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(process.cwd(), "node_modules/entities/lib/encode.js"),
        entities: path.resolve(process.cwd(), "node_modules/entities"),
      },
    },

    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? fallbackBackendUrl,
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          fallbackPublishableKey,
      ),
    },
  },
});

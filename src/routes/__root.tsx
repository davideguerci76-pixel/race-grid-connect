import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import "../i18n";
import { applySavedLanguage } from "../i18n";
import { supabase } from "@/integrations/supabase/client";
import { IUBENDA_ENABLED, IUBENDA_SCRIPT_URL } from "@/config/iubenda";
import { registerServiceWorker } from "@/lib/pwa/register-sw";
import { initInstallPromptCapture } from "@/lib/pwa/install-prompt";
import { AppSplash } from "@/components/app-splash";

import { PitcallErrorScreen } from "@/components/pitcall-error-screen";
import { OfflineBanner } from "@/components/offline-banner";
import { ConfirmProvider } from "@/hooks/use-confirm";
import { normalizeCrash } from "@/lib/errors/normalize";
import { reportError } from "@/lib/errors/report";

function NotFoundComponent() {
  return (
    <PitcallErrorScreen
      code="404"
      titleKey="errors.screens.notFoundTitle"
      bodyKey="errors.screens.notFoundBody"
    />
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [referenceId, setReferenceId] = useState<string | undefined>(undefined);

  // Crashes are always persisted (sanitized) so support can match the code the
  // user reads on screen with the row in the technical error log.
  useEffect(() => {
    const report = reportError(error, normalizeCrash(error), {
      forceLog: true,
      context: { boundary: "tanstack_root_error_component" },
    });
    setReferenceId(report.referenceId);
  }, [error]);

  return (
    <PitcallErrorScreen
      code="RED FLAG"
      titleKey="errors.screens.crashTitle"
      bodyKey="errors.screens.crashBody"
      referenceId={referenceId}
      onRetry={() => {
        router.invalidate();
        reset();
      }}
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Pit Call — Box. Now! Motorsport freelancer matching" },
      { name: "description", content: "Pit Call matches motorsport freelancers with team Pit Calls by availability, role and location." },
      { property: "og:title", content: "Pit Call" },
      { property: "og:description", content: "Pit Call matches motorsport freelancers with team Pit Calls by availability, role and location." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Pit Call" },
      { name: "twitter:description", content: "Pit Call matches motorsport freelancers with team Pit Calls by availability, role and location." },
      { property: "og:image", content: "https://pitcall.net/og-image.png" },
      { name: "twitter:image", content: "https://pitcall.net/og-image.png" },
      // Installable app (PWA) hints
      { name: "theme-color", content: "#000000" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Pit Call" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png", sizes: "180x180" },
      // Fonts are self-hosted (see src/styles.css) — no Google Fonts request.
      { rel: "preload", href: "/fonts/outfit-latin.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    ],

    // iubenda unified embed: cookie banner + auto-blocking of consent-bound
    // scripts. Loaded in <head> so blocking is active before anything else runs.
    scripts: IUBENDA_ENABLED ? [{ type: "text/javascript", src: IUBENDA_SCRIPT_URL }] : [],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head suppressHydrationWarning><HeadContent /></head>
      <body suppressHydrationWarning>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // Restore the user's saved language after hydration (SSR always renders 'en').
  useEffect(() => applySavedLanguage(), []);

  // Capture the Android install prompt as early as possible.
  useEffect(() => initInstallPromptCapture(), []);

  // Service worker: registered only in the published app (guarded wrapper).
  // Taps on a push notification arrive here as an in-app navigation.
  useEffect(() => {
    registerServiceWorker((url) => router.navigate({ to: url }).catch(() => undefined));
  }, [router]);



  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <OfflineBanner />
        <Outlet />
        <AppSplash />
        <Toaster theme="dark" position="top-right" />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

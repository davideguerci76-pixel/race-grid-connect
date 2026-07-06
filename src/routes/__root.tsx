import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-mono text-7xl font-black text-racing-red">404</h1>
        <h2 className="mt-4 text-xl font-bold uppercase tracking-tight">Fuori pista</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Questa pagina non esiste o è stata rimossa dal paddock.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center bg-racing-red px-5 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:brightness-110"
          >
            Torna in griglia
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold uppercase tracking-tight">Bandiera rossa</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Qualcosa è andato storto. Prova a ricaricare o torna in home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="bg-racing-red px-5 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110"
          >
            Riprova
          </button>
          <a
            href="/"
            className="border border-border px-5 py-3 text-xs font-bold uppercase tracking-widest hover:bg-secondary"
          >
            Home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "PaddockPro — Freelance e scuderie del motorsport" },
      {
        name: "description",
        content:
          "La piattaforma che connette meccanici, ingegneri, telemetristi e data analyst con scuderie di F1, Rally, GT e Karting.",
      },
      { property: "og:title", content: "PaddockPro — Freelance e scuderie del motorsport" },
      {
        property: "og:description",
        content:
          "Trova il tuo prossimo weekend di gara o assumi lo specialista giusto per il paddock.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700;900&family=JetBrains+Mono:wght@400;500;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

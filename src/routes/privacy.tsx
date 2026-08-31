import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { embedUrl } from "@/config/iubenda";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Pit Call" },
      { name: "description", content: "Privacy Policy of Pit Call, provided by iubenda." },
      { property: "og:title", content: "Privacy Policy — Pit Call" },
      { property: "og:description", content: "Privacy Policy of Pit Call, provided by iubenda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="container-page py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-carbon">
          <iframe
            title="Privacy Policy"
            src={embedUrl("privacy")}
            className="h-[75vh] w-full"
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const DOCS: Record<string, { title: string; body: string[] }> = {
  privacy: {
    title: "Privacy Policy",
    body: [
      "PaddockPro processes personal data solely to operate the matching platform between motorsport freelancers and teams.",
      "We store your profile, availability, requests, matches and ratings. We never sell your data.",
      "You can request export or deletion of your account at any time by contacting privacy@paddockpro.app.",
      "Placeholder document — replace with your final legal copy before launch.",
    ],
  },
  terms: {
    title: "Terms of Service",
    body: [
      "By using PaddockPro you agree to provide accurate information, honour confirmed engagements, and rate counterparties fairly.",
      "Tokens purchased are non-refundable once spent to reveal a match.",
      "PaddockPro is not a party to any contract between freelancer and team.",
      "Placeholder document — replace with your final legal copy before launch.",
    ],
  },
  cookie: {
    title: "Cookie Policy",
    body: [
      "We use strictly necessary cookies for authentication and session management.",
      "We use local storage to remember your language preference.",
      "No advertising or third-party tracking cookies are set.",
      "Placeholder document — replace with your final legal copy before launch.",
    ],
  },
};

export const Route = createFileRoute("/legal/$doc")({
  loader: ({ params }) => {
    const doc = DOCS[params.doc];
    if (!doc) throw notFound();
    return doc;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.title ?? "Legal"} · PaddockPro` },
      { name: "description", content: `${loaderData?.title ?? "Legal"} for PaddockPro.` },
    ],
  }),
  component: LegalPage,
  errorComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      Failed to load document
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <div className="text-2xl font-black uppercase">Document not found</div>
        <Link to="/" className="mt-4 inline-block text-racing-red hover:underline">Back home</Link>
      </div>
    </div>
  ),
});

function LegalPage() {
  const doc = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page py-16">
        <div className="label-mono">[LEGAL]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{doc.title}</h1>
        <div className="mt-8 max-w-2xl space-y-4 text-sm text-muted-foreground">
          {doc.body.map((p: string, i: number) => <p key={i}>{p}</p>)}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

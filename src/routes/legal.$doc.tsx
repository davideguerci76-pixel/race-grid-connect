import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BackButton } from "@/components/back-button";
import { IUBENDA_ENABLED, PRIVACY_EMAIL, embedUrl } from "@/config/iubenda";
import { openCookiePreferences } from "@/lib/iubenda";

type Section = { heading?: string; body: string[] };

const TERMS: Section[] = [
  {
    heading: "1. What Pit Call is (and is not)",
    body: [
      "Pit Call is a technology platform (SaaS) that matches motorsport teams with independent professionals based on availability, role, discipline, skills and location.",
      "Pit Call is NOT an employment agency, NOT a staffing or labour-intermediation service (including within the meaning of Italian Legislative Decree 276/2003), NOT a recruiter and NOT a party to any agreement concluded between a team and a professional.",
      "Pit Call does not negotiate, sign, guarantee, supervise or enforce any engagement. Fees, working conditions, insurance, tax and social-security obligations are agreed and fulfilled exclusively between the team and the professional.",
    ],
  },
  {
    heading: "2. Accounts and accuracy",
    body: [
      "Accounts are personal. You must provide accurate identity, professional and — for teams — valid tax/VAT information, and keep it up to date.",
      "Teams must register with a valid VAT or tax identification number; Pit Call may suspend accounts whose details cannot be verified.",
      "You are responsible for the security of your credentials and for all activity carried out through your account.",
    ],
  },
  {
    heading: "3. Tokens",
    body: [
      "Tokens are a prepaid unit that grants access to platform features (publishing a Pit Call, revealing a match, unlocking reviews or pool searches). Tokens are not a commission on any engagement, are not electronic money, and have no value outside the platform.",
      "Tokens are consumed at the moment the feature is used and are non-refundable once spent, except where the platform explicitly provides a refund rule (for example a Pit Call closed with zero matches).",
      "Where a purchase is made by a consumer, by requesting immediate access to the digital feature you expressly consent to immediate performance and acknowledge losing the right of withdrawal once the tokens are used.",
      "Tokens are non-transferable between accounts and expire with the account.",
    ],
  },
  {
    heading: "4. Data you receive about other users",
    body: [
      "When a team unlocks a match or a profile, it receives personal data of a professional. From that moment the team acts as an INDEPENDENT DATA CONTROLLER for those data.",
      "The team may use those data only to evaluate and manage the specific engagement. Reuse for marketing, resale, transfer to third parties, bulk export or building of parallel databases is prohibited and constitutes a material breach.",
      "The team must comply with the GDPR in respect of those data, including retention limits and the exercise of data-subject rights.",
      "The same rules apply to professionals receiving team contact details.",
    ],
  },
  {
    heading: "5. Ratings and user-generated content",
    body: [
      "Ratings are double-blind: they become visible only after both parties have submitted, or after the time window has elapsed. Only users who actually completed an engagement through the platform can rate.",
      "Ratings must be truthful, based on direct experience and free from unlawful, defamatory or discriminatory content.",
      "Any rated user may flag a rating; flagged ratings are reviewed by moderation and may be removed or annotated.",
      "Pit Call does not buy, sell or fabricate reviews and does not remove negative ratings on request.",
    ],
  },
  {
    heading: "6. Automated matching",
    body: [
      "Matches are produced by an automated scoring engine based on the data you provide (availability, role and seniority, discipline, skills, languages, education, day rate, distance and calendar freshness).",
      "Scoring determines visibility and ranking; it never produces an automatic legal or contractual decision. A human — the team — always decides whether to contact and engage.",
      "You may ask for an explanation of a score, and correcting your profile data recomputes it.",
    ],
  },
  {
    heading: "7. Conduct, cancellations and suspension",
    body: [
      "Confirmed engagements must be honoured. Late cancellations and no-shows are recorded on the account and may be shown as reliability signals.",
      "Circumventing the platform to avoid token costs after a match has been generated, harvesting data, scraping, or impersonating another person or team may lead to suspension without refund.",
    ],
  },
  {
    heading: "8. Liability",
    body: [
      "Pit Call provides the platform 'as is' and does not warrant that a Pit Call will produce a match, or that any engagement will be performed correctly.",
      "To the maximum extent permitted by law, Pit Call is not liable for the conduct, solvency, qualifications, insurance or compliance of any user, nor for indirect or consequential damages. Mandatory consumer rights are unaffected.",
    ],
  },
  {
    heading: "9. Termination and changes",
    body: [
      "You may close your account at any time from Dashboard → Profile → Privacy and data. Unused tokens are forfeited on voluntary closure.",
      "We may update these Terms; material changes are notified in-app before they take effect.",
    ],
  },
  {
    heading: "10. Governing law and contact",
    body: [
      `Italian law applies, without prejudice to the mandatory protections of the consumer's country of residence. Privacy requests: ${PRIVACY_EMAIL}.`,
    ],
  },
];

const TITLES: Record<string, string> = {
  privacy: "Privacy Policy",
  cookie: "Cookie Policy",
  terms: "Terms of Service",
};

export const Route = createFileRoute("/legal/$doc")({
  loader: ({ params }) => {
    const title = TITLES[params.doc];
    if (!title) throw notFound();
    return { doc: params.doc, title };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.title ?? "Legal"} · Pit Call` },
      { name: "description", content: `${loaderData?.title ?? "Legal"} for Pit Call, the motorsport freelancer matching platform.` },
      { property: "og:title", content: `${loaderData?.title ?? "Legal"} · Pit Call` },
      { property: "og:description", content: `${loaderData?.title ?? "Legal"} for Pit Call.` },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
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
  const { doc, title } = Route.useLoaderData();
  const isEmbedded = doc === "privacy" || doc === "cookie";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="container-page pt-6"><BackButton /></div>
      <div className="container-page py-16">
        <div className="label-mono">[LEGAL]</div>
        <h1 className="text-4xl font-black uppercase italic tracking-tighter">{title}</h1>

        {isEmbedded ? (
          IUBENDA_ENABLED ? (
            <div className="mt-8">
              <iframe
                title={title}
                src={embedUrl(doc as "privacy" | "cookie")}
                className="min-h-[1200px] w-full border border-border bg-white"
              />
              {doc === "cookie" && (
                <button
                  type="button"
                  onClick={openCookiePreferences}
                  className="mt-4 bg-racing-red px-5 py-3 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110"
                >
                  Cookie preferences
                </button>
              )}
            </div>
          ) : (
            <div className="mt-8 max-w-2xl space-y-4 text-sm text-muted-foreground">
              <p>
                The full {title.toLowerCase()} is served by our compliance provider and will appear here as soon as the
                document is published.
              </p>
              <p>
                In the meantime: Pit Call processes your account, profile, availability, engagement, rating and technical
                data to operate the matching platform. We never sell personal data. Strictly necessary cookies and local
                storage are used for authentication, language and interface preferences; third-party embeds (the market
                map) are blocked until you consent.
              </p>
              <p>Requests regarding your data: {PRIVACY_EMAIL}.</p>
            </div>
          )
        ) : (
          <div className="mt-8 max-w-3xl space-y-8 text-sm text-muted-foreground">
            {TERMS.map((s) => (
              <section key={s.heading}>
                <h2 className="mb-2 text-base font-bold uppercase tracking-tight text-foreground">{s.heading}</h2>
                <div className="space-y-2">
                  {s.body.map((p, i) => <p key={i}>{p}</p>)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}

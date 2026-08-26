/**
 * iubenda configuration.
 *
 * Fill these three values with the IDs from your iubenda dashboard:
 *  - siteId:          Cookie Solution → site ID
 *  - cookiePolicyId:  ID of the Privacy/Cookie Policy document
 *  - privacyPolicyId: usually identical to cookiePolicyId (same document set)
 *
 * While they are empty the banner and the embedded policies stay disabled and
 * the app shows a local fallback text, so nothing breaks before go-live.
 */
export const IUBENDA = {
  siteId: "",
  cookiePolicyId: "",
  privacyPolicyId: "",
} as const;

export const IUBENDA_ENABLED = Boolean(IUBENDA.siteId && IUBENDA.cookiePolicyId);

/** Privacy contact address used across legal copy. */
export const PRIVACY_EMAIL = "privacy@pitcall.net";

/**
 * iubenda per-purpose consent IDs.
 * 1 Strictly necessary · 2 Basic interactions · 3 Experience enhancement
 * 4 Measurement · 5 Targeting & advertising
 */
export const IUB_PURPOSE = {
  necessary: 1,
  basicInteractions: 2,
  experience: 3,
  measurement: 4,
  advertising: 5,
} as const;

export function policyUrl(kind: "privacy" | "cookie"): string {
  if (!IUBENDA_ENABLED) return "";
  const base = `https://www.iubenda.com/privacy-policy/${IUBENDA.privacyPolicyId}`;
  return kind === "cookie" ? `${base}/cookie-policy` : base;
}

export function embedUrl(kind: "privacy" | "cookie"): string {
  if (!IUBENDA_ENABLED) return "";
  const suffix = kind === "cookie" ? "/cookie-policy/legal" : "/legal";
  return `https://www.iubenda.com/privacy-policy/${IUBENDA.privacyPolicyId}${suffix}?an=no&s_ck=false&newmarkup=yes`;
}

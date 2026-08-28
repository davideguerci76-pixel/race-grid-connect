/**
 * iubenda configuration.
 *
 * The unified embedding script below is generated in the iubenda dashboard and
 * carries the whole configuration (cookie banner, per-purpose consent,
 * auto-blocking of consent-bound scripts and the policy widgets), so no manual
 * `_iub.csConfiguration` object is needed here.
 */
export const IUBENDA = {
  /** Unified embedding script id (embeds.iubenda.com/widgets/<id>.js). */
  embedId: "bac3589f-39ab-40b3-b5f4-c4d821e319b1",
  privacyPolicyId: "93285044",
} as const;

export const IUBENDA_SCRIPT_URL = `https://embeds.iubenda.com/widgets/${IUBENDA.embedId}.js`;

export const IUBENDA_ENABLED = Boolean(IUBENDA.embedId && IUBENDA.privacyPolicyId);

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

/**
 * Inline pre-configuration executed BEFORE the unified embedding script.
 * It only disables the auto-injected UI overlays (floating preferences button
 * and the US State Laws badges), never the underlying privacy features:
 * the same actions are exposed as plain links in the PITCALL footer.
 */
export const IUBENDA_PRECONFIG = `window._iub=window._iub||{};window._iub.csConfiguration=Object.assign({},window._iub.csConfiguration,{floatingPreferencesButtonDisplay:false,floatingPreferencesButtonCaption:false});window._iub.csPreConfiguration=Object.assign({},window._iub.csPreConfiguration,{floatingPreferencesButtonDisplay:false});`;

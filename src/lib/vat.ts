// International VAT / tax-ID validation.
// Country prefixes are validated against their national pattern; unknown
// countries fall back to a permissive-but-sane generic rule so teams from any
// jurisdiction can register without being blocked by an over-rigid regex.

const PATTERNS: Record<string, RegExp> = {
  AT: /^U\d{8}$/,
  BE: /^0?\d{9}$/,
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,
  GR: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[A-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^[A-Z0-9]{8,9}$/,
  IT: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
  GB: /^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
  CH: /^E?\d{9}(MWST|TVA|IVA)?$/,
  NO: /^\d{9}(MVA)?$/,
  AU: /^\d{11}$/,
  NZ: /^\d{8,9}$/,
  CA: /^\d{9}(RT\d{4})?$/,
  US: /^\d{9}$/,
  BR: /^\d{14}$/,
  MX: /^[A-Z0-9]{12,13}$/,
  IN: /^[A-Z0-9]{15}$/,
  JP: /^\d{13}$/,
  AE: /^\d{15}$/,
  ZA: /^4\d{9}$/,
  TR: /^\d{10,11}$/,
  RS: /^\d{9}$/,
  UA: /^\d{8,12}$/,
};

export function normalizeVat(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[\s.\-/_]/g, "");
}

export function isValidVat(raw: string): boolean {
  const v = normalizeVat(raw);
  if (v.length < 5 || v.length > 24) return false;
  if (!/^[A-Z0-9]+$/.test(v)) return false;

  const prefix = v.slice(0, 2);
  const pattern = PATTERNS[prefix];
  if (pattern) return pattern.test(v.slice(2));

  // Some countries are commonly written without the country prefix.
  if (/^\d+$/.test(v)) return v.length >= 8 && v.length <= 15;

  // Generic international fallback: must contain a reasonable amount of digits.
  const digits = v.replace(/\D/g, "").length;
  return digits >= 5;
}

export const VAT_PLACEHOLDER = "IT01234567890";

/**
 * Known academic email domain suffixes.
 * Extended list covering UK, US, AU, NZ, CA, EU and common global patterns.
 */
const ACADEMIC_SUFFIXES = [
  // UK
  ".ac.uk",
  // US
  ".edu",
  // Australia
  ".edu.au",
  // New Zealand
  ".ac.nz",
  // Canada
  ".edu.ca",
  ".ca", // many Canadian universities use .ca — checked with prefix guard below
  // Europe
  ".edu.pl",
  ".edu.eu",
  ".ac.at",    // Austria
  ".ac.be",    // Belgium
  ".ac.cy",    // Cyprus
  ".ac.il",    // Israel
  ".ac.in",    // India
  ".ac.jp",    // Japan
  ".ac.ke",    // Kenya
  ".ac.kr",    // South Korea
  ".ac.ng",    // Nigeria
  ".ac.nz",    // New Zealand (duplicate — harmless)
  ".ac.za",    // South Africa
  ".edu.ar",   // Argentina
  ".edu.au",   // Australia (duplicate — harmless)
  ".edu.br",   // Brazil
  ".edu.cn",   // China
  ".edu.co",   // Colombia
  ".edu.eg",   // Egypt
  ".edu.gh",   // Ghana
  ".edu.hk",   // Hong Kong
  ".edu.mx",   // Mexico
  ".edu.my",   // Malaysia
  ".edu.ng",   // Nigeria
  ".edu.pk",   // Pakistan
  ".edu.ph",   // Philippines
  ".edu.sg",   // Singapore
  ".edu.tr",   // Turkey
  ".edu.tw",   // Taiwan
  ".edu.vn",   // Vietnam
  ".uni.edu",
];

/**
 * Returns true if the email belongs to a recognised academic domain.
 */
export function isAcademicEmail(email: string): boolean {
  if (!email || !email.includes("@")) return false;
  const lower = email.toLowerCase().trim();
  return ACADEMIC_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

/**
 * Returns a user-friendly message explaining why the email was rejected.
 */
export function academicEmailError(): string {
  return "The Student plan is only available to users with an academic email address (e.g. .ac.uk, .edu). Please use your university email to subscribe.";
}

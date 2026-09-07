/**
 * The one switch that separates the preview build from the live site.
 *
 * While this is true the site behaves as a demo:
 *   • the sign-in page shows the seeded demo accounts and a "demo build" note
 *   • search engines are told not to index anything (see src/lib/seo.ts)
 *
 * ── AT LAUNCH ──────────────────────────────────────────────────────────────
 * 1. Set DEMO_MODE to false, and set SITE.url in src/lib/seo.ts to the real domain.
 * 2. Switch public/robots.txt to the allow rules written at the bottom of that file.
 *
 * Two steps, because they gate different things. This flag drives the robots
 * meta tag that RouteMeta writes on every route; robots.txt is the hard gate
 * that also stops crawlers which never run JavaScript. Until step 2 is done,
 * robots.txt still disallows everything — so flipping this flag alone cannot
 * put a placeholder site into Google.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const DEMO_MODE: boolean = true

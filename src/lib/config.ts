/**
 * Whether search engines may index the public site.
 *
 * This drives the robots meta tag that RouteMeta writes on every route (via
 * SITE.indexable in src/lib/seo.ts). It is deliberately NOT the only gate:
 * `public/robots.txt` is the hard one, because a meta tag only reaches
 * crawlers that run JavaScript.
 *
 * Both have to agree. Flipping this to true while robots.txt still carries
 * `Disallow: /` leaves the site out of search — which is the safe direction,
 * and the reason the two are separate.
 *
 * ── BEFORE TURNING THIS ON ─────────────────────────────────────────────────
 * The business phone, email and hours are seeded as the literal text
 * `TBD — add before launch` and render publicly (PublicFooter on every page,
 * Contact, FAQ, and the schema.org JSON-LD in RouteMeta). Indexing the site
 * while those are unfilled publishes them to Google. Fill them in Admin →
 * Settings first, then set SITE.url in src/lib/seo.ts to the real domain, then
 * switch public/robots.txt to its allow rules.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const SEARCH_INDEXABLE: boolean = false

# Launch checklist

The site is **deliberately invisible to search engines** right now. It carries
placeholder contact details, staff bios, and testimonials. Indexing that would
put fake business details into Google under this domain and give the real site a
thin-content history to climb out of.

Aunties Tykes is **not a licensed facility**. The `licenseNumber` field was
removed from the app entirely (types, settings table, admin UI) on 2026-09-18 —
do not reintroduce it, and do not describe the daycare as licensed anywhere.

## Going live — 2 steps

### 1. `src/lib/config.ts`

```ts
export const DEMO_MODE: boolean = false
```

That single flag:
- removes the demo login buttons and the seeded passwords from `/login`
- replaces the "demo build" note with "accounts are created by Aunties Tykes —
  there is no sign-up", plus the phone number
- flips the robots meta tag from `noindex, nofollow` to `index, follow`

Also set the real domain in `src/lib/seo.ts`:

```ts
url: 'https://auntiestykes.com',
```

`SITE.url` builds every canonical and og:url — a stale value points them all at
the preview domain.

### 2. `public/robots.txt`

Delete the `Disallow: /` block and uncomment the launch rules below it.

**This is the hard gate.** `DEMO_MODE` controls a meta tag, which only reaches
crawlers that run JavaScript. robots.txt stops everything. Until step 2 is done
the site stays out of search no matter what the flag says — that separation is
deliberate, so one flag flip can never expose a placeholder site by accident.

## Before real families use it

- [ ] **Replace the marked placeholders in Admin → Settings.** These three are
      seeded as the literal text `TBD — add before launch` and every one of them
      renders publicly — `PublicFooter` (all pages), Contact, FAQ, and the
      schema.org JSON-LD in `RouteMeta`:
      - [ ] `phone` — also feeds the `tel:` link on `/login`
      - [ ] `email` — also feeds `mailto:` links on Contact and FAQ
      - [ ] `hours`
- [ ] Confirm the carried-over demo values are really hers: capacity (12),
      ratios, and all six tuition rates
- [ ] Confirm the street address — only the town (Camp Hill, PA) is confirmed;
      the former street address was invented demo data and has been removed
- [ ] Owner confirms the spelling of her own name — the demo used "Mellissa",
      the seed uses "Melissa"
- [ ] Replace the remaining placeholder content: staff bios, testimonials,
      `placehold.co` images (3 references in `src/`)
- [ ] Owner reviews every policy text in Admin → Settings — that wording is what
      families are held to
- [ ] Swap plain-text passwords for Supabase Auth
- [ ] Connect Stripe (**webhook URLs must include `www.`** — Stripe does not
      follow 307 redirects)
- [ ] Connect file storage so documents have real files behind them
- [ ] Connect transactional email so credentials and announcements actually send
- [ ] Add per-page Open Graph if link previews per route matter — the static
      block in `index.html` covers every shared link with one card today, and
      social scrapers do not run JavaScript, so true per-page previews need
      prerendering or SSR

## Verified before handoff

Every route rendered clean with no console errors; both auth guards hold; a
parent cannot open another family's invoice; enrollment works end to end from
public form to a working login; admin-created accounts sign in; all seven
original demo flows pass; `lint`, `typecheck`, and `build` all exit 0; zero
`@ts-ignore` / `as any` / `eslint-disable` in `src/`.

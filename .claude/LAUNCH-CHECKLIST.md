# Launch checklist

The app is **live-wired** on Supabase: real Auth, real tables with RLS, real
document storage. `DEMO_MODE`, the demo dataset and the localStorage data layer
have all been removed. What remains below is genuinely outstanding.

The site is **deliberately invisible to search engines** right now, because the
business phone, email and hours are still seeded placeholders that render on
every public page.

Aunties Tykes is **not a licensed facility**. The `licenseNumber` field was
removed from the app entirely (types, settings table, admin UI) on 2026-09-18 —
do not reintroduce it, and do not describe the daycare as licensed anywhere.

---

## Blocking — real families are affected

- [ ] **Fill the three seeded placeholders in Admin → Settings.** Each is the
      literal text `TBD — add before launch`, and each renders publicly:
      - [ ] `phone` — also feeds the `tel:` link on `/login`
      - [ ] `email` — also feeds `mailto:` links on `PublicFooter` (every page),
            Contact and FAQ
      - [ ] `hours` — `PublicFooter` and Contact

      All three also go into the schema.org JSON-LD in `RouteMeta`. `/login` is
      guarded by `isPlaceholder()` in `src/lib/helpers.ts` and degrades to a
      sentence with no dead link; **the other five sites are not guarded yet**
      and will render `mailto:TBD — add before launch`. Filling the values in
      Settings fixes all of them at once — that is the intended fix.

- [ ] **No transactional email is connected.** Nothing notifies the owner when
      a contact inquiry or an enrollment arrives — she only sees them in the
      console. Parent credentials are not delivered either; the account dialog
      says so and tells her to pass them along by hand.

- [ ] **No payment processor is connected.** Invoices are statements only. The
      parent-side pay action was removed so nobody can write a payment row with
      no money behind it; the owner records payments received outside the app.
      If Stripe goes in: **webhook URLs must include `www.`** — Stripe does not
      follow 307 redirects.

## Before the site goes into search — 3 steps, in order

1. Fill phone / email / hours above. Nothing else here matters until that is done.
2. `src/lib/config.ts` → `export const SEARCH_INDEXABLE: boolean = true`, and set
   the real domain in `src/lib/seo.ts`:
   ```ts
   url: 'https://auntiestykes.com',
   ```
   `SITE.url` builds every canonical and og:url — a stale value points them all
   at the preview domain. It is currently `https://aunties-tykes.vercel.app`.
3. `public/robots.txt` — delete the `Disallow: /` block and uncomment the launch
   rules below it.

   **Step 3 is the hard gate.** `SEARCH_INDEXABLE` controls a meta tag, which
   only reaches crawlers that run JavaScript. robots.txt stops everything. Until
   step 3 is done the site stays out of search no matter what the flag says —
   that separation is deliberate, so one flag flip can never expose an unfinished
   site by accident.

## Content still to confirm with the owner

- [ ] Confirm the spelling of her name. The code now says **Melissa**
      throughout, matching the settings seed; the old demo copy said
      "Mellissa". Still unconfirmed with her directly.
- [ ] Confirm the carried-over values are really hers: capacity (12), ratios,
      and all six tuition rates
- [ ] Confirm the street address — only the town (Camp Hill, PA) is confirmed;
      the former street address was invented demo data and has been removed
- [ ] Owner reviews every policy text in Admin → Settings — that wording is what
      families are held to
- [ ] Staff bios and testimonials: the placeholder versions were deleted rather
      than rewritten. Nothing renders them today. Real copy needs writing before
      those sections come back.

## Known technical debt

- [ ] **Hot-linked stock images.** `Home.tsx` (hero) and `Contact.tsx` pull from
      Unsplash's CDN at runtime. They are stock photos, not the daycare, and the
      site depends on a third-party CDN in production. Replace with real photos
      served from `public/`.
- [ ] **`data-aiwp-slot` attributes** on `Home`, `Contact` and `DailyLogCard`
      are AWP image-replacement hooks. Left in place deliberately — remove only
      if AWP is no longer used on this project.
- [ ] Login's zod schema accepts a 4-character password while
      `api/create-parent-login.ts` requires 8. Harmless (the server rejects),
      but the two should agree.
- [ ] 4 `react-hooks/exhaustive-deps` warnings in `src/pages/parent/*` — the
      `t` function is omitted from `useMemo` deps.
- [ ] Add per-page Open Graph if link previews per route matter — the static
      block in `index.html` covers every shared link with one card today, and
      social scrapers do not run JavaScript, so true per-page previews need
      prerendering or SSR.

## Verified

`lint` and `typecheck` exit 0 (4 known warnings, 0 errors); zero `@ts-ignore` /
`as any` / `eslint-disable` in `src/`; every `commit()` in the store passes a
sync function, enforced by the type signature rather than by review.

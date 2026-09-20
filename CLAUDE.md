# Aunties Tykes — Project Context

Marketing site + private portals for a small home daycare in Camp Hill, PA.
Built by Allen Code Co as a **build-to-sell** product.

**This app is live-wired.** It runs on Supabase — real Auth, real tables with
RLS, real file storage. The demo dataset, the `DEMO_MODE` flag and the
localStorage data layer have all been removed. There is no seeded data and no
demo login: every account is created by the owner in the admin console.

---

## Stack

- **Vite 5 + React 18 + TypeScript** (strict, zero suppressions)
- **Supabase** — Auth, Postgres + RLS, private Storage bucket for documents
- **Tailwind CSS 3.4** — v3 deliberately; the design was built against v3 defaults
- **zustand** — in-memory write-through cache over Supabase (no persistence)
- **react-router-dom 6** — `BrowserRouter` + `vercel.json` SPA rewrite
- framer-motion · lucide-react · recharts · react-hook-form + zod · date-fns
- **i18n** — en / es / vi, all three kept at exact key parity
- Deploys to **Vercel**; one serverless function in `api/`

## Commands

```bash
npm run dev        # local dev server
npm run typecheck  # tsc --noEmit (strict), app + api
npm run lint       # eslint, type-aware rules + react-hooks
npm run build      # typecheck THEN vite build — type errors block a deploy
npm run preview    # serve the production build
```

**Non-negotiable:** `npm run lint` and `npm run typecheck` must both exit 0
before any change is called done. Lint currently reports 4 known
`react-hooks/exhaustive-deps` warnings in `src/pages/parent/*` and 0 errors.

## Code standards (Allen Code Co)

1. No `@ts-ignore`, `as any`, `eslint-disable`, or `ignoreBuildErrors`. Fix root cause.
   The repo has **zero** of these — keep it that way.
2. No mock data, placeholders, or unfinished code in shipped work.
3. Complete files, not snippets, unless a diff is explicitly requested.
4. Work in named sections with a stop between each.
5. Smallest safe change. Do not refactor what you were not asked to touch.
6. Verify before claiming done — read the file back, run the commands.

## The data layer — how writes work

`src/store/useStore.ts` is a write-through cache. Every mutation goes through
`commit(updater, sync)`:

- `updater` changes the in-memory cache so the UI responds immediately
- `sync` receives the post-update state, picks out the row that changed, and
  pushes only that row via `src/lib/persist.ts`
- a failed write raises a toast; the local change stays applied

**`sync` is a required argument.** An action that updated the cache without
writing through would appear to work and then vanish on reload, so the type
signature refuses that shape — the compiler is the guarantee, not review.

`src/lib/db.ts` holds the pure row↔domain mappers, so `tsc` catches a
schema/domain mismatch at build time rather than at runtime against live data.

## Security boundary

- `src/lib/useFamilyScope.ts` — family data isolation. Mirrored by RLS in
  `supabase/migrations/`. Changing one without the other opens a hole.
- `src/components/ProtectedRoute.tsx` — route guards; holds the route until
  `store.ready` so a hard refresh does not bounce a signed-in user to /login.
- Documents live in a **private** bucket; downloads use short-lived signed URLs.
- `api/create-parent-login.ts` is the only server function. It needs the
  service-role key, verifies the caller's token and checks `role = 'admin'`.
  That key must never be `VITE_`-prefixed or Vite inlines it into the bundle.

## Brand

- Primary `#4F77D9` · Sunny `#F5B942` · Sage `#5DC4A6` · Ink `#2b2f3a` · Canvas `#FBFAF7`
- Display font **Nunito**, body **Inter**
- Warm, calm, hand-crafted. Not a generic AI template.

## Payments — read before touching billing

**There is no payment processor.** Nothing in this app charges anyone.

Invoices are statements; payment is collected outside the app and recorded
against the invoice by the owner. `InvoiceView` only offers that in
`mode === 'admin'` — a parent sees their balance and nothing else, because a
parent-side button would write a payment row with no money behind it.

Payment method strings persist to `payments.method`, so they are deliberately
not run through i18n.

## Aunties Tykes is NOT a licensed facility

The `licenseNumber` field was removed from the app entirely (types, settings
table, admin UI). Do not reintroduce it, and do not describe the daycare as
licensed anywhere.

## Before the site goes into search

`src/lib/config.ts` exports **`SEARCH_INDEXABLE`** — currently `false`.
`public/robots.txt` is the hard gate and still says `Disallow: /`. Both must
agree. See `.claude/LAUNCH-CHECKLIST.md` — in particular, the business phone,
email and hours are still seeded as `TBD — add before launch` and render on
every public page.

## More context

- `.claude/ARCHITECTURE.md` — routes, data model, store, security boundary
- `.claude/LAUNCH-CHECKLIST.md` — what is still outstanding before launch

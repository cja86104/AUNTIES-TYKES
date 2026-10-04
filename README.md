# Aunties Tykes

Marketing site + private admin/parent portals for a small home daycare in Camp Hill, PA. Built by [Allen Code Co](https://github.com/cja86104) as a build-to-sell product.

This app is **live-wired**: real Supabase Auth, real Postgres tables behind Row-Level Security, and real private file storage. There is no demo mode, no seeded dataset, and no demo login — every account is created by the owner in the admin console.

## Stack

- **Vite 5 + React 18 + TypeScript** (strict, zero suppressions)
- **Supabase** — Auth, Postgres + RLS, private Storage bucket for documents
- **Tailwind CSS 3.4** (v3, intentionally — the design targets v3 defaults)
- **zustand** — in-memory write-through cache over Supabase (no persistence)
- **react-router-dom 6** — `BrowserRouter` + a `vercel.json` SPA rewrite
- framer-motion · lucide-react · recharts · react-hook-form + zod · date-fns
- **i18n** — English / Spanish / Vietnamese, kept at exact key parity
- Deploys to **Vercel**, with one serverless function under `api/`

## App shape

One router, three areas:

- **Public marketing site** — open to everyone (`/`, `/about`, `/programs`, `/tuition-policies`, `/gallery`, `/faq`, `/contact`, `/enroll`)
- **Admin console** (`/admin/*`) — role `admin` only
- **Parent portal** (`/parent/*`) — role `parent` only, scoped to a single family

There is no self-registration. Accounts exist only because the owner created one directly or approved an enrollment submission.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in real values — see Environment variables below
npm run dev
```

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run typecheck` | `tsc --noEmit` in strict mode, app + `api/` |
| `npm run lint` | ESLint, type-aware rules + `react-hooks` |
| `npm run build` | Typecheck, then `vite build` — type errors block a deploy |
| `npm run preview` | Serve the production build locally |

`npm run lint` and `npm run typecheck` must both exit 0 before any change is considered done.

## Environment variables

Set these in `.env.local` for local development and in the Vercel project settings for deploys. Never commit real values — `.env.local` is gitignored.

| Variable | Used for |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Client-side Supabase Auth + queries |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only (`api/create-parent-login.ts`) — never prefix with `VITE_` or Vite will inline it into the client bundle |
| `OPENROUTER_API_KEY`, `OPENROUTER_SITE_URL`, `OPENROUTER_SITE_NAME` | AI model routing via OpenRouter |
| `AI_MODEL_TIER0_INTENT`, `AI_MODEL_TIER1_DRAFTING`, `AI_MODEL_TIER2_ESCALATION` | Model selection for the admin AI assistant ("Ro") |
| `AI_MODEL_STT`, `AI_MODEL_STT_PROVIDER`, `AI_MODEL_TTS`, `AI_MODEL_TTS_FALLBACK`, `AI_MODEL_TTS_VOICE` | Speech-to-text / text-to-speech for Ro |
| `AI_ASSISTANT_ENABLED`, `AI_REQUIRE_CONFIRMATION_FOR_SENDS`, `AI_MAX_SENDS_PER_HOUR`, `AI_MAX_RECIPIENTS_PER_ACTION` | Ro feature flag and safety limits |
| `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | Transactional email |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments (not yet wired into the UI — see below) |
| `VITE_SITE_URL` | Canonical site URL used in SEO metadata |

## Payments

There is no payment processor connected in the UI today. Invoices are statements only; the owner records payments received outside the app, and `InvoiceView` only exposes payment-recording in admin mode — a parent sees their balance and nothing else. If Stripe is wired in later: **webhook URLs must include `www.`** — Stripe does not follow 307 redirects.

## Security boundary

- `src/lib/useFamilyScope.ts` scopes every parent-facing query to the signed-in user's family, mirrored by RLS policies in `supabase/migrations/`. Changing one without the other opens a hole.
- `src/components/ProtectedRoute.tsx` holds routes until `store.ready`, so a hard refresh doesn't bounce a signed-in user to `/login`.
- Documents live in a **private** Supabase Storage bucket; downloads use short-lived signed URLs.
- `api/create-parent-login.ts` is the only server function that uses the service-role key. It verifies the caller's token and checks `role = 'admin'` before creating a parent account.

## Code standards

1. No `@ts-ignore`, `as any`, `eslint-disable`, or `ignoreBuildErrors` — fix the root cause.
2. No mock data, placeholders, or unfinished code in shipped work.
3. Smallest safe change — don't refactor what wasn't asked for.
4. Verify before calling anything done: read the file back, run `lint` and `typecheck`.

## Project structure

```
api/              Vercel serverless functions (admin AI assistant + account creation)
src/
  components/     Shared UI components
  data/           Static/reference data
  i18n/           en / es / vi translation resources
  layouts/        Page layout shells
  lib/            Supabase client, family-scope guard, helpers, SEO
  pages/
    public/       Marketing site
    admin/        Admin console
    parent/       Parent portal
    auth/         Login
  store/          zustand write-through cache (useStore.ts) + persist.ts
supabase/
  migrations/     Schema + RLS policies
```

## Deployment

Deploys to Vercel. `vercel.json` rewrites all routes to `index.html` so client-side routing resolves on hard refresh and deep links.

The site is currently **not indexed by search engines** on purpose (`SEARCH_INDEXABLE = false` in `src/lib/config.ts`, plus a hard `Disallow: /` in `public/robots.txt`) until the real business phone, email, and hours replace the seeded `TBD — add before launch` placeholders. See `.claude/LAUNCH-CHECKLIST.md` for the full pre-launch checklist.

## License

Proprietary — © Allen Code Co. All rights reserved.

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
- Deploys to **Vercel**; six serverless functions in `api/` (parent logins + Ro)

## Commands

```bash
npm run dev        # local dev server
npm run typecheck  # tsc --noEmit (strict), app + api
npm run lint       # eslint, type-aware rules + react-hooks
npm test           # Node's built-in test runner over tests/**/*.test.ts
npm run build      # typecheck THEN vite build — type errors block a deploy
npm run preview    # serve the production build
```

**Non-negotiable:** `npm run lint`, `npm run typecheck` and `npm test` must
all exit 0 before any change is called done. All three currently exit 0 with
zero warnings and zero errors — the last 3 `react-hooks/exhaustive-deps`
warnings were fixed 2026-09-26. Keep it at zero.

Known exception, left for now (2026-10-08): `npm run build` prints two Rollup
"annotation that Rollup cannot interpret" warnings from comments inside zod's
own files (`zod/v4/core/regexes.js`, `util.js`; present since zod 4.5.0). They
are not from app code. Any other build warning is new and must be fixed.

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
- Server functions in `api/`: `create-parent-login.ts`, plus Ro's
  `ai/chat.ts`, `ai/confirm.ts`, `ai/status.ts`, `ai/transcribe.ts` and
  `ai/speak.ts`. Each verifies the caller's token and checks
  `role = 'admin'`. Creating a parent login needs the service-role key
  (`api/_lib/parentLogin.ts`, shared by the console endpoint and Ro's
  `ai/confirm.ts`); Ro needs the OpenRouter key. Neither may be
  `VITE_`-prefixed, or Vite inlines it into the bundle.

## Product rules from the owner — apply to every feature

- **Anything new gets a notification.** If a feature puts something new in
  front of a parent or the owner, it ships with a way to notice it: a nav
  badge (`src/lib/unread.ts`), a "New" pill, and a dashboard alert when it
  needs action. Never ship a new thing that only appears silently.
- **Reports show only what was filled in.** No blank or "—" rows for
  sections that were left empty.
- **Ro keeps up.** Ro already writes daily reports; any new part of a
  feature Ro covers must be reachable through Ro's tools too
  (`api/_lib/ai/tools/`).

## Schedules & attendance — read before touching either

- A child's usual week is `children.schedule`: `mon`…`sun`, each up to 3
  `{start, end}` blocks in 24h `HH:mm`, sorted, non-overlapping, end after
  start. `NULL` means never entered — the child is "schedule not set"
  (unknown), never "off". Weekends are ordinary days (the owner also runs a
  camp); do not special-case them.
- `children.plan` is legacy free text ("Full-time" …). It is no longer edited
  or written, and is shown only as a hint where no schedule is set.
- One date that differs: `child_schedule_changes` (one per child per date;
  `blocks = []` = not coming). A new usual week from a later date:
  `child_schedule_plans` (one per child per start date).
  `promote_due_schedule_plans(today)` folds started plans into
  `children.schedule` when the console loads and when Ro starts. There is no
  scheduled job, and none is needed: the resolver reads plans by date.
- Who is expected on a date comes from ONE resolver, `src/lib/schedule.ts`
  (`resolveChildDay`, `buildDayRoster`), shared by the attendance page, both
  dashboards, the parent portal and Ro (`api/_lib/ai/schedules.ts`).
  Precedence: inactive → not started yet → closure → "not coming" calendar
  note → one-off change → no schedule (unknown) → weekly pattern; an early
  close trims the blocks. Never work out who is expected anywhere else. Its
  validation mirrors the check functions in migration 0020.
- `attendance_visits` holds every arrival and departure (split days);
  `attendance` stays the day summary. Marking absent is refused once times are
  recorded.
- Eastern time only: `DAYCARE_TIME_ZONE` in `src/lib/helpers.ts`, and
  `todayInZone()` on the server.
- Invoice prefill bills each enrolled child at the family's own weekly rate
  (`customWeeklyRate`) for 4 weeks; with no rate on file it asks for one. The
  Settings rate card is not a fallback — only its sibling discount is applied.
  (There is no public tuition estimator; nothing public reads the rate card.)

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
- `AI-ADMIN-ASSISTANT-PLAN.md` — the AI admin assistant ("Ro"): spec and
  living status. §2 is where it stands, §3 the tool-by-tool table, §15 what
  is next. `.claude/AI-ASSISTANT-BUILD-HANDOFF.md` is the original
  start-of-build briefing, kept for its non-negotiables.

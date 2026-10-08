# Architecture

## Shape

Single-page Vite + React app on Supabase, deployed to Vercel. Three areas
behind one router:

- **Public site**: open to everyone; the home page, the parent portal guide,
  contact, and the enrollment form
- **Admin console** (`/admin/*`): role `admin` only (the owner)
- **Parent portal** (`/parent/*`): role `parent` only, scoped to one family

Supabase provides Auth, Postgres with RLS on every table, Realtime, and a
private Storage bucket. The browser talks to it directly with the user's own
session; RLS is the real boundary. A handful of Vercel functions in `api/`
cover what the browser may not do (below). There is no seeded data and no
demo mode: every account and record is created by the owner.

## Routes (31 pages, plus `/admin` and `/parent` redirects and a 404 catch-all)

**Public** `/` `/parent-portal-guide` `/contact` `/enroll` · **Auth** `/login`

**Admin** `/admin/dashboard` `/admin/enrollments` `/admin/families`
`/admin/families/:id` `/admin/children` `/admin/children/:id`
`/admin/calendar` `/admin/attendance` `/admin/daily-logs` `/admin/billing`
`/admin/invoices` `/admin/invoices/:id` `/admin/documents` `/admin/messages`
`/admin/settings`

**Parent** `/parent/dashboard` `/parent/children` `/parent/children/:id`
`/parent/daily-reports` `/parent/daily-reports/:childId` `/parent/attendance`
`/parent/calendar` `/parent/billing` `/parent/invoices/:id`
`/parent/documents` `/parent/messages`

`BrowserRouter` with a catch-all rewrite in `vercel.json` so deep links resolve
server-side. Every route except `Home` is `React.lazy`, so a public visitor
does not download the admin console. `RequireRole` (`ProtectedRoute.tsx`)
holds a route until `store.ready`, so a hard refresh does not bounce a
signed-in user to /login, then redirects the wrong role to its own dashboard.

## Data model — `src/types.ts`

```
User ──familyId──> Family ──> Child[] ──> AttendanceRecord[] + AttendanceVisit[]
                      │          │        DailyLog[] (with incidents) + IncidentAck[]
                      │          │
                      │          └──> schedule (WeeklySchedule | null)
                      │               ScheduleChange[]  (one date differs)
                      │               SchedulePlan[]    (new weekly schedule from a date)
                      │
                      ├──> Invoice[] ──> LineItem[], Payment[]
                      └──> Thread[]  ──> ThreadMessage[]

Settings (business info, rate card, policy text)
CalendarEvent (closure · early_close · activity · reminder · schedule_exception)
DocumentRecord + DocumentAck · Announcement · Lead
EnrollmentSubmission ──approve──> Family + Child[]
```

A user links to a **family**, not to individual children. Children belong to
the family, so a new sibling is picked up automatically with no second place to
keep in sync. `src/lib/database.types.ts` holds the row types and `src/lib/db.ts`
the pure row ↔ domain mappers, so `tsc` catches a schema/domain mismatch at
build time.

`WaitlistProspect` and its table are orphaned: nothing in the app reads them.
The real waitlist is a child whose `status` is `waitlist`.

## Store — `src/store/useStore.ts`

One zustand store, used as an in-memory write-through cache over Supabase.
Nothing is persisted in the browser.

- **Loading.** `bootstrap()` loads the public settings, restores any Supabase
  session, and hydrates every table the user's RLS lets them read
  (`hydrateAll` in `src/lib/persist.ts`). `login()` does the same after
  signing in. For the owner, `promote_due_schedule_plans` runs first (see
  Schedules).
- **Writing.** Every mutation goes through `commit(updater, sync)`. `updater`
  changes the cache so the UI responds at once; `sync` pushes only the changed
  row through `persist.*`. A failed write raises a toast. `sync` is a required
  argument, so an action that updates the cache without writing through does
  not compile.
- **Staying current.** One Realtime channel (`subscribeToChanges`) listens to
  the `public` schema and re-hydrates, debounced, on any change. Realtime runs
  each row through the subscriber's RLS, so it never delivers a row they could
  not query. This keeps other tabs and devices in step.
- **Signing out** clears the cache as well as the session, so the next person
  on a shared device inherits nothing.

Notable actions: `checkIn`/`checkOut`/`markAbsent`,
`addDailyLog`/`updateDailyLog`, `createInvoice`/`recordPayment`,
`addDocument`/`toggleDocVisibility`/`acknowledgeDocument`, `acknowledgeIncident`,
`addAnnouncement`/`sendThreadMessage`/`startThread`,
`addFamily`/`updateFamily`/`addChild`/`updateChild`, `createParentLogin`,
`submitEnrollment`/`approveEnrollment`/`declineEnrollment`,
`add/update/deleteCalendarEvent`, `saveScheduleChange`/`removeScheduleChange`,
`saveSchedulePlan`/`removeSchedulePlan`, `markSectionSeen`.

`checkIn`/`checkOut` write one `AttendanceVisit` per arrival or departure (a
split day has several) and keep that day's `AttendanceRecord` as the summary.
`markAbsent` refuses, with a toast, once a time has been recorded.

`approveEnrollment` creates the family and its children from the submission and
marks it approved. It does not create a login; that is a separate step.

## Schedules — `src/lib/schedule.ts`

The one resolver for "who is expected on this date". `resolveChildDay` applies,
in order: inactive → not started → closure → a child's "not coming" calendar
note → one-off change → no schedule entered (unknown, never "off") → the weekly
pattern in force that date (the newest started `SchedulePlan`, else
`child.schedule`); an early close trims the blocks. `buildDayRoster` groups a
date into `main` / `unscheduled` / `notToday` with counts. The attendance page,
both dashboards, the parent portal and Ro (via `api/_lib/ai/schedules.ts`) all
build from it. It has no runtime imports, so the server functions and
`node --test` can load it directly. Its validation mirrors the check functions
in migration 0020.

Started plans are folded into `child.schedule` by `promote_due_schedule_plans`
when the console loads and when Ro starts. There is no scheduled job, and none
is needed: the resolver reads plans by date. Times are Eastern only
(`DAYCARE_TIME_ZONE` in `src/lib/helpers.ts`).

## Notifications — `src/lib/unread.ts`

Every new thing put in front of a parent or the owner gets a way to be noticed:
a nav badge, a "New" pill, and a dashboard alert when it needs action. Newness
is per account, not per browser: the last time someone opened a section lives
in `section_views` (migration 0008), so opening it on a phone clears it on a
laptop too. `useUnreadCounts()` feeds the badges.

## Security boundary

- **RLS** in `supabase/migrations/` is the real boundary. The owner is
  `is_admin()`; a parent reads only rows belonging to their own family.
- **`src/lib/useFamilyScope.ts`** narrows the cache to the signed-in family for
  every parent page. It mirrors RLS. Change one without the other and you open
  a hole. Do not scatter family filtering into individual pages.
- **Documents and attachments** live in the private `documents` bucket.
  Downloads use short-lived signed URLs (`src/lib/storage.ts`).
- **No self-registration.** No route, no link, no form. A parent account exists
  only because the owner created one.

## Server functions — `api/`

| Function | What it does |
|---|---|
| `create-parent-login.ts` | Creates a parent's Auth user and profile. Needs the service-role key; verifies the caller's token and `role = 'admin'`. |
| `ai/chat.ts` | One turn with Ro: authenticate the owner, read today's state, build the prompt, run the tool loop. |
| `ai/confirm.ts` | Her tap on an action card: approve, decline or undo a proposal. |
| `ai/status.ts` | Whether Ro is enabled (`AI_ASSISTANT_ENABLED` stays server-only). |
| `ai/transcribe.ts` / `ai/speak.ts` | Voice in and voice out for Ro. |

The service-role key and the OpenRouter key are server-only. They must never be
`VITE_`-prefixed, or Vite inlines them into the bundle.

## Ro, the AI assistant — `api/_lib/ai/`

The owner's assistant, in the console's `RoPanel` (`src/lib/ro.ts` is the
browser half). Models are reached through OpenRouter, on three tiers configured
by environment variables. Ro works through a fixed catalog of tools
(`tools/index.ts`); a tool that is not registered cannot run.

- **Reads** run immediately on the owner's own JWT, so RLS applies.
- **Anything that changes data or reaches a family** only *proposes*. That
  covers sends, attendance, daily logs, calendar, schedule changes, payments,
  families, logins and enrollment decisions. The proposal is written to
  `ai_audit_log` and shown as a card. The write happens in `execute.ts`, and
  only after her tap through `ai/confirm.ts`. Standing rules
  (`ai_standing_rules`) are checked at send time.
- **What Ro notices** (`triggers.ts`) comes from plain queries, never from the
  model. The model may choose what to lead with, but cannot add, drop or
  change a notice.

The full spec is `AI-ADMIN-ASSISTANT-PLAN.md`.

## Not in this app

- **Payments:** there is no processor. Invoices are statements; the owner
  records payments received elsewhere. If one is added, Stripe webhook URLs
  must include `www.`.
- **Email/SMS:** nothing is sent. Messages and announcements appear in the
  parent portal, and the owner hands parents their login herself.

## Conventions

- Pages wrap in `<PageTransition>`; lists stagger with framer-motion, delay
  capped around 0.3s.
- Forms use local state plus a `validate()` returning an error record. The
  public Contact form and Login use react-hook-form + zod.
- Dates are `yyyy-MM-dd` strings. Use `todayISO()` / `nowTime()` (Eastern),
  never `toISOString()`, which is UTC and shifts the day for evening entries.
- Money via `money()`. Invoice status is derived by `invoiceStatus()`, never
  stored.
- The parent portal is translated (en / es / vi, kept at exact key parity); the
  admin console and the public site are English.
- Tests live in `tests/` and run on Node's built-in runner (`npm test`).

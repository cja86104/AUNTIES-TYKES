# Architecture

## Shape

Single-page Vite app, three areas behind one router:

- **Public marketing site** — open to everyone
- **Admin console** (`/admin/*`) — role `admin` only
- **Parent portal** (`/parent/*`) — role `parent` only, scoped to one family

No backend. All state lives in a zustand store persisted to `localStorage`, so
the demo is fully interactive and survives reloads.

## Routes (33 pages, plus `/admin` and `/parent` redirects and a 404 catch-all)

**Public** `/` `/about` `/programs` `/tuition-policies` `/gallery` `/faq`
`/contact` `/enroll` · **Auth** `/login`

**Admin** `/admin/dashboard` `/admin/enrollments` `/admin/families`
`/admin/families/:id` `/admin/children` `/admin/children/:id`
`/admin/attendance` `/admin/daily-logs` `/admin/billing` `/admin/invoices`
`/admin/invoices/:id` `/admin/documents` `/admin/messages` `/admin/settings`

**Parent** `/parent/dashboard` `/parent/children` `/parent/children/:id`
`/parent/daily-reports` `/parent/daily-reports/:childId` `/parent/attendance`
`/parent/billing` `/parent/invoices/:id` `/parent/documents` `/parent/messages`

`BrowserRouter` with a catch-all rewrite in `vercel.json` so deep links resolve
server-side. Every route except `Home` is `React.lazy` — a visitor to the tuition
page does not download recharts or the admin console.

## Data model — `src/types.ts`

```
User ──familyId──> Family ──> Child[] ──> AttendanceRecord[], DailyLog[]
                      │
                      ├──> Invoice[] ──> LineItem[], Payment[]
                      └──> Thread[]  ──> ThreadMessage[]

Settings (business info, rate card, policy text)
DocumentRecord · Announcement · Lead · WaitlistProspect
EnrollmentSubmission ──approve──> Family + Child[] + User
```

A user links to a **family**, not to individual children. Children belong to the
family, so a new sibling is picked up automatically with no second place to keep
in sync.

## Store — `src/store/useStore.ts`

One zustand store. `DataSlice` is the persisted part; `commit()` wraps every
mutation so a write always persists. `snapshot()` picks the persisted keys
explicitly — add a new slice there or it silently will not survive a reload.

Notable actions: `checkIn`/`checkOut`/`markAbsent`, `addDailyLog`,
`createInvoice`/`recordPayment`, `addDocument`/`toggleDocVisibility`/`acknowledgeDocument`,
`addAnnouncement`/`sendThreadMessage`, `addFamily`/`updateFamily`/`addChild`/`updateChild`,
`createParentLogin`, `submitEnrollment`/`approveEnrollment`/`declineEnrollment`.

`approveEnrollment` is one atomic commit — family, children, user account, and
submission status all move together, so there is no half-enrolled state.

## Security boundary — `src/lib/useFamilyScope.ts`

Every parent page reads its data through this one hook. It narrows invoices,
children, announcements, and documents to `user.familyId` **before** the page
sees them. That is why typing another family's invoice id into the URL returns
"we couldn't find that invoice" instead of their statement.

When this moves to Supabase, this hook is the seam for RLS-backed queries and the
first file to audit. Do not scatter family filtering into individual pages.

## Auth

`login()` checks email + password against `users` in the store (seeded from
`src/data/mockData.ts`, extended by admin-created accounts). Role decides the
redirect. `RequireRole` guards the route trees and bounces the wrong role.

**There is no self-registration** — no route, no link, no form. Accounts exist
only because the owner created one or approved an enrollment.

## Demo-only seams (where real integrations plug in)

| Area | Now | Real build |
|---|---|---|
| Passwords | plain text in the store | Supabase Auth |
| Payments | writes to the local ledger; modal says no processor is connected | Stripe — **webhook URLs must include `www.`** |
| Documents | metadata only, no file behind it | Supabase Storage |
| Email | nothing is sent; credentials are copy-to-clipboard | Resend / Postmark |
| Images | `placehold.co` placeholders | owner's real photos |

Each is stated honestly in the UI rather than faked.

## Conventions

- Pages wrap in `<PageTransition>`; lists stagger with framer-motion, delay capped ~0.3s
- Forms: local state + a `validate()` returning an error record (the public
  Contact form and Login use react-hook-form + zod — both patterns exist)
- Dates are `yyyy-MM-dd` strings. Use `todayISO()`, never `toISOString()` —
  UTC shifts the day for evening entries in Eastern time.
- Money via `money()`. Invoice status is derived by `invoiceStatus()`, never stored.

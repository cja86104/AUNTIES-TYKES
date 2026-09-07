# Aunties Tykes — Project Context

Marketing site + private portals for a small licensed home daycare in Durham, NC.
Built by Allen Code Co as a **build-to-sell** product. Version 1 is a complete,
wired demo with realistic placeholder data, shared with the owner for approval.

---

## 🛑 PROTECTED AREAS — DO NOT EDIT

**The admin portal and parent portal are FINISHED, TESTED, and SIGNED OFF.**
The owner walked every link and approved them. Current work is on the **public
landing page only**.

Do not edit, refactor, reformat, "improve", or rename anything under:

| Path | What it is |
|---|---|
| `src/pages/admin/**` | Admin console — 13 pages |
| `src/pages/parent/**` | Parent portal — 9 pages |
| `src/layouts/AdminLayout.tsx` | Admin shell + nav |
| `src/layouts/ParentLayout.tsx` | Parent shell + nav |
| `src/pages/auth/Login.tsx` | Auth entry point |
| `src/store/useStore.ts` | Entire data layer |
| `src/types.ts` | Domain types |
| `src/lib/useFamilyScope.ts` | **Security boundary** — family data isolation |
| `src/components/ProtectedRoute.tsx` | Route guards |
| `src/components/InvoiceView.tsx` | Billing UI |
| `src/components/DailyLogCard.tsx` | Daily report UI |
| `src/components/FamilyForm.tsx` | Family add/edit |
| `src/components/ChildForm.tsx` | Child add/edit |
| `src/components/ParentAccountDialog.tsx` | Account creation |
| `src/components/FileUploader.tsx` | Upload UI |

These paths are also blocked in `.claude/settings.json`. If a task genuinely
requires touching one, **stop and ask the owner first** — do not work around the
deny rule. See `.claude/PROTECTED-AREAS.md`.

### ⚠️ Shared — changing these affects the portals too

`src/components/ui.tsx` · `src/index.css` · `tailwind.config.js` · `src/lib/helpers.ts`

The design system is used by *both* the public site and the portals. Restyling a
Button here changes every admin screen. Prefer adding new classes on the public
pages over altering shared components. These are set to **ask** in settings.

### ✅ Free to edit (landing page work)

`src/pages/public/**` · `src/components/PublicNav.tsx` · `src/components/PublicFooter.tsx`
`src/layouts/PublicLayout.tsx` · `src/lib/seo.ts` · `index.html` · `public/**`

---

## Stack

- **Vite 5 + React 18 + TypeScript** (strict, zero suppressions)
- **Tailwind CSS 3.4** — v3 deliberately; the design was built against v3 defaults
- **zustand** store persisted to `localStorage`
- **react-router-dom 6** — `BrowserRouter` + `vercel.json` SPA rewrite
- framer-motion · lucide-react · recharts · react-hook-form + zod · date-fns
- Deploys to **Vercel**

## Commands

```bash
npm run dev        # local dev server
npm run typecheck  # tsc --noEmit (strict)
npm run lint       # eslint, type-aware rules + react-hooks
npm run build      # typecheck THEN vite build — type errors block a deploy
npm run preview    # serve the production build
```

**Non-negotiable:** `npm run lint` and `npm run typecheck` must both exit 0
before any change is called done.

## Code standards (Allen Code Co)

1. No `@ts-ignore`, `as any`, `eslint-disable`, or `ignoreBuildErrors`. Fix root cause.
   The repo currently has **zero** of these — keep it that way.
2. No mock data, placeholders, or unfinished code in shipped work.
3. Complete files, not snippets, unless a diff is explicitly requested.
4. Work in named sections with a stop between each.
5. Smallest safe change. Do not refactor what you were not asked to touch.
6. Verify before claiming done — read the file back, run the commands.

## Brand

- Primary `#4F77D9` · Sunny `#F5B942` · Sage `#5DC4A6` · Ink `#2b2f3a` · Canvas `#FBFAF7`
- Display font **Nunito**, body **Inter**
- Warm, calm, hand-crafted. Not a generic AI template.

## Preview vs live

`src/lib/config.ts` exports **`DEMO_MODE`** — currently `true`. It controls the
demo logins on `/login` and the robots meta tag. See `.claude/LAUNCH-CHECKLIST.md`
before going live. **The site is intentionally not indexable right now** — it
carries a placeholder license number and address.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Owner | `auntie@auntiestykes.com` | `tykes2024` |
| Parent (Brooks) | `maya@example.com` | `parent123` |
| Parent (Okafor) | `daniel@example.com` | `parent123` |

No self-registration exists. Accounts come from the admin console or an approved
enrollment. Passwords are plain text — demo only, see `.claude/ARCHITECTURE.md`.

## More context

- `.claude/PROTECTED-AREAS.md` — what is locked and why
- `.claude/ARCHITECTURE.md` — routes, data model, store, security boundary
- `.claude/LAUNCH-CHECKLIST.md` — going live, and what is demo-only

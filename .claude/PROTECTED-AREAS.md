# Protected areas

## Why this exists

The admin console and parent portal were built, verified, and **walked link by
link by the owner**, who signed off on them. Landing page work happened
alongside, and this file plus `.claude/settings.json` existed so that work
could not drift into finished code.

**Update (2026-09-20): the 🛑 Locked tier has been lifted.** The owner asked
for it explicitly — active work has moved on to a full admin/parent portal
production audit and mobile/Safari fixes, so admin and parent files need to be
editable again. `deny` in `.claude/settings.json` is now empty. The ⚠️ Shared
tier stays in force below, since the shared-component trap (a landing-page
restyle bleeding into every button in the admin console) doesn't go away just
because the lock did.

## Two tiers (as of the update above)

### ⚠️ Shared — `ask` in settings.json

Used by the public site **and** the portals. Claude will pause and ask before
touching them.

```
src/components/ui.tsx     Button, Card, Modal, Input, Badge, StatCard…
src/index.css             global styles, fonts, animations
tailwind.config.js        brand tokens
src/lib/helpers.ts        money, dates, invoice math
src/App.tsx               routing
package.json              dependencies
```

**The trap:** restyling `Button` for a new hero changes every button in the admin
console. If the landing page needs a different look, add a new variant or use
page-local classes — do not repurpose an existing one.

### ✅ Free

```
src/pages/public/**              Home, About, Programs, Tuition, Gallery, FAQ, Contact, Enroll
src/pages/admin/**                13 admin pages (lock lifted)
src/pages/parent/**               9 parent portal pages (lock lifted)
src/pages/auth/**                 login (lock lifted)
src/layouts/AdminLayout.tsx       admin shell (lock lifted)
src/layouts/ParentLayout.tsx      parent shell (lock lifted)
src/store/**                      zustand store — the whole data layer (lock lifted)
src/types.ts                      domain types (lock lifted)
src/lib/useFamilyScope.ts         SECURITY BOUNDARY — still treat with care (lock lifted)
src/components/ProtectedRoute.tsx (lock lifted)
src/components/InvoiceView.tsx    (lock lifted)
src/components/DailyLogCard.tsx   (lock lifted)
src/components/FamilyForm.tsx     (lock lifted)
src/components/ChildForm.tsx      (lock lifted)
src/components/ParentAccountDialog.tsx (lock lifted)
src/components/FileUploader.tsx   (lock lifted)
src/components/PublicNav.tsx
src/components/PublicFooter.tsx
src/layouts/PublicLayout.tsx
src/lib/seo.ts                    page titles and descriptions
src/lib/config.ts                 SEARCH_INDEXABLE flag
index.html · public/**
```

`useFamilyScope.ts` deserves special mention regardless of lock status: it is
the single place family data is filtered. It is why the Brooks family cannot
open the Okafors' invoice by editing a URL. Change it carefully and re-verify
`useFamilyScope.ts`'s tests/usage and the matching Postgres RLS policies
together — they're meant to move as a pair.

## Re-locking later

If admin/parent work is signed off again and unrelated (e.g. landing-page-only)
work resumes, restore a `deny` array in `.claude/settings.json` with the paths
listed above under "lock lifted" and reinstate the 🛑 tier in this file.

# Protected areas

## Why this exists

The admin console and parent portal were built, verified, and **walked link by
link by the owner**, who signed off on them. Landing page work is now happening
alongside. This file and `.claude/settings.json` exist so that work cannot drift
into finished code.

A landing page restyle has no business touching an invoice ledger.

## Three tiers

### 🛑 Locked — `deny` in settings.json

Claude Code will refuse `Edit`/`Write` on these. Not a suggestion — a block.

```
src/pages/admin/**              13 admin pages
src/pages/parent/**              9 parent portal pages
src/pages/auth/**                login
src/layouts/AdminLayout.tsx      admin shell
src/layouts/ParentLayout.tsx     parent shell
src/store/**                     zustand store — the whole data layer
src/types.ts                     domain types
src/lib/useFamilyScope.ts        SECURITY BOUNDARY
src/components/ProtectedRoute.tsx
src/components/InvoiceView.tsx
src/components/DailyLogCard.tsx
src/components/FamilyForm.tsx
src/components/ChildForm.tsx
src/components/ParentAccountDialog.tsx
src/components/FileUploader.tsx
```

`useFamilyScope.ts` deserves special mention: it is the single place family data
is filtered. It is why the Brooks family cannot open the Okafors' invoice by
editing a URL. Nothing about a landing page requires changing it.

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
src/components/PublicNav.tsx
src/components/PublicFooter.tsx
src/layouts/PublicLayout.tsx
src/lib/seo.ts                   page titles and descriptions
src/lib/config.ts                DEMO_MODE flag
index.html · public/**
```

## If you actually need to change a locked file

1. **Stop. Ask the owner.** Say which file and why.
2. Do not edit `.claude/settings.json` to unblock yourself. Removing your own
   guardrail is not permission.
3. If approved, make the smallest possible change and re-run the full check:
   `npm run lint && npm run typecheck && npm run build`, then walk the affected
   portal screens by hand.

## Lifting the lock later

When portal work resumes, delete the relevant lines from the `deny` array in
`.claude/settings.json`. Keep the `ask` tier — the shared-component trap does not
go away.

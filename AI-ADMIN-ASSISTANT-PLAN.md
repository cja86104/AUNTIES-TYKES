# AI Admin Assistant — Planning Doc

**Status:** Plan only. Nothing in this document has been built. No locked file
has been touched to produce it.
**Drafted:** September 2026, with Claude (Cowork), against the current state
of this repo (Vite/React demo, `DEMO_MODE = true`, no backend yet).

---

## 1. The ask, in one sentence

Give the owner a way to run the admin console by typing (or eventually
speaking) instructions — "send today's daily reports," "who hasn't paid
this month," "don't message the Brooks family until Friday" — and have an
AI carry out the same actions the admin UI already does, including
deciding which families get contacted and which don't, at OpenRouter's
cheap-tier pricing rather than frontier-model pricing.

That's a real, buildable feature. It is not a "point an LLM at the database
and let it drive" feature — that version fails fast in a childcare app,
because the whole point of `useFamilyScope.ts` is that the Brooks family
can never see the Okafors' data. An AI layer has to inherit that boundary,
not sit above it. Everything below is designed around keeping that true.

---

## 2. Why this waits on the Supabase migration — and doesn't add a second one

Right now there is no backend. Passwords are plain text in a Zustand store,
there's no server to call, and nothing is audited. An AI agent that can
"do anything the admin can do" needs three things that only exist once
this app has a real backend:

- A server-side boundary to call into (so the AI can't reach a family's
  data it shouldn't, the same way `useFamilyScope` stops a browser URL from
  doing it today)
- A place to log every action it takes, tied to the instruction that caused
  it
- A real place to send from (Resend/Postmark, per `ARCHITECTURE.md`'s
  "demo-only seams" table) — right now "Email" sends nothing

`ARCHITECTURE.md` already flags this move as coming: *"When this moves to
Supabase, [useFamilyScope] is the seam."* Good news: that migration and this
feature are the same project, not two. The Supabase tables, RLS policies,
and server functions this needs to build are the same ones the real launch
needs regardless of AI. Sequence it as:

1. **Supabase migration** (Auth, Postgres tables mirroring `types.ts`, RLS
   that reproduces what `useFamilyScope` does client-side today) — the
   already-planned, non-AI work.
2. **AI layer on top of the same server functions** the real admin UI ends
   up calling — not a parallel path.

Building the AI layer against today's `localStorage` demo would mean
throwing it away and rebuilding it in step 1 anyway.

---

## 3. Core architecture: a tool catalog, not database access

The AI never gets a database connection, an API key with broad scope, or
raw SQL. It gets a fixed list of named functions — the same shape as the
store actions this app already has — each one already scoped to one family
and already validated exactly like the UI form that calls it today.

| Existing store action (`useStore.ts`) | AI tool name | Risk tier |
|---|---|---|
| `checkIn` / `checkOut` / `markAbsent` | `attendance.set` | Low |
| `addDailyLog` | `dailyLog.create` | Low |
| `addAnnouncement` | `announcement.send` | **Send** |
| `sendThreadMessage` | `message.send` | **Send** |
| `addDocument` / `toggleDocVisibility` | `document.manage` | Low |
| `createInvoice` / `recordPayment` | `billing.mutate` | **Money** |
| `addFamily` / `updateFamily` / `addChild` / `updateChild` | `family.mutate` | Medium |
| `createParentLogin` | `account.create` | **Money/PII** |
| `approveEnrollment` / `declineEnrollment` | `enrollment.decide` | Medium |

The model's only job is to figure out *which tool, with which arguments* a
sentence maps to. It cannot invent a tool, and a tool it doesn't have
listed simply isn't callable — same principle as a locked file in this
repo: the deny list is enforced outside the thing you're trying to trust.

---

## 4. "What to send to who" — a rules engine that the AI edits, not an AI that decides live

This is the part worth getting right, because "let the AI decide every
send from scratch" is exactly where both cost and reliability go wrong —
it means an LLM call, and an LLM's judgment, sitting in the critical path
of every single message to every parent, every day.

Instead, split it in two:

**Standing rules** — plain structured data, evaluated by ordinary code,
no model involved at send time. Things like: *daily logs go out
automatically at checkout, except don't message the Okafors after 6pm,
and never auto-send anything billing-related.* The rules engine is what
actually decides who gets what, deterministically, every time.

**The AI's real job** is narrower than "decide who gets messaged":

- Turn a sentence like *"stop sending the Brooks family anything until
  Friday"* into a rule change, and show her the rule in plain English
  before it's saved
- Draft the actual wording of a message in her voice, from real fields
  (child's name, today's nap time, today's meal) — never inventing a
  detail that isn't in the record
- Handle the one-off ad hoc command — *"send this week's invoice reminder
  to everyone except families on a payment plan"* — by resolving the
  recipient list through the same family-scoped queries the admin UI
  already uses, showing her the resolved list, and waiting for her tap

Worked examples:

| She says | What actually happens |
|---|---|
| "Send today's daily reports" | Rules engine resolves "today's checked-out children with an unsent daily log," AI drafts each family's blurb from that child's real log entry, she sees a list, one tap sends all |
| "Don't bug the Okafors about the invoice, they already told me they're paying Friday" | AI writes a suppression rule (`billing reminders → Okafor family → until Friday`), confirms it back to her in plain English, no message sent by this instruction — it just prevents one later |
| "Who hasn't paid this month" | Read-only query, no send tool involved, no confirmation needed — just an answer |

---

## 5. Guardrails specific to a childcare + money app

- **Confirmation tiers.** *Low* actions (attendance, daily logs, documents)
  can auto-run once trust is established. *Send*, *Money*, and *PII*
  actions (rows marked above) always show a preview and require her tap —
  no exceptions in v1, including "send" actions the rules engine itself
  triggers, until there's a track record.
- **Audit log.** Every AI-initiated action stores the instruction that
  caused it, the tool called, the arguments, and who/what it touched.
  This is the same discipline the rest of the repo already has around
  the family-scope boundary — an acquirer will want to see this, not take
  your word for it.
- **No invented facts about a child.** Message drafting is templated: the
  model rephrases fields it's handed, it does not get to state anything
  about a specific child that isn't already in a record. This is the
  single highest-consequence failure mode (a wrong or fabricated claim
  about someone's kid) and it's cheap to close off structurally instead
  of trusting the model not to.
- **PII minimization in prompts.** Tier-0/1 model calls get first names
  and internal IDs, not full addresses, DOB, or anything payment-related —
  Stripe already isn't supposed to touch this app's own storage, and the
  AI layer shouldn't either. When picking OpenRouter providers, prefer
  ones offering zero-data-retention where it's offered, given minors'
  data is in scope.
- **Rate limit / blast-radius cap.** A hard ceiling (configurable, start
  low) on sends-per-hour and a same-message-to-N-families threshold that
  forces a confirmation regardless of rule state — the thing that catches
  "the rule was wrong and it just tried to message all 14 families" before
  it happens.
- **Undo window.** Anything sent through this system gets a short window
  (e.g., 2 minutes) where "undo" pulls it back if the transport allows,
  and always gets logged even if it can't be recalled.

---

## 6. Model routing — tiered, OpenRouter-only, priced for a home daycare's actual volume

You already run multi-model OpenRouter setups, so this is the specific
shape for this feature rather than a primer. Three tiers, picked by task
shape, not by "best model available":

**Tier 0 — intent parsing** (which tool, which arguments; the highest-volume,
lowest-difficulty call, run on nearly every instruction). A small
tool-calling-capable model is genuinely enough here — this is structured
extraction, not reasoning. As of September 2026, DeepSeek's current
tool-calling model sits around **$0.21 / $0.31 per million input/output
tokens** on OpenRouter, and even cheaper MoE "flash" variants from several
labs are pricing under $0.10 input. This tier should cost fractions of a
cent per instruction.

**Tier 1 — message drafting** (writing the actual sentence a parent reads,
in her voice). Slightly higher quality is worth paying for here since a
parent reads the output directly, but this still doesn't need a frontier
model — a Gemini Flash-class or similarly positioned mid-tier model
(roughly **$0.75 / $3.75 per million** at current discounted OpenRouter
rates) is well beyond what a two-sentence daily-report blurb needs.

**Tier 2 — rare escalation** (an ambiguous instruction, or one that touches
money and multiple families at once). Route to a stronger reasoning model
only when Tier 0 confidence is low or the tool risk tier is Money/PII —
and even here, a mid-reasoning model is sufficient specifically *because*
step 5's confirmation gate means a human checks the output before anything
executes. There's no case in this feature where paying $15–25/million
input tokens buys anything a human isn't already re-checking.

**Practical setup:** don't hardcode model IDs — OpenRouter pricing and
model lineups shift monthly (the numbers above are a September 2026
snapshot; re-check at build time). Keep a small model-registry config —
tier → ordered list of model IDs with a fallback — so swapping in a
cheaper or newer model later is a config change, not a code change. This
also gives you a place to add a local Ollama model later for your own dev
testing without it ever being in the path a live client account depends
on — her production traffic stays 100% OpenRouter so it's always available
from her browser with no dependency on your machine being on.

**Illustrative cost:** a single small home daycare — a handful of
families, maybe 10–20 AI-mediated actions on a busy day — lands at Tier 0
volumes of a few thousand tokens per action. Even with Tier 1 drafting on
every send, that's well under a dollar a month per client at today's
pricing, before any Tier 2 escalation (which should be rare by design).
That's the number worth defending to a client, not "AI costs," full stop.

---

## 7. Interface

- New admin route, `/admin/assistant` — a chat panel, following the
  existing `AdminLayout` shell and `ui.tsx` components (this is a new page
  under the admin tree, so it inherits the locked-area conversation in
  §8, not the free-to-edit public pages).
- Text input for v1. A microphone button using the browser's built-in
  Web Speech API is a genuine "hands-free" option with **zero additional
  AI cost** (it's local browser speech-to-text, not a model call) and is
  worth adding once the typed flow is proven — no reason to pay a
  transcription API for this.
- Every AI action surfaces as a running activity feed — "Sent to: Brooks,
  Okafor, Chen — tap to view" — so she's watching what happened, not
  trusting a black box. This doubles as the audit log's UI.

---

## 8. What this touches that's currently locked

Building this for real reaches into files `PROTECTED-AREAS.md` currently
denies: `src/store/**` (new actions need to exist somewhere), a new page
under `src/pages/admin/**`, and possibly `src/types.ts` for rule/audit
schemas. Per that file's own instructions: *"stop and ask the owner
first"* — noting it here because the owner and the client are the same
person for this feature, so that's a decision you make with yourself, not
a blocker, but it means the lock should be lifted deliberately for this
work (not worked around) when you actually start building, and re-applied
once it's signed off the same way the rest of the portal was.

---

## 9. Phased rollout

1. **Phase 0 — Supabase migration.** Already the acknowledged next step
   regardless of AI (§2). Nothing here starts before this exists.
2. **Phase 1 — read-only + draft-only.** She can ask questions and get
   drafted messages; nothing sends without her tap. Zero blast radius,
   builds a track record for Tier 0's accuracy.
3. **Phase 2 — low-risk auto-actions.** Daily-log delivery on the rules
   engine, with the undo window and a daily digest of what went out
   unattended.
4. **Phase 3 — broader action set.** Billing reminders, enrollment
   nudges — still confirmation-gated for anything in the Money/PII tier,
   indefinitely. Full unattended autonomy on money or child-safety
   communications isn't a milestone to build toward here; the
   confirmation gate is the feature, not a training-wheels stage to
   remove.

---

## 10. Decisions this plan doesn't make for you

- **Single-client or reusable?** This is one small home daycare today.
  Is this feature specific to Aunties Tykes, or is it actually the first
  build of something you'd want to offer across future daycare clients?
  That changes whether the rules engine and tool catalog get built
  generic/multi-tenant now or specific to this business — worth deciding
  before Phase 0's schema work, not after.
- **Whose OpenRouter key pays for her usage** — your studio account with
  a per-client usage cap, or a key she holds herself? Affects margin and
  how cleanly this attributes as a cost center if Aunties Tykes is ever
  part of an acquisition conversation.
- **Voice for v1, or later?** §7 treats it as a fast-follow, not a
  blocker — confirm that's right rather than a must-have for launch.

---

## 11. Suggested next step

Start Phase 0. It's required with or without this feature, and it's where
the real design decisions (RLS shape, what the server functions look like)
get made — this plan's tool catalog in §3 is written to map onto whatever
that migration produces, not the other way around.

---

*Pricing in §6 is a September 2026 OpenRouter snapshot (DeepSeek tool-calling
and Gemini Flash-class listings) — reconfirm current model IDs and rates at
build time rather than treating the numbers above as fixed.*

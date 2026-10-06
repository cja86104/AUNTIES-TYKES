# AI Admin Assistant — Planning Doc (v4 — decisions locked, nothing blocking Phase 1)

**Status:** Plan only. Nothing in §§3–11 has been built yet — `api/` holds
exactly one server function today (`create-parent-login.ts`, from the Auth
migration), nothing AI-related. Unlike earlier drafts, that's no longer
paired with an open decision or a permission gate — see the changelog below
and §12. There is nothing left to resolve before Phase 1 starts.

**Drafted:** September 2026, with Claude (Cowork). **Updated September 27**
— the three open items in the old §14 are all closed, so this pass locks
each one in at the section it actually affects rather than leaving them as
a standalone list:

1. **Single client, not a reusable product.** This is built specifically for
   Aunties Tykes. The tool catalog, the rules engine, and the schema in §3
   and §6 don't need a business/tenant abstraction anywhere — one owner, one
   set of families, exactly like the rest of this app already assumes.
2. **Cost is not a constraint.** The studio's own OpenRouter key pays for
   this with no spend cap. The tiered routing in §10 stays exactly as
   designed — it was never purely a cost measure, it's also the right model
   for each job's latency and capability needs — so don't read "budget's
   not an issue" as a reason to cut a tier or default everything to one
   model.
3. **Name and voice are final.** See below.

Also folded in this pass: `.claude/PROTECTED-AREAS.md` is retired (§12) —
there is no more "ask" tier for any file this build touches, so nothing
here pauses to request permission mid-build. And §11 now describes the
interface actually agreed on — a persistent icon and slide-over panel in
the `AdminLayout` shell — replacing the placeholder `/admin/assistant`
route from the original draft, which was never built and was superseded
before it was.

**Name: *Ro*. Locked** — not a placeholder anymore, this is what ships and
what's in front of Melissa.

**Voice: female, neutral, professional** — not the over-enthusiastic
assistant-bot register, and not curt or commanding either; the calm middle
of that range. This is one instruction that governs two different things:
the written personality in §4 (already close — "warm but efficient" was
already aiming here from the text side) and the literal TTS voice
selection in §9, which now has an actual pick instead of an open slot.

---

## 1. The ask, in one sentence

Give the owner a real assistant — not a settings-panel chatbot — that she can
type *or talk* to, that already knows her families, her invoices, her
attendance, and the standing instructions she's given it, and that carries
out the same actions the admin UI already does, including deciding which
families get contacted and which don't, at OpenRouter's cheap-tier pricing
rather than frontier-model pricing.

That's a real, buildable feature. It is not a "point an LLM at the database
and let it drive" feature — that version fails fast in a childcare app,
because the whole point of `useFamilyScope.ts` is that the Brooks family
can never see the Okafors' data. An AI layer has to inherit that boundary,
not sit above it. Everything below is designed around keeping that true.

---

## 2. Where this stands now

**Done:** the Supabase migration — real Auth, Postgres tables with RLS
reproducing what `useFamilyScope` did client-side, private Storage for
documents. `DEMO_MODE` and the localStorage data layer are gone entirely.
The app is live-wired. That part of the plan is finished; this section
used to describe it as a countdown and now just says so.

**Updated 2026-09-28.** The paragraph that used to sit here said "not done:
everything from §3 on", which stopped being true the day Phase 1 shipped. It
is replaced rather than amended, because a stale status section is the same
defect as a stale `ARCHITECTURE.md` — and this repo already has one of those.

**Done since:** Ro is live in production. `api/` now holds six server
functions: `create-parent-login.ts` from the Auth work, plus `ai/chat`,
`ai/status`, `ai/transcribe`, `ai/speak` and `ai/confirm`. All of §3's read
and draft tools work against real data, §5's watchers (seven since 2026-10-01) run on every turn,
§9's voice pipeline works in both directions on Chrome, and §11's slide-over
persists across navigation. Migration `0013_ai_assistant.sql` is applied, so
§8's audit log and §6/§7's standing rules are real tables.

The approve-and-execute path from §7 is built and proven on its first real
action — saving and retiring standing rules. That is the piece everything
else hangs off: `api/_lib/ai/execute.ts` holds the writes, `api/ai/confirm`
is its only caller, and a gated tool has no write of its own. So every
remaining mutation in the table below is a matter of adding a tool and an
executor, not new plumbing — and notably not a new endpoint, so the Vercel
function count stops growing here.

**Done 2026-09-28, the same day:** the send tier. `message.send` and
`announcement.send` are live, each one proposing and waiting for her tap, with
§7's standing-rule check now firing for real at send time, §8's hourly
ceilings, and a five-minute undo that genuinely removes the rows.

**Not done:** the remaining mutation tools, marked in the table below.

One thing worth watching, from live use rather than from this plan: the
Tier-0 model answers correctly but slowly, and TTS takes well over five
seconds to start. Both are deferred to a tuning pass after the catalog is
complete — they are latency, not correctness.

**Correction, 2026-09-28.** This paragraph used to open "Email (Resend) is
wired for real sending now." That is not true of the code and appears never
to have been. `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` and `EMAIL_FROM_NAME`
are set in `.env.local`, and nothing reads any of them: no Resend import
anywhere in `src/` or `api/`, no SMTP, no edge function (there is no
`supabase/functions` directory at all), and no trigger on `thread_messages`
or `announcements` — the only functions in the schema are `is_admin()` and
`current_family_id()`. It was found while building §12's send tools, which
had to know what "send" means before they could word a confirmation honestly.

So **a send is a database row and nothing else.** The parent sees it when
they open their portal, live, since those tables are in the realtime
publication; they are not emailed or texted. `AdminMessages.tsx` already
words its own toast that way ("will see it in their portal"), so the app has
been correct about this all along and only this document was wrong. Two
things follow: Ro must never say a family has been notified, only that it is
in their portal — and §8's undo is unusually complete here, because nothing
has left the building to be recalled.

There is still no payment processor — invoices are statements, payment is
recorded by hand outside the app, same as before. That doesn't change how the
`billing.mutate` tool in §3 is scoped, since its job is keeping the record
straight, not moving money.

---

## 3. Core architecture: a tool catalog, not database access

The AI never gets a database connection, an API key with broad scope, or
raw SQL. It gets a fixed list of named functions — the same shape as the
store actions this app already has — each one already scoped to one family
and already validated exactly like the UI form that calls it today.

**Revised 2026-09-27.** The owner's requirement is that Ro can eventually do
anything the admin console can do — "if Melissa says we have a new family to
add, it should be able and ready to complete it." The original table below
covered nine tools and was audited against the store's actual action surface
on that instruction; it was missing the calendar, leads, the waitlist,
business settings, thread creation, and every deletion. The complete map is
below, and the audit is the reason it is worth trusting: it was derived from
`useStore.ts` rather than from memory of what the app does.

### Built and live — 27 tools

**Naming note, 2026-10-01.** Every tool name below is written with dots (`family.find`) because that's how this table has always shown them. The actual `ToolSpec.name` in code is now underscore-separated (`family_find`) for all 27 built tools — see the Tier 2 incident note in §10 for why: Anthropic's tool-name schema rejects dots. Treat every dotted name on this page, built or still-"Waiting", as shorthand for its underscore form in code; a not-yet-built tool should be named with underscores from the start when it's built.

**Reads (15).** `family.find` · `family.get` · `roster.list` ·
`attendance.today` · `attendance.history` · `dailyLog.list` · `invoice.list` ·
`invoice.get` · `thread.list` · `thread.get` · `document.list` ·
`enrollment.list` · `calendar.upcoming` · `settings.get` · `rule.list` — all
on the caller's own JWT, so RLS decides what comes back.

**Drafts (1).** `dailyLog.draft` — prepares wording and stops. It is the only
one left: `message.draft` and `announcement.draft` were **removed** on
2026-09-28 when the send tools landed. A send proposal already is a draft —
she reads the wording and taps or dismisses — so keeping both only gave the
model a way to hand her a copy-it-yourself dead end when she had asked for
something to go out, which is the single thing the owner said defeated the
purpose of the feature. `dailyLog.draft` survives because there is genuinely
nothing to send it with: a daily log is a record, `dailyLog.write` is a later
section, and until then the honest offer is wording she can paste in herself.

**Sends (2), added 2026-09-28.** `message.send` and `announcement.send`
propose and wait for her tap — §7 allows no exception, including for a spoken
"send it". Both resolve the recipient list through the same family-scoped
queries the admin UI uses and show it to her, both re-check her standing rules
at the tap and not only at the preview, and both open a five-minute undo. Their
validations mirror `AdminMessages.tsx` exactly: a family, a subject, and at
least a sentence.

**Record and office changes (5), added 2026-09-28.** `attendance.set` ·
`dailyLog.write` · `calendar.mutate` · `lead.mutate` · `document.manage`. All
propose and wait for her tap. §7 allows Low actions to auto-run "once trust is
established"; trust is not established on day one, and the switch is cheap when
she wants it — an auto-running tool is one that calls its executor directly
instead of `propose`.

**None of the five can delete**, which is the one line drawn across this group.
§3 already gates deletions regardless of tier because this app has no trash, and
§8's undo covers sends rather than deletes. Removing a calendar event, a document
or a daily log stays in the console until it gets a pass of its own with wording
that says plainly it cannot be taken back. `document.manage` also cannot upload,
for a duller reason: an upload needs a file and Ro has no file.

**Actions (4), added 2026-09-28.** `rule.save` and `rule.retire` propose and
wait for her tap; `commitment.note` and `commitment.close` write straight
away. The difference is not a flag — `rule.save` contains no write at all.
Its write lives in `api/_lib/ai/execute.ts`, which only `api/ai/confirm.ts`
calls, so there is no path from a model's tool call to a saved rule that
does not pass through her approval. The commitment pair is exempt because it
touches Ro's own follow-up list and nothing else: no business record, no
message, no money. Every one of the four lands in `ai_audit_log` either way.

A rule change is gated despite sending nothing, which is worth stating since
it looks over-cautious next to the commitment pair. A standing rule is what
stops a later send. Saving a wrong one fails quietly — it shows up as a
message that did not go out, days later, with nothing pointing at the cause —
and retiring one removes a guard she put up herself.

### The mutation catalog, complete

Status column added 2026-09-28. "Waiting" means the tool and its executor
have not been written; the path they plug into has been.

| Store action(s) in `useStore.ts` | AI tool name | Risk tier | Status |
|---|---|---|---|
| `checkIn` / `checkOut` / `markAbsent` | `attendance.set` | Low | **Built 2026-09-28** |
| `addDailyLog` / `updateDailyLog` / ~~`deleteDailyLog`~~ | `dailyLog.write` | Low | **Built 2026-09-28** — write/update only, no delete |
| ~~`addDocument`~~ / `toggleDocVisibility` / ~~`deleteDocument`~~ | `document.manage` | Low | **Built 2026-09-28** — visibility only; upload needs a file Ro doesn't have |
| `addCalendarEvent` / `updateCalendarEvent` / ~~`deleteCalendarEvent`~~ | `calendar.mutate` | Low | **Built 2026-09-28** — add/update only |
| `addLead` / `updateLead` | `lead.mutate` | Low | **Built 2026-09-28** |
| ~~`setWaitlist`~~ | ~~`waitlist.mutate`~~ | — | **Cancelled 2026-09-28 — see below** |
| `addFamily` / ~~`updateFamily`~~ / `addChild` / ~~`updateChild`~~ | `family.add` | Medium | **Built 2026-10-01** — a new family with its children in one step, gated, no undo; changing an existing family or child still Waiting |
| `approveEnrollment` / `declineEnrollment` | `enrollment.decide` | Medium | **Built 2026-10-05** — gated, no undo; the form is claimed with a compare-and-swap before the family is written, an email already on file blocks approval, and a failed write rolls back and returns the form to pending |
| `updateSettings` / `updateRates` / `updatePolicies` | `settings.mutate` | **Money** — *added 2026-09-27* | Waiting |
| `startThread` / `sendThreadMessage` | `message.send` | **Send** | **Built 2026-09-28** |
| `addAnnouncement` | `announcement.send` | **Send** | **Built 2026-09-28** |
| ~~`createInvoice`~~ / `recordPayment` / ~~`deleteInvoice`~~ | `payment.record` | **Money** | **Built 2026-10-01** — record a payment only, gated, no undo; creating and deleting invoices still Waiting |
| `createParentLogin` (via `api/create-parent-login.ts`) | `account.create` | **Money/PII** | **Built 2026-10-01** — gated; she types the password on the card at her tap, so it never reaches a model, a tool argument or `ai_audit_log`; shares `api/_lib/parentLogin.ts` with the console endpoint; no undo |
| *(none — Ro's own tables)* | `rule.save` / `rule.retire` | Medium | **Built 2026-09-28** |
| *(none — Ro's own tables)* | `commitment.note` / `commitment.close` | Low, ungated | **Built 2026-09-28** |

Deliberately absent, because the admin console cannot do them either:
`login` / `logout` / `bootstrap` / `pushToast` / `markSectionSeen` are
plumbing, `submitEnrollment` is the public form, and `acknowledgeDocument` is
a parent's action on their own account.

**Two tier calls worth stating, since neither was in the original table.**
Deletions are gated regardless of the tier they sit in: this app has no
trash, so a deleted daily log or invoice is gone, and §8's undo window covers
sends rather than deletes. And `settings.mutate` is filed under Money rather
than Medium because `updateRates` changes the rate card every future invoice
is built from — a quiet edit there is a pricing change, not a preference.

**`waitlist.mutate` was cancelled on 2026-09-28, and this table was wrong to
list it.** `setWaitlist` exists in `useStore.ts` and nothing calls it; no page
reads `waitlist_prospects`. The app's real waitlist is a child whose `status` is
`'waitlist'`, which `AdminChildren.tsx` filters on. A tool writing to
`waitlist_prospects` would have looked like it worked and been invisible to
Melissa forever — worse than not having the tool. Putting a child on the
waitlist means changing their status, which belongs with the child mutations in
the Money/PII pass. Worth noting how it got in here: this table was derived from
the store's action surface, and a store action existing is not the same as the
app using it. Two orphans have now been found that way — this and migration
0005's three tables below. Anything still marked Waiting should be checked
against a page that actually calls it before it is built.

Also worth recording for whoever picks this up: `persist.waitlist` implements
`setWaitlist` by deleting every row in `waitlist_prospects` and re-inserting the
array. Even if that table were adopted, an AI tool must not mirror that shape —
one stale list and the waitlist is gone. Row-level writes, always.

**A schema note that lands on `family.mutate` when it is built.** Migration
0005 created `family_contacts`, `pickup_authorizations` and `pickup_events`,
backfilling the first from `families.secondary` / `families.emergency`, with
the intent that the app move onto the new table. That move never happened —
`db.ts`, `persist.ts` and `useStore.ts` contain no reference to any of the
three, and `AdminFamilyDetail.tsx` still reads the jsonb columns. So the
jsonb columns remain the live source of truth, which is what Phase 1's
`family.get` reads, correctly matching the UI. But the backfilled
`family_contacts` rows have been drifting from the jsonb ever since, and
pickup authorizations have no UI at all. Whoever builds `family.mutate` must
write the same columns the UI writes and not the orphaned table; whoever
finishes the 0005 migration has to move Ro's read at the same time.

The model's only job is to figure out *which tool, with which arguments* a
sentence (typed or spoken) maps to. It cannot invent a tool, and a tool it
doesn't have listed simply isn't callable.

---

## 4. Who Ro is — identity, not a feature list

This is the part that decides whether it feels like a real assistant or a
form with a chat bubble on it, and it costs nothing to get right.

The system prompt is assembled fresh each session from real state — not
written once and left static — the same way a rich companion prompt pulls
from live data instead of a fixed bio. For Ro, the ingredients are:
who Melissa is, her standing rules, today's real numbers (checked-in count,
unpaid invoices, pending enrollments, unanswered threads), and a strict
closing section that governs how it talks.

**It's written in second person, addressed to the model as an identity, not
described in third person as a tool.** That distinction is the actual
mechanism, not flavor:

- "This assistant helps daycare administrators manage attendance, billing,
  and messaging" teaches the model to *narrate about itself* — which is
  where "Hi! I'm an AI assistant, how can I help you today?" comes from.
- "You are Ro, Melissa's operations partner at Aunties Tykes. You know
  which families are enrolled, who's checked in today, whose invoice is
  overdue, and what she's told you about how she wants each family
  handled" teaches the model to *inhabit* that role instead.

The closing "how you respond" section matters just as much: texting
register, no markdown headers, no numbered action-item lists, ask one
sharp question before launching into a plan when the data to answer
confidently isn't there yet. That's what keeps replies reading like a
person who works there instead of a report generator.

If Melissa ever writes freeform context about how she wants Ro to sound or
what she wants it to know about her business, that text gets normalized
into consistent second-person register with one cheap model call *at save
time*, not re-interpreted live on every turn.

**Ro's personality, concretely — not just "second person."** Second-person
framing is the mechanism, but it's not the whole feeling. Kirra's
companion prompts work because they specify an actual personality, not
just a grammatical person. Ro needs the same thing, written into the
system prompt as traits the model is told to embody, not left to whatever
"helpful assistant" defaults to:

- **Warm but efficient** — she runs a business with a toddler on her hip
  half the time. Ro leads with the point, not a greeting-then-preamble.
- **A co-worker, not a customer-support agent.** Ro has opinions about
  what's worth Melissa's attention today and says so ("the Chen thing is
  the one I'd actually deal with first") instead of listing everything
  flat and making her triage it herself.
- **Comfortable saying "I don't know"** or "that's outside what I can do"
  plainly, without padding it in apology. Confident about what it does
  know, for the same reason.
- **Notices the human parts, not just the data.** If three families paid
  the same week the system prompt's "today's real numbers" show a good
  month, Ro's allowed to say so — it's not required to stay clinical when
  the honest read of the numbers is "good week."
- **Pushes back when told to ignore something the data disagrees with —
  explicitly, not as a hoped-for side effect of "has opinions."** A
  companion-style trial run of this personality (September 26) surfaced
  the gap directly: told "don't worry about it, it's fine" on an invoice
  that was, by the numbers, not fine, the model just logged the
  instruction and moved on — no "is that a one-off or the pattern with
  them," nothing. "Not deferential for the sake of it" as a personality
  trait is not enough to make a model actually do this; it needs to be a
  named behavior in the prompt: when an instruction contradicts a fact Ro
  actually has, say so once, plainly, before complying — she can still be
  overridden, she just doesn't silently swallow the contradiction first.

**Calibration, now that the register is locked (female, neutral,
professional — see the top of this doc).** Every bullet above still holds,
but the target reading is the calm middle of that range, not either edge.
"Warm but efficient" is not "upbeat" — Ro doesn't open with enthusiasm she
doesn't need to perform. "A co-worker with opinions" is not "the boss" —
she states a read and defers to Melissa's call, she doesn't direct her. If
a draft reply reads like it belongs in a cheerful onboarding email, or
like it's issuing an instruction rather than offering one, that's the
tell it drifted off the target, in either direction.

This is a fixed block in the system prompt, the same way a companion
product's personality bio is fixed — not something the model infers fresh
from the data each session. The data changes every session; the
personality doesn't.

**Continuity is part of the personality, not a separate memory feature.**
§6 already turns standing instructions into rows so they survive between
sessions. Extend the same idea one step further: when Ro says it'll follow
up on something ("I'll flag it if the Chens haven't paid by Friday"), that
commitment becomes a row too — not full conversational memory, just enough
that Ro can open a session by checking its own open commitments and
mentioning them unprompted. That's most of what makes a companion feel
like it remembers *you* rather than just answering the last message: not
deep recall, just not forgetting what it said it would do.

---

## 5. What Ro notices without being asked

This is the piece that makes it feel like an assistant instead of a search
box: a small set of watchers, each checking real state against a real
condition, each respecting a cooldown and quiet hours so Melissa isn't
pinged about the same thing five times or at 9pm on a Sunday.

| Trigger | Condition | Priority |
|---|---|---|
| `daily_log_missing` | A child's `attendance` shows `checked-out` today, no matching `dailyLogs` entry exists | Medium |
| `payment_overdue` | An invoice is past `dueDate` with a balance owed, no reminder sent within the cooldown window | Medium → High with age |
| `enrollment_new` | An `enrollments` row is `pending` and arrived within the stale threshold (3 days) — *added 2026-10-01* | High |
| `enrollment_stale` | An `enrollments` row has sat `pending` past a threshold | Medium |
| `ack_pending` | A `documents` row has `requiresAck: true` and a family hasn't acknowledged it | Low |
| `unanswered_message` | A `threads` entry's last message is from a parent, no reply within the cooldown window | Medium → High with age |
| `cold_lead` | A `leads`/`waitlist` entry has had no status change or activity in N days | Low |

Each of these is a plain read query, evaluated by ordinary code — no model
call, no cost, no judgment involved in deciding *whether* something is
true. That part stays deterministic on purpose: whether an invoice is
actually overdue is a fact to look up, not something worth risking a
model's judgment on, and §8's "no invented facts" guardrail depends on
that boundary holding.

**But *whether it's true* and *how Ro tells her about it* are different
jobs, and only the first one needs to be mechanical.** A raw list of six
rows is the "chatbot following set links" version of this feature —
technically proactive, but it reads like a cron job's output, because it
is one. What makes it feel like Ro noticed something is a second, cheap
step: hand the day's trigger results to the Tier-1 model, inside the same
personality-bearing system prompt from §4, and let it decide the framing —
what leads, what's worth a sentence versus a mention, what tone a good
week versus a rough one deserves, and whether anything connects (the Chen
daily log being late *and* their invoice sliding into "overdue" the same
week is worth saying as one thing, not two bullet points). The model is
never allowed to change the underlying facts, only their order and voice —
it's handed the exact trigger rows as structured data and templated
guardrails against adding anything not in them, the same discipline §8
already applies to message drafting.

The result Melissa actually sees, opening the console or asking out loud
"what's going on today?", reads like someone who's been paying attention
gave her a heads-up — not a report generator rendering six rows. That
distinction is the entire point of building this instead of a settings
page with filters on it.

---

## 6. What Ro remembers, and how

Not a semantic memory system, not embeddings, not a "memory palace" — that
kind of infrastructure is overkill for what this needs and is genuinely
more failure-prone than it's worth at this scale. What Ro needs is two
much simpler things, both of which already work at this scale in a chat
product built the same way:

**Standing instructions become real rows, not conversation context.**
When Melissa says "don't message the Brooks family until Friday," that
becomes a saved rule in a rules table — the same kind of record as a
child's allergy or an invoice — checked before any send-tier action runs.
It's not the model "remembering" anything; it's a lookup against data that
persists regardless of what conversation she's in or whether she closed
the tab. That's also why it's inspectable and correctable — she or you can
open the actual list of standing rules and edit or delete any of them,
never a black box.

**A cheap pattern-match runs before the model does, for the common
shapes.** Rather than sending every sentence to a model to classify,
match obvious instruction shapes with plain regex first — "don't
(message|contact|email) the X family (until|before) Y," "X is paying on
Y," "remind me to Z" — and only fall through to the Tier-0 model (§8) when
nothing matches. Costs nothing, and most of what a small home daycare
owner actually says fits a handful of shapes. Start with a small list,
expand it as you see what she actually types and says — don't try to
guess the full set up front.

---

## 7. "What to send to who" — a rules engine Ro edits, not a model that decides live

*(Carried over from the original draft — this reasoning didn't change.)*

**Standing rules** are plain structured data, evaluated by ordinary code,
no model involved at send time. Things like: *daily logs go out
automatically at checkout, except don't message the Okafors after 6pm, and
never auto-send anything billing-related.*

**Ro's real job** is narrower than "decide who gets messaged":

- Turn a sentence into a rule change (typed or spoken), and show Melissa
  the rule in plain English before it's saved
- Draft the actual wording of a message in her voice, from real fields —
  never inventing a detail that isn't in the record
- Handle one-off ad hoc commands by resolving the recipient list through
  the same family-scoped queries the admin UI already uses, showing her
  the resolved list, and waiting for her tap (or, once voice output is
  trusted, a spoken confirmation)

**Confirmation tiers.** *Low* actions (attendance, daily logs, documents)
can auto-run once trust is established. *Send*, *Money*, and *PII* actions
always show a preview and require her tap — no exceptions in v1, including
send actions the rules engine itself triggers. Voice makes it easier for
her to *ask* and to *hear the answer* — it does not loosen this gate. A
spoken "send it" still routes through the same confirmation UI a tap does;
this plan does not add voice-only approval for anything in the Money or
PII tier.

---

## 8. Guardrails specific to a childcare + money app

*(Carried over from the original draft. One item — PII minimization — was
reversed by an explicit owner decision on September 27, 2026 while Phase 1
was being built; it is struck through below rather than deleted, so the
reasoning that produced it and the reasoning that overrode it both stay on
the record. The rest is unchanged and still the right list.)*

- **Audit log.** Every AI-initiated action stores the instruction that
  caused it, the tool called, the arguments, and who/what it touched.
- **No invented facts about a child.** Message drafting is templated: the
  model rephrases fields it's handed, never states anything about a
  specific child that isn't already in a record. **Still in force, and more
  load-bearing than before** — see the reversal below, which means there is
  now more real detail available for a draft to get subtly wrong.
- ~~**PII minimization in prompts.** Tier-0/1 model calls get first names
  and internal IDs, not full addresses, DOB, or anything payment-related.~~
  **Reversed 2026-09-27 — Ro sees the whole record.** Full names, dates of
  birth, allergies, medications, family and emergency contact details,
  payment method and reference, and the business's own contact fields are
  all handed to the model. The owner's reasoning: this is a single-admin
  app, Melissa is the only human who ever sees Ro's output, and restricting
  what Ro knows only makes it worse at the job it exists to do. On payments
  specifically — the app stores invoices and hand-recorded payments, never
  card or bank details, so "payment-related" here means a method string and
  a check number alongside family information Ro already has, not a
  credential.

  What this trades away, stated plainly so it is a known cost rather than an
  oversight: the limit was never about who can see the screen, it was about
  what leaves the building. Every field now travels to third-party
  inference providers over OpenRouter — an Ant Group model at Tier 0, an
  Alibaba model at Tier 1, Anthropic at Tier 2 (§10). If that ever needs
  narrowing, because a client asks, an acquirer's diligence asks, or a tier
  is repointed at a provider with different terms, the single place to
  narrow it is `api/_lib/ai/projection.ts` — its `Brief` shapes are the
  contract for what a tool may return, and its header carries this same
  decision record.
- **Rate limit / blast-radius cap.** A hard ceiling on sends-per-hour and a
  same-message-to-N-families threshold that forces confirmation
  regardless of rule state.
- **Undo window.** Anything sent gets a short window where "undo" pulls it
  back if the transport allows, and is always logged even if it can't be.

---

## 9. Voice — full v1, both directions, Safari is non-negotiable

Voice ships with the initial build. Not deferred, not a fast-follow. The
Safari requirement isn't a nice-to-have either — it's the thing that
decides whether this is usable for the client at all, so the architecture
below is chosen specifically because it's Safari-safe *by construction*,
not because a particular vendor happens to support it today.

**The rule that makes Safari support non-negotiable-and-true at the same
time: never rely on browser-native speech APIs.** `webkitSpeechRecognition`
doesn't reliably open the real microphone on iOS Safari (it rides on Apple
Dictation under the hood and is inconsistent across mobile browsers), and
`speechSynthesis()` has inconsistent voice availability and quality on
Safari. Both are free, and both are exactly the wrong choice given the
requirement.

**What actually works everywhere, Safari included:** the server calls a
speech API and gets back an audio file; input goes the same way in
reverse — the browser records audio and uploads it, the server
transcribes it. Neither direction depends on a browser's own speech
engine. Safari has always fully supported MP3 playback through a normal
`<audio>` element; the only real constraint is universal across every
modern browser, not Safari-specific — playback has to start from a user
gesture (a tap), which a chat interface already does naturally.

**Speech-to-text (her voice → text):** OpenRouter's audio-transcription
endpoint, `openai/whisper-large-v3-turbo` (Groq-hosted). Verified rate:
**$0.000003/second** — that's $0.18/hour, effectively free at single-owner
volume. Record with `MediaRecorder`, upload the clip, transcribe
server-side, feed the transcript into the normal send-message flow as if
she'd typed it.

**Text-to-speech (Ro's replies → her voice):** verified rates below,
pulled directly from OpenRouter this week — v2 had this as a rough
estimate and got it wrong in a way worth explaining rather than just
correcting quietly.

| Model | Input / Output per 1M | Real cost per minute of speech |
|---|---|---|
| `google/gemini-3.8-flash-lite-tts` — **pick** | $0.50 / $6 | roughly half a cent |
| `openai/gpt-4o-mini-tts-2025-12-15` — fallback | $0.60 / $12 | roughly a penny |

**Swap and revert, 2026-09-30 → 2026-10-01 — Kokoro 82M tried, Gemini kept.**
On 2026-09-30 the pick was changed to `hexgrad/kokoro-82m`, voice `af_heart`,
pinned to the DeepInfra provider (`provider: { order: ["deepinfra"],
allow_fallbacks: false }` — DeepInfra prices Kokoro at $0.62/M characters
against Together's $4.00/M for the identical model, over $3/M apart). On
2026-10-01, after listening to Kokoro and a couple of other candidates
against it, Gemini was judged the better-sounding voice by a clear enough
margin to outweigh the cost case the swap was made on, and the pick reverted
to `google/gemini-3.8-flash-lite-tts` / `Erinome`. The provider-pin mechanism
itself stayed in the code (config.ts `SpeechConfig.providers`, openrouter.ts
`speak()`) since it's config-driven and harmless unset — `AI_MODEL_TTS_PROVIDER`
is simply not set for Gemini, which keeps OpenRouter's own routing. Worth
knowing if Kokoro (or another DeepInfra-hosted model) comes up again: the
pin machinery is already there, just set the env var.

**Fixed, 2026-10-01 — STT (Whisper) drifted onto a slow provider, pinned to
Groq.** The owner reported speech-to-text going from fine to 15+ seconds to
land in the text box (not a failure — `transcribe()` was succeeding, just
slow). `openai/whisper-large-v3-turbo` has exactly two providers on
OpenRouter: DeepInfra ($0.00000333/s) and Groq ($0.0000111/s, ~3.3x pricier).
`AI_MODEL_STT` had never been pinned — the header comment above it already
said "Groq-hosted," which was only ever an assumption riding on default
routing, not something the code enforced. OpenRouter's default routing is
price-weighted by the *inverse square* of price, so it had drifted onto
DeepInfra, and DeepInfra does not have Groq's speed for this model. Same
class of bug as the tier-0/1 Cerebras incident above: an unpinned model
silently moving to whichever provider is cheapest, not fastest. Fixed by
adding the same provider-pin mechanism STT never had: `AiConfig.sttProviders`
(config.ts) and a `provider: { only, allow_fallbacks: false }` block in
`transcribe()` (openrouter.ts), both mirroring `chatProviders`/`chat()`
exactly. `AI_MODEL_STT_PROVIDER=groq`, no fallback — same reasoning as the
Cerebras pin, the point is Groq's own speed, so falling back on a hiccup
defeats it. Purely additive: `npm run typecheck` and `npm run lint` both
pass clean, and the diff touches nothing in the Tier 2 tool-naming fix above.

**Correction, 2026-09-27 — the audio format.** §9's Safari argument rested on
mp3 playing through a plain `<audio>` element. Gemini TTS does not offer mp3:
it answers `Gemini TTS only supports response_format="pcm"`. Headerless PCM is
not playable by an `<audio>` element at all, so the argument as written did not
survive contact with the chosen model.

The mechanism is intact, the container changed. The server now asks for PCM and
wraps it in a 44-byte RIFF/WAVE header before returning it, so the client still
receives a file it plays after a tap — WAV rather than mp3, and WAV plays in
every browser including Safari. Format is negotiated per model (PCM first, mp3
second, branching on the content type that actually comes back) rather than
hardcoded, which is what caused this. Two consequences worth knowing: PCM is
uncompressed at 48 KB per second, so `api/ai/speak.ts` caps text at 1200
characters (~80s) as a response-size limit, and speech above 4 MB is refused
outright rather than truncated mid-sentence.

**Voice check, closed.** §9 flagged that the male/female split for Gemini's
voices came from a third-party reference rather than Google. Google's own speech
documentation lists both: **`Erinome` — "Clear"** and **`Sulafat` — "Warm"**,
among 30 prebuilt voices. That matches §9's reasoning for picking Erinome as the
neutral-professional read, from the primary source. What remains is only a
listen for taste, not a correctness question.

**Correction, 2026-09-27.** This row previously read `openai/gpt-4o-mini-tts`,
undated. That slug does not exist on OpenRouter and returns "Model ... does not
exist" — OpenRouter's own TTS documentation names the dated
`openai/gpt-4o-mini-tts-2025-12-15`. Found when speech was first tried against
the live deployment. `google/gemini-3.8-flash-lite-tts` is confirmed present and
is unaffected. A related check still outstanding: OpenRouter exposes a
`supported_voices` array per speech model on its models endpoint, so `Erinome`
should be confirmed against that list rather than against the third-party
reference §9 took it from.

**Why the output price is so much higher than the input price, on both of
these — this isn't a mistake, and it's true of every TTS model, not just
one:** input tokens are text, priced like any text model. Output "tokens"
for a TTS model are chunks of generated audio, and it takes far more of
them to represent a sentence spoken aloud than it took to represent that
same sentence as written text — so the per-token rate looks enormous next
to a chat model's, while the actual per-minute cost stays tiny, because a
short reply doesn't generate many of those tokens. Both numbers are real
and both matter (the per-1M rate for engineering purposes, the per-minute
figure for what this actually costs Melissa), which is why v2 stating only
a single rough per-minute estimate was the wrong call — showing one number
without the other is exactly what reads as "doesn't make sense."

Gemini's the pick over gpt-4o-mini-tts specifically because its output
rate is half, at no cost to the Safari-safety architecture — that
mechanism (server generates a file, client plays it through a tapped
`<audio>` element) doesn't care which vendor generated the file. Both stay
on OpenRouter, so there's still exactly one provider and one key across
chat, transcription, and speech.

**Voice selection, now that "female, neutral, professional" is locked
in.** Gemini's TTS voices carry short tone labels in Google's own docs
(Bright, Firm, Informative, Warm, and so on) but not a gender tag — the
male/female split below is from a widely-used third-party reference
(ComfyUI-Gemini_TTS), not Google directly, so it's worth a one-time listen
check against the real API before this ships, the same spirit as the
iPhone Safari check below.

- **Primary pick: `Erinome`** — documented as "clear and precise." That's
  the neutral-professional read: composed and competent without leaning
  warm or brisk either way.
- **If that reads too flat once you hear it: `Sulafat`** — "warm and
  welcoming." Closer to §4's "warm but efficient" language, if the
  neutral pick undersells the co-worker warmth once it's actually
  speaking.

**Fallback voice, `gpt-4o-mini-tts`:** OpenAI's own docs don't label
gender or tone for its 13 voices the way Google's do, so there's no
verified pick here yet — this path only matters if the Gemini endpoint is
down, so it's not worth guessing at. Run a few of the newer voices
(`marin`, `cedar` are what OpenAI itself recommends for this model)
through openai.fm and pick whichever reads closest to the same target
before this fallback path is ever live.

If voice quality becomes the deciding factor later — ElevenLabs is
meaningfully more natural-sounding than either of the above — that's a
deliberate upgrade to evaluate on its own, not a v1 default; it'd be a
second vendor and key outside the OpenRouter-only standard this app holds
to everywhere else.

**Playback UI:** every Ro reply gets a tap-to-listen affordance next to
the text — never autoplay. That satisfies the universal user-gesture
requirement automatically and means nothing about the Safari story depends
on a workaround; it's just how the feature is built.

**Verification, not just architecture.** Test actual recording and
playback on a real iPhone in Safari once, early in the build — before
Melissa is relying on it. The mechanism above is standard and safe, but
"works in Chrome dev tools" isn't the same as confirming it on the one
device that has to work. Cheap to check now, expensive to discover at
launch.

---

## 10. Model routing — tiered, OpenRouter-only, priced for a home daycare's actual volume

Final picks, deliberately spread across three different labs rather than
defaulting to one provider for everything — chosen for fit, not chased on
price. Verified against OpenRouter's own model pages, September 2026:

**Tier 0 — intent parsing.** `inclusionai/ling-3.0-flash-vl` — $0.06 / $0.18
per 1M tokens, 131K context. Hybrid instant/reasoning model with tool
calling built in — exactly the "which tool, which arguments" job, and
cheap enough that the regex fast-path in §6 only exists to skip calls that
would've cost fractions of a cent anyway.

**Tier 1 — message drafting.** `qwen/qwen3.8-flash` — $0.15 / $0.47 per 1M
tokens, 1M context, confirmed tool calling. The sentence a parent actually
reads doesn't need a frontier model, just consistent tone — this is well
past what a two-sentence daily-report blurb requires.

**Swap, 2026-10-01 — both Tier 0 and Tier 1 moved to `openai/gpt-oss-120b`,
pinned to Cerebras.** Both tiers now point at the same model id rather than
staying on separate labs — tried on Tier 0 first on confidence in the
model itself, then also put on Tier 1 to see how it does there too. Pinned
specifically to the Cerebras `fp16` endpoint (`provider: { only:
["cerebras/fp16"], allow_fallbacks: false }`): Cerebras's throughput on
this model is far ahead of every other provider serving it — roughly
600 tps against the next tier of general-purpose providers' low hundreds —
which is the reason for the pin, so no fallback to a slower provider on a
Cerebras hiccup. `AI_MODEL_TIER0_INTENT_PROVIDER` /
`AI_MODEL_TIER1_DRAFTING_PROVIDER` carry the pin (config.ts
`chatProviders`, openrouter.ts `chat()`); a tier with no `_PROVIDER` entry
keeps OpenRouter's own routing, so this is additive and doesn't touch Tier
2. `inclusionai/ling-3.0-flash-vl` and `qwen/qwen3.8-flash` above are the
prior picks, kept here for the record rather than deleted.

**Incident, 2026-10-01 — the Cerebras pin broke both tiers, rolled back.**
Within the hour of going live, every Tier 0 call started failing and
escalating straight to Tier 2, and Tier 2 (`anthropic/claude-haiku-4.5`,
never pinned, untouched by this swap) failed as well — not yet explained,
since nothing about the escalation tier's own request changed.
`cerebras/fp16` was checked against OpenRouter's own
`/api/v1/models/openai/gpt-oss-120b/endpoints` and is a real, current
endpoint tag, so the slug itself isn't the bug. `AI_MODEL_TIER0_INTENT_PROVIDER`
and `AI_MODEL_TIER1_DRAFTING_PROVIDER` were removed from Vercel as an
immediate rollback — `openai/gpt-oss-120b` stays on both tiers, unpinned.
Open until a Vercel runtime log (the `[ro] tier failed` line and its
`attempts` detail) or the OpenRouter Activity log shows the actual
rejection reason for both the Cerebras attempt and the Anthropic one.

**Confirmed, same day — why the unpinned fallback lands on DekaLLM, not
Cerebras.** Not a bug: OpenRouter's documented default (no `provider`
field at all) is price-weighted load balancing across stable providers,
not throughput-weighted — "look at the lowest-cost candidates and select
one weighted by inverse square of the price." For `openai/gpt-oss-120b`,
DekaLLM prices at $0.03/$0.18 per 1M against Cerebras's $0.35/$0.75 —
over 10x apart — so default routing reliably picks DekaLLM once the pin
is off. Getting back to Cerebras still requires the explicit pin; the
open question is only whether the pin itself is safe to re-add (the
original 400-with-no-fallback cause is still unconfirmed).

**Resolved, 2026-10-01 — the Tier 2 failure was a separate, pre-existing
bug: dotted tool names.** The "both tiers failed" half of the incident
above had nothing to do with the Cerebras pin. Every one of the 27 tool
names in `api/_lib/ai/tools/*.ts` used dot-namespacing (`family.find`,
`rule.save`, `message.send`, ...) going all the way back to §3's original
table. That is tolerated by whichever provider Tier 0/1 happened to land
on, but the Azure-hosted endpoint OpenRouter routes Tier 2
(`anthropic/claude-haiku-4.5`) through enforces Anthropic's tool-name
pattern, `^[a-zA-Z0-9_-]{1,128}$` — no dots allowed — and rejected the
whole tools array with `tools.0.custom.name: String should match
pattern...`. This had presumably always been broken for Tier 2; it only
surfaced now because the Cerebras-pin incident above kept forcing
escalation attempts that exercised the dormant path for the first time.
Fixed by renaming every `ToolSpec.name` to underscores (`family_find`,
`rule_save`, `message_send`, ...) across all six tool files, plus the
handful of model-facing description/prompt strings that referenced the
old dotted names by name (`prompt.ts`, `api/ai/chat.ts`). Left unchanged,
because they are separate, internal-only identifiers that the Anthropic
schema never sees: the `Executor.tool` registry in `execute.ts`, the
`tool:`/`kind:` fields passed to `propose()`, and the per-request dedup
`key` template strings. `npm run typecheck` and `npm run lint` both pass
clean after the rename. The Cerebras-pin question directly above is still
open and unrelated to this fix.

**Confirmed working, 2026-10-01.** Deployed through the owner's normal
commit/push → Vercel pipeline. Ro now goes through Tier 2 escalation (and
the rest of the tool catalog) through the proper channels without the
`tools.0.custom.name` rejection. Do not re-introduce dots into any
`ToolSpec.name` in a future tool.

**Tier 2 — rare escalation.** `anthropic/claude-haiku-4.5` — $1 / $5 per
1M tokens, 200K context, extended thinking with controllable reasoning
depth. OpenRouter's own listing puts it at matching Claude Sonnet 4 on
reasoning, coding, and computer-use tasks — genuinely capable, not a
"cheap tier" compromise — at a fraction of Opus's $5/$25 rate. Route here
only when Tier 0 confidence is low or the tool's risk tier is Money/PII,
and even then the confirmation gate in §7 means a human checks the output
before anything executes.

Don't hardcode model IDs. Keep a small model-registry config — tier →
ordered list of model IDs with a fallback, the same shape as a working
provider-config file already in the portfolio (`AI_CONFIG` → tiers →
models) — so swapping in a cheaper or newer model, or adding a second
option per tier for redundancy, is a config change, not a code change.

**Illustrative cost:** a handful of families, 10–20 AI-mediated actions on
a busy day, well under a dollar a month per client at today's pricing —
before any Tier 2 escalation, which should be rare by design. Voice adds
pennies on top of that at single-owner volume. That's the number worth
defending to a client, not "AI costs," full stop.

---

## 11. Interface

- **A persistent icon in the `AdminLayout` shell, opening a slide-over
  panel — not a separate route.** Confirmed over a dedicated
  `/admin/assistant` page: Melissa's mid-task on whatever admin page she's
  on when she needs Ro, and a route switch loses that context for no
  reason. The icon and panel live in `AdminLayout.tsx` itself, so Ro is
  reachable from every admin page without leaving it.
- **Both typed and spoken input from day one.** A microphone control next
  to the text input, using the OpenRouter/Whisper pipeline from §9 — not
  the browser's own speech recognition.
- **Every Ro reply gets a tap-to-listen control**, using the OpenRouter
  TTS pipeline from §9, with the voice picked there. Off by default per
  message (she taps to hear it, it doesn't talk at her unprompted),
  always available.
- Every AI action surfaces as a running activity feed — "Sent to: Brooks,
  Okafor, Chen — tap to view" — doubling as the audit log's UI. The
  proactive notices from §5 land in the same feed, ranked by priority.
- The panel is a good fit as a slide-over specifically because it's meant
  to be glanced at and dismissed, not lived in — a full route would
  invite building it like a destination page, which fights the
  "co-worker at your elbow" framing in §4.

---

## 12. Permission state — nothing gated anymore

`.claude/PROTECTED-AREAS.md` and the `ask` list in `.claude/settings.json`
are retired as of September 27, 2026. Both existed to keep in-progress
public-site work from bleeding into the admin/parent portal after it was
signed off; that concern doesn't apply to this build, which touches
`src/store/**`, new components, and `src/types.ts` on purpose. There is no
file in this codebase that pauses to ask permission before an edit —
building this doesn't reach into anything locked, because nothing is
locked.

One file still deserves the same care a lock would have forced anyway,
just because of what it does rather than a permission rule:
**`src/lib/useFamilyScope.ts`** is the single place family data gets
filtered client-side, and it's meant to move in lockstep with the
Postgres RLS policies doing the same job server-side. Any change here
gets the same re-verification `ARCHITECTURE.md` already calls for — check
the RLS policies alongside it, not after.

---

## 13. Phased rollout

1. **Phase 0 — Supabase migration. Done.** Real Auth, real tables, real
   RLS, live in production. Nothing below has started.
2. **Phase 1 — read-only + draft-only, voice included. Done, live.** She
   can ask questions (typed or spoken) and get drafted messages and spoken
   replies; nothing sends. Zero blast radius on the action side, built a
   track record for Tier-0 accuracy, and got the voice pipeline proven
   early rather than bolted on later. Voice being in v1 was about the
   input/output channel, not about loosening any confirmation gate — and it
   did not.
3. **Phase 2 — actions, each behind her tap. In progress.** The
   approve-and-execute path is built and proven on standing rules
   (2026-09-28): propose, preview, tap, execute, audit, with the claim on
   the audit row making a double tap incapable of running anything twice.
   What remains is filling the catalog — the low-risk mutations, then the
   send tier, then Money/PII — plus the undo window and a digest of
   anything that ran unattended. §5's notices are already live.

   Worth recording, because it inverts the original plan's instinct: the
   rules engine was going to be built as its own slab and the send path as
   another. Building one complete vertical slice instead — server library,
   endpoint, tool, UI, all for a single real action — meant the second
   action needed no new plumbing at all. Every remaining tool is a tool and
   an executor.

   That held. The send tier shipped the same day and added no endpoint, no
   table and no new gate — two tools, two executors, and one field
   (`sendTarget`) whose presence is what opts a tool into the rule check and
   the ceilings. Sends were taken before §11's low-risk mutations on purpose:
   until something could send, the rules engine guarded nothing, and the
   generic send gate had no consumer and so had never run. The remaining
   sections are now the low-risk mutations, then Money/PII.

   The low-risk mutations landed the same day. Five tools, five executors, no
   new endpoint, no new table, and one tool from §3's list cancelled outright
   after reading the code it was supposed to mirror. What is left is the
   Money/PII pass: invoices and payments, new families and children, enrollment
   decisions, parent logins, and the rate card — plus a deliberate pass on
   deletions, which nothing in Ro can do yet on purpose.
4. **Phase 3 — broader action set.** Billing reminders, enrollment
   nudges — still confirmation-gated for anything in the Money/PII tier,
   indefinitely. Full unattended autonomy on money or child-safety
   communications isn't a milestone to build toward; the confirmation
   gate is the feature, not training wheels to remove.

---

## 14. Decisions — all resolved as of September 27

Nothing left open here. For the record, since this section used to be the
running list:

- **Single-client or reusable?** Single client — built specifically for
  Aunties Tykes, no multi-tenant abstraction anywhere in §3 or §6.
- **Whose OpenRouter key pays for her usage?** The studio's own key, no
  spend cap. Doesn't change how §10's tiers are chosen — see the header
  changelog.
- **Ro's actual name and voice selection?** Name's locked (*Ro*). Voice is
  `Erinome` on Gemini — briefly swapped to `af_heart` on `hexgrad/kokoro-82m`
  (DeepInfra-pinned) on 2026-09-30, reverted 2026-10-01 after a listen test;
  see §9's swap-and-revert note.

Resolved earlier and still holding: voice ships in v1, not deferred.
Provider stays OpenRouter-only across chat, transcription, and speech,
rather than splitting to a second vendor for voice.

---

## 15. Suggested next step

Phase 0 is done, every decision in §14 is closed, and §12 confirms
nothing is permission-gated. This is no longer "finish the migration
first" or "wait on a decision" — it's just "start Phase 1." §3's tool
catalog and §5's trigger queries, against the real Supabase tables that
now exist, are the next concrete build targets.

Two small pieces of upkeep, done alongside this update while they were
already in view:

- The earlier `AI_ASSISTANT_ENABLED` duplicate in `.env.local` (set both
  `false` and `true` in two different places) is gone — confirmed a
  single `false` remains, correctly gating both text and voice off until
  Phase 1 has a track record.
- `.env.local`'s `AI_MODEL_TTS` pointed at `openai/gpt-4o-mini-tts` —
  that's §9's fallback, not the pick. It now points at
  `google/gemini-3.8-flash-lite-tts`, with `AI_MODEL_TTS_FALLBACK` and
  `AI_MODEL_TTS_VOICE=Erinome` added alongside it so the actual voice
  pick from §9 lives in config next to the model, not just in this
  document. (Briefly superseded 2026-09-30 by `hexgrad/kokoro-82m` /
  `af_heart` / DeepInfra-pinned; reverted 2026-10-01 back to this same
  Gemini config after a listen test found it the better voice. See §9's
  swap-and-revert note — `AI_MODEL_TTS_PROVIDER` is simply unset again.)

---

*Pricing in §§9–10 reflects rates pulled directly from OpenRouter on
September 26, 2026 — reconfirm via OpenRouter's Models API at build time
regardless, these roll forward on their own schedule.*

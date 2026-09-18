# AI Admin Assistant — Planning Doc (v2 — full build, voice included)

**Status:** Plan only. Nothing in this document has been built. No locked file
has been touched to produce it.
**Drafted:** September 2026, with Claude (Cowork). Supersedes the earlier
September draft — that version assumed no backend and treated voice as a
later fast-follow. Neither is true anymore: the Supabase backend is going
live tonight, and voice — both directions, working on Safari — is now a v1
requirement, not a phase-2 nice-to-have. This version reflects that.

**Working name used throughout:** *Ro*. Placeholder from the planning
conversation, not a locked decision — swap it for whatever you or Melissa
land on. Nothing else in this plan depends on the specific name.

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

## 2. Where this stands tonight

The Supabase migration — Auth, Postgres tables mirroring `types.ts`, RLS
that reproduces what `useFamilyScope` does client-side today — is going
live tonight. That migration and this feature are still the same project,
not two: the tables, RLS policies, and server functions this needs are the
ones the real launch needs regardless of AI.

1. **Supabase migration** — happening tonight. A server-side boundary to
   call into, a place to log every action, and a real place to send from
   (Resend/Postmark) all come from this, not from the AI work.
2. **AI layer on top of the same server functions** the real admin UI ends
   up calling — not a parallel path.

Nothing in §§3–9 below starts before step 1 is actually live and the admin
UI is calling real server functions instead of the localStorage store.

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
| `enrollment_stale` | An `enrollments` row has sat `pending` past a threshold | Medium |
| `ack_pending` | A `documents` row has `requiresAck: true` and a family hasn't acknowledged it | Low |
| `unanswered_message` | A `threads` entry's last message is from a parent, no reply within the cooldown window | Medium → High with age |
| `cold_lead` | A `leads`/`waitlist` entry has had no status change or activity in N days | Low |

Each of these is a plain read query, evaluated by ordinary code — no model
call, no cost, no judgment involved in deciding *whether* to surface it.
They only ever surface things to Melissa; anything in the Send/Money/PII
tier still goes through the confirmation gate in §7 before it does
anything to a family. Noticing and acting stay separate.

The result is that opening the console (or asking Ro out loud, "what's
going on today?") gets her a short, ranked list — "3 families haven't
paid, the Chen daily log never went out, the Brooks haven't heard from you
in a week" — instead of her having to go find that herself.

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

*(Carried over from the original draft, unchanged — still the right list.)*

- **Audit log.** Every AI-initiated action stores the instruction that
  caused it, the tool called, the arguments, and who/what it touched.
- **No invented facts about a child.** Message drafting is templated: the
  model rephrases fields it's handed, never states anything about a
  specific child that isn't already in a record.
- **PII minimization in prompts.** Tier-0/1 model calls get first names
  and internal IDs, not full addresses, DOB, or anything payment-related.
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
endpoint, `openai/whisper-large-v3-turbo` (Groq-hosted), roughly
$0.0007/minute — same API key already used for chat. At single-owner
volume this is effectively free. Record with `MediaRecorder`, upload the
clip, transcribe server-side, feed the transcript into the normal
send-message flow as if she'd typed it.

**Text-to-speech (Ro's replies → her voice):** OpenRouter now has a native
TTS endpoint (`/api/v1/audio/speech`), added since the original draft —
this means voice output can run on the exact same provider and key as
chat and speech-to-text, rather than adding OpenAI as a second vendor.
Candidate model: `openai/gpt-4o-mini-tts` (OpenRouter currently lists it
as `openai/gpt-4o-mini-tts-2025-12-15` — confirm the current ID via
OpenRouter's Models API at build time, these roll forward), priced per
character, roughly $0.015/minute of generated audio by OpenAI's own
published rate — reconfirm OpenRouter's actual rate for the model at build
time since routed pricing can differ slightly from a provider's direct
rate. At Melissa's volume this is a few dollars a month at most, most
likely cents.

Two things worth knowing exist, not necessarily for v1:

- **ElevenLabs** is a meaningfully more natural-sounding voice than
  OpenAI's or Azure's, if quality becomes the deciding factor later. $6/mo
  for 30,000 credits on their Starter plan (their free tier's 10,000
  credits/month might even cover a single owner's daily digest on its
  own). Separate account and key, so it's a deliberate upgrade, not a
  default — the server-audio-file architecture is identical, only the
  fetch call changes.
- **OpenAI's TTS API directly** (`tts-1`/`tts-1-hd`, $15–30 per 1M chars)
  is a reference implementation, not a recommendation — it's what an
  existing companion product in the portfolio already runs, including a
  sentence-chunking trick for perceived latency. Useful to look at if
  OpenRouter's TTS endpoint has rough edges at build time; not the primary
  path given it'd be a second provider outside the OpenRouter-only
  standard this app already holds to for chat.

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

- New admin route, `/admin/assistant` — a chat panel following the
  existing `AdminLayout` shell and `ui.tsx` components. New page under the
  admin tree, so it inherits the locked-area conversation in §12.
- **Both typed and spoken input from day one.** A microphone control next
  to the text input, using the OpenRouter/Whisper pipeline from §9 — not
  the browser's own speech recognition.
- **Every Ro reply gets a tap-to-listen control**, using the OpenRouter
  TTS pipeline from §9. Off by default per message (she taps to hear it,
  it doesn't talk at her unprompted), always available.
- Every AI action surfaces as a running activity feed — "Sent to: Brooks,
  Okafor, Chen — tap to view" — doubling as the audit log's UI. The
  proactive notices from §5 land in the same feed, ranked by priority.

---

## 12. What this touches that's currently locked

Building this for real reaches into files `PROTECTED-AREAS.md` denies:
`src/store/**` (new actions need to exist somewhere), a new page under
`src/pages/admin/**`, and possibly `src/types.ts` for rule/audit schemas.
Per that file's own instructions: stop and ask the owner first — the
owner and the client are the same person for this feature, so the lock
should be lifted deliberately when you actually start building, not
worked around, and re-applied once it's signed off the same way the rest
of the portal was.

---

## 13. Phased rollout

1. **Phase 0 — Supabase migration.** In progress tonight. Nothing below
   starts before real server functions exist to call into.
2. **Phase 1 — read-only + draft-only, voice included.** She can ask
   questions (typed or spoken) and get drafted messages and spoken
   replies; nothing sends without her tap. Zero blast radius on the
   action side, builds a track record for Tier-0 accuracy, and gets the
   voice pipeline proven early rather than bolted on later. Voice being
   in v1 is about the input/output channel, not about loosening any
   confirmation gate — those stay exactly as cautious as Phase 1 always
   was.
3. **Phase 2 — low-risk auto-actions.** Daily-log delivery on the rules
   engine, the proactive notices from §5 live, undo window, daily digest
   of what went out unattended.
4. **Phase 3 — broader action set.** Billing reminders, enrollment
   nudges — still confirmation-gated for anything in the Money/PII tier,
   indefinitely. Full unattended autonomy on money or child-safety
   communications isn't a milestone to build toward; the confirmation
   gate is the feature, not training wheels to remove.

---

## 14. Decisions this plan still doesn't make for you

- **Single-client or reusable?** Still open — does the rules engine and
  tool catalog get built generic/multi-tenant now, or specific to Aunties
  Tykes? Worth deciding before Phase 0's schema work is final.
- **Whose OpenRouter key pays for her usage** — your studio account with a
  per-client cap, or a key she holds herself? Affects margin and how this
  attributes as a cost center if Aunties Tykes is ever part of an
  acquisition conversation.
- **Ro's actual name and voice selection** — placeholder name and no
  voice picked yet. Low-stakes, easy to change later, but pick something
  before it's in front of Melissa as a finished thing.

Resolved since the last draft: voice ships in v1, not deferred. Provider
stays OpenRouter-only across chat, transcription, and speech, rather than
splitting to a second vendor for voice.

---

## 15. Suggested next step

Finish Phase 0 tonight. Everything from §3 on is written to map onto
whatever that migration produces, not the other way around — once real
server functions exist, §3's tool catalog and §5's trigger queries are the
next concrete build targets.

---

*Pricing in §§9–10 is a September 2026 snapshot — reconfirm current model
IDs and rates via OpenRouter's Models API at build time rather than
treating the numbers above as fixed.*

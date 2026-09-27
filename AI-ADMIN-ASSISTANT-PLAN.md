# AI Admin Assistant — Planning Doc (v3 — live app, real voice pricing, real personality)

**Status:** Plan only. Nothing in §§3–11 has been built yet — `api/` holds
exactly one server function today (`create-parent-login.ts`, from the Auth
migration), nothing AI-related. No locked file has been touched to produce
this doc.
**Drafted:** September 2026, with Claude (Cowork). **Updated September 26**
— the app itself is no longer pre-launch. Three things changed from the
v2 draft: (1) the Supabase migration this plan was written to wait for is
done and live, so §2 below describes a starting line, not a countdown to
tonight; (2) the voice pricing in §9 was optimistic — real OpenRouter rates
pulled this week showed the actual TTS model's input/output prices are
wildly lopsided in a way v2 never explained, so it's rewritten with
verified numbers and a cheaper pick; (3) §§4–5 got a real pass on
personality and proactive behavior — the v2 version leaned so hard on
"don't invent facts" that the result was six hardcoded trigger conditions
with no AI judgment anywhere in them, which reads exactly like what it is:
a rules engine wearing a chat UI. That's fixed below without giving up the
guardrail that made it safe.

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

## 2. Where this stands now

**Done:** the Supabase migration — real Auth, Postgres tables with RLS
reproducing what `useFamilyScope` did client-side, private Storage for
documents. `DEMO_MODE` and the localStorage data layer are gone entirely.
The app is live-wired. That part of the plan is finished; this section
used to describe it as a countdown and now just says so.

**Not done:** everything from §3 on. `api/` has one server function today
— `create-parent-login.ts`, from the Auth work — and nothing that talks to
OpenRouter, nothing resembling a tool catalog, no chat endpoint. The AI
layer is still a plan, not code, regardless of how live the rest of the
app is. Building it means adding server functions that call into the same
family-scoped boundary the admin UI already uses — not a parallel path,
and not blocked on anything else at this point.

Email (Resend) is wired for real sending now; there is still no payment
processor — invoices are statements, payment is recorded by hand outside
the app, same as before. That doesn't change how the `billing.mutate` tool
in §3 is scoped, since its job is keeping the record straight, not moving
money.

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
| `openai/gpt-4o-mini-tts` — fallback | $0.60 / $12 | roughly a penny |

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

1. **Phase 0 — Supabase migration. Done.** Real Auth, real tables, real
   RLS, live in production. Nothing below has started.
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

Phase 0 is done, so this is no longer "finish the migration first" — it's
"start Phase 1." §3's tool catalog and §5's trigger queries, against the
real Supabase tables that now exist, are the next concrete build targets.

One thing to check before that starts, unrelated to this plan's content:
`.env.local` currently has `AI_ASSISTANT_ENABLED` set twice — `false` in
the AI section with the "don't flip this on at initial deploy" comment
right above it, and `true` again in a stray line near the bottom of the
file. Nothing reads that flag yet since none of the AI server functions
exist, so it's inert today — but whichever value wins by the time Phase 1
code ships depends on dotenv's own last-one-wins behavior, not on anyone's
intent, which is exactly how a safety flag gets shipped backwards by
accident. Worth cleaning up now while it's free, not after it's live.

---

*Pricing in §§9–10 reflects rates pulled directly from OpenRouter on
September 26, 2026 — reconfirm via OpenRouter's Models API at build time
regardless, these roll forward on their own schedule.*

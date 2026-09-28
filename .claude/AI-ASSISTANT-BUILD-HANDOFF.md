# Handoff — AI Admin Assistant ("Ro"), start of build

**Written:** September 27, 2026, for whichever session actually starts
writing code. **Read `AI-ADMIN-ASSISTANT-PLAN.md` in full before touching
anything** — that document (v4, ~600 lines) is the real spec: architecture,
personality, guardrails, voice, model routing, phased rollout. This handoff
doesn't repeat it. It orients you to it and states what's true right now
that a document written over several sessions can't fully update in place.

---

## Where things stand

- **Every open decision is resolved** (plan §14). Single client — this is
  built for Aunties Tykes specifically, no multi-tenant abstraction
  anywhere. No spend cap — the studio's own OpenRouter key pays for usage,
  so §10's tiering is justified on latency/capability fit alone, not cost;
  don't cut a tier assuming it was a cost measure. Name and voice are
  locked: **Ro**, TTS voice **Erinome** (primary) / **Sulafat** (warmer
  alternate — see plan §9 for why you might switch).
- **Nothing in this repo is permission-gated.** `.claude/PROTECTED-AREAS.md`
  and the `ask` list in `.claude/settings.json` were both retired
  2026-09-27 (plan §12). You do not need to stop and ask before touching
  `src/store/**`, `src/App.tsx`, `package.json`, or anything else that used
  to require it.
- **Nothing AI-related exists in code yet.** `api/` has exactly one server
  function today, `create-parent-login.ts`. No chat endpoint, no tool
  catalog, no OpenRouter call anywhere in this codebase. You're building
  this from zero, not finishing partial work.
- **This app is live, in production, with a real owner actively using it**
  for one real daycare — no demo mode, no seeded data, real families'
  records. Anything you test by hand touches (or risks touching) that data.
  Test with the same care the rest of this app already gets.

---

## Start here (plan §15's own next step)

Phase 0 (Supabase migration) is done. Phase 1 is next — **read-only +
draft-only, voice included** (plan §13.2): Melissa can ask Ro questions,
typed or spoken, and gets drafted messages and spoken replies back. Nothing
sends without her tap. Concretely:

1. **§3's tool catalog — but only the read/query and drafting tools.** The
   mutating Send/Money/PII-tier ones (`announcement.send`, `billing.mutate`,
   `message.send`, etc.) get wired in Phase 2/3, confirmation-gated from the
   moment they arrive (§7) — don't build them live in Phase 1.
2. **§5's trigger queries** — deterministic "what's worth mentioning today"
   checks. Plain reads, no model judgment on whether something is true.
3. **§4's system-prompt assembly** — built fresh per session from real
   state, in the personality that's locked in (see Non-negotiables below).
4. **§9's voice pipeline** — STT via OpenRouter's Whisper endpoint, TTS via
   Gemini (`Erinome`), both server-side. Test real recording/playback on an
   actual iPhone in Safari early — that's called out for a reason: it's the
   one requirement that's a dealbreaker if it's wrong, not a nice-to-have.
5. **§11's interface** — a persistent icon + slide-over panel added to
   `src/layouts/AdminLayout.tsx`, not a new route.

---

## Non-negotiables — don't compromise these under build pressure

- **The tool catalog is a wall, not a request** (§8 — the September 26
  Kirra trial is the concrete evidence for why this has to be structural).
  The model gets named functions with fixed scope, never raw DB/API access.
  If data doesn't exist, the tool returns nothing and Ro says "I don't have
  that" — she never gets an opening to fill the gap with a plausible guess.
- **Any mutating tool reuses the existing write path, never a parallel
  one.** `src/store/useStore.ts` (client) and `src/lib/persist.ts` /
  Postgres RLS (server) already enforce family scoping. A new AI-triggered
  write goes through that — same store actions, or server-side calls
  honoring the same RLS — never a shortcut around `useFamilyScope`'s
  boundary.
- **Confirmation gating has no voice exception** (§7). Send/Money/PII
  actions always show a preview and wait for her tap, spoken "send it"
  included. Phase 1 doesn't wire sends at all, so this shouldn't come up
  yet — but don't let a later phase add a "just say send and it goes"
  shortcut.
- **Voice is server-mediated in both directions.** Never
  `speechSynthesis()` or `webkitSpeechRecognition`. Safari support is
  non-negotiable for this client, and browser-native speech APIs are
  exactly what breaks it (§9 has the full reasoning).
- **Ro's personality is a fixed prompt block, not something the model
  infers.** Second person, the five traits in §4, the explicit pushback
  behavior, and the calibration note (neutral-professional, not
  cheerleader, not boss) go in close to verbatim — don't paraphrase it down
  to "be helpful and warm."

---

## Environment — already set in `.env.local`, don't rediscover these

```
AI_MODEL_TIER0_INTENT=inclusionai/ling-3.0-flash-vl
AI_MODEL_TIER1_DRAFTING=qwen/qwen3.8-flash
AI_MODEL_TIER2_ESCALATION=anthropic/claude-haiku-4.5
AI_MODEL_STT=openai/whisper-large-v3-turbo
AI_MODEL_TTS=google/gemini-3.8-flash-lite-tts
AI_MODEL_TTS_FALLBACK=openai/gpt-4o-mini-tts
AI_MODEL_TTS_VOICE=Erinome
AI_ASSISTANT_ENABLED=false          # flip deliberately once Phase 1 has a track record
AI_REQUIRE_CONFIRMATION_FOR_SENDS=true
AI_MAX_SENDS_PER_HOUR=25
AI_MAX_RECIPIENTS_PER_ACTION=10
```

All chat, transcription, and TTS calls go through OpenRouter — one
provider, one key, everywhere (`OPENROUTER_API_KEY`, already set — the
studio's own key, no per-client spend cap). No second vendor for voice
unless a later, deliberate decision changes that (plan §9's ElevenLabs
note).

Reconfirm model pricing/availability against OpenRouter's own Models API
before finalizing anything — the plan's numbers were pulled September 26,
2026 and roll forward on their own schedule.

---

## What else to know before writing code

- `CLAUDE.md` (repo root) has the real code standards — no `@ts-ignore` /
  `as any` / `eslint-disable`, no mock data, smallest safe change, verify
  by reading files back and running `npm run lint` / `npm run typecheck`.
  Both currently exit 0 with zero warnings — keep it that way.
- `.claude/ARCHITECTURE.md` — routes, data model, store pattern, security
  boundary. Read it alongside the plan doc; it's the "how the existing app
  is actually built" reference the plan assumes you already have.
- **There is no payment processor anywhere in this app.** `billing.mutate`'s
  job is keeping the invoice record straight, not moving money (plan §2).
  Don't build anything that implies otherwise.
- **Realtime is wired** (Supabase `postgres_changes`, shipped 2026-09-26)
  across the tables both portals read. An admin-side write already
  propagates to an open family tab live, no manual refresh. Whatever Ro
  eventually sends inherits that for free — nothing extra needed there.

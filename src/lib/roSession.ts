import { create } from 'zustand'
import {
  askRo,
  confirmRoAction,
  fetchRoStatus,
  RoError,
  type RoAction,
  type RoDraft,
  type RoNotice,
  type RoStatus,
  type RoToolRun,
} from './ro'
import { uid } from './helpers'

/**
 * Ro's conversation, held outside React.
 *
 * It lives here rather than in `RoPanel`'s own state for a specific reason.
 * `src/App.tsx` renders `<Routes location={location} key={location.key}>` — a
 * changing key, which is what makes `AnimatePresence mode="wait"` animate
 * between pages. The cost is that the whole route subtree is thrown away and
 * remounted on every navigation, `AdminLayout` and Ro included. Conversation
 * state in the panel therefore did not survive clicking a nav link: she would
 * ask about a message, go look at it, come back, and find an empty panel.
 *
 * Fixing that in the router would mean restructuring how all 33 pages
 * transition. Holding the conversation in a module-scoped store fixes it where
 * the problem actually is: a persistent assistant should not lose its thread
 * because the DOM moved. The store also owns the request, so a reply that
 * arrives while the panel is unmounted still lands instead of being dropped on
 * the floor.
 *
 * Scope, deliberately: this survives navigation, not a page reload. Nothing is
 * written to storage — the panel is meant to be glanced at and dismissed (§11),
 * and a reload is a reasonable place for a conversation to end. `clear()` gives
 * her the same thing on purpose.
 */

export interface RoMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  drafts?: RoDraft[]
  actions?: RoAction[]
  toolRuns?: RoToolRun[]
  notices?: RoNotice[]
  warnings?: string[]
}

/**
 * What has happened to one proposed action, keyed by its id.
 *
 * Held here rather than in the card's own component state, for the same reason
 * the conversation is: `App.tsx` remounts this whole subtree on navigation, and a
 * card that forgot she had already approved it would offer to run the action
 * again. The server would refuse the second run — the claim in `audit.ts` is
 * atomic — but a button that appears to work and then reports "already done" is a
 * bug she has to reason about, not a safeguard.
 *
 * An id absent from the map is pending. `failed` is left re-tappable on purpose:
 * a request that died on the network deserves a second attempt, and one the
 * server actually refused will simply say so again.
 */
export interface RoDecision {
  state: 'working' | 'done' | 'declined' | 'failed' | 'undone'
  detail: string
  /**
   * When the undo option lapses, for a send that has one. Null means no undo is
   * on offer — either the action cannot be taken back, or the window has passed.
   */
  undoUntil: string | null
  /**
   * Something that went wrong AFTER the action succeeded — an undo that could not
   * be completed. Kept apart from `detail` so a failed pull-back does not
   * overwrite the record of the send having worked.
   */
  problem: string
}

interface RoSessionState {
  open: boolean
  /** Kept so a half-typed question survives a navigation too. */
  input: string
  messages: RoMessage[]
  busy: boolean

  /** Approvals and dismissals, keyed by proposal id. Absent = still pending. */
  decisions: Record<string, RoDecision>

  status: RoStatus | null
  statusProblem: string | null
  /** False until the first status call settles, either way. */
  statusChecked: boolean

  setOpen: (open: boolean) => void
  setInput: (input: string) => void
  /** Fetches status once per page load; safe to call on every mount. */
  ensureStatus: () => void
  send: (text: string) => Promise<void>
  /** Approves or dismisses one prepared action. */
  /**
   * `secret` is the password typed on a card that asks for one. It is passed
   * straight through to the request and never written to this store.
   */
  decide: (actionId: string, decision: 'approve' | 'decline' | 'undo', secret?: string) => Promise<void>
  clear: () => void
}

/** Guards `ensureStatus` against the second, third and fourth mount. */
let statusRequested = false

export const useRoSession = create<RoSessionState>()((set, get) => ({
  open: false,
  input: '',
  messages: [],
  busy: false,
  decisions: {},
  status: null,
  statusProblem: null,
  statusChecked: false,

  setOpen: (open) => set({ open }),
  setInput: (input) => set({ input }),

  ensureStatus: () => {
    if (statusRequested) return
    statusRequested = true
    fetchRoStatus()
      .then((status) => {
        set({ status })
        // A server that cannot read its own config says so in the panel rather
        // than disappearing, so the missing variable names reach someone.
        if (status.misconfigured === true && status.reason !== undefined) {
          set({
            statusProblem:
              `${status.reason}. Every AI_MODEL_* value, OPENROUTER_API_KEY and ` +
              'OPENROUTER_SITE_URL/NAME must be set in the Vercel project — .env.local ' +
              'is not deployed.',
          })
        }
      })
      .catch((cause: unknown) => {
        set({ statusProblem: cause instanceof RoError ? cause.message : 'Could not reach Ro.' })
      })
      .finally(() => set({ statusChecked: true }))
  },

  send: async (text) => {
    const trimmed = text.trim()
    if (trimmed.length === 0 || get().busy) return

    // History is read before the new turn is appended, so it is prior turns only.
    const history = get().messages.map((message) => ({
      role: message.role,
      content: message.content,
    }))

    set((state) => ({
      messages: [...state.messages, { id: uid('ro'), role: 'user', content: trimmed }],
      input: '',
      busy: true,
    }))

    try {
      const reply = await askRo(trimmed, history)
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: uid('ro'),
            role: 'assistant',
            content: reply.reply,
            drafts: reply.drafts,
            actions: reply.actions,
            toolRuns: reply.toolRuns,
            notices: reply.notices,
            warnings: reply.warnings,
          },
        ],
      }))
    } catch (cause) {
      const message = cause instanceof RoError ? cause.message : 'Ro could not answer that.'
      set((state) => ({
        messages: [
          ...state.messages,
          // No `warnings` here: the failure IS the message. Now that warnings are
          // rendered, a marker like 'failed' would print as a second line under
          // the error saying "failed", which tells her nothing she cannot see.
          { id: uid('ro'), role: 'assistant', content: message },
        ],
      }))
    } finally {
      set({ busy: false })
    }
  },

  decide: async (actionId, decision, secret) => {
    const existing = get().decisions[actionId]
    // A second tap while the first is in flight is always ignored. After it has
    // settled, only two things may still be tapped: a failed action can be
    // retried, and a completed send can be undone while its window is open.
    if (existing !== undefined) {
      if (existing.state === 'working') return
      if (decision === 'undo' ? existing.state !== 'done' : existing.state !== 'failed') return
    }

    const previous = existing
    const mark = (
      state: RoDecision['state'],
      detail: string,
      extra: { undoUntil?: string | null; problem?: string } = {},
    ): void => {
      set((current) => ({
        decisions: {
          ...current.decisions,
          [actionId]: {
            state,
            detail,
            undoUntil: extra.undoUntil ?? null,
            problem: extra.problem ?? '',
          },
        },
      }))
    }
    mark('working', '')

    try {
      const result = await confirmRoAction(actionId, decision, secret)
      if (result.outcome === 'executed') {
        // Reached either by approving, or by an undo that could not be completed
        // — in which case the send stands and `error` says why it could not be
        // pulled back. The original summary is kept in that case.
        const undoFailed = decision === 'undo' && result.error.length > 0
        mark('done', undoFailed ? (previous?.detail ?? result.summary) : result.summary, {
          undoUntil: undoFailed ? (previous?.undoUntil ?? null) : result.undoUntil,
          problem: undoFailed ? result.error : '',
        })
      } else if (result.outcome === 'undone') {
        mark('undone', result.summary)
      } else if (result.outcome === 'declined') {
        mark('declined', result.summary)
      } else {
        mark('failed', result.error.length > 0 ? result.error : 'That did not go through.')
      }
    } catch (cause) {
      const message = cause instanceof RoError ? cause.message : 'That did not go through.'
      // A refused undo must not erase the fact that the send worked.
      if (decision === 'undo' && previous !== undefined) {
        mark('done', previous.detail, { undoUntil: previous.undoUntil, problem: message })
      } else {
        mark('failed', message)
      }
    }
  },

  clear: () => set({ messages: [], input: '', decisions: {} }),
}))

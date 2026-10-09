import {
  Ban,
  Bell,
  BookMarked,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FolderOpen,
  Inbox,
  KeyRound,
  Lightbulb,
  MessageSquare,
  NotebookPen,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import { Badge, Card, PageHeader } from '../../components/ui'
import { useSectionSeen } from '../../lib/unread'
import { CANNOT_DO, CARD_STEPS, GETTING_STARTED, TIPS, TOPICS, type GuideStep } from '../../data/roGuide'

/** One icon per topic id in src/data/roGuide.ts. A topic without one gets the sparkle. */
const TOPIC_ICONS: Record<string, LucideIcon> = {
  today: Search,
  notices: Bell,
  attendance: ClipboardCheck,
  logs: NotebookPen,
  messages: MessageSquare,
  schedules: CalendarClock,
  calendar: CalendarDays,
  families: Users,
  enrollments: ClipboardList,
  logins: KeyRound,
  billing: ReceiptText,
  documents: FolderOpen,
  inquiries: Inbox,
  rules: BookMarked,
}

/** Anchors sit under the sticky console header, so each section leaves room above it. */
const SECTION = 'scroll-mt-28'

function Steps({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="grid gap-3 md:grid-cols-2">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-3 rounded-card border border-slate-200/80 bg-white p-4 shadow-card">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-bold text-brand-ink">
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900">{step.title}</span>
            <span className="mt-1 block text-sm leading-relaxed text-slate-600">{step.body}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * A still picture of the card Ro shows before she acts, drawn with the same look
 * as the real one in RoPanel.tsx. Nothing in it is a button: it is an example.
 */
function ExampleCard() {
  return (
    <figure className="rounded-card border border-sunny bg-white p-3 shadow-card" aria-label="Example of a card from Ro">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge tone="amber">Waiting on you</Badge>
        <span className="text-xs font-semibold text-slate-500">Send a new message</span>
      </div>
      <p className="text-sm font-bold leading-snug text-slate-900">To Brooks Family — Pickup tomorrow</p>
      <dl className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2.5 text-xs">
        {[
          { label: 'To', value: 'Brooks Family (1 family)' },
          { label: 'Subject', value: 'Pickup tomorrow' },
          { label: 'Message', value: 'Hi Maya, just a heads up that pickup is at 4 tomorrow. Thank you!' },
          { label: 'What happens', value: 'Posts to their parent portal. No email goes out — this app does not send any.' },
        ].map((row) => (
          <div key={row.label} className="flex gap-2">
            <dt className="w-24 shrink-0 font-semibold text-slate-500">{row.label}</dt>
            <dd className="min-w-0 text-slate-700">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-center gap-2" aria-hidden="true">
        <span className="inline-flex min-h-[2.25rem] flex-1 items-center justify-center gap-1.5 rounded-control bg-brand px-3 text-sm font-semibold text-white">
          <ShieldCheck size={16} strokeWidth={2} />
          Send it
        </span>
        <span className="inline-flex min-h-[2.25rem] items-center justify-center rounded-control border border-slate-300 px-3 text-sm font-semibold text-slate-600">
          No thanks
        </span>
      </div>
      <figcaption className="mt-3 text-xs text-slate-500">An example. Nothing goes out until you tap the blue button.</figcaption>
    </figure>
  )
}

export default function AdminRoGuide() {
  // Opening the guide clears the "New" pill on its sidebar link.
  useSectionSeen('ro_guide')

  return (
    <PageTransition>
      <PageHeader
        title="Ro Guide"
        description="Everything Ro can do for you, what to say to get it done, and what to expect."
      />

      <Card className="mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
          <Sparkles size={22} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-slate-900">Meet Ro</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            Ro is your assistant inside the console. Ask her questions about your day, or tell her what
            needs doing — check a child in, write a daily log, message a family, send an invoice — in
            your own words, typed or spoken. She works from your real records and never guesses.
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-800">
            Nothing is saved or sent until you tap to approve it.
          </p>
        </div>
      </Card>

      <nav aria-label="Guide sections" className="mb-10">
        <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">Jump to</p>
        <ul className="flex flex-wrap gap-2">
          {[
            { id: 'getting-started', title: 'Getting started' },
            { id: 'cards', title: 'Approving' },
            ...TOPICS.map((topic) => ({ id: topic.id, title: topic.title })),
            { id: 'cannot', title: 'What Ro can’t do' },
            { id: 'tips', title: 'Tips' },
          ].map((link) => (
            <li key={link.id}>
              <a
                href={`#${link.id}`}
                className="inline-flex min-h-[2.25rem] items-center rounded-chip border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-brand hover:text-brand"
              >
                {link.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="getting-started" className={`${SECTION} mb-10`}>
        <h2 className="mb-4 font-display text-xl font-bold text-slate-900">Getting started</h2>
        <Steps steps={GETTING_STARTED} />
      </section>

      <section id="cards" className={`${SECTION} mb-12`}>
        <h2 className="mb-1.5 font-display text-xl font-bold text-slate-900">How Ro asks before she acts</h2>
        <p className="mb-4 max-w-2xl text-sm text-slate-500">
          Anything that changes a record or reaches a family comes to you as a card first.
        </p>
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
          <ol className="space-y-3">
            {CARD_STEPS.map((step) => (
              <li key={step.title} className="rounded-card border border-slate-200/80 bg-white p-4 shadow-card">
                <span className="block text-sm font-bold text-slate-900">{step.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-slate-600">{step.body}</span>
              </li>
            ))}
          </ol>
          <ExampleCard />
        </div>
      </section>

      <section aria-labelledby="can-do" className="mb-12">
        <h2 id="can-do" className="mb-4 font-display text-xl font-bold text-slate-900">
          What Ro can do
        </h2>
        <div className="space-y-5">
          {TOPICS.map((topic) => {
            const Icon = TOPIC_ICONS[topic.id] ?? Sparkles
            return (
              <Card key={topic.id} id={topic.id} className={`${SECTION} p-5`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-bold text-slate-900">{topic.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{topic.intro}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-5 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Try saying</p>
                    <ul className="space-y-2">
                      {topic.examples.map((example) => (
                        <li
                          key={example}
                          className="rounded-control bg-sunny-tint px-3 py-2 text-sm leading-relaxed text-slate-800"
                        >
                          &ldquo;{example}&rdquo;
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Good to know</p>
                    <ul className="space-y-2">
                      {topic.notes.map((note) => (
                        <li key={note} className="flex gap-2 text-sm leading-relaxed text-slate-600">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card id="cannot" className={`${SECTION} p-5`}>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-tint text-rose-ink">
              <Ban size={18} strokeWidth={1.75} />
            </span>
            <h2 className="font-display text-lg font-bold text-slate-900">What Ro can&rsquo;t do yet</h2>
          </div>
          <ul className="space-y-2">
            {CANNOT_DO.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-relaxed text-slate-600">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-500">If you ask for one of these, Ro will tell you plainly.</p>
        </Card>

        <Card id="tips" className={`${SECTION} p-5`}>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunny-tint text-sunny-ink">
              <Lightbulb size={18} strokeWidth={1.75} />
            </span>
            <h2 className="font-display text-lg font-bold text-slate-900">Tips for the best results</h2>
          </div>
          <ul className="space-y-2">
            {TIPS.map((tip) => (
              <li key={tip} className="flex gap-2 text-sm leading-relaxed text-slate-600">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sunny" aria-hidden="true" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </PageTransition>
  )
}

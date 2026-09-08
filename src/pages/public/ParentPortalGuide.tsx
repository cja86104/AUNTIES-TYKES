import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { useState } from 'react'
import {
  ChevronDown,
  ArrowRight,
  LayoutDashboard,
  LogIn,
  Baby,
  NotebookPen,
  ClipboardCheck,
  Wallet,
  FolderOpen,
  MessageSquare,
} from 'lucide-react'
import PageTransition, { Reveal } from '../../components/PageTransition'
import { Button, Card, SectionHeading } from '../../components/ui'
import type { LucideIcon } from 'lucide-react'

interface GuideItem {
  key: string
  title: string
  icon: LucideIcon
  body: string
}

const guideItems: GuideItem[] = [
  {
    key: 'login',
    title: 'Logging in',
    icon: LogIn,
    body: `Once your enrollment is set up, we'll create your family login using the email you gave us. From then on, click **Parent Login** in the site header, sign in, and your dashboard opens with everything for your family in one place.`,
  },
  {
    key: 'dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    body: `Your home base — today's check-in status, your child's latest daily report, and quick links to everything else, all at a glance.`,
  },
  {
    key: 'myChildren',
    title: 'My Children',
    icon: Baby,
    body: `Each child's profile lives here — allergies, emergency contacts, and everything we keep on file. If anything's out of date, just send us a message and we'll fix it.`,
  },
  {
    key: 'dailyReports',
    title: 'Daily Reports',
    icon: NotebookPen,
    body: `Meals, naps, diapers, mood, and a note from the day, posted before pickup. Search by child or filter by date to pull up any past report.`,
  },
  {
    key: 'attendance',
    title: 'Attendance',
    icon: ClipboardCheck,
    body: `Every check-in and check-out we've recorded for your children, with a date range filter and a downloadable export.`,
  },
  {
    key: 'billing',
    title: 'Billing',
    icon: Wallet,
    body: `What's due, your payment history, and every invoice we've sent — click any invoice for the full breakdown.`,
  },
  {
    key: 'documents',
    title: 'Documents',
    icon: FolderOpen,
    body: `Handbooks, menus, calendars, and any forms we need back from you. Download what you need, and acknowledge the ones that ask for it.`,
  },
  {
    key: 'messages',
    title: 'Messages',
    icon: MessageSquare,
    body: `Announcements from us, plus a direct line to Mellissa for anything day-to-day — she checks in between naps and after pickup.`,
  },
]

interface GuideCardProps {
  item: GuideItem
  open: boolean
  onToggle: () => void
}

function GuideCard({ item, open, onToggle }: GuideCardProps) {
  const Icon = item.icon
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4F77D9]/10 text-[#4F77D9]">
            <Icon size={18} />
          </span>
          <span className="font-display text-base font-bold text-slate-900">{item.title}</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="overflow-hidden"
          >
            <div className="md border-t border-slate-100 px-5 py-5 text-sm">
              <ReactMarkdown>{item.body}</ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

export default function ParentPortalGuide() {
  const [openKey, setOpenKey] = useState<string | null>(null)

  return (
    <PageTransition>
      <section className="px-5 pb-10 pt-10 lg:px-8 lg:pt-16">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#4F77D9]/30 bg-white/70 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#39569f] backdrop-blur">
            <LayoutDashboard size={14} /> Parent portal
          </span>
          <h1 className="mt-6 font-display text-4xl font-black leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
            Getting around your parent portal.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            A quick walkthrough of everything inside your family's login — what's where, and what each part is for.
          </p>
        </div>
      </section>

      <section className="px-5 py-10 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <SectionHeading
              eyebrow="Portal guide"
              title="What's inside your login"
              description="Every family's login has the same seven sections, plus how to get in for the first time."
              align="center"
            />
          </Reveal>
          <div className="mt-10 space-y-4">
            {guideItems.map((item, i) => (
              <Reveal key={item.key} delay={i * 0.05}>
                <GuideCard
                  item={item}
                  open={openKey === item.key}
                  onToggle={() => setOpenKey(openKey === item.key ? null : item.key)}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-10 lg:px-8">
        <Reveal>
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-[#5DC4A6]/30 bg-gradient-to-br from-[#FDF1DC] via-white to-[#E6F6F0] px-6 py-14 text-center sm:px-14">
            <div className="at-grid-dots absolute inset-0 opacity-20" aria-hidden="true" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold leading-tight text-slate-900 sm:text-4xl">
                Not enrolled yet?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                Families get portal access as soon as enrollment is complete. Already have a login?
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Button as={Link} to="/enroll" size="lg">
                  Start enrollment <ArrowRight size={18} />
                </Button>
                <Button as={Link} to="/login" size="lg" variant="outline">
                  Parent login
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </PageTransition>
  )
}

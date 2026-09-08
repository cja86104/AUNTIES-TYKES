import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import {
  ChevronDown,
  ArrowRight,
  Receipt,
  CalendarDays,
  Thermometer,
  Timer,
  Baby,
  Clock,
  Backpack,
  Utensils,
  Moon,
  ShieldCheck,
  Users,
  Camera,
  MessageCircle,
} from 'lucide-react'
import PageTransition, { Reveal } from '../../components/PageTransition'
import { Button, Card, SectionHeading } from '../../components/ui'
import { useStore } from '../../store/useStore'
import type { LucideIcon } from 'lucide-react'

interface HandbookItem {
  key: string
  title: string
  icon: LucideIcon
  body: string
}

interface HandbookCategory {
  title: string
  items: HandbookItem[]
}

interface PolicyItemProps {
  title: string
  icon: LucideIcon
  body: string
  open: boolean
  onToggle: () => void
}

function PolicyItem({ title, icon: Icon, body, open, onToggle }: PolicyItemProps) {
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
          <span className="font-display text-base font-bold text-slate-900">{title}</span>
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
              <ReactMarkdown>{body}</ReactMarkdown>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

export default function TuitionPolicies() {
  const settings = useStore((s) => s.settings)
  const [openKey, setOpenKey] = useState<string | null>(null)

  const handbook: HandbookCategory[] = [
    {
      title: 'Daily life',
      items: [
        {
          key: 'hours',
          title: 'Hours & drop-off',
          icon: Clock,
          body: `We're open **Monday through Friday, 7:00 AM to 5:45 PM**. Drop-off closes at 9:30 AM so we can start our morning rhythm without interruptions — if you need to arrive later, just send a quick text.`,
        },
        {
          key: 'pack',
          title: 'What to bring',
          icon: Backpack,
          body: `A labeled water bottle, two full changes of clothes (three during potty learning), diapers and wipes if needed, a crib sheet and small blanket for nap, and weather-appropriate outerwear.

We provide all meals and snacks, so lunch boxes aren't needed.`,
        },
        {
          key: 'meals',
          title: 'Meals & snacks',
          icon: Utensils,
          body: `Breakfast, a hot lunch, and an afternoon snack are included every day and posted on a monthly menu. We're a **peanut-free house** and can accommodate most dietary needs with a note from you.`,
        },
        {
          key: 'nap',
          title: 'Nap & rest time',
          icon: Moon,
          body: `Infants sleep on their own schedule in safe-sleep certified cribs. Toddlers and preschoolers rest from about 12:45 to 2:30. Non-sleepers get quiet books and puzzles on their mat after the first 45 minutes.`,
        },
      ],
    },
    {
      title: 'Health & safety',
      items: [
        {
          key: 'sick',
          title: 'When to keep your child home',
          icon: Thermometer,
          body: settings.policies.sick,
        },
        {
          key: 'potty',
          title: 'Potty learning, our way',
          icon: Baby,
          body: settings.policies.potty,
        },
        {
          key: 'safety',
          title: 'How we keep everyone safe',
          icon: ShieldCheck,
          body: `Locked entry, background-checked adults, and monthly safety drills. Every caregiver in the home carries a cleared background check plus current CPR and First Aid, and our kitchen is peanut-free with allergy protocols in place.`,
        },
      ],
    },
    {
      title: 'Schedule & attendance',
      items: [
        {
          key: 'latePickup',
          title: 'Pickup & late fees',
          icon: Timer,
          body: settings.policies.latePickup,
        },
        {
          key: 'holidays',
          title: 'Holidays & closures',
          icon: CalendarDays,
          body: settings.policies.holidays,
        },
        {
          key: 'ratios',
          title: 'Group sizes & ratios',
          icon: Users,
          body: `We keep it small on purpose — **twelve children total**, split by age: Infants 1:3, Toddlers 1:4, Preschool 1:6. Smaller groups mean more hands, more patience, and more one-on-one time for your child.`,
        },
      ],
    },
    {
      title: 'Staying connected',
      items: [
        {
          key: 'updates',
          title: 'Daily updates',
          icon: Camera,
          body: `Every family gets a parent portal login for daily reports — meals, naps, diapers, mood, and activities. Announcements and invoices live there too.`,
        },
        {
          key: 'questions',
          title: 'Questions anytime',
          icon: MessageCircle,
          body: `This page covers the basics, but every family is different. Reach out through the contact page anytime — Mellissa answers those personally, usually the same day.`,
        },
      ],
    },
  ]

  return (
    <PageTransition>
      <section className="px-5 pb-10 pt-10 lg:px-8 lg:pt-16">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#4F77D9]/30 bg-white/70 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#39569f] backdrop-blur">
            <Receipt size={14} /> Tuition & policies
          </span>
          <h1 className="mt-6 font-display text-4xl font-black leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
            What to expect, plainly stated.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Everything a family needs to know before day one — hours, meals, safety, and how we handle the everyday
            stuff. Right here, not buried behind a login.
          </p>
        </div>
      </section>

      {/* Parent handbook */}
      <section className="px-5 py-14 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <SectionHeading
              eyebrow="Parent handbook"
              title="Get to know how we do things"
              description="No binder to dig through — just the plain-language version, organized by topic."
              align="center"
            />
          </Reveal>
          <div className="mt-10 space-y-9">
            {handbook.map((category, ci) => (
              <div key={category.title}>
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-slate-500">
                  {category.title}
                </h2>
                <div className="mt-4 space-y-4">
                  {category.items.map((item, i) => (
                    <Reveal key={item.key} delay={(ci * category.items.length + i) * 0.04}>
                      <PolicyItem
                        title={item.title}
                        icon={item.icon}
                        body={item.body}
                        open={openKey === item.key}
                        onToggle={() => setOpenKey(openKey === item.key ? null : item.key)}
                      />
                    </Reveal>
                  ))}
                </div>
              </div>
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
                Questions about a specific situation?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                Split schedules, vouchers, or a January start — send us the details and we will tell you what is
                possible.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Button as={Link} to="/contact" size="lg">
                  Ask a question <ArrowRight size={18} />
                </Button>
                <Button as={Link} to="/faq" size="lg" variant="outline">
                  Read the FAQ
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* A note from Mellissa */}
      <section className="px-5 py-20 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-5xl text-center">
            <p
              style={{ fontFamily: "'Caveat', cursive" }}
              className="text-4xl leading-[1.15] text-slate-800 sm:text-5xl lg:text-[3.4rem]"
            >
              Every family's schedule looks a little different, so the numbers do too — reach out and I'll walk you
              through exactly what it looks like for yours.
            </p>
            <p
              style={{ fontFamily: "'Caveat', cursive" }}
              className="mt-6 text-3xl text-[#4F77D9] sm:text-4xl"
            >
              — Mellissa
            </p>
          </div>
        </Reveal>
      </section>
    </PageTransition>
  )
}

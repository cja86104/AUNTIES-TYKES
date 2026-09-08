import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { ChevronDown, Check, ArrowRight, Calculator, Receipt, CalendarDays, Thermometer, Timer, Baby } from 'lucide-react'
import PageTransition, { Reveal } from '../../components/PageTransition'
import { Button, Card, SectionHeading, Badge, Field, Select, Input } from '../../components/ui'
import { useStore } from '../../store/useStore'
import { money } from '../../lib/helpers'
import type { LucideIcon } from 'lucide-react'
import type { Policies } from '../../types'

const included = [
  'Breakfast, hot lunch, and afternoon snack',
  'All art, sensory, and activity supplies',
  'Daily digital reports with photos',
  'Diapers changed on our schedule (you supply)',
  'Parent portal with invoices and documents',
  'Two check-ins with Mellissa each year',
]

interface PolicyMeta {
  key: keyof Policies
  title: string
  icon: LucideIcon
}

const policyMeta: PolicyMeta[] = [
  { key: 'sick', title: 'Illness & when to stay home', icon: Thermometer },
  { key: 'latePickup', title: 'Late pickup', icon: Timer },
  { key: 'holidays', title: 'Holidays & closures', icon: CalendarDays },
  { key: 'potty', title: 'Potty learning', icon: Baby },
]

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
  const rates = settings.rates
  const [openKey, setOpenKey] = useState<string | null>('sick')
  const [plan, setPlan] = useState('fullTime')
  const [kids, setKids] = useState(1)
  const [dropIns, setDropIns] = useState(0)

  const estimate = useMemo(() => {
    const weekly = plan === 'fullTime' ? rates.fullTime : rates.partTime
    const count = Math.max(1, Math.min(4, Number(kids) || 1))
    const base = weekly * 4 * count
    const discount = count > 1 ? ((count - 1) * weekly * 4 * rates.siblingDiscountPct) / 100 : 0
    const extras = (Number(dropIns) || 0) * rates.dropIn
    return { base, discount, extras, total: base - discount + extras }
  }, [plan, kids, dropIns, rates])

  const tiers = [
    {
      name: 'Full-time',
      price: rates.fullTime,
      unit: '/ week per child',
      desc: 'Five days a week, 7:00 AM – 5:45 PM. First choice of schedule and enrollment priority for siblings.',
      tone: 'primary',
      features: ['Guaranteed spot year-round', 'All meals included', 'Daily photo reports', 'Two check-ins a year'],
      featured: true,
    },
    {
      name: 'Part-time',
      price: rates.partTime,
      unit: '/ week per child',
      desc: 'Three fixed days (M/W/F or T/Th plus one). Same daily rhythm, same care, fewer days.',
      tone: 'outline',
      features: ['Three fixed days', 'All meals included', 'Daily photo reports', 'Subject to availability'],
    },
    {
      name: 'Drop-in',
      price: rates.dropIn,
      unit: '/ day',
      desc: 'For enrolled families who need an extra day, or occasional care when we have room to spare.',
      tone: 'outline',
      features: ['Booked 48 hours ahead', 'Meals included', 'Enrolled families first', 'Availability confirmed by text'],
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
            Clear pricing. No surprise fees.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Tuition is billed monthly on the 1st and due by the 10th through your parent portal. Everything below is the
            same number we would tell you in person.
          </p>
        </div>
      </section>

      {/* Tiers */}
      <section className="px-5 py-10 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {tiers.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.08}>
              <Card
                hover
                className={`flex h-full flex-col p-7 ${t.featured ? 'border-[#4F77D9]/40 ring-2 ring-[#4F77D9]/25' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-extrabold text-slate-900">{t.name}</h3>
                  {t.featured && <Badge tone="blue">Most families</Badge>}
                </div>
                <p className="mt-5 font-display text-4xl font-black tracking-tight text-slate-900">
                  {money(t.price)}
                  <span className="ml-1 align-middle text-sm font-semibold text-slate-500">{t.unit}</span>
                </p>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-slate-600">{t.desc}</p>
                <ul className="mt-6 space-y-2.5">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <Check size={17} className="mt-0.5 shrink-0 text-[#5DC4A6]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  as={Link}
                  to="/contact"
                  variant={t.featured ? 'primary' : 'outline'}
                  className="mt-7 w-full"
                >
                  Check availability
                </Button>
              </Card>
            </Reveal>
          ))}
        </div>

        <div className="mx-auto mt-8 grid max-w-7xl gap-4 sm:grid-cols-3">
          {[
            ['One-time registration fee', money(rates.registrationFee), 'Due at enrollment, holds your spot'],
            ['Sibling discount', `${rates.siblingDiscountPct}%`, 'Off tuition for each additional child'],
            ['Late pickup', `${money(rates.lateFeePerMinute)} / min`, 'After 5:45 PM, two grace passes a year'],
          ].map(([label, value, sub], i) => (
            <Reveal key={label} delay={i * 0.07}>
              <Card className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mt-2 font-display text-2xl font-extrabold text-slate-900">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{sub}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Estimator + included */}
      <section className="px-5 py-14 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_1fr]">
          <Reveal>
            <Card className="h-full p-7">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EAF0FC] to-white text-[#4F77D9]">
                  <Calculator size={20} />
                </span>
                <div>
                  <h2 className="font-display text-xl font-extrabold text-slate-900">Monthly estimate</h2>
                  <p className="text-sm text-slate-500">Four-week month, before taxes or subsidies.</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <Field label="Schedule">
                  <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
                    <option value="fullTime">Full-time (5 days)</option>
                    <option value="partTime">Part-time (3 days)</option>
                  </Select>
                </Field>
                <Field label="Children">
                  <Select value={kids} onChange={(e) => setKids(Number(e.target.value))}>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Extra drop-in days">
                  <Input
                    type="number"
                    min="0"
                    max="20"
                    value={dropIns}
                    onChange={(e) => setDropIns(Number(e.target.value) || 0)}
                  />
                </Field>
              </div>

              <div className="mt-6 space-y-2.5 rounded-2xl bg-slate-50 p-5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Base tuition (4 weeks)</span>
                  <span className="font-semibold text-slate-900">{money(estimate.base)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Sibling discount</span>
                  <span className="font-semibold text-[#2E8C72]">−{money(estimate.discount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Drop-in days</span>
                  <span className="font-semibold text-slate-900">{money(estimate.extras)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                  <span className="font-semibold text-slate-800">Estimated monthly total</span>
                  <span className="font-display text-2xl font-extrabold text-slate-900">{money(estimate.total)}</span>
                </div>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                This is an estimate only. Your first invoice includes the {money(rates.registrationFee)} registration
                fee, and months with five billing weeks are prorated at the weekly rate.
              </p>
            </Card>
          </Reveal>

          <Reveal delay={0.08}>
            <Card className="h-full p-7">
              <h2 className="font-display text-xl font-extrabold text-slate-900">What tuition includes</h2>
              <p className="mt-1.5 text-sm text-slate-500">
                If it happens inside our house, it is already paid for. You pack diapers, wipes, and a nap blanket.
              </p>
              <ul className="mt-6 space-y-3">
                {included.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-[15px] text-slate-700">
                    <Check size={18} className="mt-0.5 shrink-0 text-[#5DC4A6]" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-7 rounded-2xl border border-dashed border-slate-300 p-5 text-sm leading-relaxed text-slate-600">
                <strong className="font-semibold text-slate-800">Subsidies welcome.</strong> We accept Pennsylvania
                Child Care Works (CCW) subsidized care and can complete employer or FSA paperwork — just ask.
              </div>
            </Card>
          </Reveal>
        </div>
      </section>

      {/* Policies */}
      <section className="px-5 py-14 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <SectionHeading
              eyebrow="House policies"
              title="The rules that keep everyone healthy"
              description="These are the four questions we get most. The full parent handbook lives in your portal once you enroll."
              align="center"
            />
          </Reveal>
          <div className="mt-10 space-y-4">
            {policyMeta.map((p, i) => (
              <Reveal key={p.key} delay={i * 0.06}>
                <PolicyItem
                  title={p.title}
                  icon={p.icon}
                  body={settings.policies[p.key] || 'Policy details coming soon.'}
                  open={openKey === p.key}
                  onToggle={() => setOpenKey(openKey === p.key ? null : p.key)}
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
    </PageTransition>
  )
}
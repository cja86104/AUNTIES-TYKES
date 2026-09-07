import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Clock, Users, Sun, CheckCircle2, Baby, Blocks, GraduationCap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import PageTransition, { Reveal } from '../../components/PageTransition'
import { Button, Card, SectionHeading, Badge } from '../../components/ui'
import { programs } from '../../data/mockData'
import { useStore } from '../../store/useStore'

const icons: Record<string, LucideIcon> = { infants: Baby, toddlers: Blocks, preschool: GraduationCap }

export default function Programs() {
  const settings = useStore((s) => s.settings)
  const [active, setActive] = useState(programs[1].id)
  const current = programs.find((p) => p.id === active) || programs[0]

  return (
    <PageTransition>
      <section className="px-5 pb-12 pt-10 lg:px-8 lg:pt-16">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#5DC4A6]/40 bg-white/70 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#25705c] backdrop-blur">
            <Sun size={14} /> Programs & daily rhythm
          </span>
          <h1 className="mt-6 font-display text-4xl font-black leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
            Three age groups. One very small house.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Every group has its own rhythm, ratio, and set of goals — but they share a kitchen table, a backyard, and a
            director who knows all twelve names, favorite books, and nap quirks.
          </p>
          <p className="mt-5 text-sm font-semibold text-slate-500">{settings.ratios}</p>
        </div>
      </section>

      {/* Program cards */}
      <section className="px-5 py-8 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {programs.map((p, i) => {
            const Icon = icons[p.id] || Baby
            const isActive = p.id === active
            return (
              <Reveal key={p.id} delay={i * 0.08}>
                <Card
                  hover
                  className={`flex h-full cursor-pointer flex-col overflow-hidden ${isActive ? 'ring-2 ring-[#4F77D9]' : ''}`}
                  onClick={() => setActive(p.id)}
                >
                  <div className="h-48 w-full overflow-hidden bg-slate-100">
                    <img
                      data-aiwp-slot={p.slot}
                      src={p.image}
                      alt={`${p.name} room`}
                      className="h-full w-full object-cover transition duration-700 hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4F77D9]/10 text-[#4F77D9]">
                          <Icon size={17} />
                        </span>
                        <h2 className="font-display text-xl font-extrabold text-slate-900">{p.name}</h2>
                      </div>
                      <Badge tone={p.spots.toLowerCase().includes('waitlist') ? 'amber' : 'green'}>{p.spots}</Badge>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[#4F77D9]">{p.ages}</p>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">{p.summary}</p>
                    <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <Users size={15} className="text-[#5DC4A6]" /> {p.ratio}
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock size={15} className="text-[#5DC4A6]" /> {p.hours}
                      </div>
                    </dl>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setActive(p.id)
                      }}
                      className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-[#4F77D9] transition hover:gap-2.5"
                    >
                      {isActive ? 'Showing the daily routine' : 'See the daily routine'} <ArrowRight size={15} />
                    </button>
                  </div>
                </Card>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* Routine detail */}
      <section className="px-5 py-14 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <Card className="overflow-hidden">
                <div className="grid gap-0 lg:grid-cols-[1.1fr_1fr]">
                  <div className="p-7 sm:p-10">
                    <span className="inline-flex items-center gap-2 rounded-full bg-[#F5B942]/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#8a6112]">
                      A day with the {current.name.toLowerCase()}
                    </span>
                    <h2 className="mt-5 font-display text-3xl font-extrabold text-slate-900">{current.name}</h2>
                    <p className="mt-3 text-base leading-relaxed text-slate-600">{current.summary}</p>

                    <ol className="mt-8 space-y-0">
                      {current.routine.map((step, i) => (
                        <motion.li
                          key={step}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.06 }}
                          className="relative flex gap-4 pb-6 last:pb-0"
                        >
                          <div className="relative flex flex-col items-center">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4F77D9] font-display text-xs font-extrabold text-white">
                              {i + 1}
                            </span>
                            {i < current.routine.length - 1 && (
                              <span className="mt-1 w-0.5 flex-1 rounded-full bg-slate-200" />
                            )}
                          </div>
                          <p className="pt-1.5 text-[15px] leading-relaxed text-slate-700">{step}</p>
                        </motion.li>
                      ))}
                    </ol>
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50/70 p-7 sm:p-10 lg:border-l lg:border-t-0">
                    <h3 className="font-display text-lg font-bold text-slate-900">What makes this group special</h3>
                    <ul className="mt-4 space-y-3">
                      {current.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-2.5 text-sm text-slate-700">
                          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#5DC4A6]" />
                          {h}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Ages</span>
                        <span className="font-semibold text-slate-900">{current.ages}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Ratio</span>
                        <span className="font-semibold text-slate-900">{current.ratio}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Hours</span>
                        <span className="font-semibold text-slate-900">{current.hours}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Availability</span>
                        <span className="font-semibold text-slate-900">{current.spots}</span>
                      </div>
                    </div>

                    <Button as={Link} to="/contact" className="mt-6 w-full">
                      Ask about a {current.name.toLowerCase()} spot <ArrowRight size={16} />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* Comparison */}
      <section className="px-5 py-14 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <SectionHeading eyebrow="Side by side" title="Compare the programs" align="center" />
          </Reveal>
          <Reveal delay={0.08}>
            <Card className="mt-10 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3.5">Program</th>
                    <th className="px-5 py-3.5">Ages</th>
                    <th className="px-5 py-3.5">Ratio</th>
                    <th className="px-5 py-3.5">Nap</th>
                    <th className="px-5 py-3.5">Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-4 font-display font-bold text-slate-900">{p.name}</td>
                      <td className="px-5 py-4 text-slate-600">{p.ages}</td>
                      <td className="px-5 py-4 text-slate-600">{p.ratio}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {p.id === 'infants' ? 'On demand, safe-sleep cribs' : '12:45 – 2:30 PM on mats'}
                      </td>
                      <td className="px-5 py-4">
                        <Badge tone={p.spots.toLowerCase().includes('waitlist') ? 'amber' : 'green'}>{p.spots}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </Reveal>
        </div>
      </section>

      <section className="px-5 py-10 lg:px-8">
        <Reveal>
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#4F77D9] to-[#5DC4A6] px-6 py-14 text-center sm:px-14">
            <div className="at-grid-dots absolute inset-0 opacity-30" aria-hidden="true" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                Not sure which group fits your child?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/85">
                Tell us their age and temperament and we will tell you honestly where they would thrive — even if that is
                somewhere else.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Button as={Link} to="/contact" size="lg" variant="dark">
                  Talk with Auntie Roz <ArrowRight size={18} />
                </Button>
                <Button
                  as={Link}
                  to="/tuition-policies"
                  size="lg"
                  variant="outline"
                  className="border-white/60 bg-white/10 text-white hover:border-white hover:text-white"
                >
                  See tuition
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </PageTransition>
  )
}
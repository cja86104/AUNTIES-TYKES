import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  HeartHandshake,
  Blocks,
  ShieldCheck,
  Clock,
  ArrowRight,
  Quote,
  Sun,
} from 'lucide-react'
import PageTransition, { Reveal } from '../../components/PageTransition'
import { Button, Card, SectionHeading, Badge } from '../../components/ui'
import { programs, testimonials } from '../../data/mockData'

const highlights = [
  {
    icon: HeartHandshake,
    title: 'Experienced, licensed care',
    body: 'A small, licensed Pennsylvania home — background-checked, CPR certified, and run by someone who knows every child by name.',
    tone: 'from-[#EAF0FC] to-white text-[#4F77D9]',
  },
  {
    icon: Blocks,
    title: 'Play-based learning',
    body: 'Real projects, real dirt, real questions — the kind of hands-on play that builds real skills without ever feeling like school.',
    tone: 'from-[#E6F6F0] to-white text-[#2E8C72]',
  },
  {
    icon: ShieldCheck,
    title: 'Safe by design',
    body: 'Locked entry, background-checked adults, monthly drills, and a peanut-free kitchen with allergy protocols.',
    tone: 'from-[#FDECEC] to-white text-[#C25252]',
  },
  {
    icon: Clock,
    title: 'Hours that fit real jobs',
    body: 'Open 7:00 AM to 5:45 PM with full-time, part-time, and occasional drop-in options when we have room.',
    tone: 'from-[#FDF1DC] to-white text-[#C98A18]',
  },
]

const dayInLife = [
  { slot: 2, src: 'https://images.unsplash.com/photo-1587616211892-f743fcca64f9?auto=format&fit=crop&w=800&q=80', label: '7:00 — Slow, warm arrivals' },
  { slot: 3, src: 'https://images.unsplash.com/photo-1690843857685-15c9a042d37b?auto=format&fit=crop&w=800&q=80', label: '10:15 — Outside, rain or shine' },
  { slot: 4, src: 'https://images.unsplash.com/photo-1576867757603-05b134ebc379?auto=format&fit=crop&w=800&q=80', label: '12:00 — Family-style lunch' },
]

export default function Home() {
  return (
    <PageTransition>
      {/* Hero */}
      <section className="relative px-5 pb-16 pt-10 lg:px-8 lg:pb-24 lg:pt-16">
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.06 }}
              className="mt-6 font-display text-4xl font-black leading-[1.06] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.65rem]"
            >
              Safe, nurturing daycare for
              <span className="relative whitespace-nowrap"> your little ones
                <svg className="absolute -bottom-2 left-0 h-3 w-full" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M2 8 C 60 2, 120 12, 180 5 S 280 2, 298 7" fill="none" stroke="#F5B942" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.14 }}
              className="mt-7 max-w-xl text-lg leading-relaxed text-slate-600"
            >
              Aunties Tykes is a licensed 12-child family daycare in Camp Hill, PA for babies through pre-K. Small groups,
              a real daily rhythm, and photo updates before you finish your first coffee.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <Button as={Link} to="/programs" size="lg">
                Explore our programs
              </Button>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="relative"
          >
            <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_40px_80px_-40px_rgba(31,37,55,0.45)]">
              <div className="h-[420px] w-full overflow-hidden sm:h-[520px]">
                <img
                  data-aiwp-slot="1"
                  src="https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=1600&q=80"
                  alt="Children playing in the Aunties Tykes playroom"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Highlights */}
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <SectionHeading
              eyebrow="Why families stay"
              title="Big-center standards. Small-house warmth."
              description="You get real structure and real documentation, from someone who actually knows your child's favorite book by heart — not a stranger following a manual."
              align="center"
            />
          </Reveal>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.map((h, i) => (
              <Reveal key={h.title} delay={i * 0.08}>
                <Card hover className="h-full p-6">
                  <span className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${h.tone}`}>
                    <h.icon size={22} />
                  </span>
                  <h3 className="font-display text-lg font-bold text-slate-900">{h.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{h.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Day in the life */}
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#1F2537] px-6 py-14 sm:px-12">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#F5B942]">
                <Sun size={13} /> A day at Aunties Tykes
              </span>
              <h2 className="mt-5 font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                A rhythm children can feel coming.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-white/70">
                Predictability is what makes little ones brave. Our day has the same shape every time — arrival snuggles,
                circle, project, outside, lunch, real nap, and one more round outside before pickup.
              </p>
              <Button as={Link} to="/programs" variant="sunny" className="mt-8">
                See the full daily routine <ArrowRight size={16} />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {dayInLife.map((d, i) => (
                <Reveal key={d.slot} delay={i * 0.1}>
                  <figure className="group">
                    <div className="h-44 w-full overflow-hidden rounded-2xl sm:h-56">
                      <img
                        data-aiwp-slot={d.slot}
                        src={d.src}
                        alt={d.label}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
                        loading="lazy"
                      />
                    </div>
                    <figcaption className="mt-2.5 text-xs font-semibold text-white/70">{d.label}</figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Program preview */}
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <SectionHeading eyebrow="Programs" title="Three age groups, one family" className="max-w-xl" />
              <Button as={Link} to="/programs" variant="outline">
                Compare all programs <ArrowRight size={16} />
              </Button>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {programs.map((p, i) => (
              <Reveal key={p.id} delay={i * 0.08}>
                <Card hover className="flex h-full flex-col p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-extrabold text-slate-900">{p.name}</h3>
                    <Badge tone={p.spots.includes('Waitlist') ? 'amber' : 'green'}>{p.spots}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-[#4F77D9]">{p.ages}</p>
                  <p className="mt-3.5 flex-1 text-sm leading-relaxed text-slate-600">{p.summary}</p>
                  <ul className="mt-5 space-y-1.5">
                    {p.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5DC4A6]" />
                        {h}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/programs"
                    className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-[#4F77D9] transition hover:gap-2.5"
                  >
                    Program details <ArrowRight size={15} />
                  </Link>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <SectionHeading eyebrow="Parent voices" title="What families tell their friends" align="center" />
          </Reveal>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {testimonials.map((t, i) => (
              <Reveal key={t.id} delay={i * 0.1}>
                <Card hover className="flex h-full flex-col p-7">
                  <Quote size={26} className="text-[#F5B942]" />
                  <p className="mt-4 flex-1 text-[15px] leading-relaxed text-slate-700">{t.quote}</p>
                  <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F77D9] to-[#5DC4A6] font-display font-extrabold text-white">
                      {t.name[0]}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.detail}</p>
                    </div>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 py-10 lg:px-8">
        <Reveal>
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#4F77D9] to-[#5DC4A6] px-6 py-14 text-center sm:px-14">
            <div className="at-grid-dots absolute inset-0 opacity-30" aria-hidden="true" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                Ready to see Aunties Tykes in person?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/85">
                Reach out and we will set up a time that works for you — you will see the real daily rhythm, not a staged room.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Button as={Link} to="/contact" size="lg" variant="dark">
                  Get in touch <ArrowRight size={18} />
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </PageTransition>
  )
}
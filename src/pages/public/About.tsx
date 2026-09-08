import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  HeartHandshake,
  GraduationCap,
  Award,
  Fingerprint,
  Siren,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  MapPin,
} from 'lucide-react'
import PageTransition, { Reveal } from '../../components/PageTransition'
import { Button, Card, SectionHeading, Badge } from '../../components/ui'
import { useStore } from '../../store/useStore'
import { team } from '../../data/mockData'

const values = [
  {
    icon: HeartHandshake,
    title: 'Known by name',
    body: 'Twelve children, one house, one director. We know who needs a slow morning and who wants to be first outside.',
    tone: 'from-[#EAF0FC] to-white text-[#4F77D9]',
  },
  {
    icon: GraduationCap,
    title: 'Learning through play',
    body: 'Projects grow out of what the children are curious about this month — bugs, bridges, bread, whatever it is.',
    tone: 'from-[#E6F6F0] to-white text-[#2E8C72]',
  },
  {
    icon: ShieldCheck,
    title: 'Honest documentation',
    body: 'Every bottle, nap, diaper, and scraped knee is written down and posted to your portal before pickup.',
    tone: 'from-[#FDF1DC] to-white text-[#C98A18]',
  },
  {
    icon: Sparkles,
    title: 'Partnership with parents',
    body: 'Potty learning, sleep changes, big feelings — we follow your lead at home instead of handing you a policy.',
    tone: 'from-[#F4EEFD] to-white text-[#6F4CB8]',
  },
]

const safety = [
  { icon: Fingerprint, label: 'Background checks', detail: 'Every adult living in or working in the home is fingerprinted and cleared annually.' },
  { icon: Siren, label: 'Monthly drills', detail: 'Fire, shelter-in-place, and evacuation drills are practiced and logged every month.' },
  { icon: ShieldCheck, label: 'Locked entry', detail: 'Doors stay locked during care hours; pickups require a name on your authorized list.' },
  { icon: Award, label: 'Current certifications', detail: 'Infant/child CPR, First Aid, ITS-SIDS, and safe-sleep training kept current for all staff.' },
]

export default function About() {
  const settings = useStore((s) => s.settings)

  return (
    <PageTransition>
      {/* Hero */}
      <section className="px-5 pb-16 pt-10 lg:px-8 lg:pt-16">
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#4F77D9]/30 bg-white/70 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#39569f] backdrop-blur">
              <HeartHandshake size={14} /> Family owned & operated
            </span>
            <h1 className="mt-6 font-display text-4xl font-black leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
              A daycare that grew out of a living room.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              {settings.director}'s story goes here — her background in early childhood care, what led her to open
              her own home, and the one rule she built Aunties Tykes around. Send over a paragraph and we'll drop it in
              exactly as you want it said.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button as={Link} to="/contact" size="lg">
                Meet us in person <ArrowRight size={18} />
              </Button>
              <Button as={Link} to="/programs" size="lg" variant="outline">
                See our programs
              </Button>
            </div>
            <dl className="mt-11 grid max-w-md grid-cols-3 gap-6 border-t border-slate-200 pt-7">
              {[
                [settings.capacity, 'children max'],
                ['3', 'age groups'],
                ['PA', 'licensed home'],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="font-display text-2xl font-extrabold text-slate-900">{v}</dt>
                  <dd className="text-xs font-semibold uppercase tracking-wider text-slate-500">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <Reveal y={26}>
            <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_40px_80px_-40px_rgba(31,37,55,0.45)]">
              <div className="h-[380px] w-full overflow-hidden sm:h-[460px]">
                <img
                  data-aiwp-slot="2"
                  src="https://images.unsplash.com/photo-1714646793149-189cc073b387?auto=format&fit=crop&w=1400&q=80"
                  alt="A quiet reading moment at Aunties Tykes"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Story */}
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
          <Reveal>
            <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
              <div className="h-[320px] w-full overflow-hidden sm:h-[400px]">
                <img
                  data-aiwp-slot="3"
                  src="https://images.unsplash.com/photo-1761208663763-c4d30657c910?auto=format&fit=crop&w=1200&q=80"
                  alt="The Aunties Tykes playroom with low shelves and natural light"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <SectionHeading
              eyebrow="Our philosophy"
              title="Childhood is not a waiting room for kindergarten."
              description="We teach letters, numbers, and self-regulation — but we do it while planting bulbs, mixing muffin batter, and arguing about who gets the red shovel. That is the work of being three."
            />
            <ul className="mt-8 space-y-4">
              {[
                'Mixed-age moments so younger children learn from older ones',
                'Emotion coaching instead of time-outs',
                'Two outdoor blocks every day the weather allows',
                'Home-cooked, peanut-free meals served family style',
              ].map((line) => (
                <li key={line} className="flex items-start gap-3 text-[15px] text-slate-700">
                  <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-[#5DC4A6]" />
                  {line}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Values */}
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <SectionHeading eyebrow="What we believe" title="Four things we refuse to compromise on" align="center" />
          </Reveal>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v, i) => (
              <Reveal key={v.title} delay={i * 0.08}>
                <Card hover className="h-full p-6">
                  <span className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${v.tone}`}>
                    <v.icon size={22} />
                  </span>
                  <h3 className="font-display text-lg font-bold text-slate-900">{v.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{v.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <SectionHeading
              eyebrow="The grown-up in the house"
              title="One face, every single morning"
              description="No rotating staff, no substitute you've never met — just the same person who knows your child's favorite book by heart."
              align="center"
            />
          </Reveal>
          <div className={team.length === 1 ? 'mx-auto mt-12 max-w-sm' : 'mt-12 grid gap-6 md:grid-cols-3'}>
            {team.map((t, i) => (
              <Reveal key={t.id} delay={i * 0.09}>
                <Card hover className="flex h-full flex-col overflow-hidden">
                  {/* No real photo yet — a real headshot of a real named owner shouldn't be faked with stock. */}
                  <div className="flex h-60 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#EAF0FC] via-white to-[#FDF1DC]">
                    <span className="font-display text-6xl font-black text-[#4F77D9]/20">
                      {t.name
                        .split(' ')
                        .map((w) => w[0])
                        .join('')}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="font-display text-lg font-extrabold text-slate-900">{t.name}</h3>
                    <p className="mt-0.5 text-sm font-semibold text-[#4F77D9]">{t.role}</p>
                    <p className="mt-3.5 flex-1 text-sm leading-relaxed text-slate-600">{t.bio}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {t.creds.map((c) => (
                        <Badge key={c} tone="green">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Safety */}
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#1F3A2E] px-6 py-14 sm:px-12">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#F5B942]">
                <ShieldCheck size={13} /> Licensing & safety
              </span>
              <h2 className="mt-5 font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                The boring paperwork, done right.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-white/70">
                We are a licensed Pennsylvania Family Child Care Home. Our license, inspection reports, insurance
                certificate, and staff certifications are posted in the entryway and available in your parent portal.
              </p>
              <div className="mt-7 space-y-2.5 text-sm text-white/70">
                <p className="flex items-center gap-2.5">
                  <Award size={16} className="text-[#5DC4A6]" /> License {settings.licenseNumber}
                </p>
                <p className="flex items-center gap-2.5">
                  <Clock size={16} className="text-[#5DC4A6]" /> {settings.hours}
                </p>
                <p className="flex items-center gap-2.5">
                  <MapPin size={16} className="text-[#5DC4A6]" /> {settings.address}
                </p>
                <p className="flex items-center gap-2.5">
                  <HeartHandshake size={16} className="text-[#5DC4A6]" /> {settings.ratios}
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {safety.map((s, i) => (
                <Reveal key={s.label} delay={i * 0.07}>
                  <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-5">
                    <s.icon size={20} className="text-[#F5B942]" />
                    <p className="mt-3.5 font-display text-base font-bold text-white">{s.label}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/65">{s.detail}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 py-10 lg:px-8">
        <Reveal>
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#25705c] to-[#8a6112] px-6 py-14 text-center sm:px-14">
            <div className="at-grid-dots absolute inset-0 opacity-30" aria-hidden="true" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                Come see whether it feels like home.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/85">
                Reach out and we will find a time that works — right in the middle of a real day, not a staged one.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Button as={Link} to="/contact" size="lg" variant="dark">
                  Get in touch <ArrowRight size={18} />
                </Button>
                <Button
                  as={Link}
                  to="/tuition-policies"
                  size="lg"
                  variant="outline"
                  className="border-white/60 bg-white/10 text-white hover:border-white hover:text-white"
                >
                  Tuition & policies
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </PageTransition>
  )
}
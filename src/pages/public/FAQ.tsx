import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ChevronDown, HelpCircle, ArrowRight, Mail } from 'lucide-react'
import PageTransition, { Reveal } from '../../components/PageTransition'
import { Button, Card, Input, EmptyState, SectionHeading } from '../../components/ui'
import { faqs } from '../../data/mockData'
import { useStore } from '../../store/useStore'

export default function FAQ() {
  const settings = useStore((s) => s.settings)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(0)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return faqs
    return faqs.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))
  }, [query])

  return (
    <PageTransition>
      <section className="px-5 pb-8 pt-10 lg:px-8 lg:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#4F77D9]/30 bg-white/70 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#39569f] backdrop-blur">
            <HelpCircle size={14} /> Parent FAQ
          </span>
          <h1 className="mt-6 font-display text-4xl font-black leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
            Answers before you ask.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            The questions families actually ask us — answered the same way we would answer them standing in the
            kitchen.
          </p>

          <div className="relative mx-auto mt-9 max-w-md">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search naps, meals, sick policy…"
              className="pl-10"
              aria-label="Search frequently asked questions"
            />
          </div>
        </div>
      </section>

      <section className="px-5 py-10 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {results.length === 0 ? (
            <EmptyState
              icon={HelpCircle}
              title="No answer matched that"
              description="Try a different word, or just ask us directly — we answer texts faster than email."
              action={
                <Button as={Link} to="/contact">
                  Ask your question <ArrowRight size={16} />
                </Button>
              }
            />
          ) : (
            <div className="space-y-3.5">
              {results.map((f, i) => {
                const isOpen = open === i
                return (
                  <Reveal key={f.q} delay={Math.min(i * 0.04, 0.3)}>
                    <Card className="overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? -1 : i)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
                      >
                        <span className="font-display text-base font-bold text-slate-900">{f.q}</span>
                        <ChevronDown
                          size={18}
                          className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.26 }}
                            className="overflow-hidden"
                          >
                            <p className="border-t border-slate-100 px-5 py-5 text-[15px] leading-relaxed text-slate-600">
                              {f.a}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  </Reveal>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="px-5 py-14 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <Card className="grid gap-8 p-8 sm:p-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
              <SectionHeading
                eyebrow="Still wondering?"
                title="Talk to a person, not a form letter"
                description="Send a message and Mellissa will get back to you personally — usually the same day."
              />
              <div className="space-y-3">
                <a
                  href={`mailto:${settings.email}`}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-[#4F77D9] hover:bg-[#4F77D9]/5"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5DC4A6]/15 text-[#25705c]">
                    <Mail size={18} />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-900">{settings.email}</span>
                    <span className="block text-xs text-slate-500">Replies within one business day</span>
                  </span>
                </a>
                <Button as={Link} to="/contact" className="w-full" size="lg">
                  Get in touch <ArrowRight size={18} />
                </Button>
              </div>
            </Card>
          </Reveal>
        </div>
      </section>
    </PageTransition>
  )
}
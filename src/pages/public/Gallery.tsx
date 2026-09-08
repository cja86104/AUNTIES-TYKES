import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, X, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'
import PageTransition, { Reveal } from '../../components/PageTransition'
import { Button, Card, Tabs, SectionHeading } from '../../components/ui'
import { galleryItems } from '../../data/mockData'

export default function Gallery() {
  const [filter, setFilter] = useState('all')
  const [index, setIndex] = useState(-1)

  const categories = useMemo(() => {
    const set = Array.from(new Set(galleryItems.map((g) => g.category)))
    return [
      { value: 'all', label: 'Everything', count: galleryItems.length },
      ...set.map((c) => ({ value: c, label: c, count: galleryItems.filter((g) => g.category === c).length })),
    ]
  }, [])

  const items = useMemo(
    () => (filter === 'all' ? galleryItems : galleryItems.filter((g) => g.category === filter)),
    [filter],
  )

  const active = index >= 0 && index < items.length ? items[index] : null

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIndex(-1)
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % items.length)
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + items.length) % items.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, items.length])

  useEffect(() => {
    setIndex(-1)
  }, [filter])

  return (
    <PageTransition>
      <section className="px-5 pb-8 pt-10 lg:px-8 lg:pt-16">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#F5B942]/50 bg-white/70 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#8a6112] backdrop-blur">
            <Camera size={14} /> Photo gallery
          </span>
          <h1 className="mt-6 font-display text-4xl font-black leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
            Our house, mid-Tuesday.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Nothing staged, nothing borrowed. These are the rooms, the yard, and the projects your child would walk into
            tomorrow morning.
          </p>
        </div>
      </section>

      <section className="px-5 py-8 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex justify-center">
            <Tabs tabs={categories} value={filter} onChange={setFilter} />
          </div>

          <motion.div layout className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {items.map((g, i) => (
                <motion.button
                  key={g.id}
                  layout
                  type="button"
                  onClick={() => setIndex(i)}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-28px_rgba(16,24,40,0.35)]"
                  aria-label={`Open ${g.title}`}
                >
                  <div className="h-56 w-full overflow-hidden bg-slate-100">
                    <img
                      data-aiwp-slot={g.slot}
                      src={g.src}
                      alt={g.title}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
                      loading="lazy"
                    />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/80 to-transparent p-4 pt-10">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{g.category}</p>
                    <p className="font-display text-base font-bold text-white">{g.title}</p>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      <AnimatePresence>
        {active && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-8">
            <motion.div
              className="absolute inset-0 bg-slate-900/85 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIndex(-1)}
            />
            <motion.div
              key={active.id}
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', stiffness: 250, damping: 26 }}
              className="relative z-10 w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label={active.title}
            >
              <div className="max-h-[70vh] w-full overflow-hidden bg-slate-100">
                <img
                  data-aiwp-slot={active.slot}
                  src={active.src}
                  alt={active.title}
                  className="h-full max-h-[70vh] w-full object-cover"
                />
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{active.category}</p>
                  <p className="font-display text-lg font-bold text-slate-900">{active.title}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)}
                    className="rounded-xl border border-slate-300 p-2 text-slate-600 transition hover:border-[#4F77D9] hover:text-[#4F77D9]"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-xs font-semibold text-slate-500">
                    {index + 1} / {items.length}
                  </span>
                  <button
                    onClick={() => setIndex((i) => (i + 1) % items.length)}
                    className="rounded-xl border border-slate-300 p-2 text-slate-600 transition hover:border-[#4F77D9] hover:text-[#4F77D9]"
                    aria-label="Next photo"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <button
                onClick={() => setIndex(-1)}
                className="absolute right-3 top-3 rounded-full bg-slate-900/60 p-2 text-white transition hover:bg-slate-900"
                aria-label="Close photo viewer"
              >
                <X size={18} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <section className="px-5 py-14 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <Card className="grid gap-8 p-8 sm:p-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
              <div>
                <SectionHeading
                  eyebrow="Daily photos"
                  title="Your child's own gallery, every day"
                  description="Enrolled families get a private feed inside the parent portal — photos attached to the day's report, alongside meals, naps, and a note from whoever was with them that day."
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Button as={Link} to="/contact" size="lg" className="w-full">
                  Get in touch <ArrowRight size={18} />
                </Button>
                <Button as={Link} to="/login" size="lg" variant="outline" className="w-full">
                  Parent portal login
                </Button>
              </div>
            </Card>
          </Reveal>
        </div>
      </section>
    </PageTransition>
  )
}
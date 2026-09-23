import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogIn } from 'lucide-react'
import PageTransition, { Reveal } from '../../components/PageTransition'
import { Button } from '../../components/ui'

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
              className="font-display text-4xl font-black leading-[1.1] tracking-tight text-slate-900 sm:text-5xl"
            >
              Welcome to your Aunties Tykes portal.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.14 }}
              className="mt-7 max-w-xl text-lg leading-relaxed text-slate-600"
            >
              This is your family's spot to check in any time: daily reports, photos from the day, attendance,
              invoices, and a way to reach us, all in one place.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-9 flex flex-wrap items-center gap-5"
            >
              <Button as={Link} to="/login" size="lg">
                <LogIn size={17} /> Parent login
              </Button>
              <Button as={Link} to="/contact" size="lg" variant="outline">
                Get in touch
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

      {/* A note from Melissa */}
      <section className="px-5 py-20 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-5xl text-center">
            <p
              style={{ fontFamily: "'Caveat', cursive" }}
              className="text-4xl leading-[1.15] text-slate-800 sm:text-5xl lg:text-[3.4rem]"
            >
              Every family who walks through this door becomes part of mine — that's not a slogan, it's just how I
              do things here.
            </p>
            <p
              style={{ fontFamily: "'Caveat', cursive" }}
              className="mt-6 text-3xl text-[#3F8570] sm:text-4xl"
            >
              — AUNTIE 
            </p>
          </div>
        </Reveal>
      </section>
    </PageTransition>
  )
}

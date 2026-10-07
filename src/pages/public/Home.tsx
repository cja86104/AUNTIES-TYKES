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
              className="font-display text-4xl font-black leading-[1.1] tracking-tight sm:text-5xl"
            >
              <span className="text-rainbow-red rainbow-outline">Welcome</span>{' '}
              <span className="text-rainbow-orange rainbow-outline">to</span>{' '}
              <span className="text-rainbow-gold rainbow-outline">your</span>{' '}
              <span className="text-[#FF13F0] rainbow-outline">Aunties</span>{' '}
              <span className="text-rainbow-blue rainbow-outline">Tykes</span>{' '}
              <span className="text-rainbow-purple rainbow-outline">portal.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.14 }}
              className="mt-7 max-w-xl text-lg leading-relaxed text-ink"
            >
              This is your Family's spot to check in anytime to see the menu, materials list, events, photos
              and a way to reach me all in one place.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-9 flex flex-wrap items-center gap-5"
            >
              <Button as={Link} to="/login" size="lg" variant="rainbow">
                <LogIn size={17} /> Parent login
              </Button>
              <Button as={Link} to="/contact" size="lg" variant="tan">
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
                  src="/hero-rainbow-wall.jpg"
                  alt="A classroom wall at Aunties Tykes decorated with colorful bubble-letter affirmations -- be kind, honest, thankful, brave, happy, humble, creative, you -- beside a plush rainbow with clouds and a handwritten quote: you're braver than you believe, stronger than you seem, smarter than you think"
                  className="h-full w-full object-cover object-[50%_32%]"
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
              className="text-4xl leading-[1.15] text-ink sm:text-5xl lg:text-[3.4rem]"
            >
              Every family who walks through this door becomes part of mine — that's not a slogan, it's just how I
              do things here.
            </p>
            <p
              style={{ fontFamily: "'Caveat', cursive" }}
              className="mt-6 text-3xl text-[#FF13F0] sm:text-4xl"
            >
              — AUNTIE 
            </p>
          </div>
        </Reveal>
      </section>
    </PageTransition>
  )
}

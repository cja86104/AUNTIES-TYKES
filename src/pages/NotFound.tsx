import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, ArrowLeft, Compass, LifeBuoy } from 'lucide-react'
import { Button, Card } from '../components/ui'

const suggestions = [
  ['/tuition-policies', 'Tuition & policies'],
  ['/faq', 'Parent FAQ'],
  ['/contact', 'Get in touch'],
  ['/login', 'Parent portal login'],
]

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#FBFAF7] px-5 py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="at-blob left-[-6rem] top-[-6rem] h-80 w-80 bg-[#4F77D9]/25" />
        <span className="at-blob right-[-4rem] bottom-[2rem] h-72 w-72 bg-[#F5B942]/30" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-2xl"
      >
        <Card className="p-8 text-center sm:p-12">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EAF0FC] to-[#FDF1DC] text-[#4F77D9]">
            <Compass size={28} />
          </span>
          <p className="mt-6 font-display text-6xl font-black tracking-tight text-slate-900">404</p>
          <h1 className="mt-3 font-display text-2xl font-extrabold text-slate-900">
            That page wandered off during outside time.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
            We could not find what you were looking for. Here are the rooms that definitely exist.
          </p>

          <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
            {suggestions.map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#4F77D9] hover:bg-[#4F77D9]/5 hover:text-[#4F77D9]"
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button as={Link} to="/" size="lg">
              <Home size={17} /> Back home
            </Button>
            <Button as={Link} to="/contact" size="lg" variant="outline">
              <LifeBuoy size={17} /> Get help
            </Button>
          </div>

          <button
            onClick={() => window.history.back()}
            className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-[#4F77D9]"
          >
            <ArrowLeft size={13} /> Or go back one step
          </button>
        </Card>
      </motion.div>
    </div>
  )
}
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, LogIn, LayoutDashboard } from 'lucide-react'
import { useStore } from '../store/useStore'
import { Button } from './ui'
import { cx } from '../lib/helpers'

const links = [
  { to: '/', label: 'Home' },
  { to: '/parent-portal-guide', label: 'Portal Guide' },
  { to: '/tuition-policies', label: 'Tuition & Policies' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
]

export default function PublicNav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const user = useStore((s) => s.user)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const portalHref = user ? (user.role === 'admin' ? '/admin/dashboard' : '/parent/dashboard') : '/login'

  return (
    <header
      className={cx(
        'sticky top-0 z-50 transition-all duration-300',
        scrolled ? 'border-b border-slate-200/80 bg-[#FBFAF7]/85 backdrop-blur-xl' : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 lg:px-8">
        <Link to="/" className="group flex items-center gap-3" aria-label="Aunties Tykes home">
          <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4F77D9] to-[#5DC4A6] shadow-[0_8px_18px_-8px_rgba(79,119,217,0.9)] transition-transform duration-300 group-hover:rotate-6">
            <span className="font-display text-lg font-black text-white">AT</span>
            <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-[#FBFAF7] bg-[#F5B942]" />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-lg font-extrabold tracking-tight text-slate-900">Aunties Tykes</span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Licensed home daycare
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Main">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cx(
                  'relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                  isActive ? 'text-[#4F77D9]' : 'text-slate-600 hover:text-slate-900',
                )
              }
            >
              {({ isActive }) => (
                <span className="relative">
                  {l.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute -bottom-1.5 left-0 right-0 h-0.5 rounded-full bg-[#F5B942]"
                    />
                  )}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button as={Link} to={portalHref} size="sm" className="hidden sm:inline-flex">
            {user ? <LayoutDashboard size={15} /> : <LogIn size={15} />}
            {user ? 'My Portal' : 'Parent Login'}
          </Button>
          <button
            onClick={() => setOpen((o) => !o)}
            className="rounded-xl border border-slate-300 bg-white p-2.5 text-slate-700 transition hover:border-[#4F77D9] hover:text-[#4F77D9] xl:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="overflow-hidden border-t border-slate-200 bg-white xl:hidden"
            aria-label="Mobile"
          >
            <div className="mx-auto max-w-7xl px-5 py-4">
              {links.map((l, i) => (
                <motion.div
                  key={l.to}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.03 * i }}
                >
                  <NavLink
                    to={l.to}
                    className={({ isActive }) =>
                      cx(
                        'block rounded-xl px-3 py-3 text-base font-semibold',
                        isActive ? 'bg-[#4F77D9]/10 text-[#39569f]' : 'text-slate-700 hover:bg-slate-50',
                      )
                    }
                  >
                    {l.label}
                  </NavLink>
                </motion.div>
              ))}
              <Button as={Link} to={portalHref} className="mt-3 w-full" size="md">
                {user ? 'Go to my portal' : 'Parent Login'}
              </Button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
import { useEffect, useState } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { LayoutDashboard, Baby, NotebookPen, ClipboardCheck, Wallet, FolderOpen, MessageSquare, LogOut, Menu } from 'lucide-react'
import { useStore } from '../store/useStore'
import { Avatar } from '../components/ui'
import { cx } from '../lib/helpers'

const nav = [
  { to: '/parent/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/parent/children', label: 'My Children', icon: Baby },
  { to: '/parent/daily-reports', label: 'Daily Reports', icon: NotebookPen },
  { to: '/parent/attendance', label: 'Attendance', icon: ClipboardCheck },
  { to: '/parent/billing', label: 'Billing', icon: Wallet },
  { to: '/parent/documents', label: 'Documents', icon: FolderOpen },
  { to: '/parent/messages', label: 'Messages', icon: MessageSquare },
]

export default function ParentLayout() {
  const user = useStore((s) => s.user)
  const logout = useStore((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  const doLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-[#FBFAF7]">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link to="/parent/dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F77D9] to-[#5DC4A6]">
              <span className="font-display text-base font-black text-white">AT</span>
            </span>
            <span className="leading-tight">
              <span className="block font-display text-base font-extrabold text-slate-900">Aunties Tykes</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Parent portal</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">Family account</p>
            </div>
            <Avatar name={user?.name || 'Parent'} hue="from-[#F5B942] to-[#5DC4A6]" size="md" />
            <button
              onClick={doLogout}
              className="hidden rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600 sm:inline-flex sm:items-center sm:gap-1.5"
            >
              <LogOut size={15} /> Sign out
            </button>
            <button
              onClick={() => setOpen((o) => !o)}
              className="rounded-xl border border-slate-300 p-2 text-slate-600 lg:hidden"
              aria-label="Toggle portal menu"
            >
              <Menu size={18} />
            </button>
          </div>
        </div>

        <nav className="mx-auto hidden max-w-7xl gap-1 px-4 pb-2 sm:px-6 lg:flex lg:px-8" aria-label="Parent portal">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2 rounded-t-xl border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-all',
                  isActive
                    ? 'border-[#4F77D9] text-[#4F77D9]'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
                )
              }
            >
              <n.icon size={16} /> {n.label}
            </NavLink>
          ))}
        </nav>

        <AnimatePresence>
          {open && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-slate-200 lg:hidden"
            >
              <div className="px-4 py-3 sm:px-6">
                {nav.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    className={({ isActive }) =>
                      cx(
                        'flex items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-semibold',
                        isActive ? 'bg-[#4F77D9]/10 text-[#39569f]' : 'text-slate-700 hover:bg-slate-50',
                      )
                    }
                  >
                    <n.icon size={17} /> {n.label}
                  </NavLink>
                ))}
                <button
                  onClick={doLogout}
                  className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                >
                  <LogOut size={17} /> Sign out
                </button>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
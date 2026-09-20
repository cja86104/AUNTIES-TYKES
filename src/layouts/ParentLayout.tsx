import { useEffect, useState } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard,
  UserRound,
  NotebookPen,
  ClipboardCheck,
  CalendarDays,
  Wallet,
  FolderOpen,
  MessageSquare,
  LogOut,
  Menu,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store/useStore'
import { Avatar } from '../components/ui'
import { cx } from '../lib/helpers'
import { setPortalLanguage } from '../i18n'
import { useUnreadCounts, type UnreadCounts } from '../lib/unread'

interface NavItem {
  to: string
  labelKey: string
  icon: typeof LayoutDashboard
  /** Which unread count, if any, shows as a badge on this row. */
  badge?: keyof UnreadCounts
}

const nav: NavItem[] = [
  { to: '/parent/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/parent/children', labelKey: 'nav.myChildren', icon: UserRound },
  { to: '/parent/daily-reports', labelKey: 'nav.dailyReports', icon: NotebookPen },
  { to: '/parent/attendance', labelKey: 'nav.attendance', icon: ClipboardCheck },
  { to: '/parent/calendar', labelKey: 'nav.calendar', icon: CalendarDays },
  { to: '/parent/billing', labelKey: 'nav.billing', icon: Wallet },
  { to: '/parent/documents', labelKey: 'nav.documents', icon: FolderOpen, badge: 'documents' },
  { to: '/parent/messages', labelKey: 'nav.messages', icon: MessageSquare, badge: 'messages' },
]

export default function ParentLayout() {
  const { t } = useTranslation()
  const user = useStore((s) => s.user)
  const logout = useStore((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const unread = useUnreadCounts()

  useEffect(() => {
    setOpen(false)
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  // The signed-in parent's own account decides the portal language — set by
  // the owner when the account was created (see ParentAccountDialog).
  useEffect(() => {
    setPortalLanguage(user?.preferredLanguage)
  }, [user?.preferredLanguage])

  const doLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-[#FCF7EA]">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link to="/parent/dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#3F8570] to-[#D98B9B]">
              <span className="font-display text-base font-black text-white">AT</span>
            </span>
            <span className="leading-tight">
              <span className="block font-display text-base font-extrabold text-slate-900">Aunties Tykes</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('portal.brandLine')}</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">{t('portal.familyAccount')}</p>
            </div>
            <Avatar name={user?.name || 'Parent'} hue="from-[#F5B942] to-[#D98B9B]" size="md" />
            <button
              onClick={doLogout}
              className="hidden rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-600 sm:inline-flex sm:items-center sm:gap-1.5"
            >
              <LogOut size={15} /> {t('portal.signOut')}
            </button>
            <button
              onClick={() => setOpen((o) => !o)}
              className="rounded-xl border border-slate-300 p-2 text-slate-600 lg:hidden"
              aria-label={t('portal.toggleMenu')}
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
                    ? 'border-[#3F8570] text-[#3F8570]'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
                )
              }
            >
              <n.icon size={16} /> {t(n.labelKey)}
              {n.badge && unread[n.badge] > 0 && (
                <span
                  className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#D98B9B] px-1.5 text-xs font-bold text-white"
                  aria-label={`${unread[n.badge]} new`}
                >
                  {unread[n.badge]}
                </span>
              )}
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
                        isActive ? 'bg-[#3F8570]/10 text-[#1F4A3D]' : 'text-slate-700 hover:bg-slate-50',
                      )
                    }
                  >
                    <n.icon size={17} /> {t(n.labelKey)}
                    {n.badge && unread[n.badge] > 0 && (
                      <span
                        className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#D98B9B] px-1.5 text-xs font-bold text-white"
                        aria-label={`${unread[n.badge]} new`}
                      >
                        {unread[n.badge]}
                      </span>
                    )}
                  </NavLink>
                ))}
                <button
                  onClick={doLogout}
                  className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                >
                  <LogOut size={17} /> {t('portal.signOut')}
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
import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Users,
  UserRound,
  ClipboardCheck,
  NotebookPen,
  Wallet,
  ReceiptText,
  FolderOpen,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  ExternalLink,
  Heart,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { setPortalLanguage } from '../i18n'
import { Avatar } from '../components/ui'
import { cx } from '../lib/helpers'
import { useUnreadCounts, type UnreadCounts } from '../lib/unread'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  /** Which unread count, if any, shows as a badge on this row. */
  badge?: keyof UnreadCounts
}

const nav: NavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/families', label: 'Families', icon: Users },
  { to: '/admin/children', label: 'Children', icon: UserRound },
  { to: '/admin/calendar', label: 'Family Calendar', icon: CalendarDays },
  { to: '/admin/attendance', label: 'Attendance', icon: ClipboardCheck },
  { to: '/admin/daily-logs', label: 'Daily Logs', icon: NotebookPen },
  { to: '/admin/billing', label: 'Billing', icon: Wallet },
  { to: '/admin/invoices', label: 'Invoices', icon: ReceiptText },
  { to: '/admin/documents', label: 'Documents', icon: FolderOpen, badge: 'documents' },
  { to: '/admin/messages', label: 'Messages / Announcements', icon: MessageSquare, badge: 'messages' },
  { to: '/admin/enrollments', label: 'Future Arrivals', icon: ClipboardList },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export default function AdminLayout() {
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

  // The admin console is English-only. i18next is a single global instance
  // shared with the parent portal (via InvoiceView / DailyLogCard), so force
  // it back to English whenever the admin shell is mounted -- otherwise a
  // parent's chosen language can leak into the admin views after a role
  // switch in the same browser session.
  useEffect(() => {
    setPortalLanguage('en')
  }, [])

  const doLogout = () => {
    logout()
    navigate('/')
  }

  const SidebarInner = (
    <div className="flex h-full flex-col">
      <Link to="/" className="flex items-center gap-3 px-5 py-5">
        <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#D98B9B] to-[#3F8570] shadow-control">
          <Heart size={20} strokeWidth={1.75} className="fill-white text-white" />
        </span>
        <span className="leading-tight">
          <span className="block font-script text-2xl font-semibold text-white">Aunties Tykes</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">Home care console</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Admin">
        {nav.map((n) => {
          const count = n.badge ? unread[n.badge] : 0
          return (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              cx(
                'group flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-semibold transition-all',
                isActive ? 'bg-white/12 text-white' : 'text-white/60 hover:bg-white/8 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <n.icon
                  size={20}
                  strokeWidth={1.75}
                  className={cx('shrink-0 transition', isActive ? 'text-[#F5B942]' : 'group-hover:text-white')}
                />
                {n.label}
                {count > 0 ? (
                  <span
                    className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#F5B942] px-1.5 text-xs font-bold text-[#1F2537]"
                    aria-label={`${count} new`}
                  >
                    {count}
                  </span>
                ) : (
                  isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#F5B942]" />
                )}
              </>
            )}
          </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-control px-3 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-white/8 hover:text-white"
        >
          <ExternalLink size={20} strokeWidth={1.75} /> View public site
        </Link>
        <button
          onClick={doLogout}
          className="mt-1 flex w-full items-center gap-2 rounded-control px-3 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-rose-500/20 hover:text-rose-200"
        >
          <LogOut size={20} strokeWidth={1.75} /> Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F7F1E4]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[370px] bg-[#1F2537] lg:block">{SidebarInner}</aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-64 bg-[#1F2537] lg:hidden"
            >
              {SidebarInner}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-[370px]">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-4 px-6 py-4 sm:px-8 lg:px-10">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOpen(true)}
                className="rounded-control border border-slate-300 p-2 text-slate-600 transition hover:border-brand hover:text-brand lg:hidden"
                aria-label="Open navigation"
              >
                <Menu size={20} strokeWidth={1.75} />
              </button>
              <div>
                <p className="font-display text-sm font-extrabold text-slate-900">Aunties Tykes — Admin</p>
                <p className="text-xs text-slate-500">Owner console</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-bold text-slate-900">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.title || 'Administrator'}</p>
              </div>
              <Avatar name={user?.name || 'Admin'} hue="from-[#3F8570] to-[#D98B9B]" size="md" />
              <button
                onClick={doLogout}
                className="rounded-control border border-slate-300 p-2 text-slate-500 transition hover:border-rose-300 hover:text-rose-600"
                aria-label="Sign out"
              >
                <LogOut size={20} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </header>

        <main className="px-6 py-10 sm:px-8 lg:px-12">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
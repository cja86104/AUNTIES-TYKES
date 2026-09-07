import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Baby,
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
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { Avatar } from '../components/ui'
import { cx } from '../lib/helpers'

const nav = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/enrollments', label: 'Enrollments', icon: ClipboardList },
  { to: '/admin/families', label: 'Families', icon: Users },
  { to: '/admin/children', label: 'Children', icon: Baby },
  { to: '/admin/attendance', label: 'Attendance', icon: ClipboardCheck },
  { to: '/admin/daily-logs', label: 'Daily Logs', icon: NotebookPen },
  { to: '/admin/billing', label: 'Billing', icon: Wallet },
  { to: '/admin/invoices', label: 'Invoices', icon: ReceiptText },
  { to: '/admin/documents', label: 'Documents', icon: FolderOpen },
  { to: '/admin/messages', label: 'Messages', icon: MessageSquare },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export default function AdminLayout() {
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

  const SidebarInner = (
    <div className="flex h-full flex-col">
      <Link to="/" className="flex items-center gap-3 px-5 py-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F77D9] to-[#5DC4A6]">
          <span className="font-display text-base font-black text-white">AT</span>
        </span>
        <span className="leading-tight">
          <span className="block font-display text-base font-extrabold text-white">Aunties Tykes</span>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Admin console</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Admin">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              cx(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
                isActive ? 'bg-white/12 text-white' : 'text-white/60 hover:bg-white/8 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <n.icon size={17} className={cx('shrink-0 transition', isActive ? 'text-[#F5B942]' : 'group-hover:text-white')} />
                {n.label}
                {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#F5B942]" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-white/8 hover:text-white"
        >
          <ExternalLink size={16} /> View public site
        </Link>
        <button
          onClick={doLogout}
          className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-rose-500/20 hover:text-rose-200"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F5F4F0]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-[#1F2537] lg:block">{SidebarInner}</aside>

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

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOpen(true)}
                className="rounded-xl border border-slate-300 p-2 text-slate-600 transition hover:border-[#4F77D9] hover:text-[#4F77D9] lg:hidden"
                aria-label="Open navigation"
              >
                <Menu size={18} />
              </button>
              <div>
                <p className="font-display text-sm font-extrabold text-slate-900">Aunties Tykes — Admin</p>
                <p className="text-xs text-slate-500">Owner console · demo data</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-bold text-slate-900">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.title || 'Administrator'}</p>
              </div>
              <Avatar name={user?.name || 'Admin'} hue="from-[#4F77D9] to-[#5DC4A6]" size="md" />
              <button
                onClick={doLogout}
                className="rounded-xl border border-slate-300 p-2 text-slate-500 transition hover:border-rose-300 hover:text-rose-600"
                aria-label="Sign out"
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-7 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
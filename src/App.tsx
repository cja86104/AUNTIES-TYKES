import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'

import PublicLayout from './layouts/PublicLayout'
import AdminLayout from './layouts/AdminLayout'
import ParentLayout from './layouts/ParentLayout'
import { RequireRole } from './components/ProtectedRoute'
import ToastHost from './components/ToastHost'
import RouteMeta from './components/RouteMeta'

// The landing page is eager so the first paint never waits on a chunk.
import Home from './pages/public/Home'

/*
 * Everything else is split by route. Without this the public marketing site
 * ships the whole admin console — recharts, dnd-kit and all — to a parent who
 * only wanted to read the tuition page.
 */
const ParentPortalGuide = lazy(() => import('./pages/public/ParentPortalGuide'))
const TuitionPolicies = lazy(() => import('./pages/public/TuitionPolicies'))
const FAQ = lazy(() => import('./pages/public/FAQ'))
const Contact = lazy(() => import('./pages/public/Contact'))
const Enroll = lazy(() => import('./pages/public/Enroll'))
const Login = lazy(() => import('./pages/auth/Login'))
const NotFound = lazy(() => import('./pages/NotFound'))

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminEnrollments = lazy(() => import('./pages/admin/AdminEnrollments'))
const AdminFamilies = lazy(() => import('./pages/admin/AdminFamilies'))
const AdminFamilyDetail = lazy(() => import('./pages/admin/AdminFamilyDetail'))
const AdminChildren = lazy(() => import('./pages/admin/AdminChildren'))
const AdminChildDetail = lazy(() => import('./pages/admin/AdminChildDetail'))
const AdminAttendance = lazy(() => import('./pages/admin/AdminAttendance'))
const AdminDailyLogs = lazy(() => import('./pages/admin/AdminDailyLogs'))
const AdminBilling = lazy(() => import('./pages/admin/AdminBilling'))
const AdminInvoices = lazy(() => import('./pages/admin/AdminInvoices'))
const AdminInvoiceDetail = lazy(() => import('./pages/admin/AdminInvoiceDetail'))
const AdminDocuments = lazy(() => import('./pages/admin/AdminDocuments'))
const AdminMessages = lazy(() => import('./pages/admin/AdminMessages'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))

const ParentDashboard = lazy(() => import('./pages/parent/ParentDashboard'))
const ParentChildren = lazy(() => import('./pages/parent/ParentChildren'))
const ParentChildDetail = lazy(() => import('./pages/parent/ParentChildDetail'))
const ParentDailyReports = lazy(() => import('./pages/parent/ParentDailyReports'))
const ParentAttendance = lazy(() => import('./pages/parent/ParentAttendance'))
const ParentBilling = lazy(() => import('./pages/parent/ParentBilling'))
const ParentInvoiceDetail = lazy(() => import('./pages/parent/ParentInvoiceDetail'))
const ParentDocuments = lazy(() => import('./pages/parent/ParentDocuments'))
const ParentMessages = lazy(() => import('./pages/parent/ParentMessages'))

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <span className="flex flex-col items-center gap-3">
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#4F77D9]" />
        <span className="text-sm font-semibold text-slate-400">Loading…</span>
      </span>
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <Suspense fallback={<RouteFallback />}>
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/parent-portal-guide" element={<ParentPortalGuide />} />
            <Route path="/tuition-policies" element={<TuitionPolicies />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/enroll" element={<Enroll />} />
          </Route>

          <Route path="/login" element={<Login />} />

          <Route
            element={
              <RequireRole role="admin">
                <AdminLayout />
              </RequireRole>
            }
          >
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/enrollments" element={<AdminEnrollments />} />
            <Route path="/admin/families" element={<AdminFamilies />} />
            <Route path="/admin/families/:id" element={<AdminFamilyDetail />} />
            <Route path="/admin/children" element={<AdminChildren />} />
            <Route path="/admin/children/:id" element={<AdminChildDetail />} />
            <Route path="/admin/attendance" element={<AdminAttendance />} />
            <Route path="/admin/daily-logs" element={<AdminDailyLogs />} />
            <Route path="/admin/billing" element={<AdminBilling />} />
            <Route path="/admin/invoices" element={<AdminInvoices />} />
            <Route path="/admin/invoices/:id" element={<AdminInvoiceDetail />} />
            <Route path="/admin/documents" element={<AdminDocuments />} />
            <Route path="/admin/messages" element={<AdminMessages />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
          </Route>

          <Route
            element={
              <RequireRole role="parent">
                <ParentLayout />
              </RequireRole>
            }
          >
            <Route path="/parent" element={<Navigate to="/parent/dashboard" replace />} />
            <Route path="/parent/dashboard" element={<ParentDashboard />} />
            <Route path="/parent/children" element={<ParentChildren />} />
            <Route path="/parent/children/:id" element={<ParentChildDetail />} />
            <Route path="/parent/daily-reports" element={<ParentDailyReports />} />
            <Route path="/parent/daily-reports/:childId" element={<ParentDailyReports />} />
            <Route path="/parent/attendance" element={<ParentAttendance />} />
            <Route path="/parent/billing" element={<ParentBilling />} />
            <Route path="/parent/invoices/:id" element={<ParentInvoiceDetail />} />
            <Route path="/parent/documents" element={<ParentDocuments />} />
            <Route path="/parent/messages" element={<ParentMessages />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteMeta />
      <AnimatedRoutes />
      <ToastHost />
    </BrowserRouter>
  )
}

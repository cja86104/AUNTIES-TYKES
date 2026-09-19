import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore'
import type { Role } from '../types'

export interface RequireRoleProps {
  role: Role
  children: ReactNode
}

export function RequireRole({ role, children }: RequireRoleProps) {
  const user = useStore((s) => s.user)
  const ready = useStore((s) => s.ready)
  const location = useLocation()

  /*
   * On a hard refresh in live mode the Supabase session is restored
   * asynchronously, so `user` is briefly null for someone who is in fact
   * signed in. Redirecting on that would bounce them to /login on every
   * reload, so hold the route until bootstrap has settled.
   */
  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#3F8570]" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/parent/dashboard'} replace />
  }
  return <>{children}</>
}

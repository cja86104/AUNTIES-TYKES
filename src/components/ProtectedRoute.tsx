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
  const location = useLocation()

  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/parent/dashboard'} replace />
  }
  return <>{children}</>
}

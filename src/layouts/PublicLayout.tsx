import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'

export default function PublicLayout() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#FBFAF7]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden">
        <span className="at-blob left-[-6rem] top-[-8rem] h-80 w-80 bg-[#4F77D9]/25" />
        <span className="at-blob right-[-4rem] top-[2rem] h-72 w-72 bg-[#F5B942]/30" style={{ animationDelay: '2s' }} />
        <span className="at-blob left-[38%] top-[6rem] h-64 w-64 bg-[#5DC4A6]/25" style={{ animationDelay: '4s' }} />
      </div>
      <PublicNav />
      <main className="relative flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  )
}
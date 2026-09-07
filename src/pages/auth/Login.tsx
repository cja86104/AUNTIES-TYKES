import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { ArrowLeft, LogIn, ShieldCheck, AlertTriangle, Sparkles, KeyRound } from 'lucide-react'
import { Button, Card, Field, Input, Badge } from '../../components/ui'
import type { Tone } from '../../components/ui'
import { useStore } from '../../store/useStore'
import type { Role } from '../../types'

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const schema = z.object({
  email: z.string().regex(emailRe, 'Enter a valid email address'),
  password: z.string().min(4, 'Passwords are at least 4 characters'),
})

type LoginValues = z.infer<typeof schema>

/**
 * react-router types `location.state` as `any`. Narrow it properly rather than
 * trusting whatever the previous route put there.
 */
function redirectTargetFrom(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null || !('from' in state)) return undefined
  const from: unknown = state.from
  return typeof from === 'string' && from.startsWith('/') ? from : undefined
}

interface DemoAccount {
  label: string
  email: string
  password: string
  tone: Tone
}

const demos: DemoAccount[] = [
  { label: 'Owner / Director', email: 'auntie@auntiestykes.com', password: 'tykes2024', tone: 'blue' },
  { label: 'Parent (Brooks family)', email: 'maya@example.com', password: 'parent123', tone: 'green' },
  { label: 'Parent (Okafor family)', email: 'daniel@example.com', password: 'parent123', tone: 'amber' },
]

export default function Login() {
  const user = useStore((s) => s.user)
  const login = useStore((s) => s.login)
  const pushToast = useStore((s) => s.pushToast)
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState('')

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  if (user) {
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/parent/dashboard'} replace />
  }

  const destinationFor = (role: Role): string => {
    const from = redirectTargetFrom(location.state)
    if (role === 'admin') return from?.startsWith('/admin') ? from : '/admin/dashboard'
    return from?.startsWith('/parent') ? from : '/parent/dashboard'
  }

  const onSubmit = async (values: LoginValues) => {
    setFormError('')
    await new Promise((r) => setTimeout(r, 600))
    const res = login(values.email, values.password)
    if (!res.ok) {
      setFormError(res.error)
      pushToast({ tone: 'error', title: 'Sign-in failed', description: res.error })
      return
    }
    pushToast({
      title: `Welcome back, ${res.user.name.split(' ')[0]}`,
      description: res.user.role === 'admin' ? 'Opening the admin console.' : 'Opening your family portal.',
    })
    navigate(destinationFor(res.user.role), { replace: true })
  }

  const fill = (d: DemoAccount) => {
    setValue('email', d.email, { shouldValidate: true })
    setValue('password', d.password, { shouldValidate: true })
    setFormError('')
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#FBFAF7]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="at-blob left-[-6rem] top-[-6rem] h-80 w-80 bg-[#4F77D9]/25" />
        <span className="at-blob right-[-4rem] top-[10rem] h-72 w-72 bg-[#F5B942]/30" style={{ animationDelay: '2s' }} />
        <span className="at-blob left-[30%] bottom-[-6rem] h-72 w-72 bg-[#5DC4A6]/25" style={{ animationDelay: '4s' }} />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-8 lg:px-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-[#4F77D9]"
        >
          <ArrowLeft size={15} /> Back to auntiestykes.com
        </Link>

        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4F77D9] to-[#5DC4A6]">
                <span className="font-display text-lg font-black text-white">AT</span>
              </span>
              <div>
                <p className="font-display text-lg font-extrabold text-slate-900">Aunties Tykes</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Family portal</p>
              </div>
            </div>

            <h1 className="mt-8 font-display text-3xl font-black leading-tight tracking-tight text-slate-900 sm:text-4xl">
              Daily reports, invoices, and messages — all in one place.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-slate-600">
              Parents sign in to see today's meals, naps, photos, and statements. Directors sign in to run the whole
              house.
            </p>

            <div className="mt-9 overflow-hidden rounded-2xl border border-slate-200 bg-white/80 backdrop-blur">
              <div className="h-48 w-full overflow-hidden bg-slate-100">
                <img
                  data-aiwp-slot="5"
                  src="https://placehold.co/900x480/EAF0FC/3960BE?text=Inside+the+parent+portal"
                  alt="Preview of the Aunties Tykes parent portal"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="flex items-center gap-2.5 px-5 py-4 text-xs font-semibold text-slate-500">
                <ShieldCheck size={15} className="text-[#5DC4A6]" />
                Demo build — data lives only in this browser.
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
            <Card className="p-7 sm:p-9">
              <h2 className="font-display text-2xl font-extrabold text-slate-900">Sign in</h2>
              <p className="mt-1.5 text-sm text-slate-500">Use your family email, or try a demo account below.</p>

              <form
                onSubmit={(e) => {
                  void handleSubmit(onSubmit)(e)
                }}
                className="mt-7 space-y-5"
                noValidate
              >
                <Field label="Email" error={errors.email?.message}>
                  <Input
                    type="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    invalid={!!errors.email}
                    {...register('email')}
                  />
                </Field>
                <Field label="Password" error={errors.password?.message}>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    invalid={!!errors.password}
                    {...register('password')}
                  />
                </Field>

                {formError && (
                  <motion.p
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2.5 rounded-xl bg-rose-50 p-3.5 text-sm text-rose-700"
                  >
                    <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                    {formError}
                  </motion.p>
                )}

                <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Signing in…' : 'Sign in'} <LogIn size={17} />
                </Button>
              </form>

              <div className="mt-8 border-t border-slate-200 pt-6">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Sparkles size={14} className="text-[#F5B942]" /> Demo logins
                </p>
                <div className="mt-3.5 space-y-2.5">
                  {demos.map((d) => (
                    <button
                      key={d.email}
                      type="button"
                      onClick={() => fill(d)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-[#4F77D9] hover:bg-[#4F77D9]/5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900">{d.label}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {d.email} · {d.password}
                        </span>
                      </span>
                      <Badge tone={d.tone}>
                        <KeyRound size={12} /> Use
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
import { useEffect, useState } from 'react'
import { KeyRound, Copy, RefreshCw, Baby, ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { Button, Card, Field, Input, Modal, Select, Badge } from './ui'
import { useStore, makeTempPassword } from '../store/useStore'
import type { PortalCredentials } from '../types'

export interface ParentAccountDialogProps {
  open: boolean
  onClose: () => void
  /** Lock the dialog to one family (used from a family's own page). */
  fixedFamilyId?: string
}

type Errors = Partial<Record<'familyId' | 'name' | 'email' | 'password', string>>

/**
 * Creates a parent portal account. Shared by the Families list and a family's
 * own page so both entry points behave identically.
 *
 * No one can self-register — this dialog is the only way an account is made,
 * alongside approving an enrollment.
 */
export default function ParentAccountDialog({ open, onClose, fixedFamilyId }: ParentAccountDialogProps) {
  const families = useStore((s) => s.families)
  const children = useStore((s) => s.children)
  const users = useStore((s) => s.users)
  const createParentLogin = useStore((s) => s.createParentLogin)
  const pushToast = useStore((s) => s.pushToast)

  const [familyId, setFamilyId] = useState(fixedFamilyId ?? '')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [autoGenerate, setAutoGenerate] = useState(true)
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [created, setCreated] = useState<PortalCredentials | null>(null)

  const family = families.find((f) => f.id === familyId)
  // A user is linked to a family, so these are the children the account will see.
  const linkedChildren = children.filter((c) => c.familyId === familyId)
  const existingAccounts = users.filter((u) => u.role === 'parent' && u.familyId === familyId)

  // Reset each time the dialog opens, and prefill from the chosen family.
  useEffect(() => {
    if (!open) return
    setFamilyId(fixedFamilyId ?? '')
    setName('')
    setEmail('')
    setAutoGenerate(true)
    setPassword('')
    setReveal(false)
    setErrors({})
    setCreated(null)
  }, [open, fixedFamilyId])

  // Suggest the family's contact details once a family is picked.
  useEffect(() => {
    if (!family) return
    setName((n) => n || family.primaryContact)
    setEmail((e) => e || family.email)
  }, [family])

  const submit = () => {
    const next: Errors = {}
    if (!familyId) next.familyId = 'Choose a family'
    if (name.trim().length < 2) next.name = "Enter the guardian's name"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address'
    if (!autoGenerate && password.trim().length < 8) next.password = 'Use at least 8 characters'
    setErrors(next)
    if (Object.keys(next).length) return

    const credentials = createParentLogin(
      familyId,
      name.trim(),
      email.trim(),
      autoGenerate ? undefined : password.trim(),
    )

    if (!credentials) {
      setErrors({ email: 'An account already uses that email address' })
      return
    }
    setCreated(credentials)
    pushToast({
      title: 'Parent account created',
      description: `${name.trim()} can now sign in to the ${family?.name ?? 'family'} portal.`,
    })
  }

  const copyCredentials = () => {
    if (!created) return
    const text = [
      `Parent login for the ${family?.name ?? 'family'}`,
      `Email: ${created.email}`,
      `Password: ${created.password}`,
      '',
      'Please keep these somewhere safe and change the password after signing in.',
    ].join('\n')
    navigator.clipboard.writeText(text).then(
      () => pushToast({ title: 'Credentials copied', description: 'Paste them into a text or email.' }),
      () => pushToast({ tone: 'error', title: 'Could not copy', description: 'Select the details and copy manually.' }),
    )
  }

  if (created) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Account created"
        description="These are shown once — copy them before closing."
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <div className="space-y-4">
          <Card className="bg-slate-50 p-5">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <KeyRound size={13} /> Parent login for the {family?.name ?? 'family'}
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Email</dt>
                <dd className="font-semibold text-slate-900">{created.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Password</dt>
                <dd className="font-mono font-semibold text-slate-900">{created.password}</dd>
              </div>
            </dl>
            <Button size="sm" variant="outline" className="mt-4 w-full" onClick={copyCredentials}>
              <Copy size={14} /> Copy to share
            </Button>
          </Card>

          {linkedChildren.length > 0 && (
            <div className="rounded-2xl bg-[#E6F6F0]/60 p-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1f6152]">
                <Baby size={13} /> This account can see
              </p>
              <p className="mt-1.5 text-sm text-slate-700">
                {linkedChildren.map((c) => c.name).join(', ')} — their daily reports, attendance, invoices, and documents.
              </p>
            </div>
          )}

          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            <strong className="font-semibold">Share this securely.</strong> This preview build has no email sending
            connected, so nothing was sent automatically — pass it along by text or in person. The password is not shown
            again after you close this.
          </p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a parent account"
      description="Only you can make accounts — families cannot sign themselves up."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <KeyRound size={16} /> Create account
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!fixedFamilyId && (
          <Field label="Family" error={errors.familyId}>
            <Select value={familyId} invalid={Boolean(errors.familyId)} onChange={(e) => setFamilyId(e.target.value)}>
              <option value="">Select a family…</option>
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {family && (
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Baby size={13} /> Linked children
            </p>
            {linkedChildren.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {linkedChildren.map((c) => (
                  <Badge key={c.id} tone="blue">
                    {c.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-slate-500">
                No children on this family yet — add one and this account will pick them up automatically.
              </p>
            )}
            {existingAccounts.length > 0 && (
              <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
                <ShieldCheck size={13} className="mt-0.5 shrink-0" />
                {existingAccounts.length === 1 ? 'One account already exists' : `${existingAccounts.length} accounts already exist`}{' '}
                for this family ({existingAccounts.map((u) => u.email).join(', ')}). Adding another is fine — useful when
                both guardians want their own login.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Guardian name" error={errors.name}>
            <Input
              value={name}
              invalid={Boolean(errors.name)}
              onChange={(e) => setName(e.target.value)}
              placeholder="Maya Brooks"
            />
          </Field>
          <Field label="Email" error={errors.email} hint="This is their username.">
            <Input
              type="email"
              value={email}
              invalid={Boolean(errors.email)}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maya@example.com"
            />
          </Field>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={autoGenerate}
              onChange={(e) => setAutoGenerate(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-[#4F77D9]"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Generate a password for me</span>
              <span className="block text-xs text-slate-500">
                Easy to read over the phone, shown once after you save.
              </span>
            </span>
          </label>

          {!autoGenerate && (
            <div className="mt-4">
              <Field label="Password" error={errors.password} hint="At least 8 characters.">
                <div className="relative">
                  <Input
                    type={reveal ? 'text' : 'password'}
                    value={password}
                    invalid={Boolean(errors.password)}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-20"
                    placeholder="AuntiesTykes2026!"
                  />
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
                    <button
                      type="button"
                      onClick={() => setReveal((r) => !r)}
                      aria-label={reveal ? 'Hide password' : 'Show password'}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPassword(makeTempPassword())
                        setReveal(true)
                      }}
                      aria-label="Suggest a password"
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#4F77D9]"
                    >
                      <RefreshCw size={15} />
                    </button>
                  </div>
                </div>
              </Field>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

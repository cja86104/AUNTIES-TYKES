import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, CheckCircle2, Plus, Trash2, Phone, Send } from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import { Badge, Button, Card, Field, Input, Select, Textarea } from '../../components/ui'
import { useStore } from '../../store/useStore'
import { uid, todayISO, fmtDate } from '../../lib/helpers'
import type { AgeGroup, Contact, EnrollmentChildDraft } from '../../types'

const AGE_GROUPS: AgeGroup[] = ['Infant', 'Toddler', 'Preschool']
const PLANS = ['Full-time', 'Part-time (M/W/F)', 'Part-time (T/Th)', 'Drop-in as needed']

const STEPS = [
  { n: 1, label: 'Your family' },
  { n: 2, label: 'Your children' },
  { n: 3, label: 'Emergency & review' },
] as const

const blankChild = (): EnrollmentChildDraft => ({
  id: uid('kid'),
  name: '',
  dob: '',
  ageGroup: 'Toddler',
  plan: 'Full-time',
  startDate: '',
  allergies: '',
  medications: '',
  notes: '',
})

const blankContact = (): Contact => ({ name: '', relation: '', phone: '' })

type Errors = Record<string, string>

export default function Enroll() {
  const submitEnrollment = useStore((s) => s.submitEnrollment)
  const settings = useStore((s) => s.settings)
  const pushToast = useStore((s) => s.pushToast)

  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [errors, setErrors] = useState<Errors>({})

  const [familyName, setFamilyName] = useState('')
  const [primaryContact, setPrimaryContact] = useState('')
  const [relation, setRelation] = useState('Mother')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [secondary, setSecondary] = useState<Contact>(blankContact())
  const [children, setChildren] = useState<EnrollmentChildDraft[]>([blankChild()])
  const [emergency, setEmergency] = useState<Contact[]>([blankContact()])
  const [notes, setNotes] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  const setChild = (id: string, key: keyof EnrollmentChildDraft, value: string) =>
    setChildren((cs) => cs.map((c) => (c.id === id ? { ...c, [key]: value } : c)))

  const setEmergencyAt = (i: number, key: keyof Contact, value: string) =>
    setEmergency((es) => es.map((e, idx) => (idx === i ? { ...e, [key]: value } : e)))

  /** Suggest "Brooks Family" once we know the guardian's name. */
  const onGuardianBlur = () => {
    if (familyName.trim()) return
    const parts = primaryContact.trim().split(' ').filter(Boolean)
    const last = parts[parts.length - 1]
    if (last) setFamilyName(`${last} Family`)
  }

  const validateStep1 = () => {
    const e: Errors = {}
    if (primaryContact.trim().length < 2) e.primaryContact = 'Please enter your full name'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email address'
    if (phone.trim().length < 7) e.phone = 'Enter a phone number we can reach you at'
    if (address.trim().length < 6) e.address = 'Enter your home address'
    if (familyName.trim().length < 2) e.familyName = 'What should we call your family?'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const validateStep2 = () => {
    const e: Errors = {}
    children.forEach((c, i) => {
      if (c.name.trim().length < 2) e[`child-${i}-name`] = "Enter your child's name"
      if (!c.dob) e[`child-${i}-dob`] = 'Date of birth is required'
      if (!c.startDate) e[`child-${i}-startDate`] = 'When would you like to start?'
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const validateStep3 = () => {
    const e: Errors = {}
    const first = emergency[0]
    if (!first || first.name.trim().length < 2) e['emg-0-name'] = 'One emergency contact is required'
    if (!first || first.phone.trim().length < 7) e['emg-0-phone'] = 'Add a phone number'
    if (!acknowledged) e.acknowledged = 'Please confirm you have read the parent handbook and policies'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const next = () => {
    const ok = step === 1 ? validateStep1() : validateStep2()
    if (!ok) return
    setStep((s) => s + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const back = () => {
    setErrors({})
    setStep((s) => s - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = () => {
    if (!validateStep3()) return
    setSubmitting(true)
    window.setTimeout(() => {
      submitEnrollment({
        familyName: familyName.trim(),
        primaryContact: primaryContact.trim(),
        relation,
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        secondary,
        emergency: emergency.filter((c) => c.name.trim() && c.phone.trim()),
        children: children.map((c) => ({ ...c, name: c.name.trim() })),
        notes: notes.trim(),
        acknowledgedHandbook: acknowledged,
      })
      setSubmitting(false)
      setDone(true)
      pushToast({ title: 'Enrollment sent', description: 'Auntie Roz will review it and get back to you.' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 700)
  }

  if (done) {
    return (
      <PageTransition>
        <section className="px-5 py-20 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-2xl text-center"
          >
            <span className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#E6F6F0] to-[#EAF0FC] text-[#2E8C72]">
              <CheckCircle2 size={38} />
            </span>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Thank you, {primaryContact.split(' ')[0]}.
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              Your enrollment form is with {settings.director.split('"')[0].trim() || 'Auntie Roz'}. She reviews these
              personally, usually within two business days, and will call you at{' '}
              <strong className="font-semibold text-slate-800">{phone}</strong> to confirm your start date.
            </p>
            <Card className="mt-8 p-6 text-left">
              <h2 className="font-display text-base font-bold text-slate-900">What happens next</h2>
              <ol className="mt-4 space-y-3 text-sm text-slate-600">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4F77D9]/10 text-xs font-bold text-[#39569f]">1</span>
                  She reviews your form and confirms a spot in the right age group.
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4F77D9]/10 text-xs font-bold text-[#39569f]">2</span>
                  You get a parent portal login for daily reports, invoices, and documents.
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4F77D9]/10 text-xs font-bold text-[#39569f]">3</span>
                  We schedule a gentle first week — usually two half days to start.
                </li>
              </ol>
            </Card>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button as={Link} to="/" variant="outline">
                Back to the site
              </Button>
              <Button as={Link} to="/faq">
                Read common questions
              </Button>
            </div>
          </motion.div>
        </section>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <section className="relative overflow-hidden px-5 pb-6 pt-14 lg:px-8">
        <div className="at-blob h-72 w-72 bg-[#F5B942]/30" style={{ top: '-4rem', right: '-3rem' }} />
        <div className="relative mx-auto max-w-3xl text-center">
          <Badge tone="blue">Enrollment</Badge>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Let’s get your little one enrolled
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Takes about five minutes. Everything here goes straight to {settings.businessName} — nothing is shared, and
            you can call us at{' '}
            <a href={`tel:${settings.phone}`} className="font-semibold text-[#4F77D9] hover:underline">
              {settings.phone}
            </a>{' '}
            if you would rather do this together.
          </p>
        </div>
      </section>

      <section className="px-5 pb-20 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <ol className="mb-8 flex items-center justify-center gap-2 sm:gap-4">
            {STEPS.map((s, i) => {
              const state = step === s.n ? 'current' : step > s.n ? 'done' : 'todo'
              return (
                <li key={s.n} className="flex items-center gap-2 sm:gap-4">
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-all ${
                        state === 'current'
                          ? 'bg-[#4F77D9] text-white shadow-[0_10px_24px_-12px_rgba(79,119,217,0.9)]'
                          : state === 'done'
                            ? 'bg-[#5DC4A6]/20 text-[#25705c]'
                            : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {state === 'done' ? <CheckCircle2 size={17} /> : s.n}
                    </span>
                    <span
                      className={`hidden text-sm font-semibold sm:block ${
                        state === 'todo' ? 'text-slate-400' : 'text-slate-800'
                      }`}
                    >
                      {s.label}
                    </span>
                  </span>
                  {i < STEPS.length - 1 && <span className="h-px w-6 bg-slate-200 sm:w-10" />}
                </li>
              )
            })}
          </ol>

          <Card className="p-6 sm:p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.28 }}
              >
                {step === 1 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="font-display text-xl font-extrabold text-slate-900">About your family</h2>
                      <p className="mt-1 text-sm text-slate-500">The grown-ups we will be talking with every day.</p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Your full name *" error={errors.primaryContact}>
                        <Input
                          value={primaryContact}
                          invalid={Boolean(errors.primaryContact)}
                          onChange={(e) => setPrimaryContact(e.target.value)}
                          onBlur={onGuardianBlur}
                          placeholder="Maya Brooks"
                          autoComplete="name"
                        />
                      </Field>
                      <Field label="You are the child’s…">
                        <Select value={relation} onChange={(e) => setRelation(e.target.value)}>
                          <option>Mother</option>
                          <option>Father</option>
                          <option>Grandparent</option>
                          <option>Legal guardian</option>
                          <option>Other</option>
                        </Select>
                      </Field>
                      <Field label="Email *" error={errors.email} hint="This becomes your parent portal login.">
                        <Input
                          type="email"
                          value={email}
                          invalid={Boolean(errors.email)}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="maya@example.com"
                          autoComplete="email"
                        />
                      </Field>
                      <Field label="Phone *" error={errors.phone}>
                        <Input
                          type="tel"
                          value={phone}
                          invalid={Boolean(errors.phone)}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="(919) 555-0142"
                          autoComplete="tel"
                        />
                      </Field>
                      <Field label="Home address *" error={errors.address} className="sm:col-span-2">
                        <Input
                          value={address}
                          invalid={Boolean(errors.address)}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="218 Larkspur Lane, Durham, NC 27705"
                          autoComplete="street-address"
                        />
                      </Field>
                      <Field label="Family name *" error={errors.familyName} hint="How we label your file and invoices." className="sm:col-span-2">
                        <Input
                          value={familyName}
                          invalid={Boolean(errors.familyName)}
                          onChange={(e) => setFamilyName(e.target.value)}
                          placeholder="Brooks Family"
                        />
                      </Field>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-5">
                      <h3 className="font-display text-base font-bold text-slate-900">Second guardian</h3>
                      <p className="mt-1 text-sm text-slate-500">Optional — anyone else with pickup rights.</p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        <Field label="Name">
                          <Input value={secondary.name} onChange={(e) => setSecondary({ ...secondary, name: e.target.value })} placeholder="Andre Brooks" />
                        </Field>
                        <Field label="Relation">
                          <Input value={secondary.relation} onChange={(e) => setSecondary({ ...secondary, relation: e.target.value })} placeholder="Father" />
                        </Field>
                        <Field label="Phone">
                          <Input value={secondary.phone} onChange={(e) => setSecondary({ ...secondary, phone: e.target.value })} placeholder="(919) 555-0188" />
                        </Field>
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="font-display text-xl font-extrabold text-slate-900">Your children</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Add each child you are enrolling. Allergies and medications matter — please be thorough.
                      </p>
                    </div>

                    {children.map((c, i) => (
                      <div key={c.id} className="rounded-2xl border border-slate-200 p-5">
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="font-display text-base font-bold text-slate-900">
                            Child {i + 1}
                            {c.name.trim() ? ` — ${c.name.trim()}` : ''}
                          </h3>
                          {children.length > 1 && (
                            <button
                              onClick={() => setChildren((cs) => cs.filter((x) => x.id !== c.id))}
                              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                              aria-label={`Remove child ${i + 1}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Full name *" error={errors[`child-${i}-name`]}>
                            <Input
                              value={c.name}
                              invalid={Boolean(errors[`child-${i}-name`])}
                              onChange={(e) => setChild(c.id, 'name', e.target.value)}
                              placeholder="Ellie Brooks"
                            />
                          </Field>
                          <Field label="Date of birth *" error={errors[`child-${i}-dob`]}>
                            <Input
                              type="date"
                              max={todayISO()}
                              value={c.dob}
                              invalid={Boolean(errors[`child-${i}-dob`])}
                              onChange={(e) => setChild(c.id, 'dob', e.target.value)}
                            />
                          </Field>
                          <Field label="Age group">
                            <Select value={c.ageGroup} onChange={(e) => setChild(c.id, 'ageGroup', e.target.value)}>
                              {AGE_GROUPS.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Schedule">
                            <Select value={c.plan} onChange={(e) => setChild(c.id, 'plan', e.target.value)}>
                              {PLANS.map((pl) => (
                                <option key={pl} value={pl}>
                                  {pl}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Preferred start date *" error={errors[`child-${i}-startDate`]}>
                            <Input
                              type="date"
                              value={c.startDate}
                              invalid={Boolean(errors[`child-${i}-startDate`])}
                              onChange={(e) => setChild(c.id, 'startDate', e.target.value)}
                            />
                          </Field>
                          <Field label="Allergies" hint="Separate with commas, or leave blank.">
                            <Input
                              value={c.allergies}
                              onChange={(e) => setChild(c.id, 'allergies', e.target.value)}
                              placeholder="Peanuts, strawberries"
                            />
                          </Field>
                          <Field label="Medications" hint="Separate with commas." className="sm:col-span-2">
                            <Input
                              value={c.medications}
                              onChange={(e) => setChild(c.id, 'medications', e.target.value)}
                              placeholder="EpiPen Jr., albuterol inhaler"
                            />
                          </Field>
                          <Field label="Anything we should know?" className="sm:col-span-2">
                            <Textarea
                              rows={3}
                              value={c.notes}
                              onChange={(e) => setChild(c.id, 'notes', e.target.value)}
                              placeholder="Naps best with her yellow blanket. Still working on sharing."
                            />
                          </Field>
                        </div>
                      </div>
                    ))}

                    <Button variant="outline" onClick={() => setChildren((cs) => [...cs, blankChild()])}>
                      <Plus size={16} /> Add another child
                    </Button>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="font-display text-xl font-extrabold text-slate-900">Emergency contacts</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        People we can call if we cannot reach you. At least one is required by our license.
                      </p>
                    </div>

                    {emergency.map((c, i) => (
                      <div key={i} className="rounded-2xl border border-slate-200 p-5">
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="flex items-center gap-2 font-display text-base font-bold text-slate-900">
                            <Phone size={15} className="text-slate-400" /> Contact {i + 1}
                            {i === 0 && <span className="text-xs font-semibold text-rose-600">required</span>}
                          </h3>
                          {emergency.length > 1 && (
                            <button
                              onClick={() => setEmergency((es) => es.filter((_, idx) => idx !== i))}
                              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                              aria-label={`Remove emergency contact ${i + 1}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <Field label="Name" error={i === 0 ? errors['emg-0-name'] : undefined}>
                            <Input
                              value={c.name}
                              invalid={i === 0 && Boolean(errors['emg-0-name'])}
                              onChange={(e) => setEmergencyAt(i, 'name', e.target.value)}
                              placeholder="Gwen Brooks"
                            />
                          </Field>
                          <Field label="Relation">
                            <Input value={c.relation} onChange={(e) => setEmergencyAt(i, 'relation', e.target.value)} placeholder="Grandmother" />
                          </Field>
                          <Field label="Phone" error={i === 0 ? errors['emg-0-phone'] : undefined}>
                            <Input
                              value={c.phone}
                              invalid={i === 0 && Boolean(errors['emg-0-phone'])}
                              onChange={(e) => setEmergencyAt(i, 'phone', e.target.value)}
                              placeholder="(919) 555-0119"
                            />
                          </Field>
                        </div>
                      </div>
                    ))}

                    {emergency.length < 3 && (
                      <Button variant="outline" onClick={() => setEmergency((es) => [...es, blankContact()])}>
                        <Plus size={16} /> Add another contact
                      </Button>
                    )}

                    <Field label="Anything else for Auntie Roz?" hint="Optional.">
                      <Textarea
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="We prefer text updates. Dad handles Friday pickups."
                      />
                    </Field>

                    <div className="rounded-2xl bg-slate-50 p-5">
                      <h3 className="font-display text-base font-bold text-slate-900">Review</h3>
                      <dl className="mt-3 space-y-1.5 text-sm">
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">Family</dt>
                          <dd className="text-right font-semibold text-slate-800">{familyName || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">Guardian</dt>
                          <dd className="text-right font-semibold text-slate-800">
                            {primaryContact || '—'} ({relation})
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">Reach you at</dt>
                          <dd className="text-right font-semibold text-slate-800">{email || '—'} · {phone || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-slate-500">Children</dt>
                          <dd className="text-right font-semibold text-slate-800">
                            {children
                              .filter((c) => c.name.trim())
                              .map((c) => `${c.name.trim()} (${c.ageGroup}${c.startDate ? `, from ${fmtDate(c.startDate, 'MMM d')}` : ''})`)
                              .join(' · ') || '—'}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-[#4F77D9]">
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-[#4F77D9]"
                      />
                      <span className="text-sm text-slate-700">
                        I have read the{' '}
                        <Link to="/tuition-policies" className="font-semibold text-[#4F77D9] hover:underline">
                          tuition and policies
                        </Link>{' '}
                        — including the sick policy, late pickup fee, and holiday closures — and the information above is
                        accurate.
                        {errors.acknowledged && (
                          <span className="mt-1 block text-xs font-medium text-rose-600">{errors.acknowledged}</span>
                        )}
                      </span>
                    </label>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-6">
              {step > 1 ? (
                <Button variant="ghost" onClick={back}>
                  <ArrowLeft size={16} /> Back
                </Button>
              ) : (
                <Button as={Link} to="/contact" variant="ghost">
                  <ArrowLeft size={16} /> Just a tour instead
                </Button>
              )}

              {step < 3 ? (
                <Button onClick={next}>
                  Continue <ArrowRight size={16} />
                </Button>
              ) : (
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send size={16} /> Submit enrollment
                    </>
                  )}
                </Button>
              )}
            </div>
          </Card>

          <p className="mt-6 text-center text-xs text-slate-500">
            Licensed {settings.licenseNumber} · {settings.address}
          </p>
        </div>
      </section>
    </PageTransition>
  )
}

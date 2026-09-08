import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { MapPin, Mail, Clock, Send, CheckCircle2, CalendarCheck, ArrowRight, ShieldCheck } from 'lucide-react'
import PageTransition, { Reveal } from '../../components/PageTransition'
import { Button, Card, Field, Input, Textarea, Select, Badge } from '../../components/ui'
import { useStore } from '../../store/useStore'

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const schema = z.object({
  parentName: z.string().min(2, 'Please tell us your name'),
  email: z.string().regex(emailRe, 'Enter a valid email address'),
  phone: z.string().min(7, 'Enter a phone number we can reach you at'),
  childAges: z.string().min(1, "Let us know your child's age"),
  program: z.string().optional(),
  startDate: z.string().optional(),
  message: z.string().min(10, 'A sentence or two helps us prepare for your visit').max(1200, 'That is a bit long — trim it down'),
})

type ContactValues = z.infer<typeof schema>

export default function Contact() {
  const settings = useStore((s) => s.settings)
  const addLead = useStore((s) => s.addLead)
  const pushToast = useStore((s) => s.pushToast)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      parentName: '',
      email: '',
      phone: '',
      childAges: '',
      program: 'Toddlers',
      startDate: '',
      message: '',
    },
  })

  const onSubmit = async (values: ContactValues) => {
    try {
      await new Promise((r) => setTimeout(r, 700))
      addLead({
        parentName: values.parentName,
        email: values.email,
        phone: values.phone,
        childAges: values.childAges,
        message: `[${values.program || 'Any program'}] ${values.message}`,
        tourDate: values.startDate || '',
      })
      setSent(true)
      reset()
      pushToast({
        title: 'Inquiry sent',
        description: 'Mellissa will reply within one business day.',
      })
    } catch {
      pushToast({
        tone: 'error',
        title: 'That did not go through',
        description: 'Please try again, or email us at ' + settings.email + '.',
      })
    }
  }

  return (
    <PageTransition>
      <section className="px-5 pb-8 pt-10 lg:px-8 lg:pt-16">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#5DC4A6]/40 bg-white/70 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#25705c] backdrop-blur">
            <CalendarCheck size={14} /> Now welcoming new families
          </span>
          <h1 className="mt-6 font-display text-4xl font-black leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
            Let's find your child a spot.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Tell us a little about your family. We will reply with real availability and an honest waitlist
            position — usually within one business day.
          </p>
        </div>
      </section>

      <section className="px-5 py-10 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.25fr_1fr]">
          <Reveal>
            <Card className="p-7 sm:p-9">
              {sent ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center py-10 text-center"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#5DC4A6]/15 text-[#2E8C72]">
                    <CheckCircle2 size={30} />
                  </span>
                  <h2 className="mt-5 font-display text-2xl font-extrabold text-slate-900">Thank you — it's in.</h2>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600">
                    Your inquiry landed in our admin inbox. You will hear from {settings.director.split(' ')[0]} within
                    one business day. If it is urgent, email {settings.email} and we will get back to you as soon as we can.
                  </p>
                  <div className="mt-7 flex flex-wrap justify-center gap-3">
                    <Button variant="outline" onClick={() => setSent(false)}>
                      Send another message
                    </Button>
                    <Button as={Link} to="/">
                      Back to home <ArrowRight size={16} />
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <>
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#5DC4A6]/40 bg-[#E6F6F0]/50 p-4">
                  <p className="text-sm text-slate-700">
                    <strong className="font-semibold text-slate-900">Already spoken with Mellissa?</strong> Skip ahead and
                    fill out the enrollment form.
                  </p>
                  <Button as={Link} to="/enroll" size="sm" variant="accent">
                    Start enrollment <ArrowRight size={14} />
                  </Button>
                </div>

                <form
                  onSubmit={(e) => {
                    void handleSubmit(onSubmit)(e)
                  }}
                  noValidate
                >
                  <h2 className="font-display text-xl font-extrabold text-slate-900">Send an inquiry</h2>
                  <p className="mt-1.5 text-sm text-slate-500">
                    Fields marked with an asterisk are required. We never share your information.
                  </p>

                  <div className="mt-6 grid gap-5 sm:grid-cols-2">
                    <Field label="Your name *" error={errors.parentName?.message}>
                      <Input placeholder="Jordan Rivera" invalid={!!errors.parentName} {...register('parentName')} />
                    </Field>
                    <Field label="Email *" error={errors.email?.message}>
                      <Input type="email" placeholder="you@example.com" invalid={!!errors.email} {...register('email')} />
                    </Field>
                    <Field label="Phone *" error={errors.phone?.message}>
                      <Input placeholder="(717) 555-0148" invalid={!!errors.phone} {...register('phone')} />
                    </Field>
                    <Field label="Child's age(s) *" error={errors.childAges?.message}>
                      <Input placeholder="18 months and 4 years" invalid={!!errors.childAges} {...register('childAges')} />
                    </Field>
                    <Field label="Program of interest">
                      <Select {...register('program')}>
                        <option>Infants</option>
                        <option>Toddlers</option>
                        <option>Preschool</option>
                        <option>Not sure yet</option>
                      </Select>
                    </Field>
                    <Field label="Ideal start date" hint="Approximate is fine">
                      <Input type="date" {...register('startDate')} />
                    </Field>
                    <Field label="Tell us about your family *" error={errors.message?.message} className="sm:col-span-2">
                      <Textarea
                        rows={5}
                        placeholder="Schedule needs, allergies, what you're looking for in care…"
                        invalid={!!errors.message}
                        {...register('message')}
                      />
                    </Field>
                  </div>

                  <div className="mt-7 flex flex-wrap items-center gap-4">
                    <Button type="submit" size="lg" disabled={isSubmitting}>
                      {isSubmitting ? 'Sending…' : 'Send inquiry'} <Send size={17} />
                    </Button>
                    <p className="text-xs text-slate-500">
                      This demo stores your inquiry locally so you can see it appear in the admin console.
                    </p>
                  </div>
                </form>
                </>
              )}
            </Card>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="space-y-6">
              <Card className="overflow-hidden">
                <div className="h-52 w-full overflow-hidden bg-slate-100">
                  <img
                    data-aiwp-slot="4"
                    src="https://images.unsplash.com/photo-1761061079517-2ff8192b2f02?auto=format&fit=crop&w=1200&q=80"
                    alt="A residential street near Aunties Tykes in Camp Hill, Pennsylvania"
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-6">
                  <h3 className="font-display text-lg font-bold text-slate-900">Visit us</h3>
                  <ul className="mt-4 space-y-3.5 text-sm text-slate-600">
                    <li className="flex gap-2.5">
                      <MapPin size={17} className="mt-0.5 shrink-0 text-[#4F77D9]" />
                      {settings.address}
                    </li>
                    <li className="flex gap-2.5">
                      <Mail size={17} className="mt-0.5 shrink-0 text-[#4F77D9]" />
                      <a className="transition hover:text-[#4F77D9]" href={`mailto:${settings.email}`}>
                        {settings.email}
                      </a>
                    </li>
                    <li className="flex gap-2.5">
                      <Clock size={17} className="mt-0.5 shrink-0 text-[#4F77D9]" />
                      {settings.hours}
                    </li>
                  </ul>
                  <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#5DC4A6]/10 px-3 py-2 text-xs font-semibold text-[#25705c]">
                    <ShieldCheck size={15} /> License {settings.licenseNumber}
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-display text-lg font-bold text-slate-900">Current availability</h3>
                <ul className="mt-4 space-y-3 text-sm">
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-slate-600">Infants</span>
                    <Badge tone="amber">Waitlist · January</Badge>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-slate-600">Toddlers</span>
                    <Badge tone="green">1 part-time spot</Badge>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-slate-600">Preschool</span>
                    <Badge tone="green">2 full-time spots</Badge>
                  </li>
                </ul>
                <p className="mt-5 text-xs leading-relaxed text-slate-500">
                  Availability changes quickly. We update this page the same week a spot opens or fills.
                </p>
              </Card>
            </div>
          </Reveal>
        </div>
      </section>
    </PageTransition>
  )
}
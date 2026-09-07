import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  Building2,
  Calculator,
  ScrollText,
  Save,
  RotateCcw,
  ExternalLink,
  Info,
} from 'lucide-react'
import PageTransition from '../../components/PageTransition'
import { Button, Card, Field, Input, Modal, PageHeader, Select, Tabs, Textarea } from '../../components/ui'
import { useStore } from '../../store/useStore'
import { money } from '../../lib/helpers'
import type { Policies, Rates, Settings } from '../../types'

type BusinessDraft = Omit<Settings, 'rates' | 'policies'>

const policyFields: { key: keyof Policies; label: string; hint: string }[] = [
  { key: 'sick', label: 'Illness & when to stay home', hint: 'Shown on the public Tuition & Policies page.' },
  { key: 'latePickup', label: 'Late pickup', hint: 'Explain the grace period and the per-minute fee.' },
  { key: 'holidays', label: 'Holidays & closures', hint: 'List the paid closure days families should plan around.' },
  { key: 'potty', label: 'Potty learning', hint: 'What you expect parents to send in during learning weeks.' },
]

const rateFields: { key: keyof Rates; label: string; hint: string; suffix: string }[] = [
  { key: 'fullTime', label: 'Full-time (weekly)', hint: 'Five days a week.', suffix: '/wk' },
  { key: 'partTime', label: 'Part-time (weekly)', hint: 'Three fixed days.', suffix: '/wk' },
  { key: 'dropIn', label: 'Drop-in (daily)', hint: 'When a spot is open.', suffix: '/day' },
  { key: 'registrationFee', label: 'Registration fee', hint: 'One time, at enrollment.', suffix: 'once' },
  { key: 'lateFeePerMinute', label: 'Late pickup fee', hint: 'Charged per minute past closing.', suffix: '/min' },
  { key: 'siblingDiscountPct', label: 'Sibling discount', hint: 'Percent off the second child.', suffix: '%' },
]

export default function AdminSettings() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const updateRates = useStore((s) => s.updateRates)
  const updatePolicies = useStore((s) => s.updatePolicies)
  const resetDemoData = useStore((s) => s.resetDemoData)
  const pushToast = useStore((s) => s.pushToast)

  const [tab, setTab] = useState<'business' | 'rates' | 'policies'>('business')
  const [confirmReset, setConfirmReset] = useState(false)

  const initialBusiness = useMemo<BusinessDraft>(() => {
    const { rates: _rates, policies: _policies, ...rest } = settings
    return rest
  }, [settings])

  const [business, setBusiness] = useState<BusinessDraft>(initialBusiness)
  const [rates, setRates] = useState<Rates>(settings.rates)
  const [policies, setPolicies] = useState<Policies>(settings.policies)

  // Re-sync the drafts whenever the stored settings change (including a demo reset).
  useEffect(() => setBusiness(initialBusiness), [initialBusiness])
  useEffect(() => setRates(settings.rates), [settings.rates])
  useEffect(() => setPolicies(settings.policies), [settings.policies])

  const businessDirty = JSON.stringify(business) !== JSON.stringify(initialBusiness)
  const ratesDirty = JSON.stringify(rates) !== JSON.stringify(settings.rates)
  const policiesDirty = JSON.stringify(policies) !== JSON.stringify(settings.policies)

  const setBiz = (key: keyof BusinessDraft, value: string | number) =>
    setBusiness((b) => ({ ...b, [key]: value }))

  const saveBusiness = () => {
    updateSettings(business)
    pushToast({ title: 'Business details saved', description: 'The public site and portal headers now use these.' })
  }

  const saveRates = () => {
    updateRates(rates)
    pushToast({ title: 'Rate card saved', description: 'The tuition estimator on the public site updates immediately.' })
  }

  const savePolicies = () => {
    updatePolicies(policies)
    pushToast({ title: 'Policies saved', description: 'Families see the new wording on the Tuition & Policies page.' })
  }

  const doReset = () => {
    resetDemoData()
    setConfirmReset(false)
    pushToast({ tone: 'info', title: 'Demo data reset', description: 'Every record is back to its starting state.' })
  }

  return (
    <PageTransition>
      <PageHeader
        title="Settings"
        description="Your business details, rate card, and policy wording — all of it feeds the public site."
        actions={
          <Button as={Link} to="/tuition-policies" variant="outline" target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> View public page
          </Button>
        }
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#4F77D9]/30 bg-[#4F77D9]/5 p-4 text-sm text-[#39569f]">
        <Info size={18} className="mt-0.5 shrink-0" />
        <p>
          These fields are live. Changing a rate here updates the tuition estimator on the public{' '}
          <Link to="/tuition-policies" className="font-semibold underline">
            Tuition &amp; Policies
          </Link>{' '}
          page, and policy edits change the text families read there.
        </p>
      </div>

      <div className="mb-6">
        <Tabs
          tabs={[
            { value: 'business', label: 'Business info' },
            { value: 'rates', label: 'Tuition rates' },
            { value: 'policies', label: 'Policies' },
          ]}
          value={tab}
          onChange={(v) => setTab(v as 'business' | 'rates' | 'policies')}
        />
      </div>

      {tab === 'business' && (
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4F77D9]/10 text-[#4F77D9]">
              <Building2 size={19} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Business information</h2>
              <p className="text-sm text-slate-500">Appears in the site footer, contact page, and invoices.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">
              <Input value={business.businessName} onChange={(e) => setBiz('businessName', e.target.value)} />
            </Field>
            <Field label="Director">
              <Input value={business.director} onChange={(e) => setBiz('director', e.target.value)} />
            </Field>
            <Field label="Tagline" className="sm:col-span-2">
              <Input value={business.tagline} onChange={(e) => setBiz('tagline', e.target.value)} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input value={business.address} onChange={(e) => setBiz('address', e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={business.phone} onChange={(e) => setBiz('phone', e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={business.email} onChange={(e) => setBiz('email', e.target.value)} />
            </Field>
            <Field label="Hours">
              <Input value={business.hours} onChange={(e) => setBiz('hours', e.target.value)} />
            </Field>
            <Field label="License number">
              <Input value={business.licenseNumber} onChange={(e) => setBiz('licenseNumber', e.target.value)} />
            </Field>
            <Field label="Licensed capacity" hint="Total children allowed on site at once.">
              <Select value={String(business.capacity)} onChange={(e) => setBiz('capacity', Number(e.target.value))}>
                {[6, 8, 10, 12, 14, 16, 18, 20].map((n) => (
                  <option key={n} value={n}>
                    {n} children
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Staffing ratios">
              <Input value={business.ratios} onChange={(e) => setBiz('ratios', e.target.value)} />
            </Field>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            {businessDirty && <span className="text-xs font-semibold text-[#8a6112]">Unsaved changes</span>}
            <Button onClick={saveBusiness} disabled={!businessDirty}>
              <Save size={16} /> Save business info
            </Button>
          </div>
        </Card>
      )}

      {tab === 'rates' && (
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5DC4A6]/15 text-[#2E8C72]">
              <Calculator size={19} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Rate card</h2>
              <p className="text-sm text-slate-500">Drives the public estimator and the invoice prefill.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rateFields.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <div className="relative">
                  {f.suffix !== '%' && (
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                  )}
                  <Input
                    type="number"
                    min="0"
                    step={f.key === 'lateFeePerMinute' ? '0.5' : '1'}
                    value={rates[f.key]}
                    onChange={(e) => setRates((r) => ({ ...r, [f.key]: Number(e.target.value) || 0 }))}
                    className={f.suffix === '%' ? 'pr-12' : 'pl-7 pr-12'}
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                    {f.suffix}
                  </span>
                </div>
              </Field>
            ))}
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-700">What a family sees</p>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
              <li className="flex justify-between">
                <span>One child, full-time, 4 weeks</span>
                <span className="font-semibold text-slate-900">{money(rates.fullTime * 4)}</span>
              </li>
              <li className="flex justify-between">
                <span>Two children, full-time, 4 weeks (with sibling discount)</span>
                <span className="font-semibold text-slate-900">
                  {money(rates.fullTime * 8 - Math.round(rates.fullTime * 4 * (rates.siblingDiscountPct / 100)))}
                </span>
              </li>
              <li className="flex justify-between">
                <span>Fifteen minutes late at pickup</span>
                <span className="font-semibold text-slate-900">{money(rates.lateFeePerMinute * 15)}</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            {ratesDirty && <span className="text-xs font-semibold text-[#8a6112]">Unsaved changes</span>}
            <Button onClick={saveRates} disabled={!ratesDirty}>
              <Save size={16} /> Save rates
            </Button>
          </div>
        </Card>
      )}

      {tab === 'policies' && (
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F5B942]/20 text-[#8a6112]">
              <ScrollText size={19} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Policy wording</h2>
              <p className="text-sm text-slate-500">Markdown is supported — **bold**, bullet lists, and numbered steps.</p>
            </div>
          </div>

          <div className="space-y-5">
            {policyFields.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <Textarea
                  rows={7}
                  value={policies[f.key]}
                  onChange={(e) => setPolicies((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="font-mono text-xs leading-relaxed"
                />
              </Field>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            {policiesDirty && <span className="text-xs font-semibold text-[#8a6112]">Unsaved changes</span>}
            <Button onClick={savePolicies} disabled={!policiesDirty}>
              <Save size={16} /> Save policies
            </Button>
          </div>
        </Card>
      )}

      <Card className="mt-8 border-rose-200 bg-rose-50/40 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <SettingsIcon size={19} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Reset the demo</h2>
              <p className="max-w-xl text-sm text-slate-600">
                Puts every child, invoice, document, and message back to its starting state. Useful before showing the
                site to someone new.
              </p>
            </div>
          </div>
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={16} /> Reset demo data
          </Button>
        </div>
      </Card>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset all demo data?"
        description="Every change made in this preview will be discarded."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doReset}>
              <RotateCcw size={16} /> Reset everything
            </Button>
          </>
        }
      >
        <Card className="bg-rose-50/60 p-4 text-sm text-rose-900">
          Attendance, daily reports, invoices, payments, documents, announcements, and any settings you edited all go
          back to their original values.
        </Card>
      </Modal>
    </PageTransition>
  )
}

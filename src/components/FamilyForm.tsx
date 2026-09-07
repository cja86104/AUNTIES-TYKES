import { Plus, Trash2 } from 'lucide-react'
import { Button, Field, Input, Select, Textarea } from './ui'
import type { Contact, Family } from '../types'

/** Everything about a family except the fields the store assigns. */
export type FamilyFormValue = Omit<Family, 'id' | 'joinedAt'>

export interface FamilyFormProps {
  value: FamilyFormValue
  onChange: (value: FamilyFormValue) => void
  errors?: Record<string, string>
}

export const emptyFamilyForm = (): FamilyFormValue => ({
  name: '',
  primaryContact: '',
  relation: 'Mother',
  email: '',
  phone: '',
  address: '',
  secondary: { name: '', relation: '', phone: '' },
  emergency: [{ name: '', relation: '', phone: '' }],
  notes: '',
})

export function validateFamilyForm(v: FamilyFormValue): Record<string, string> {
  const e: Record<string, string> = {}
  if (v.name.trim().length < 2) e.name = 'Give the family a name'
  if (v.primaryContact.trim().length < 2) e.primaryContact = 'Who is the main contact?'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Enter a valid email address'
  if (v.phone.trim().length < 7) e.phone = 'Enter a phone number'
  if (v.address.trim().length < 6) e.address = 'Enter a home address'
  return e
}

/** Shared by the "add family" and "edit family" flows so they cannot drift apart. */
export default function FamilyForm({ value, onChange, errors = {} }: FamilyFormProps) {
  const set = <K extends keyof FamilyFormValue>(key: K, v: FamilyFormValue[K]) =>
    onChange({ ...value, [key]: v })

  const setEmergency = (index: number, key: keyof Contact, v: string) =>
    onChange({
      ...value,
      emergency: value.emergency.map((c, i) => (i === index ? { ...c, [key]: v } : c)),
    })

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Family name" error={errors.name}>
          <Input
            value={value.name}
            invalid={Boolean(errors.name)}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Brooks Family"
          />
        </Field>
        <Field label="Primary contact" error={errors.primaryContact}>
          <Input
            value={value.primaryContact}
            invalid={Boolean(errors.primaryContact)}
            onChange={(e) => set('primaryContact', e.target.value)}
            placeholder="Maya Brooks"
          />
        </Field>
        <Field label="Relation to child">
          <Select value={value.relation} onChange={(e) => set('relation', e.target.value)}>
            <option>Mother</option>
            <option>Father</option>
            <option>Grandparent</option>
            <option>Legal guardian</option>
            <option>Other</option>
          </Select>
        </Field>
        <Field label="Email" error={errors.email} hint="Used for the parent portal login.">
          <Input
            type="email"
            value={value.email}
            invalid={Boolean(errors.email)}
            onChange={(e) => set('email', e.target.value)}
            placeholder="maya@example.com"
          />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input
            value={value.phone}
            invalid={Boolean(errors.phone)}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="(919) 555-0142"
          />
        </Field>
        <Field label="Home address" error={errors.address}>
          <Input
            value={value.address}
            invalid={Boolean(errors.address)}
            onChange={(e) => set('address', e.target.value)}
            placeholder="218 Larkspur Lane, Durham, NC 27705"
          />
        </Field>
      </div>

      <div className="rounded-2xl bg-slate-50 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">Second guardian</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name">
            <Input
              value={value.secondary.name}
              onChange={(e) => set('secondary', { ...value.secondary, name: e.target.value })}
            />
          </Field>
          <Field label="Relation">
            <Input
              value={value.secondary.relation}
              onChange={(e) => set('secondary', { ...value.secondary, relation: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={value.secondary.phone}
              onChange={(e) => set('secondary', { ...value.secondary, phone: e.target.value })}
            />
          </Field>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">Emergency contacts</p>
        <div className="space-y-3">
          {value.emergency.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_2rem] items-end gap-2">
              <Field label={i === 0 ? 'Name' : undefined}>
                <Input value={c.name} onChange={(e) => setEmergency(i, 'name', e.target.value)} placeholder="Gwen Brooks" />
              </Field>
              <Field label={i === 0 ? 'Relation' : undefined}>
                <Input value={c.relation} onChange={(e) => setEmergency(i, 'relation', e.target.value)} placeholder="Grandmother" />
              </Field>
              <Field label={i === 0 ? 'Phone' : undefined}>
                <Input value={c.phone} onChange={(e) => setEmergency(i, 'phone', e.target.value)} placeholder="(919) 555-0119" />
              </Field>
              <button
                onClick={() =>
                  onChange({ ...value, emergency: value.emergency.filter((_, idx) => idx !== i) })
                }
                disabled={value.emergency.length === 1}
                aria-label={`Remove emergency contact ${i + 1}`}
                className="mb-1 rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        {value.emergency.length < 4 && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => onChange({ ...value, emergency: [...value.emergency, { name: '', relation: '', phone: '' }] })}
          >
            <Plus size={14} /> Add contact
          </Button>
        )}
      </div>

      <Field label="Notes" hint="Pickup habits, preferences, anything worth remembering.">
        <Textarea rows={3} value={value.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </div>
  )
}

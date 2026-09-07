import { Field, Input, Select, Textarea } from './ui'
import type { AgeGroup, Child, ChildStatus, Family } from '../types'

/** Child fields as the admin edits them — lists are comma-separated text here. */
export interface ChildFormValue {
  familyId: string
  name: string
  dob: string
  ageGroup: AgeGroup
  status: ChildStatus
  plan: string
  startDate: string
  teacher: string
  allergies: string
  medications: string
  notes: string
}

const AGE_GROUPS: AgeGroup[] = ['Infant', 'Toddler', 'Preschool']
const PLANS = ['Full-time', 'Part-time (M/W/F)', 'Part-time (T/Th)', 'Drop-in as needed']

export const emptyChildForm = (familyId = ''): ChildFormValue => ({
  familyId,
  name: '',
  dob: '',
  ageGroup: 'Toddler',
  status: 'active',
  plan: 'Full-time',
  startDate: '',
  teacher: 'Auntie Roz',
  allergies: '',
  medications: '',
  notes: '',
})

/** Turn a stored child back into editable form values. */
export const childToForm = (c: Child): ChildFormValue => ({
  familyId: c.familyId,
  name: c.name,
  dob: c.dob,
  ageGroup: c.ageGroup,
  status: c.status,
  plan: c.plan,
  startDate: c.startDate,
  teacher: c.teacher,
  allergies: c.allergies.join(', '),
  medications: c.medications.join(', '),
  notes: c.notes,
})

/** Convert form values into the stored shape. */
export const formToChild = (v: ChildFormValue): Omit<Child, 'id' | 'hue'> => ({
  familyId: v.familyId,
  name: v.name.trim(),
  dob: v.dob,
  ageGroup: v.ageGroup,
  status: v.status,
  plan: v.plan,
  startDate: v.startDate,
  teacher: v.teacher.trim() || 'Auntie Roz',
  allergies: v.allergies.split(',').map((s) => s.trim()).filter(Boolean),
  medications: v.medications.split(',').map((s) => s.trim()).filter(Boolean),
  notes: v.notes.trim(),
})

export function validateChildForm(v: ChildFormValue): Record<string, string> {
  const e: Record<string, string> = {}
  if (v.name.trim().length < 2) e.name = "Enter the child's name"
  if (!v.dob) e.dob = 'Date of birth is required'
  if (!v.familyId) e.familyId = 'Pick a family'
  if (!v.startDate) e.startDate = 'Set a start date'
  return e
}

export interface ChildFormProps {
  value: ChildFormValue
  onChange: (value: ChildFormValue) => void
  errors?: Record<string, string>
  /** Omit to hide the family picker (when the family is already fixed). */
  families?: Family[]
}

export default function ChildForm({ value, onChange, errors = {}, families }: ChildFormProps) {
  const set = <K extends keyof ChildFormValue>(key: K, v: ChildFormValue[K]) =>
    onChange({ ...value, [key]: v })

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {families && (
        <Field label="Family" error={errors.familyId} className="sm:col-span-2">
          <Select
            value={value.familyId}
            invalid={Boolean(errors.familyId)}
            onChange={(e) => set('familyId', e.target.value)}
          >
            <option value="">Select a family…</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Full name" error={errors.name}>
        <Input
          value={value.name}
          invalid={Boolean(errors.name)}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Ellie Brooks"
        />
      </Field>
      <Field label="Date of birth" error={errors.dob}>
        <Input type="date" value={value.dob} invalid={Boolean(errors.dob)} onChange={(e) => set('dob', e.target.value)} />
      </Field>

      <Field label="Age group">
        <Select value={value.ageGroup} onChange={(e) => set('ageGroup', e.target.value as AgeGroup)}>
          {AGE_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status">
        <Select value={value.status} onChange={(e) => set('status', e.target.value as ChildStatus)}>
          <option value="active">Active</option>
          <option value="waitlist">Waitlist</option>
        </Select>
      </Field>

      <Field label="Schedule">
        <Select value={value.plan} onChange={(e) => set('plan', e.target.value)}>
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Start date" error={errors.startDate}>
        <Input
          type="date"
          value={value.startDate}
          invalid={Boolean(errors.startDate)}
          onChange={(e) => set('startDate', e.target.value)}
        />
      </Field>

      <Field label="Primary teacher">
        <Input value={value.teacher} onChange={(e) => set('teacher', e.target.value)} placeholder="Auntie Roz" />
      </Field>
      <Field label="Allergies" hint="Comma separated.">
        <Input value={value.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="Peanuts, strawberries" />
      </Field>

      <Field label="Medications" hint="Comma separated." className="sm:col-span-2">
        <Input value={value.medications} onChange={(e) => set('medications', e.target.value)} placeholder="EpiPen Jr." />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea rows={3} value={value.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </div>
  )
}

/**
 * Child statuses and the family-level "unenrolled" reading.
 *
 * Runs on Node's built-in test runner with no dependencies. Node strips the
 * TypeScript types itself, which is why imports here name the `.ts` file.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CHILD_STATUSES, CHILD_STATUS_LABELS, isFamilyUnenrolled } from '../src/lib/childStatus.ts'

void describe('child statuses', () => {
  void it('lists every status in dropdown order, each with a label', () => {
    assert.deepStrictEqual([...CHILD_STATUSES], ['active', 'summer_camp', 'waitlist', 'unenrolled'])
    assert.deepStrictEqual(
      CHILD_STATUSES.map((s) => CHILD_STATUS_LABELS[s]),
      ['Active', 'Summer Camp', 'Waitlist', 'Unenrolled'],
    )
  })
})

void describe('isFamilyUnenrolled', () => {
  void it('is true only when the family has children and every one is unenrolled', () => {
    assert.equal(isFamilyUnenrolled([{ status: 'unenrolled' }, { status: 'unenrolled' }]), true)
    assert.equal(isFamilyUnenrolled([{ status: 'unenrolled' }, { status: 'active' }]), false)
    assert.equal(isFamilyUnenrolled([{ status: 'waitlist' }]), false)
  })

  void it('does not call a family with no children on file unenrolled', () => {
    assert.equal(isFamilyUnenrolled([]), false)
  })
})

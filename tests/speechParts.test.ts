/**
 * How Ro's replies are split for speaking. Run with `npm test`.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SPLIT_ABOVE, splitForSpeech } from '../src/lib/speechParts.ts'

/** The words, in order, ignoring whitespace — what must never change. */
const words = (text: string): string[] => text.split(/\s+/).filter((word) => word.length > 0)

void describe('splitForSpeech', () => {
  void it('keeps a short reply as one clip', () => {
    const text = 'Good morning! Three children are here.'
    assert.ok(text.length <= SPLIT_ABOVE)
    assert.deepStrictEqual(splitForSpeech(text), [text])
  })

  void it('speaks the first sentence on its own, then the rest', () => {
    const text =
      'Good morning, Melissa! Three children are here and two are still expected. ' +
      'Mia leaves early at one today, so her mom will be by around then. ' +
      'The Chen invoice is now a week overdue, and the Okafor family wrote back about Friday.'
    const parts = splitForSpeech(text)
    assert.equal(parts[0], 'Good morning, Melissa!')
    assert.ok(parts.length >= 2 && parts.length <= 3)
    assert.deepStrictEqual(words(parts.join(' ')), words(text))
  })

  void it('makes the second piece no more than five times the first, keeping at least one sentence', () => {
    const first = 'Here is your Monday rundown for the week.'
    const filler = 'Ava, Ben and Cal are in from seven until three on each of those days this week. '
    const text = `${first} ${filler.repeat(12)}`.trim()
    const parts = splitForSpeech(text)
    assert.equal(parts.length, 3)
    assert.ok((parts[1] ?? '').length <= first.length * 5)
    assert.deepStrictEqual(words(parts.join(' ')), words(text))
  })

  void it('takes the next sentence too when the first is very short', () => {
    const text =
      'Sure! I checked the roster for Friday and everyone is expected at their usual times. ' +
      'Nobody has a change on file, and the calendar has no early close that day either, so it looks like a normal day.'
    assert.equal(splitForSpeech(text)[0], 'Sure! I checked the roster for Friday and everyone is expected at their usual times.')
  })

  void it('never splits after an abbreviation like Mrs. or p.m.', () => {
    const text =
      'Mrs. Chen called about pickup. She will be there at 1 p.m. tomorrow instead of the usual time, ' +
      'and asked that you let the Okafors know too, since they share the drive on Thursdays this month.'
    const parts = splitForSpeech(text)
    assert.equal(parts[0], 'Mrs. Chen called about pickup.')
    for (const part of parts) assert.ok(!/\b(?:Mrs|p\.m)\.$/.test(part), `split after an abbreviation: "${part}"`)
    assert.deepStrictEqual(words(parts.join(' ')), words(text))
  })

  void it('leaves a reply whose first sentence is very long as one clip', () => {
    const text = `${'This first sentence keeps going and going without any full stop at all '.repeat(4)}end. Then more.`
    assert.deepStrictEqual(splitForSpeech(text), [text])
  })
})

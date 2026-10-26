/**
 * Photo sizing before upload. Run with `npm test`. Node strips the TypeScript
 * types itself, which is why imports here name the `.ts` file.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fitWithin, jpegName, MAX_IMAGE_EDGE } from '../src/lib/imageSize.ts'

void describe('fitWithin', () => {
  void it('scales a phone photo down so its longest edge is the limit, keeping the shape', () => {
    assert.deepStrictEqual(fitWithin(4032, 3024), { width: MAX_IMAGE_EDGE, height: 1536 })
    assert.deepStrictEqual(fitWithin(3024, 4032), { width: 1536, height: MAX_IMAGE_EDGE })
  })

  void it('never scales a small photo up', () => {
    assert.deepStrictEqual(fitWithin(800, 600), { width: 800, height: 600 })
  })

  void it('reports nothing to draw for an image with no size', () => {
    assert.deepStrictEqual(fitWithin(0, 600), { width: 0, height: 0 })
    assert.deepStrictEqual(fitWithin(Number.NaN, 600), { width: 0, height: 0 })
  })

  void it('never rounds a very thin image down to zero', () => {
    assert.deepStrictEqual(fitWithin(10000, 2), { width: MAX_IMAGE_EDGE, height: 1 })
  })
})

void describe('jpegName', () => {
  void it('swaps the extension for .jpg', () => {
    assert.equal(jpegName('IMG_0412.HEIC'), 'IMG_0412.jpg')
    assert.equal(jpegName('art.project.png'), 'art.project.jpg')
  })

  void it('adds .jpg to a name with no extension, and to a dotfile', () => {
    assert.equal(jpegName('photo'), 'photo.jpg')
    assert.equal(jpegName('.hidden'), '.hidden.jpg')
  })
})

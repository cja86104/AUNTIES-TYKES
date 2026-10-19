/**
 * Shrinks a photo in the browser before it is uploaded.
 *
 * Why: photos were stored at full phone size (2–5 MB, up to the 10 MB bucket
 * limit) and every thumbnail downloaded the original, which is what drove the
 * project's Storage egress past the plan limit (2026-10-19). Every upload in
 * the app goes through FileUploader, which calls this first.
 *
 * Drawing the photo through an <img> onto a canvas applies its EXIF rotation
 * (every current browser honours it for <img>), and the JPEG written back
 * carries no EXIF at all — so a phone photo's GPS location is not stored.
 *
 * HEIC decodes only where the browser can (Safari, which is what the owner's
 * iPhone uses); there it becomes a JPEG, which every browser can show inline.
 * Anything that cannot be decoded, or would not come out smaller, is uploaded
 * exactly as it was — shrinking is a saving, never a reason to fail an upload.
 *
 * One photo at a time, app-wide. A phone photo decoded at full size takes
 * ~100–190 MB, and choosing several at once decoded them all together, which
 * is past what iOS Safari allows a tab: Safari killed and reloaded the page
 * mid-report, which looked like being signed out (2026-10-19). Shrinks now
 * queue behind each other, and each full-size image is released as soon as it
 * has been drawn. Uploads of the shrunk copies still run side by side.
 */
import { fitWithin, JPEG_QUALITY, jpegName } from './imageSize'

const SHRINKABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

async function decode(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = url
  await img.decode()
  return img
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  })
}

/** The tail of the shrink queue; each shrink starts when the one before it ends. */
let queueTail: Promise<unknown> = Promise.resolve()

export function shrinkImage(file: File): Promise<File> {
  if (!SHRINKABLE_TYPES.includes(file.type)) return Promise.resolve(file)
  const result = queueTail.then(() => shrinkOne(file))
  queueTail = result
  return result
}

async function shrinkOne(file: File): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const img = await decode(url)
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight)
    if (width === 0 || height === 0) return file

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (ctx === null) return file
    // A transparent PNG would otherwise turn black where it was see-through.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    // Lets the full-size decoded bitmap go now rather than whenever GC runs.
    img.removeAttribute('src')
    const blob = await toJpeg(canvas)
    // Frees the bitmap now; iOS Safari caps total canvas memory per page.
    canvas.width = 0
    canvas.height = 0

    if (blob === null) return file
    // HEIC is converted even when it would not shrink, so it can show inline.
    if (file.type !== 'image/heic' && blob.size >= file.size) return file
    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}

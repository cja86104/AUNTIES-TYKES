/**
 * The sizing rules for photos shrunk before upload (see ./imageShrink.ts).
 *
 * Kept apart from the canvas code and free of DOM types, so the arithmetic is
 * tested on Node (tests/imageSize.test.ts) without a browser.
 */

/**
 * The longest edge a stored photo keeps, in pixels. Sharp full-screen on a
 * phone, and a photographed form or immunisation record stays legible. A
 * typical phone photo drops from 2–5 MB to a few hundred KB.
 */
export const MAX_IMAGE_EDGE = 2048

/** JPEG quality for the shrunk copy. */
export const JPEG_QUALITY = 0.82

/** The size to draw at: scaled down to fit MAX_IMAGE_EDGE, never scaled up. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_IMAGE_EDGE,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** The file name the shrunk JPEG is stored under: same name, `.jpg` extension. */
export function jpegName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  return `${stem}.jpg`
}

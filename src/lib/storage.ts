/**
 * Document file storage.
 *
 * The bucket is private (see supabase/migrations/0006). Nothing here ever
 * produces a permanent URL — downloads go through a short-lived signed URL so
 * a link copied out of the portal stops working rather than granting a
 * stranger a child's immunisation record indefinitely.
 */
import { supabase } from './supabase'
import { uid } from './helpers'

export const DOCUMENTS_BUCKET = 'documents'

/** Must match file_size_limit on the bucket, or the server rejects it later. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Must match allowed_mime_types on the bucket. */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Checked before upload so the person gets a useful sentence instead of a
 * generic failure from the storage API.
 */
export function rejectionReason(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is ${megabytes(file.size)}. The limit is ${megabytes(MAX_UPLOAD_BYTES)}.`
  }
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name} is not a file type we accept. Use a PDF, a Word document, or a photo.`
  }
  return null
}

/** Strip anything that would make an awkward object key. */
function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 120) || 'file'
}

/**
 * `prefix` decides who can read it, because the storage policies match on the
 * path: 'admin' for the owner's uploads, `family/<familyId>` for a parent's.
 */
export function buildStoragePath(prefix: string, fileName: string): string {
  return `${prefix}/${uid('f')}/${safeName(fileName)}`
}

export async function uploadDocument(file: File, storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error(error.message)
}

/**
 * A signed URL valid for one minute — long enough to click, not to share.
 *
 * `download` is what makes Storage answer with `Content-Disposition:
 * attachment`. Without it the URL just renders the file in the tab, which is
 * how a click here used to dump people on a raw Supabase page.
 */
async function documentDownloadUrl(storagePath: string, fileName?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, 60, { download: fileName ?? true })
  if (error || !data) throw new Error(error?.message ?? 'Could not prepare that download.')
  return data.signedUrl
}

/**
 * Saves the file to the visitor's downloads.
 *
 * A plain anchor click rather than window.open: by the time the signed URL
 * comes back the click's user gesture has expired, and popup blockers stop
 * window.open at that point. Because the response is an attachment the page
 * does not navigate, so no target is needed and no blank tab flashes up.
 */
export async function downloadDocument(storagePath: string, fileName?: string): Promise<void> {
  const url = await documentDownloadUrl(storagePath, fileName)
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/**
 * File types a browser draws inline in an <img>. HEIC is accepted for upload
 * but only Safari renders it, so it is offered as a download instead.
 */
const INLINE_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const

export function isInlineImage(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return (INLINE_IMAGE_EXTENSIONS as readonly string[]).includes(ext)
}

/** How long a view link lasts. */
const VIEW_URL_SECONDS = 60 * 60

/** A view link is handed out again only while it has at least this long left. */
const VIEW_URL_REUSE_MARGIN_MS = 10 * 60 * 1000

/** View links already made this session, by storage path. */
const viewUrls = new Map<string, { url: Promise<string>; expiresAt: number }>()

/**
 * A signed URL that renders the file in place, for showing a photo on a page.
 *
 * Valid for an hour rather than a minute: it sits in an <img> for as long as
 * the page is open, and a parent tapping it to see it full size should not
 * hit an expired link. It still stops working on its own, unlike a public URL.
 *
 * The same link is reused for most of that hour. Every signed URL is a
 * different address, so a fresh one per render made the browser download the
 * photo again every time it appeared — that, with full-size photos, is what
 * drove Storage egress past the plan limit (2026-10-19). Reusing it lets the
 * browser show its cached copy instead. Concurrent requests for one photo share
 * a single signing call. A failed one is forgotten so the next render retries.
 */
export function viewDocumentUrl(storagePath: string): Promise<string> {
  const now = Date.now()
  const cached = viewUrls.get(storagePath)
  if (cached && cached.expiresAt - VIEW_URL_REUSE_MARGIN_MS > now) return cached.url

  const url = supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, VIEW_URL_SECONDS)
    .then(({ data, error }) => {
      if (error || !data) throw new Error(error?.message ?? 'Could not load that file.')
      return data.signedUrl
    })
  const entry = { url, expiresAt: now + VIEW_URL_SECONDS * 1000 }
  viewUrls.set(storagePath, entry)
  void url.catch(() => {
    if (viewUrls.get(storagePath) === entry) viewUrls.delete(storagePath)
  })
  return url
}

/**
 * Forgets every view link. Called on sign-out so the next person on a shared
 * device starts with none of the previous account's links.
 */
export function clearViewUrls(): void {
  viewUrls.clear()
}

export async function removeDocumentFile(storagePath: string): Promise<void> {
  viewUrls.delete(storagePath)
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath])
  if (error) throw new Error(error.message)
}

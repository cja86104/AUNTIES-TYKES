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

/** A signed URL valid for one minute — long enough to click, not to share. */
export async function documentDownloadUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, 60)
  if (error || !data) throw new Error(error?.message ?? 'Could not prepare that download.')
  return data.signedUrl
}

export async function removeDocumentFile(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath])
  if (error) throw new Error(error.message)
}

/**
 * One-off backfill: shrinks the full-size photos uploaded before photos were
 * shrunk in the browser (src/lib/imageShrink.ts, 2026-10-19).
 *
 * Why: every view of those photos downloads the phone original (2–5 MB+),
 * which is what drove Storage egress past the plan limit. New uploads are
 * already small; this brings the old ones down to the same size rules
 * (src/lib/imageSize.ts — 2048 px longest edge, JPEG quality 0.82).
 *
 * What it touches, and what it never does:
 *   - Only JPEG photos (.jpg / .jpeg) that a daily report, a document or an
 *     announcement actually points at. Unreferenced files are never viewed, so
 *     they cost no egress and are left alone.
 *   - Each photo is replaced AT THE SAME PATH, still a JPEG, so no link,
 *     file name or record changes — only the recorded size is updated.
 *   - EXIF rotation is applied and all metadata (including GPS) is dropped.
 *   - Before anything is replaced, the original is saved to
 *     photo-backups/<run time>/<storage path> on this computer
 *     (git-ignored — it holds children's photos and must never be committed).
 *   - A photo that would not shrink by at least 10% is left as it was.
 *   - PNG, WebP and HEIC photos are counted and reported, never changed.
 *
 * Run from the repo root in PowerShell:
 *   npm run photos:shrink              # dry run: lists what it would shrink, changes nothing
 *   npm run photos:shrink -- --apply   # does it
 *
 * Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local. The
 * service-role key bypasses RLS; it is read from the environment and never
 * printed. Run it when nobody is using the app (evening): each record update
 * makes open screens reload. Safe to run again — photos already small are
 * skipped.
 *
 * The dry run downloads nothing. --apply downloads each photo once, which
 * counts toward egress one time, in exchange for every later view being small.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import type { Database } from '../src/lib/database.types.ts'
import type { LogAttachment } from '../src/types.ts'
import { JPEG_QUALITY, MAX_IMAGE_EDGE } from '../src/lib/imageSize.ts'

const BUCKET = 'documents'

/** Photos recorded at or under this size are already small enough to skip. */
const SKIP_AT_OR_BELOW_BYTES = 600 * 1024

/** A photo is replaced only if the new copy is at most this share of the old. */
const MIN_SAVING_RATIO = 0.9

const apply = process.argv.includes('--apply')

type Ref =
  | { kind: 'daily_log'; rowId: string }
  | { kind: 'document'; rowId: string }
  | { kind: 'announcement'; rowId: string }

interface Candidate {
  path: string
  /** Largest size any record holds for it; null when no record says. */
  recordedSize: number | null
  refs: Ref[]
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function extensionOf(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? ''
}

function fail(message: string): never {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  fail('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (they are read from .env.local).')
}

const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

/* ---------------------------- 1. find the photos ---------------------------- */

const candidates = new Map<string, Candidate>()
const skippedOtherFormats = new Map<string, number>()

function note(path: string | null, size: number | null, ref: Ref): void {
  if (!path) return
  const ext = extensionOf(path)
  if (ext !== 'jpg' && ext !== 'jpeg') {
    if (['png', 'webp', 'heic'].includes(ext)) skippedOtherFormats.set(path, size ?? 0)
    return
  }
  const existing = candidates.get(path)
  if (existing) {
    existing.refs.push(ref)
    if (size !== null && (existing.recordedSize === null || size > existing.recordedSize)) existing.recordedSize = size
    return
  }
  candidates.set(path, { path, recordedSize: size, refs: [ref] })
}

const logs = await db.from('daily_logs').select('id, attachments')
if (logs.error) fail(`Could not read daily reports: ${logs.error.message}`)
for (const row of logs.data) {
  for (const a of row.attachments ?? []) note(a.storagePath, a.size, { kind: 'daily_log', rowId: row.id })
}

const docs = await db.from('documents').select('id, storage_path, size')
if (docs.error) fail(`Could not read documents: ${docs.error.message}`)
for (const row of docs.data) note(row.storage_path, row.size, { kind: 'document', rowId: row.id })

const posts = await db.from('announcements').select('id, attachment_storage_path, attachment_size')
if (posts.error) fail(`Could not read announcements: ${posts.error.message}`)
for (const row of posts.data) {
  note(row.attachment_storage_path, row.attachment_size, { kind: 'announcement', rowId: row.id })
}

const todo = [...candidates.values()]
  .filter((c) => c.recordedSize === null || c.recordedSize > SKIP_AT_OR_BELOW_BYTES)
  .sort((a, b) => (b.recordedSize ?? 0) - (a.recordedSize ?? 0))

console.log(`\nJPEG photos referenced: ${String(candidates.size)}`)
console.log(`Already small (≤ ${mb(SKIP_AT_OR_BELOW_BYTES)}), skipped: ${String(candidates.size - todo.length)}`)
console.log(`To shrink: ${String(todo.length)}  (recorded total ${mb(todo.reduce((s, c) => s + (c.recordedSize ?? 0), 0))})`)
if (skippedOtherFormats.size > 0) {
  const total = [...skippedOtherFormats.values()].reduce((s, n) => s + n, 0)
  console.log(`PNG / WebP / HEIC left unchanged: ${String(skippedOtherFormats.size)}  (${mb(total)})`)
}

if (!apply) {
  for (const c of todo) {
    console.log(`  ${c.recordedSize === null ? 'size unknown' : mb(c.recordedSize)}  ${c.path}`)
  }
  console.log('\nDry run — nothing was changed. Add --apply to shrink these.\n')
  process.exit(0)
}

/* ------------------------------ 2. shrink them ------------------------------ */

const runStamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupRoot = join('photo-backups', runStamp)
let replaced = 0
let unchanged = 0
let failed = 0
let before = 0
let after = 0

async function recordSize(c: Candidate, size: number): Promise<string[]> {
  const problems: string[] = []
  for (const ref of c.refs) {
    if (ref.kind === 'document') {
      const r = await db.from('documents').update({ size }).eq('id', ref.rowId).eq('storage_path', c.path)
      if (r.error) problems.push(`document ${ref.rowId}: ${r.error.message}`)
    } else if (ref.kind === 'announcement') {
      const r = await db
        .from('announcements')
        .update({ attachment_size: size })
        .eq('id', ref.rowId)
        .eq('attachment_storage_path', c.path)
      if (r.error) problems.push(`announcement ${ref.rowId}: ${r.error.message}`)
    } else {
      // Re-read just before writing, so an edit made since the scan is kept.
      const current = await db.from('daily_logs').select('attachments').eq('id', ref.rowId).maybeSingle()
      if (current.error) {
        problems.push(`daily report ${ref.rowId}: ${current.error.message}`)
        continue
      }
      if (current.data === null) continue
      const attachments: LogAttachment[] = (current.data.attachments ?? []).map((a) =>
        a.storagePath === c.path ? { ...a, size } : a,
      )
      const r = await db.from('daily_logs').update({ attachments }).eq('id', ref.rowId)
      if (r.error) problems.push(`daily report ${ref.rowId}: ${r.error.message}`)
    }
  }
  return problems
}

for (const c of todo) {
  const label = c.path
  try {
    const download = await db.storage.from(BUCKET).download(c.path)
    if (download.error) throw new Error(`download: ${download.error.message}`)
    const original = new Uint8Array(await download.data.arrayBuffer())

    const shrunk = await sharp(original)
      .rotate()
      .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: Math.round(JPEG_QUALITY * 100), mozjpeg: true })
      .toBuffer()

    if (shrunk.length > original.length * MIN_SAVING_RATIO) {
      unchanged += 1
      console.log(`  = ${mb(original.length)}  would not shrink enough, left as is  ${label}`)
      continue
    }

    const backupPath = join(backupRoot, ...c.path.split('/'))
    await mkdir(dirname(backupPath), { recursive: true })
    await writeFile(backupPath, original)

    const upload = await db.storage
      .from(BUCKET)
      .upload(c.path, shrunk, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' })
    if (upload.error) throw new Error(`upload: ${upload.error.message} (original kept at ${backupPath})`)

    const problems = await recordSize(c, shrunk.length)
    replaced += 1
    before += original.length
    after += shrunk.length
    console.log(`  ✔ ${mb(original.length)} → ${mb(shrunk.length)}  ${label}`)
    for (const p of problems) console.log(`    ! photo shrunk, but its recorded size was not updated — ${p}`)
  } catch (error) {
    failed += 1
    console.log(`  ✖ ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log(`\nShrunk ${String(replaced)}, left unchanged ${String(unchanged)}, failed ${String(failed)}.`)
if (replaced > 0) {
  console.log(`Stored size ${mb(before)} → ${mb(after)}. Originals saved under ${backupRoot}\\`)
}
console.log('')
if (failed > 0) process.exit(1)

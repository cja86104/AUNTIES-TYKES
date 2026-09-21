import { useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { bytes, cx, uid } from '../lib/helpers'
import { buildStoragePath, rejectionReason, uploadDocument } from '../lib/storage'
import type { UploadedFileMeta } from '../types'

type QueueState = 'uploading' | 'done' | 'error'

interface QueueItem {
  id: string
  name: string
  size: number
  state: QueueState
  /** Why it failed. Only set when state is 'error'. */
  message?: string
}

export interface FileUploaderProps {
  /**
   * Storage path prefix, which is what the bucket policies match on:
   * 'admin' for the owner's uploads, `family/<familyId>` for a parent's.
   */
  prefix: string
  onUploaded?: (meta: UploadedFileMeta) => void
  /** Called once per file that could not be stored, with a sentence to show. */
  onError?: (message: string) => void
  accept?: string
  label?: string
}

/**
 * Uploads the chosen files to the private `documents` bucket, then hands the
 * caller the metadata — including the storage path — so it can save a row
 * that actually points at a file.
 *
 * The bar is deliberately indeterminate: the storage API reports no progress,
 * so a percentage here would be invented.
 */
export default function FileUploader({
  prefix,
  onUploaded,
  onError,
  accept = '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp,.heic',
  label = 'Drop files here or browse',
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])

  const fail = useCallback(
    (id: string, message: string) => {
      setQueue((q) => q.map((i) => (i.id === id ? { ...i, state: 'error', message } : i)))
      onError?.(message)
    },
    [onError],
  )

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      const files = Array.from(fileList ?? [])
      if (!files.length) return

      files.forEach((file) => {
        const id = uid('up')
        setQueue((q) => [...q, { id, name: file.name, size: file.size, state: 'uploading' }])

        const refusal = rejectionReason(file)
        if (refusal) {
          fail(id, refusal)
          return
        }

        const storagePath = buildStoragePath(prefix, file.name)
        void uploadDocument(file, storagePath)
          .then(() => {
            setQueue((q) => q.map((i) => (i.id === id ? { ...i, state: 'done' } : i)))
            onUploaded?.({
              title: file.name.replace(/\.[^.]+$/, ''),
              fileName: file.name,
              size: file.size,
              storagePath,
            })
            setTimeout(() => setQueue((q) => q.filter((i) => i.id !== id)), 2600)
          })
          .catch((error: unknown) => {
            fail(
              id,
              error instanceof Error
                ? `${file.name} did not upload: ${error.message}`
                : `${file.name} did not upload. Check your connection and try again.`,
            )
          })
      })
    },
    [prefix, onUploaded, fail],
  )

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        className={cx(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200',
          dragging
            ? 'border-[#3F8570] bg-[#3F8570]/5 scale-[1.01]'
            : 'border-slate-300 bg-slate-50/60 hover:border-[#3F8570] hover:bg-[#3F8570]/5',
        )}
      >
        <motion.span
          animate={{ y: dragging ? -4 : 0 }}
          className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#3F8570] shadow-sm"
        >
          <UploadCloud size={24} />
        </motion.span>
        <p className="font-display text-sm font-bold text-slate-800">{label}</p>
        <p className="mt-1 text-xs text-slate-500">PDF, Word, or images up to 10 MB each</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <AnimatePresence>
        {queue.length > 0 && (
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 space-y-2.5">
            {queue.map((item) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={cx(
                  'flex items-center gap-3 rounded-xl border bg-white p-3',
                  item.state === 'error' ? 'border-rose-200' : 'border-slate-200',
                )}
              >
                <span
                  className={cx(
                    'flex h-9 w-9 items-center justify-center rounded-lg',
                    item.state === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500',
                  )}
                >
                  {item.state === 'done' ? (
                    <CheckCircle2 size={17} className="text-[#2E8C72]" />
                  ) : item.state === 'error' ? (
                    <AlertTriangle size={17} />
                  ) : (
                    <FileText size={17} />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                  {item.state === 'error' ? (
                    <p className="mt-0.5 text-xs text-rose-700">{item.message}</p>
                  ) : (
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      {item.state === 'done' ? (
                        <div className="h-full w-full rounded-full bg-[#D98B9B]" />
                      ) : (
                        <motion.div
                          className="h-full w-2/5 rounded-full bg-[#3F8570]"
                          animate={{ x: ['-100%', '250%'] }}
                          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}
                    </div>
                  )}
                </div>

                <span className="w-24 shrink-0 text-right text-xs font-semibold text-slate-500">
                  {item.state === 'done'
                    ? 'Uploaded'
                    : item.state === 'error'
                      ? 'Not uploaded'
                      : `Uploading… · ${bytes(item.size)}`}
                </span>

                {item.state === 'error' && (
                  <button
                    onClick={() => setQueue((q) => q.filter((i) => i.id !== item.id))}
                    className="inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center sm:min-h-0 sm:min-w-0 rounded-full p-1 text-slate-400 hover:bg-slate-100"
                    aria-label={`Dismiss ${item.name}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

import { useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UploadCloud, FileText, CheckCircle2, X } from 'lucide-react'
import { bytes, cx, uid } from '../lib/helpers'
import type { UploadedFileMeta } from '../types'

interface QueueItem {
  id: string
  name: string
  size: number
  progress: number
  done: boolean
}

export interface FileUploaderProps {
  onUploaded?: (meta: UploadedFileMeta) => void
  accept?: string
  label?: string
}

/**
 * Demo uploader: reads the chosen files, simulates progress, then hands
 * the metadata to the parent via onUploaded(). No server required.
 */
export default function FileUploader({
  onUploaded,
  accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg',
  label = 'Drop files here or browse',
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      const files = Array.from(fileList ?? [])
      if (!files.length) return

      files.forEach((file) => {
        const id = uid('up')
        setQueue((q) => [...q, { id, name: file.name, size: file.size, progress: 0, done: false }])

        let pct = 0
        const timer = setInterval(() => {
          pct += Math.random() * 22 + 8
          if (pct >= 100) {
            pct = 100
            clearInterval(timer)
            setQueue((q) => q.map((i) => (i.id === id ? { ...i, progress: 100, done: true } : i)))
            onUploaded?.({ title: file.name.replace(/\.[^.]+$/, ''), fileName: file.name, size: file.size })
            setTimeout(() => setQueue((q) => q.filter((i) => i.id !== id)), 2600)
          } else {
            setQueue((q) => q.map((i) => (i.id === id ? { ...i, progress: Math.round(pct) } : i)))
          }
        }, 220)
      })
    },
    [onUploaded],
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
            ? 'border-[#4F77D9] bg-[#4F77D9]/5 scale-[1.01]'
            : 'border-slate-300 bg-slate-50/60 hover:border-[#4F77D9] hover:bg-[#4F77D9]/5',
        )}
      >
        <motion.span
          animate={{ y: dragging ? -4 : 0 }}
          className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#4F77D9] shadow-sm"
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
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  {item.done ? <CheckCircle2 size={17} className="text-[#2E8C72]" /> : <FileText size={17} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      className={cx('h-full rounded-full', item.done ? 'bg-[#5DC4A6]' : 'bg-[#4F77D9]')}
                      animate={{ width: `${item.progress}%` }}
                      transition={{ duration: 0.2 }}
                    />
                  </div>
                </div>
                <span className="w-20 shrink-0 text-right text-xs font-semibold text-slate-500">
                  {item.done ? 'Uploaded' : `${item.progress}% · ${bytes(item.size)}`}
                </span>
                {!item.done && (
                  <button
                    onClick={() => setQueue((q) => q.filter((i) => i.id !== item.id))}
                    className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
                    aria-label={`Cancel upload of ${item.name}`}
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

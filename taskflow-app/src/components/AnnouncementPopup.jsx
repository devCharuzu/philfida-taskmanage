import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { getMyAnnouncements, setAnnouncementState } from '../lib/api'

// Shown once per sign-in. Announcements the person ticked "do not show again"
// on are filtered out server-side by the Dismissed flag, so the choice follows
// them to any device rather than living in this browser only.
const SHOWN_KEY = 'philfida_announcements_shown_for'

const OVERVIEW_CHARS = 320

export default function AnnouncementPopup({ onOpenAnnouncements }) {
  const session = useStore(s => s.session)
  const [queue, setQueue] = useState([])
  const [idx, setIdx] = useState(0)
  const [dontShow, setDontShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session?.ID) return
    // Only once per session, not on every route change.
    let already = null
    try { already = sessionStorage.getItem(SHOWN_KEY) } catch { /* private mode */ }
    if (already === String(session.ID)) return

    let alive = true
    getMyAnnouncements(session.ID).then(list => {
      if (!alive) return
      const pending = list.filter(a => !a.dismissed && !a.archived)
      setQueue(pending)
      setIdx(0)
      try { sessionStorage.setItem(SHOWN_KEY, String(session.ID)) } catch { /* ignore */ }
    }).catch(() => {})
    return () => { alive = false }
  }, [session?.ID])

  const item = queue[idx]
  if (!item) return null

  const body = item.Body || ''
  const isLong = body.length > OVERVIEW_CHARS
  const overview = isLong ? body.slice(0, OVERVIEW_CHARS).trimEnd() + '…' : body

  async function close() {
    setBusy(true)
    try {
      // Mark seen; "do not show again" additionally dismisses it for good.
      await setAnnouncementState(item.ID, session.ID,
        dontShow ? { isRead: true, dismissed: true } : { isRead: true })
    } catch (e) {
      console.warn('announcement state failed', e)
    } finally {
      setBusy(false)
      setDontShow(false)
      setIdx(i => i + 1)
    }
  }

  async function readMore() {
    try { await setAnnouncementState(item.ID, session.ID, { isRead: true, ...(dontShow ? { dismissed: true } : {}) }) }
    catch { /* non-blocking */ }
    setQueue([])
    onOpenAnnouncements?.(item.ID)
  }

  const fmt = (iso) => new Date(iso).toLocaleDateString('en-PH',
    { month: 'short', day: 'numeric', year: 'numeric' })

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-slate-900/60 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center gap-3 rounded-t-2xl bg-green-800 px-6 py-4">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/15">
              <i className="bi bi-megaphone-fill text-base text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-0 truncate text-[15px] font-semibold leading-tight tracking-tight text-white">
                {item.Title}
              </p>
              <p className="mb-0 mt-0.5 truncate text-[11px] font-medium leading-tight text-green-100/80">
                {item.SenderName} · {fmt(item.CreatedAt)}
                {queue.length > 1 && ` · ${idx + 1} of ${queue.length}`}
              </p>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-700">
              {overview || <span className="italic text-slate-400">No further details were provided.</span>}
            </div>
            {item.ExpiresAt && (
              <p className="mb-0 mt-3 text-[11px] text-amber-700">
                Shown until {fmt(item.ExpiresAt)}
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
            <div className="flex gap-2">
              <button onClick={readMore} disabled={busy}
                className="flex-1 rounded-lg bg-green-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-900 disabled:opacity-60">
                Read more
              </button>
              <button onClick={close} disabled={busy}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:opacity-60">
                {idx + 1 < queue.length ? 'Next' : 'Close'}
              </button>
            </div>

            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 text-[11px] font-medium text-slate-500">
              <input type="checkbox" className="h-3.5 w-3.5 accent-green-600"
                checked={dontShow} onChange={e => setDontShow(e.target.checked)} />
              Do not show this announcement again
            </label>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

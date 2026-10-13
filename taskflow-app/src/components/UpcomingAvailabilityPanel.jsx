import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import {
  formatPresenceScheduleRange,
  getManilaDateTimeString,
  getPresenceScheduleLabel,
  getPresenceScheduleWindow,
  isPresenceScheduleVisible,
} from '../lib/availability'

export default function UpcomingAvailabilityPanel({ schedules = [] }) {
  const [open, setOpen] = useState(false)
  const items = useMemo(() => schedules
    .filter(schedule => isPresenceScheduleVisible(schedule))
    .sort((a, b) => {
      const aWindow = getPresenceScheduleWindow(a)
      const bWindow = getPresenceScheduleWindow(b)
      return aWindow.start.localeCompare(bWindow.start)
    }), [schedules])

  const session = useStore(s => s.session)
  const userId = session?.ID
  const [dontShow, setDontShow] = useState(false)
  const previousIds = useRef(new Set())
  const initializedFor = useRef(null)
  const preferenceKey = `philfida_avail_welcome_hide_${userId}`

  useEffect(() => {
    if (!userId) return
    const ids = new Set(items.map(item => String(item.ID || item.id)))
    let hidden = dontShow
    try { hidden = localStorage.getItem(preferenceKey) === '1' } catch { /* storage unavailable */ }
    if (initializedFor.current !== userId) {
      initializedFor.current = userId
      setDontShow(hidden)
      setOpen(!hidden)
    } else if (!hidden && [...ids].some(id => !previousIds.current.has(id))) {
      setOpen(true)
    }
    previousIds.current = ids
  }, [userId, preferenceKey, items, dontShow])

  useEffect(() => {
    const openManually = () => setOpen(true)
    window.addEventListener('open-availability-schedules', openManually)
    return () => window.removeEventListener('open-availability-schedules', openManually)
  }, [])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  function changePreference(checked) {
    setDontShow(checked)
    try {
      if (checked) localStorage.setItem(preferenceKey, '1')
      else localStorage.removeItem(preferenceKey)
    } catch { /* storage unavailable */ }
  }

  const now = getManilaDateTimeString()
  return (
    <>
      {open && createPortal(
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5"
          onClick={event => event.target === event.currentTarget && setOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="upcoming-availability-title"
            className="flex max-h-[min(82dvh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-center gap-3 bg-green-900 px-5 py-4 text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-green-200">
                <i className="bi bi-calendar2-week-fill text-lg" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="upcoming-availability-title" className="mb-0 text-sm font-bold text-white">Welcome{session?.Name ? `, ${session.Name}` : ''}!</h2>
                <p className="mb-0 mt-1 text-[11px] text-green-100/80">Travel and leave schedules · {items.length} {items.length === 1 ? 'schedule' : 'schedules'}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close scheduled availability"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-green-100 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </header>

            <div className="flex-1 space-y-2 overflow-y-auto p-4 sm:p-5">
              {items.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No current or upcoming travel or leave schedules.</p>}
              {items.map(schedule => {
                const type = schedule.Type || schedule.type
                const isTravel = type === 'travel'
                const { start, end } = getPresenceScheduleWindow(schedule)
                const inProgress = now >= start && now < end
                const placeOrReason = isTravel
                  ? [schedule.TravelActivity, schedule.TravelLocation].filter(Boolean).join(' · ')
                  : [schedule.LeaveType, schedule.LeaveReason].filter(Boolean).join(' · ')
                return (
                  <article
                    key={schedule.ID || schedule.id}
                    className={`rounded-xl border p-3.5 ${isTravel ? 'border-blue-100 bg-blue-50/60' : 'border-rose-100 bg-rose-50/60'}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${isTravel ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
                        <i className={`bi ${isTravel ? 'bi-airplane-fill' : 'bi-calendar-x-fill'}`} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="mb-0 truncate text-sm font-bold text-slate-800">{schedule.EmployeeName || 'Personnel'}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${isTravel ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'}`}>
                            {getPresenceScheduleLabel(schedule)}
                          </span>
                          {inProgress && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800">In progress</span>}
                        </div>
                        <p className="mb-0 mt-1 text-xs font-semibold text-slate-600">{formatPresenceScheduleRange(schedule)}</p>
                        {placeOrReason && <p className="mb-0 mt-1 break-words text-[11px] leading-relaxed text-slate-500">{placeOrReason}</p>}
                        <p className="mb-0 mt-1 text-[10px] font-medium text-slate-400">{schedule.Region || 'Region not specified'}</p>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
            <footer className="border-t border-slate-100 px-4 py-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={dontShow} onChange={event => changePreference(event.target.checked)} className="h-4 w-4 accent-green-800" />
                Don't show this automatically again
              </label>
              <p className="mt-1 text-xs text-slate-400">Saved for your account on this browser. Open Scheduled anytime to review or change this option.</p>
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-4 py-2 text-xs font-semibold">Done</button>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}

// Role pages keep the launcher in their header; App owns the single popup.
export function UpcomingAvailabilityButton({ schedules = [] }) {
  const items = schedules.filter(schedule => isPresenceScheduleVisible(schedule))
  return (
    <div className="border-b border-slate-200 bg-white px-4 py-2 md:px-8">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event('open-availability-schedules'))}
        aria-label={`${items.length} upcoming availability schedules`}
        className="inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
      >
        <i className="bi bi-calendar2-week-fill" aria-hidden="true" />
        Scheduled <span className="rounded-full bg-amber-200/70 px-1.5 py-0.5 tabular-nums">{items.length}</span>
      </button>

    </div>
  )
}

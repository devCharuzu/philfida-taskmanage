import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatPresenceScheduleRange, getPresenceScheduleLabel } from '../lib/availability'

function statusLabel(status) {
  if (status?.startsWith('Official Travel')) return 'Official Travel now'
  if (status?.startsWith('On Leave')) return 'On Leave now'
  return 'Available now'
}

export default function DispatchAvailabilityConfirm({ dispatchConfirm, pendingDispatch, onCancel, onConfirm }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const warningsById = useMemo(() => new Map(
    (dispatchConfirm?.warnings || []).map(person => [String(person.ID), person])
  ), [dispatchConfirm])
  const recipients = dispatchConfirm?.recipients || []

  useEffect(() => {
    setError('')
    setLoading(false)
  }, [dispatchConfirm])

  useEffect(() => {
    if (!dispatchConfirm) return
    const closeOnEscape = event => {
      if (event.key === 'Escape' && !loading) onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [dispatchConfirm, loading, onCancel])

  if (!dispatchConfirm) return null

  const warningCount = warningsById.size
  const recipientCount = recipients.length
  const recipientLabel = `${recipientCount} ${recipientCount === 1 ? 'person' : 'people'}`

  async function confirmDispatch() {
    if (!pendingDispatch || loading) return
    setLoading(true)
    setError('')
    try {
      await onConfirm()
    } catch (failure) {
      setError(failure.message || 'The task could not be dispatched. Review the error and retry.')
    } finally {
      setLoading(false)
    }
  }

  const confirmation = (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5"
      onClick={event => event.target === event.currentTarget && !loading && onCancel()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispatch-availability-title"
        className="flex max-h-[min(82dvh,700px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-center gap-3 bg-amber-500 px-5 py-4 text-white">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
            <i className="bi bi-exclamation-triangle-fill text-lg" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="dispatch-availability-title" className="mb-0 text-sm font-bold">Availability notice</h2>
            <p className="mb-0 mt-1 text-xs text-amber-50">
              {warningCount} of {recipientCount} selected {warningCount === 1 ? 'person has' : 'people have'} a current or upcoming schedule.
            </p>
          </div>
          <button type="button" onClick={onCancel} disabled={loading} aria-label="Cancel dispatch" className="flex h-9 w-9 items-center justify-center rounded-lg text-amber-50 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-50">
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Task</span>
            <span className="min-w-0 truncate text-xs font-semibold text-slate-800">{pendingDispatch?.title || 'New task'}</span>
          </div>

          <div className="space-y-2">
            {recipients.map(person => {
              const warning = warningsById.get(String(person.ID))
              const unavailable = person.Status?.startsWith('Official Travel') || person.Status?.startsWith('On Leave')
              return (
                <article key={person.ID} className={`rounded-xl border p-3 ${warning ? 'border-amber-200 bg-amber-50/70' : 'border-emerald-100 bg-emerald-50/60'}`}>
                  <div className="flex items-start gap-2.5">
                    <span className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${unavailable ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="mb-0 text-xs font-bold text-slate-800">{person.Name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${unavailable ? 'bg-amber-200 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>
                          {statusLabel(person.Status)}
                        </span>
                      </div>
                      <p className="mb-0 mt-0.5 text-[10px] text-slate-500">{person.Unit || person.Office || 'Unit not set'}</p>
                      {warning?.upcomingSchedules?.map(schedule => (
                        <p key={schedule.ID} className="mb-0 mt-1.5 text-[10px] font-semibold text-amber-900">
                          Scheduled {getPresenceScheduleLabel(schedule)} · {formatPresenceScheduleRange(schedule)}
                        </p>
                      ))}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <p className="mb-0 text-xs leading-relaxed text-slate-600">
            The task will be created separately for all {recipientLabel}. You can still cancel and change the selection.
          </p>
          {error && <p role="alert" className="mb-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 p-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={loading} className="btn-secondary min-h-10 px-4 py-2.5 text-xs font-semibold disabled:opacity-50">Go back</button>
          <button type="button" onClick={confirmDispatch} disabled={loading || !pendingDispatch} aria-busy={loading} className="btn-primary min-h-10 px-4 py-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60">
            {loading
              ? <><span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Dispatching…</>
              : <><i className="bi bi-send-fill mr-2" aria-hidden="true" />Dispatch to {recipientLabel}</>}
          </button>
        </footer>
      </section>
    </div>
  )

  // Keep this component renderable in server-side previews and tests while
  // retaining the body-level overlay in the browser.
  return typeof document === 'undefined'
    ? confirmation
    : createPortal(confirmation, document.body)
}

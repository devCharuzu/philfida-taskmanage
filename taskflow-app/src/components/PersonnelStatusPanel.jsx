import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { normalizeStatus } from './PresenceToggle'
import { getSignedFileUrl, stripStatusMarkers } from '../lib/api'

/**
 * PersonnelStatusPanel — shared personnel availability roster.
 *
 * Renders the availability status bar (Available / Official Travel / On Leave
 * pills plus a Personnel button) and the drill-down modals: a grouped roster
 * modal and a per-person detail modal (travel venue/dates, travel-order file
 * view/download, leave note, role, employee ID).
 *
 * Used by the Director page and the employee Dashboard so every role sees the
 * same availability picture. Pass the already-filtered user list, e.g. active
 * non-director personnel in the viewer's region.
 *
 * The ref exposes a `close()` method so a parent can dismiss any open panel UI
 * (e.g. the Director page closes it when opening the dispatch drawer).
 */
const PersonnelStatusPanel = forwardRef(function PersonnelStatusPanel({ users }, ref) {
  const [modalOpen, setModalOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [travelOrderSignedUrl, setTravelOrderSignedUrl] = useState('')
  const [travelOrderLoading, setTravelOrderLoading] = useState(false)

  useImperativeHandle(ref, () => ({
    close: () => { setModalOpen(false); setSelected(null) },
  }), [])

  // Resolve travel order file path → signed URL when the detail modal opens
  useEffect(() => {
    setTravelOrderSignedUrl('')
    if (!selected?.Status?.startsWith('Official Travel')) return
    const raw = selected.Status
    const match = raw.match(/\[TO:(.*?)\]/)
    const path = match ? match[1] : null
    if (!path) return
    setTravelOrderLoading(true)
    getSignedFileUrl(path)
      .then(url => setTravelOrderSignedUrl(url || ''))
      .catch(() => setTravelOrderSignedUrl(''))
      .finally(() => setTravelOrderLoading(false))
  }, [selected])

  // Personnel grouped by availability status
  const groups = {
    Available:         users.filter(u => normalizeStatus(u.Status) === 'Available'),
    'Official Travel': users.filter(u => normalizeStatus(u.Status) === 'Official Travel'),
    'On Leave':        users.filter(u => normalizeStatus(u.Status) === 'On Leave'),
  }

  return (
    <>
      {/* ── PERSONNEL STATUS BAR ── */}
      <div className="px-4 md:px-8 py-2.5 border-b border-slate-200 bg-white flex-shrink-0 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-0.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
            <span className="text-[11px] font-bold uppercase tracking-tight">{groups['Available'].length} Available</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100 shadow-sm whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-blue-500 shadow-sm shadow-blue-200" />
            <span className="text-[11px] font-bold uppercase tracking-tight">{groups['Official Travel'].length} Travel</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-full border border-rose-100 shadow-sm whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-200" />
            <span className="text-[11px] font-bold uppercase tracking-tight">{groups['On Leave'].length} Leave</span>
          </div>
        </div>

        {users.length > 0 && (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all active:scale-95 shadow-sm"
          >
            <i className="bi bi-people-fill text-green-700" />
            Personnel <span className="text-slate-400 font-medium">({users.length})</span>
          </button>
        )}
      </div>

      {/* ── PERSONNEL MODAL ── */}
      {modalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#0a2e0a,#155414)' }}>
              <div className="flex items-start gap-4">
                <i className="bi bi-people-fill text-white text-base" />
                <div>
                  <p className="text-white font-bold text-sm leading-none mb-0">Personnel Status</p>
                  <p className="text-green-300 text-[10px] leading-none mt-0.5">{users.length} active personnel</p>
                </div>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-green-300 hover:text-white text-2xl leading-none">&times;</button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Available */}
              {groups['Available'].length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Available ({groups['Available'].length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {groups['Available'].map(u => (
                      <div key={u.ID} className="flex items-start gap-4 px-3 py-2.5 bg-emerald-50 rounded-lg border border-emerald-100 hover:border-emerald-200 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                          {u.Name?.charAt(0) || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-emerald-900 text-sm truncate leading-none mb-0">{u.Name}</p>
                          <p className="text-emerald-600 text-[10px] truncate leading-none mt-0.5">{u.Unit || u.Office || '—'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Official Travel */}
              {groups['Official Travel'].length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Official Travel ({groups['Official Travel'].length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {groups['Official Travel'].map(u => {
                      const detail = u.Status.split(' — ')?.[1] || ''
                      return (
                        <button
                          key={u.ID}
                          onClick={() => setSelected(u)}
                          className="flex items-start gap-4 px-3 py-2.5 bg-blue-50 rounded-lg border border-blue-100 hover:bg-blue-100 hover:border-blue-200 transition-colors text-left w-full"
                        >
                          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                            {u.Name?.charAt(0) || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-blue-900 text-sm truncate leading-none mb-0">{u.Name}</p>
                            <p className="text-blue-600 text-[10px] truncate leading-none mt-0.5">{u.Unit || u.Office || '—'}</p>
                            {detail && <p className="text-blue-500 text-[10px] italic truncate leading-none mt-0.5">{detail}</p>}
                          </div>
                          <i className="bi bi-chevron-right text-blue-400 text-xs flex-shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* On Leave */}
              {groups['On Leave'].length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    On Leave ({groups['On Leave'].length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {groups['On Leave'].map(u => {
                      const detail = u.Status.split(' — ')?.[1] || ''
                      return (
                        <button
                          key={u.ID}
                          onClick={() => setSelected(u)}
                          className="flex items-start gap-4 px-3 py-2.5 bg-red-50 rounded-lg border border-red-100 hover:bg-red-100 hover:border-red-200 transition-colors text-left w-full"
                        >
                          <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                            {u.Name?.charAt(0) || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-red-900 text-sm truncate leading-none mb-0">{u.Name}</p>
                            <p className="text-red-600 text-[10px] truncate leading-none mt-0.5">{u.Unit || u.Office || '—'}</p>
                            {detail && <p className="text-red-500 text-[10px] italic truncate leading-none mt-0.5">{detail}</p>}
                          </div>
                          <i className="bi bi-chevron-right text-red-400 text-xs flex-shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
              <button onClick={() => setModalOpen(false)} className="btn-secondary w-full py-2">
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── PERSONNEL DETAIL MODAL ── */}
      {selected && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className={`flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0 ${
              selected.Status?.startsWith('Official Travel') ? 'bg-blue-600' :
              selected.Status?.startsWith('On Leave') ? 'bg-red-600' : 'bg-emerald-600'
            }`}>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">{selected.Name?.charAt(0) || '?'}</span>
                </div>
                <div>
                  <p className="text-white font-bold text-sm leading-none mb-0">{selected.Name}</p>
                  <p className="text-white/80 text-[10px] leading-none mt-0.5">{selected.Unit || selected.Office || '—'}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/80 hover:text-white text-2xl leading-none">&times;</button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              {/* Status Badge */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Current Status</p>
                <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                  selected.Status?.startsWith('Official Travel') ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                  selected.Status?.startsWith('On Leave') ? 'bg-red-50 text-red-700 border border-red-200' :
                  'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    selected.Status?.startsWith('Official Travel') ? 'bg-blue-500' :
                    selected.Status?.startsWith('On Leave') ? 'bg-red-500' : 'bg-emerald-500'
                  }`} />
                  {selected.Status?.split(' — ')?.[0] || selected.Status || 'Available'}
                </div>

                {/* ── Official Travel: parsed detail fields ── */}
                {selected.Status?.startsWith('Official Travel') && (() => {
                  const raw = selected.Status
                  const travelOrderMatch = raw.match(/\[TO:(.*?)\]/)
                  const travelOrderUrl = travelOrderMatch ? travelOrderMatch[1] : null
                  const clean = stripStatusMarkers(raw)
                  const detail = clean.split(' — ')?.[1] || ''
                  // Parse: "eventName at location (dateStart to dateEnd)"
                  const parenMatch = detail.match(/^(.*?)\s+\(([^)]+)\)\s*$/)
                  const beforeParen = parenMatch ? parenMatch[1] : detail
                  const dateRange   = parenMatch ? parenMatch[2] : ''
                  const atIdx       = beforeParen.lastIndexOf(' at ')
                  const eventName   = atIdx > -1 ? beforeParen.slice(0, atIdx).trim() : beforeParen.trim()
                  const location    = atIdx > -1 ? beforeParen.slice(atIdx + 4).trim() : ''
                  return (
                    <div className="mt-3 space-y-2.5">
                      {eventName && (
                        <div className="flex items-start gap-2.5">
                          <i className="bi bi-calendar-event-fill text-blue-400 text-sm mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Travel Name</p>
                            <p className="text-sm text-slate-700 font-medium leading-snug">{eventName}</p>
                          </div>
                        </div>
                      )}
                      {location && (
                        <div className="flex items-start gap-2.5">
                          <i className="bi bi-geo-alt-fill text-blue-400 text-sm mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Venue</p>
                            <p className="text-sm text-slate-700 font-medium leading-snug">{location}</p>
                          </div>
                        </div>
                      )}
                      {dateRange && (
                        <div className="flex items-start gap-2.5">
                          <i className="bi bi-calendar-range-fill text-blue-400 text-sm mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Date</p>
                            <p className="text-sm text-slate-700 font-medium leading-snug">{dateRange}</p>
                          </div>
                        </div>
                      )}
                      {travelOrderUrl ? (
                        <div className="pt-2 border-t border-slate-100">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Travel Order File</p>
                          {travelOrderLoading ? (
                            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                              <span className="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
                              Preparing file…
                            </div>
                          ) : travelOrderSignedUrl ? (
                            <div className="flex gap-2">
                              {/* VIEW — opens in new browser tab */}
                              <button
                                onClick={() => window.open(travelOrderSignedUrl, '_blank')}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 active:bg-blue-200 transition-colors font-semibold text-xs"
                              >
                                <i className="bi bi-eye-fill text-sm" />
                                View
                              </button>
                              {/* DOWNLOAD — fetch blob so browser saves to disk */}
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await fetch(travelOrderSignedUrl, { mode: 'cors' })
                                    const blob = await res.blob()
                                    const fname = decodeURIComponent(
                                      travelOrderSignedUrl.split('?')[0].split('/').pop()
                                    ) || 'travel-order'
                                    const a = document.createElement('a')
                                    a.href = URL.createObjectURL(blob)
                                    a.download = fname
                                    document.body.appendChild(a); a.click()
                                    document.body.removeChild(a); URL.revokeObjectURL(a.href)
                                  } catch (error) {
                                    window.open(travelOrderSignedUrl, '_blank')
                                  }
                                }}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 active:bg-emerald-200 transition-colors font-semibold text-xs"
                              >
                                <i className="bi bi-download text-sm" />
                                Download
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-red-400 italic">Could not load file. Try again.</p>
                          )}
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-slate-100">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Travel Order File</p>
                          <p className="text-xs text-slate-400 italic">No file attached</p>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* ── On Leave: simple detail ── */}
                {selected.Status?.startsWith('On Leave') && selected.Status?.includes(' — ') && (
                  <p className="mt-2 text-sm text-slate-600 italic">
                    {selected.Status.split(' — ')[1]}
                  </p>
                )}
              </div>

              {/* Role */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Role</p>
                <p className="text-sm text-slate-700 font-medium">{selected.Role || 'Employee'}</p>
              </div>

              {/* Employee ID */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Employee ID</p>
                <p className="text-sm text-slate-700 font-mono">{selected.ID}</p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50">
              <button onClick={() => setSelected(null)} className="btn-secondary w-full py-2.5">
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
})

export default PersonnelStatusPanel

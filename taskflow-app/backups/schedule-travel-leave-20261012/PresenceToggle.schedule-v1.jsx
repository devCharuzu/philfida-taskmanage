import { useState, useEffect, useRef, lazy, Suspense} from 'react'
import { createPortal } from 'react-dom'
const LocationPicker = lazy(() => import('./LocationPicker'))
import { updatePresence, uploadFiles, buildTravelStatus } from '../lib/api'

// ── Exported helper: normalizes stored status string to base key ──
// NOTE: the stored status prefixes ('Official Travel', 'On Leave') are unchanged
// so existing data, parsing and the scheduler keep working. Only the
// user-facing labels were renamed to "Schedule Travel" / "Schedule Leave".
export function normalizeStatus(raw) {
  if (!raw) return 'Available'
  if (raw.startsWith('Official Travel')) return 'Official Travel'
  if (raw.startsWith('On Leave'))        return 'On Leave'
  return 'Available'
}

const LEAVE_TYPES = [
  'Vacation Leave', 'Sick Leave', 'Maternity Leave', 'Paternity Leave',
  'Special Leave',  'Emergency Leave', 'Study Leave', 'Mandatory Leave', 'Others',
]

const OPTIONS = [
  {
    value:    'Available',
    label:    'Available',
    active:   'bg-emerald-600 text-white border-emerald-700 shadow-sm',
    inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300',
    dot:      'bg-emerald-400',
  },
  {
    value:    'Official Travel',
    label:    'Schedule Travel',
    active:   'bg-blue-600 text-white border-blue-700 shadow-sm',
    inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-blue-50 hover:border-blue-300',
    dot:      'bg-blue-400',
  },
  {
    value:    'On Leave',
    label:    'Schedule Leave',
    active:   'bg-red-500 text-white border-red-600 shadow-sm',
    inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-red-50 hover:border-red-300',
    dot:      'bg-red-400',
  },
]

// ── Scheduling helpers ──────────────────────────────────────────
const DURATION_PRESETS = [
  { label: '3 days', days: 3 },
  { label: '5 days', days: 5 },
  { label: '1 week', days: 7 },
]

// Today's date in Asia/Manila as YYYY-MM-DD (the timezone the scheduler uses).
function manilaToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

// Timezone-safe date arithmetic on YYYY-MM-DD strings.
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// "2026-10-20" → "Oct 20" for compact display.
function fmtShort(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Segmented "Start now / Schedule" toggle used by both modals.
function ModeToggle({ mode, setMode }) {
  const choices = [
    { v: 'now',      label: 'Start now', hint: 'Takes effect immediately' },
    { v: 'schedule', label: 'Schedule',  hint: 'Activates on the start date' },
  ]
  return (
    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
      {choices.map(o => {
        const active = mode === o.v
        return (
          <button key={o.v} type="button" onClick={() => setMode(o.v)}
            className={`py-2 px-2 rounded-lg transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${active ? 'bg-white shadow-sm' : 'hover:bg-white/60'}`}>
            <span className={`block text-[11px] font-black uppercase tracking-widest transition-colors duration-200 ${active ? 'text-slate-800' : 'text-slate-400'}`}>{o.label}</span>
            <span className={`block text-[9px] font-medium mt-0.5 transition-colors duration-200 ${active ? 'text-slate-500' : 'text-slate-400/80'}`}>{o.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

// Quick duration presets: 3 days / 5 days / 1 week. Accent matches the modal.
function DurationPresets({ preset, onPick, accent }) {
  const activeCls = accent === 'blue'
    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
    : 'bg-red-600 text-white border-red-600 shadow-sm'
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Duration</label>
      <div className="flex gap-1.5">
        {DURATION_PRESETS.map(p => {
          const active = preset === p.days
          return (
            <button key={p.days} type="button" onClick={() => onPick(p.days)}
              className={`flex-1 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wide transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 ${active ? activeCls : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700 focus-visible:ring-slate-300'}`}>
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ChangeConfirmModal({ current, target, onConfirm, onCancel }) {
  const from = OPTIONS.find(o => o.value === current)
  const to   = OPTIONS.find(o => o.value === target)
  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300"
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="px-6 py-5 flex items-center gap-4"
          style={{ background: 'linear-gradient(135deg, #014d2a, #016837)' }}>
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/10">
            <i className="bi bi-arrow-left-right text-white text-lg" />
          </div>
          <div>
            <p className="text-white font-black text-sm uppercase tracking-tight leading-none">Change Availability</p>
            <p className="text-green-300/80 text-[10px] mt-1 font-bold uppercase tracking-widest">Confirmation Required</p>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className={`flex-1 text-center py-2 rounded-lg text-[10px] font-black uppercase border shadow-sm ${
              current === 'Available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              current === 'Official Travel' ? 'bg-blue-50 text-blue-700 border-blue-200' :
              'bg-red-50 text-red-700 border-red-200'
            }`}>{from?.label || current}</span>
            <i className="bi bi-arrow-right text-slate-400 flex-shrink-0" />
            <span className={`flex-1 text-center py-2 rounded-lg text-[10px] font-black uppercase border shadow-sm ${
              target === 'Available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              target === 'Official Travel' ? 'bg-blue-50 text-blue-700 border-blue-200' :
              'bg-red-50 text-red-700 border-red-200'
            }`}>{to?.label || target}</span>
          </div>
          <p className="text-slate-600 text-[13px] mb-6 text-center font-medium leading-relaxed">
            Are you sure you want to update your current availability status? This action will be reflected in real-time.
          </p>
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all border border-slate-100">Cancel</button>
            <button onClick={onConfirm} className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-white rounded-xl shadow-lg shadow-green-900/20 active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg, #016837, #027a42)' }}>Confirm</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Travel Modal ──────────────────────────────────────────────
function TravelModal({ onConfirm, onCancel }) {
  const [mode, setMode]         = useState('now') // 'now' | 'schedule'
  const [preset, setPreset]     = useState(null) // 3 | 5 | 7 | null (custom)
  const [busy, setBusy]         = useState(false)
  const [eventName, setEventName] = useState('')
  const [location,  setLocation]  = useState('')
  const [geo,       setGeo]       = useState(null)   // { lat, lng } once pinned
  const [dateStart, setDateStart] = useState('')
  const [timeStart, setTimeStart] = useState('08:00')
  const [dateEnd,   setDateEnd]   = useState('')
  const [timeEnd,   setTimeEnd]   = useState('17:00')
  const [error,     setError]     = useState('')

  const fileInputRef = useRef(null)
  const [files, setFiles] = useState([])
  const today = manilaToday()

  function pickPreset(days) {
    const start = dateStart || today
    if (!dateStart) setDateStart(start)
    setDateEnd(addDays(start, days - 1))
    setPreset(days)
    setError('')
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!eventName || !location || !dateStart || !dateEnd) { setError('All fields are required.'); return }
    if (mode === 'now' && files.length === 0) { setError('Travel Order file is required.'); return }
    if (mode === 'schedule' && dateStart < today) { setError('Scheduled start date cannot be in the past.'); return }
    if (dateEnd < dateStart) { setError('End date must be after start date.'); return }
    if (dateEnd === dateStart && timeEnd <= timeStart) { setError('End time must be after start time on same day.'); return }
    setError('')
    setBusy(true)
    Promise.resolve(onConfirm({ eventName, location, lat: geo?.lat ?? null, lng: geo?.lng ?? null, dateStart, timeStart, dateEnd, timeEnd, files, mode }))
      .then(res => { if (res?.ok) onCancel() })
      .catch(() => {})
      .finally(() => setBusy(false))
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9998] animate-in fade-in duration-300" />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300 overflow-y-auto"
        onClick={e => e.target === e.currentTarget && onCancel()}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 my-4">
          <div className="flex items-center gap-3 px-6 py-4 rounded-t-2xl bg-blue-700">
            <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0">
              <i className="bi bi-airplane-fill text-white text-base" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-0 text-white font-semibold text-[15px] leading-tight tracking-tight">Schedule Travel</p>
              <p className="mb-0 mt-0.5 text-blue-100/80 text-[11px] font-medium leading-tight">
                {mode === 'now' ? 'Travel order required' : 'Plan ahead — activates automatically'}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <i className="bi bi-x-lg text-sm" />
            </button>
          </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-[11px] rounded-xl px-4 py-3 font-bold animate-in fade-in duration-200"><i className="bi bi-exclamation-circle-fill" />{error}</div>}
          <ModeToggle mode={mode} setMode={setMode} />
          {mode === 'schedule' && (
            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <i className="bi bi-calendar-check-fill text-blue-500 text-sm mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-blue-700 font-medium leading-snug">
                Your status stays as-is until <span className="font-bold">{dateStart ? fmtShort(dateStart) : 'the start date'}</span> — then switches to travel automatically.
              </p>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Event / Activity Name</label>
            <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              placeholder="e.g. Regional Fiber Industry Summit"
              value={eventName} onChange={e => setEventName(e.target.value)} autoFocus />
          </div>
          <Suspense fallback={
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Location / Venue</label>
              <div className="h-[60px] rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />
            </div>
          }>
            <LocationPicker
              value={location}
              onChange={({ address, lat, lng }) => {
                setLocation(address)
                setGeo(lat != null && lng != null ? { lat, lng } : null)
              }}
            />
          </Suspense>
          <DurationPresets preset={preset} onPick={pickPreset} accent="blue" />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date Start</label>
              <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                type="date" min={mode === 'schedule' ? today : undefined} value={dateStart}
                onChange={e => { setDateStart(e.target.value); setPreset(null) }} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Time Start</label>
              <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date End</label>
              <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                type="date" min={dateStart} value={dateEnd}
                onChange={e => { setDateEnd(e.target.value); setPreset(null) }} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Time End</label>
              <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center justify-between">
              <span>Travel Order Attachment</span>
              {mode === 'now'
                ? <span className="text-red-500 font-black">REQUIRED</span>
                : <span className="text-slate-400 font-bold">OPTIONAL — ATTACH LATER</span>}
            </label>
            <div className="relative">
              <input type="file" ref={fileInputRef} className="hidden"
                onChange={e => setFiles(Array.from(e.target.files))} />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed transition-all
                  ${files.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-blue-300 hover:bg-blue-50'}`}>
                <i className={`bi ${files.length > 0 ? 'bi-file-earmark-check-fill' : 'bi-cloud-upload'} text-lg`} />
                <span className="text-xs font-bold truncate">
                  {files.length > 0 ? files[0].name : 'Select Travel Order File'}
                </span>
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} disabled={busy} className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all border border-slate-100 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-white rounded-xl shadow-lg shadow-blue-900/20 active:scale-95 transition-all disabled:opacity-70 disabled:active:scale-100"
              style={{ background: 'linear-gradient(135deg, #1e40af, #2563eb)' }}>
              {busy ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  {mode === 'now' ? 'Updating…' : 'Scheduling…'}
                </span>
              ) : mode === 'now' ? 'Start Now' : 'Schedule Travel'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>,
    document.body
  )
}

// ── Leave Modal ───────────────────────────────────────────────
function LeaveModal({ onConfirm, onCancel }) {
  const [mode, setMode]       = useState('now') // 'now' | 'schedule'
  const [preset, setPreset]   = useState(null)
  const [busy, setBusy]       = useState(false)
  const [leaveType, setLeaveType] = useState('')
  const [reason,    setReason]    = useState('')
  const [dateStart, setDateStart] = useState('')
  const [timeStart, setTimeStart] = useState('08:00')
  const [dateEnd,   setDateEnd]   = useState('')
  const [timeEnd,   setTimeEnd]   = useState('17:00')
  const [error,     setError]     = useState('')
  const [files, setFiles] = useState([])
  const fileInputRef = useRef(null)
  const today = manilaToday()

  function pickPreset(days) {
    const start = dateStart || today
    if (!dateStart) setDateStart(start)
    setDateEnd(addDays(start, days - 1))
    setPreset(days)
    setError('')
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!leaveType) { setError('Please select a leave type.'); return }
    if (!reason.trim()) { setError('Please provide a reason for the leave.'); return }
    if (!dateStart || !dateEnd) { setError('Start and end dates are required.'); return }
    if (mode === 'now' && files.length === 0) { setError('Leave attachment is required.'); return }
    if (mode === 'schedule' && dateStart < today) { setError('Scheduled start date cannot be in the past.'); return }
    if (dateEnd < dateStart) { setError('End date must be after start date.'); return }
    if (dateEnd === dateStart && timeEnd <= timeStart) { setError('End time must be after start time on same day.'); return }
    setError('')
    setBusy(true)
    Promise.resolve(onConfirm({ leaveType, reason, dateStart, timeStart, dateEnd, timeEnd, files, mode }))
      .then(res => { if (res?.ok) onCancel() })
      .catch(() => {})
      .finally(() => setBusy(false))
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9998] animate-in fade-in duration-300" />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300 overflow-y-auto"
        onClick={e => e.target === e.currentTarget && onCancel()}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 my-4">
          <div className="flex items-center gap-3 px-6 py-4 rounded-t-2xl bg-red-700">
            <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0">
              <i className="bi bi-calendar-x-fill text-white text-base" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-0 text-white font-semibold text-[15px] leading-tight tracking-tight">Schedule Leave</p>
              <p className="mb-0 mt-0.5 text-red-100/80 text-[11px] font-medium leading-tight">
                {mode === 'now' ? 'Leave details required' : 'Plan ahead — activates automatically'}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <i className="bi bi-x-lg text-sm" />
            </button>
          </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-[11px] rounded-xl px-4 py-3 font-bold animate-in fade-in duration-200"><i className="bi bi-exclamation-circle-fill" />{error}</div>}
          <ModeToggle mode={mode} setMode={setMode} />
          {mode === 'schedule' && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <i className="bi bi-calendar-check-fill text-red-500 text-sm mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-red-700 font-medium leading-snug">
                Your status stays as-is until <span className="font-bold">{dateStart ? fmtShort(dateStart) : 'the start date'}</span> — then switches to leave automatically.
              </p>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Type of Leave</label>
            <div className="grid grid-cols-2 gap-1.5">
              {LEAVE_TYPES.map(type => {
                const active = leaveType === type
                return (
                  <button key={type} type="button" onClick={() => setLeaveType(type)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-black uppercase text-left transition-all duration-200 active:scale-95
                      ${active ? 'bg-red-600 text-white border-red-700 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-red-50 hover:border-red-200'}`}>
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors duration-200
                      ${active ? 'border-white' : 'border-slate-300'}`}>
                      {active && <span className="w-2 h-2 rounded-full bg-white block" />}
                    </div>
                    {type}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reason</label>
            <textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium resize-none"
              rows={2} placeholder="Brief reason for leave..."
              value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          <DurationPresets preset={preset} onPick={pickPreset} accent="red" />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date Start</label>
              <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium"
                type="date" min={mode === 'schedule' ? today : undefined} value={dateStart}
                onChange={e => { setDateStart(e.target.value); setPreset(null) }} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Time Start</label>
              <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium"
                type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date End</label>
              <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium"
                type="date" min={dateStart} value={dateEnd}
                onChange={e => { setDateEnd(e.target.value); setPreset(null) }} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Time End</label>
              <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium"
                type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center justify-between">
              <span>Leave File Attachment</span>
              {mode === 'now'
                ? <span className="text-red-500 font-black">REQUIRED</span>
                : <span className="text-slate-400 font-bold">OPTIONAL — ATTACH LATER</span>}
            </label>
            <div className="relative">
              <input type="file" ref={fileInputRef} className="hidden"
                onChange={e => setFiles(Array.from(e.target.files))} />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed transition-all
                  ${files.length > 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-red-300 hover:bg-red-50'}`}>
                <i className={`bi ${files.length > 0 ? 'bi-file-earmark-check-fill' : 'bi-cloud-upload'} text-lg`} />
                <span className="text-xs font-bold truncate">
                  {files.length > 0 ? files[0].name : 'Select Leave File'}
                </span>
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} disabled={busy} className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all border border-slate-100 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-white rounded-xl shadow-lg shadow-red-900/20 active:scale-95 transition-all disabled:opacity-70 disabled:active:scale-100"
              style={{ background: 'linear-gradient(135deg, #991b1b, #dc2626)' }}>
              {busy ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  {mode === 'now' ? 'Updating…' : 'Scheduling…'}
                </span>
              ) : mode === 'now' ? 'Start Now' : 'Schedule Leave'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>,
    document.body
  )
}

// ── Upcoming scheduled travel/leave ───────────────────────────
// Shows reminders that are scheduled for the future (applied === false).
// The existing scheduler (checkAndApplyScheduledPresence) flips them to
// active automatically when their window starts.
function UpcomingSchedules({ userId }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    if (!userId) return
    const load = () => {
      try {
        const stored = localStorage.getItem(`philfida_calendar_reminders_${userId}`)
        const all = stored ? JSON.parse(stored) : []
        setItems(
          all
            .filter(r => (r.type === 'travel' || r.type === 'leave') && !r.applied)
            .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
        )
      } catch (e) {
        console.error(e)
      }
    }
    load()
    window.addEventListener('storage', load)
    window.addEventListener('presence-reminders-changed', load)
    return () => {
      window.removeEventListener('storage', load)
      window.removeEventListener('presence-reminders-changed', load)
    }
  }, [userId])

  function cancelItem(id) {
    const target = items.find(i => i.id === id)
    if (!target) return
    const when = target.date ? `${fmtShort(target.date)}${target.returnDate && target.returnDate !== target.date ? ` → ${fmtShort(target.returnDate)}` : ''}` : ''
    const label = target.type === 'travel'
      ? `travel${target.travelActivity ? ` (${target.travelActivity})` : ''}`
      : `leave${target.leaveType ? ` (${target.leaveType})` : ''}`
    if (!window.confirm(`Cancel this scheduled ${label}${when ? ` on ${when}` : ''}?`)) return
    try {
      const key = `philfida_calendar_reminders_${userId}`
      const stored = localStorage.getItem(key)
      const all = stored ? JSON.parse(stored) : []
      localStorage.setItem(key, JSON.stringify(all.filter(r => r.id !== id)))
      window.dispatchEvent(new Event('storage'))
      window.dispatchEvent(new Event('presence-reminders-changed'))
    } catch (e) {
      console.error(e)
    }
  }

  if (items.length === 0) return null

  return (
    <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2">
        Upcoming Schedules ({items.length})
      </p>
      <div className="space-y-1.5">
        {items.map(r => {
          const isTravel = r.type === 'travel'
          const title = isTravel
            ? r.travelActivity || 'Travel'
            : `${r.leaveType || 'Leave'}`
          const when = r.date ? `${fmtShort(r.date)}${r.returnDate && r.returnDate !== r.date ? ` → ${fmtShort(r.returnDate)}` : ''}` : ''
          return (
            <div key={r.id}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-colors ${isTravel ? 'bg-blue-50/60 border-blue-100' : 'bg-red-50/60 border-red-100'}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isTravel ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
                <i className={`bi ${isTravel ? 'bi-airplane-fill' : 'bi-calendar-x-fill'} text-sm`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-slate-700 truncate leading-tight">{title}</p>
                {when && <p className="text-[11px] text-slate-400 font-medium mt-0.5">{when}</p>}
              </div>
              <button type="button" onClick={() => cancelItem(r.id)} title="Cancel schedule"
                className="flex-shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-white transition-all active:scale-95">
                Cancel
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function PresenceToggle({ value, userId, onChange, onSync, size = 'small' }) {
  const [modal,          setModal]          = useState(null)  // 'travel' | 'leave' | null
  const [pendingTarget,  setPendingTarget]  = useState(null)  // what they want to switch to
  const [loading,        setLoading]        = useState(false)

  const displayValue = normalizeStatus(value)

  function handleClick(targetValue) {
    // Clicking the currently active status — do nothing
    if (targetValue === displayValue) return

    if (targetValue === 'Available') {
      // Switching back to Available — show confirmation first
      setPendingTarget('Available')
      setModal('confirm')
    } else if (targetValue === 'Official Travel') {
      if (displayValue !== 'Available') {
        // Currently on leave/travel — confirm change first
        setPendingTarget('Official Travel')
        setModal('confirm')
      } else {
        setModal('travel')
      }
    } else if (targetValue === 'On Leave') {
      if (displayValue !== 'Available') {
        // Currently on travel — confirm change first
        setPendingTarget('On Leave')
        setModal('confirm')
      } else {
        setModal('leave')
      }
    }
  }

  // After confirming change — open the appropriate detail modal or set directly
  async function handleChangeConfirmed() {
    setModal(null)
    if (pendingTarget === 'Available') {
      const confirmed = window.confirm(`Note: Resetting your availability to "Available" will also clear/delete any active or scheduled Travel or Leave reminders on your Personal Calendar. Do you want to proceed?`)
      if (!confirmed) {
        setPendingTarget(null)
        return
      }
      setLoading(true)
      try {
        await commitStatus('Available', 'Available')

        // Clear active travel/leave reminders from local storage
        const key = `philfida_calendar_reminders_${userId}`
        const stored = localStorage.getItem(key)
        let reminders = []
        if (stored) {
          try { reminders = JSON.parse(stored) } catch (e) {}
        }
        const filtered = reminders.filter(r => r.type !== 'travel' && r.type !== 'leave')
        localStorage.setItem(key, JSON.stringify(filtered))
        window.dispatchEvent(new Event('storage'))
        window.dispatchEvent(new Event('presence-reminders-changed'))
      } finally {
        setLoading(false)
      }
    } else if (pendingTarget === 'Official Travel') {
      setModal('travel')
    } else if (pendingTarget === 'On Leave') {
      setModal('leave')
    }
    setPendingTarget(null)
  }

  async function commitStatus(displayKey, fullStatus) {
    // Write first. onChange() used to run before this, so the toggle moved even
    // when the write failed — the person saw their new status while every other
    // account still saw the old one.
    await updatePresence(userId, fullStatus)
    onChange?.(fullStatus)
    onSync?.()
  }

  function readReminders() {
    const key = `philfida_calendar_reminders_${userId}`
    const stored = localStorage.getItem(key)
    let reminders = []
    if (stored) {
      try { reminders = JSON.parse(stored) } catch (e) {}
    }
    return { key, reminders }
  }

  function writeReminders(key, reminders) {
    localStorage.setItem(key, JSON.stringify(reminders))
    window.dispatchEvent(new Event('storage'))
    window.dispatchEvent(new Event('presence-reminders-changed'))
  }

  async function uploadFirst(files) {
    if (!files?.length) return ''
    // uploadFiles() returns a pipe-delimited STRING of paths (e.g. "uploads/abc.pdf")
    // NOT an array — use .split('|')[0] to get the first path, not [0] (first character).
    const urlStr = await uploadFiles(files)
    return urlStr ? urlStr.split('|')[0] : ''
  }

  async function confirmTravel(details) {
    // Scheduled mode → create a future reminder instead of changing status now.
    if (details.mode === 'schedule') return scheduleTravel(details)

    const confirmed = window.confirm(`Note: Setting your availability to "Schedule Travel" will also create/update a corresponding travel reminder on your Personal Calendar for these dates. Do you want to proceed?`)
    if (!confirmed) return { cancelled: true }

    setLoading(true)
    try {
      const firstPath = await uploadFirst(details.files)

      const fullStatus = buildTravelStatus({
        activity: details.eventName,
        location: details.location,
        dateRange: `${details.dateStart} ${details.timeStart} to ${details.dateEnd} ${details.timeEnd}`,
        filePath: firstPath,
        lat: details.lat,
        lng: details.lng,
      })
      await commitStatus('travel', fullStatus)

      // Write reminder to local storage
      const { key, reminders } = readReminders()
      // Filter out existing travel/leave reminders
      const kept = reminders.filter(r => r.type !== 'travel' && r.type !== 'leave')

      const newReminder = {
        id: 'active-travel-' + Date.now(),
        title: `Official Travel: ${details.eventName} at ${details.location}`,
        notes: `Official Travel schedule. Start: ${details.dateStart} ${details.timeStart}. Return: ${details.dateEnd} ${details.timeEnd}.`,
        time: details.timeStart,
        timeEnd: details.timeEnd,
        date: details.dateStart,
        color: 'blue',
        type: 'travel',
        travelActivity: details.eventName,
        travelLocation: details.location,
        travelLat: details.lat ?? null,
        travelLng: details.lng ?? null,
        returnDate: details.dateEnd,
        attachments: firstPath || '',
        applied: true
      }
      writeReminders(key, [...kept, newReminder])
      return { ok: true }
    } catch (error) {
      console.error('Travel update failed:', error)
      window.alert(`Could not set your availability to Schedule Travel.\n\n${error.message || 'Please check your connection and try again.'}`)
      return { error: true }
    } finally {
      setLoading(false)
    }
  }

  async function scheduleTravel(details) {
    const range = details.dateEnd !== details.dateStart
      ? `${details.dateStart} to ${details.dateEnd}`
      : details.dateStart
    const confirmed = window.confirm(
      `Schedule this travel for ${range}?\n\nYour status will stay as-is and switch to "Schedule Travel" automatically on the start date.`
    )
    if (!confirmed) return { cancelled: true }

    setLoading(true)
    try {
      const firstPath = await uploadFirst(details.files)

      const { key, reminders } = readReminders()
      // Keep existing reminders — several future schedules may coexist.
      reminders.push({
        id: 'scheduled-travel-' + Date.now(),
        title: `Official Travel: ${details.eventName} at ${details.location}`,
        notes: `Scheduled travel. Start: ${details.dateStart} ${details.timeStart}. Return: ${details.dateEnd} ${details.timeEnd}.`,
        time: details.timeStart,
        timeEnd: details.timeEnd,
        date: details.dateStart,
        color: 'blue',
        type: 'travel',
        travelActivity: details.eventName,
        travelLocation: details.location,
        travelLat: details.lat ?? null,
        travelLng: details.lng ?? null,
        returnDate: details.dateEnd,
        attachments: firstPath || '',
        applied: false
      })
      writeReminders(key, reminders)
      return { ok: true }
    } catch (error) {
      console.error('Schedule travel failed:', error)
      window.alert(`Could not schedule your travel.\n\n${error.message || 'Please check your connection and try again.'}`)
      return { error: true }
    } finally {
      setLoading(false)
    }
  }

  async function confirmLeave(details) {
    // Scheduled mode → create a future reminder instead of changing status now.
    if (details.mode === 'schedule') return scheduleLeave(details)

    const confirmed = window.confirm(`Note: Setting your availability to "Schedule Leave" will also create/update a corresponding leave reminder on your Personal Calendar for these dates. Do you want to proceed?`)
    if (!confirmed) return { cancelled: true }

    setLoading(true)
    try {
      const firstPath = await uploadFirst(details.files)
      const fileInfo = firstPath ? ` [TO:${firstPath}]` : ''

      const full = `On Leave — ${details.leaveType}: ${details.reason} (${details.dateStart} ${details.timeStart} to ${details.dateEnd} ${details.timeEnd})${fileInfo}`
      await commitStatus('On Leave', full)

      // Write reminder to local storage
      const { key, reminders } = readReminders()
      const kept = reminders.filter(r => r.type !== 'travel' && r.type !== 'leave')

      const newReminder = {
        id: 'active-leave-' + Date.now(),
        title: `On Leave: ${details.leaveType} — ${details.reason}`,
        notes: `Leave schedule. Start: ${details.dateStart} ${details.timeStart}. Return: ${details.dateEnd} ${details.timeEnd}.`,
        time: details.timeStart,
        timeEnd: details.timeEnd,
        date: details.dateStart,
        color: 'red',
        type: 'leave',
        leaveType: details.leaveType,
        leaveReason: details.reason,
        returnDate: details.dateEnd,
        attachments: firstPath || '',
        applied: true
      }
      writeReminders(key, [...kept, newReminder])
      return { ok: true }
    } catch (error) {
      console.error('Leave update failed:', error)
      window.alert(`Could not set your availability to Schedule Leave.\n\n${error.message || 'Please check your connection and try again.'}`)
      return { error: true }
    } finally {
      setLoading(false)
    }
  }

  async function scheduleLeave(details) {
    const range = details.dateEnd !== details.dateStart
      ? `${details.dateStart} to ${details.dateEnd}`
      : details.dateStart
    const confirmed = window.confirm(
      `Schedule this leave for ${range}?\n\nYour status will stay as-is and switch to "Schedule Leave" automatically on the start date.`
    )
    if (!confirmed) return { cancelled: true }

    setLoading(true)
    try {
      const firstPath = await uploadFirst(details.files)
      const fileInfo = firstPath ? ` [TO:${firstPath}]` : ''

      const { key, reminders } = readReminders()
      // Keep existing reminders — several future schedules may coexist.
      reminders.push({
        id: 'scheduled-leave-' + Date.now(),
        title: `On Leave: ${details.leaveType} — ${details.reason}`,
        notes: `Scheduled leave. Start: ${details.dateStart} ${details.timeStart}. Return: ${details.dateEnd} ${details.timeEnd}.`,
        time: details.timeStart,
        timeEnd: details.timeEnd,
        date: details.dateStart,
        color: 'red',
        type: 'leave',
        leaveType: details.leaveType,
        leaveReason: details.reason,
        returnDate: details.dateEnd,
        attachments: firstPath || '',
        applied: false
      })
      writeReminders(key, reminders)
      return { ok: true }
    } catch (error) {
      console.error('Schedule leave failed:', error)
      window.alert(`Could not schedule your leave.\n\n${error.message || 'Please check your connection and try again.'}`)
      return { error: true }
    } finally {
      setLoading(false)
    }
  }

  function cancelModal() {
    setModal(null)
    setPendingTarget(null)
  }

  return (
    <>
    <div>
      <div className={`
        ${size === 'large'
          ? 'grid grid-cols-1 sm:grid-cols-3 gap-3 w-full'
          : 'flex items-center gap-1.5 p-1 bg-white border border-slate-200 rounded-xl shadow-sm flex-shrink-0'}
      `}>
        {OPTIONS.map(opt => {
          const isActive = displayValue === opt.value
          return (
            <button key={opt.value} type="button"
              onClick={() => handleClick(opt.value)}
              title={isActive ? `Currently: ${value}` : `Switch to ${opt.label}`}
              disabled={isActive || loading}
              className={`flex items-center justify-center gap-2 font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
                ${size === 'large' ? 'px-4 py-3 text-[13px] rounded-xl border' : 'px-3 py-2 text-[11px] sm:text-xs rounded-lg border'}
                ${isActive
                  ? `${opt.active} cursor-default`
                  : `${opt.inactive} ${loading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`
                }`}>
              {loading && isActive ? (
                <span className={`${size === 'large' ? 'w-4 h-4 border-[3px]' : 'w-2 h-2 border-2'} border-white/30 border-t-white rounded-full animate-spin flex-shrink-0`} />
              ) : (
                <span className={`${size === 'large' ? 'w-2.5 h-2.5' : 'w-2 h-2'} rounded-full flex-shrink-0 ${isActive ? 'bg-white' : opt.dot}`} />
              )}
              <span className={size === 'large' ? 'uppercase tracking-wide' : ''}>{opt.label}</span>
              {isActive && !loading && <i className={`bi bi-check2 ml-0.5 ${size === 'large' ? 'text-base' : 'text-[10px]'}`} />}
            </button>
          )
        })}
      </div>
      <UpcomingSchedules userId={userId} />
    </div>

      {modal === 'confirm' && (
        <ChangeConfirmModal
          current={displayValue}
          target={pendingTarget}
          onConfirm={handleChangeConfirmed}
          onCancel={cancelModal}
        />
      )}
      {modal === 'travel' && <TravelModal onConfirm={confirmTravel} onCancel={cancelModal} />}
      {modal === 'leave'  && <LeaveModal  onConfirm={confirmLeave}  onCancel={cancelModal} />}
    </>
  )
}

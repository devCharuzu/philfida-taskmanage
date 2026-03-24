import { useState } from 'react'
import { updatePresence } from '../lib/api'

// ── Exported helper: normalizes stored status string to base key ──
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
    short:    'Avail',
    active:   'bg-emerald-600 text-white border-emerald-700',
    inactive: 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50',
    dot:      'bg-emerald-400',
  },
  {
    value:    'Official Travel',
    label:    'On Travel',
    short:    'Travel',
    active:   'bg-blue-600 text-white border-blue-700',
    inactive: 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50',
    dot:      'bg-blue-400',
  },
  {
    value:    'On Leave',
    label:    'On Leave',
    short:    'Leave',
    active:   'bg-red-500 text-white border-red-600',
    inactive: 'bg-white text-red-500 border-red-200 hover:bg-red-50',
    dot:      'bg-red-400',
  },
]

// ── Change Confirmation Modal ─────────────────────────────────
function ChangeConfirmModal({ current, target, onConfirm, onCancel }) {
  const from = OPTIONS.find(o => o.value === current)
  const to   = OPTIONS.find(o => o.value === target)
  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg,#0a2e0a,#155414)' }}>
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <i className="bi bi-arrow-left-right text-white text-base" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">Change Availability</p>
            <p className="text-green-300 text-xs mt-0.5">Confirm status change</p>
          </div>
          <button onClick={onCancel} className="ml-auto text-green-300 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-3 mb-5">
            <span className={`flex-1 text-center py-2 rounded-xl text-xs font-bold border ${
              current === 'Available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              current === 'Official Travel' ? 'bg-blue-50 text-blue-700 border-blue-200' :
              'bg-red-50 text-red-700 border-red-200'
            }`}>{from?.label || current}</span>
            <i className="bi bi-arrow-right text-slate-400 flex-shrink-0" />
            <span className={`flex-1 text-center py-2 rounded-xl text-xs font-bold border ${
              target === 'Available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              target === 'Official Travel' ? 'bg-blue-50 text-blue-700 border-blue-200' :
              'bg-red-50 text-red-700 border-red-200'
            }`}>{to?.label || target}</span>
          </div>
          <p className="text-slate-600 text-sm mb-5 text-center">
            Are you sure you want to change your availability?
          </p>
          <div className="flex gap-3">
            <button onClick={onCancel} className="btn-secondary flex-1 py-2.5">Cancel</button>
            <button onClick={onConfirm} className="btn-primary flex-1 py-2.5">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Travel Modal ──────────────────────────────────────────────
function TravelModal({ onConfirm, onCancel }) {
  const [eventName, setEventName] = useState('')
  const [location,  setLocation]  = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd,   setDateEnd]   = useState('')
  const [error,     setError]     = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!eventName || !location || !dateStart || !dateEnd) { setError('All fields are required.'); return }
    if (dateEnd < dateStart) { setError('End date must be after start date.'); return }
    onConfirm({ eventName, location, dateStart, dateEnd })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4"
          style={{ background: 'linear-gradient(135deg,#1e40af,#2563eb)' }}>
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <i className="bi bi-airplane-fill text-white text-base" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">Official Travel</p>
            <p className="text-blue-200 text-xs mt-0.5">Enter your travel details</p>
          </div>
          <button onClick={onCancel} className="ml-auto text-blue-200 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2"><i className="bi bi-exclamation-circle-fill" />{error}</div>}
          <div>
            <label className="label">Event / Activity Name</label>
            <input className="input" placeholder="e.g. Regional Fiber Industry Summit"
              value={eventName} onChange={e => setEventName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Location / Venue</label>
            <input className="input" placeholder="e.g. Manila Hotel, Manila"
              value={location} onChange={e => setLocation(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date Start</label>
              <input className="input" type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} />
            </div>
            <div>
              <label className="label">Date End</label>
              <input className="input" type="date" min={dateStart} value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
            </div>
          </div>
          {dateStart && dateEnd && eventName && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1">
              <p className="font-bold">{eventName}</p>
              <p><i className="bi bi-geo-alt-fill mr-1" />{location || '—'}</p>
              <p><i className="bi bi-calendar-range mr-1" />
                {new Date(dateStart).toLocaleDateString('en-PH', { dateStyle: 'medium' })} — {new Date(dateEnd).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
              </p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1 py-2.5">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 text-white font-bold text-sm rounded-xl"
              style={{ background: 'linear-gradient(135deg,#1e40af,#2563eb)' }}>
              <i className="bi bi-check-lg mr-1" /> Confirm Travel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Leave Modal ───────────────────────────────────────────────
function LeaveModal({ onConfirm, onCancel }) {
  const [leaveType, setLeaveType] = useState('')
  const [reason,    setReason]    = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd,   setDateEnd]   = useState('')
  const [error,     setError]     = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!leaveType || !reason || !dateStart || !dateEnd) { setError('All fields are required.'); return }
    if (dateEnd < dateStart) { setError('End date must be after start date.'); return }
    onConfirm({ leaveType, reason, dateStart, dateEnd })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4"
          style={{ background: 'linear-gradient(135deg,#991b1b,#dc2626)' }}>
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <i className="bi bi-calendar-x-fill text-white text-base" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">On Leave</p>
            <p className="text-red-200 text-xs mt-0.5">Enter your leave details</p>
          </div>
          <button onClick={onCancel} className="ml-auto text-red-200 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2"><i className="bi bi-exclamation-circle-fill" />{error}</div>}
          <div>
            <label className="label">Type of Leave</label>
            <div className="grid grid-cols-2 gap-1.5">
              {LEAVE_TYPES.map(type => {
                const active = leaveType === type
                return (
                  <button key={type} type="button" onClick={() => setLeaveType(type)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold text-left transition-all
                      ${active ? 'bg-red-600 text-white border-red-700 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-red-50 hover:border-red-200'}`}>
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                      ${active ? 'border-white' : 'border-slate-300'}`}>
                      {active && <span className="w-2 h-2 rounded-full bg-white block" />}
                    </div>
                    {type}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="label">Reason</label>
            <textarea className="input resize-none" rows={2} placeholder="Brief reason for leave..."
              value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date Start</label>
              <input className="input" type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} />
            </div>
            <div>
              <label className="label">Date End</label>
              <input className="input" type="date" min={dateStart} value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
            </div>
          </div>
          {leaveType && dateStart && dateEnd && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700 space-y-1">
              <p className="font-bold">{leaveType}</p>
              {reason && <p className="italic">"{reason}"</p>}
              <p><i className="bi bi-calendar-range mr-1" />
                {new Date(dateStart).toLocaleDateString('en-PH', { dateStyle: 'medium' })} — {new Date(dateEnd).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
              </p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1 py-2.5">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 text-white font-bold text-sm rounded-xl"
              style={{ background: 'linear-gradient(135deg,#991b1b,#dc2626)' }}>
              <i className="bi bi-check-lg mr-1" /> Confirm Leave
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function PresenceToggle({ value, userId, onChange }) {
  const [modal,          setModal]          = useState(null)  // 'travel' | 'leave' | null
  const [pendingTarget,  setPendingTarget]  = useState(null)  // what they want to switch to

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
  function handleChangeConfirmed() {
    setModal(null)
    if (pendingTarget === 'Available') {
      commitStatus('Available', 'Available')
    } else if (pendingTarget === 'Official Travel') {
      setModal('travel')
    } else if (pendingTarget === 'On Leave') {
      setModal('leave')
    }
    setPendingTarget(null)
  }

  async function commitStatus(displayKey, fullStatus) {
    onChange?.(fullStatus)
    await updatePresence(userId, fullStatus)
  }

  async function confirmTravel(details) {
    setModal(null)
    const full = `Official Travel — ${details.eventName}, ${details.location} (${details.dateStart} to ${details.dateEnd})`
    await commitStatus('Official Travel', full)
  }

  async function confirmLeave(details) {
    setModal(null)
    const full = `On Leave — ${details.leaveType}: ${details.reason} (${details.dateStart} to ${details.dateEnd})`
    await commitStatus('On Leave', full)
  }

  function cancelModal() {
    setModal(null)
    setPendingTarget(null)
  }

  return (
    <>
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200 flex-shrink-0">
        {OPTIONS.map(opt => {
          const isActive = displayValue === opt.value
          return (
            <button key={opt.value} type="button"
              onClick={() => handleClick(opt.value)}
              title={isActive ? `Currently: ${value}` : `Switch to ${opt.value}`}
              disabled={isActive}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all
                ${isActive
                  ? `${opt.active} cursor-default opacity-100`
                  : `${opt.inactive} cursor-pointer`}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-white/80' : opt.dot}`} />
              <span className="hidden sm:inline">{opt.label}</span>
              <span className="sm:hidden">{opt.short}</span>
              {isActive && <i className="bi bi-check text-[10px] hidden sm:inline" />}
            </button>
          )
        })}
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
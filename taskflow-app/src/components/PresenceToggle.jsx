import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { updatePresence, uploadFiles } from '../lib/api'

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
    active:   'bg-emerald-600 text-white border-emerald-700 shadow-sm',
    inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300',
    dot:      'bg-emerald-400',
  },
  {
    value:    'Official Travel',
    label:    'Travel',
    active:   'bg-blue-600 text-white border-blue-700 shadow-sm',
    inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-blue-50 hover:border-blue-300',
    dot:      'bg-blue-400',
  },
  {
    value:    'On Leave',
    label:    'Leave',
    active:   'bg-red-500 text-white border-red-600 shadow-sm',
    inactive: 'bg-white text-slate-600 border-slate-200 hover:bg-red-50 hover:border-red-300',
    dot:      'bg-red-400',
  },
]

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
  const [eventName, setEventName] = useState('')
  const [location,  setLocation]  = useState('')
  const [dateStart, setDateStart] = useState('')
  const [timeStart, setTimeStart] = useState('08:00')
  const [dateEnd,   setDateEnd]   = useState('')
  const [timeEnd,   setTimeEnd]   = useState('17:00')
  const [error,     setError]     = useState('')

  const fileInputRef = useRef(null)
  const [files, setFiles] = useState([])

  function handleSubmit(e) {
    e.preventDefault()
    if (!eventName || !location || !dateStart || !dateEnd) { setError('All fields are required.'); return }
    if (files.length === 0) { setError('Travel Order file is required.'); return }
    if (dateEnd < dateStart) { setError('End date must be after start date.'); return }
    if (dateEnd === dateStart && timeEnd <= timeStart) { setError('End time must be after start time on same day.'); return }
    onConfirm({ eventName, location, dateStart, timeStart, dateEnd, timeEnd, files })
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9998] animate-in fade-in duration-300" />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300"
        onClick={e => e.target === e.currentTarget && onCancel()}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-4 px-6 py-5 rounded-t-2xl"
            style={{ background: 'linear-gradient(135deg, #1e40af, #2563eb)' }}>
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/10">
              <i className="bi bi-airplane-fill text-white text-lg" />
            </div>
            <div>
              <p className="text-white font-black text-sm uppercase tracking-tight leading-none">Official Travel</p>
              <p className="text-blue-200/80 text-[10px] mt-1 font-bold uppercase tracking-widest">Travel Order Required</p>
            </div>
          </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-[11px] rounded-xl px-4 py-3 font-bold"><i className="bi bi-exclamation-circle-fill" />{error}</div>}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Event / Activity Name</label>
            <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium" 
              placeholder="e.g. Regional Fiber Industry Summit"
              value={eventName} onChange={e => setEventName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Location / Venue</label>
            <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium" 
              placeholder="e.g. Manila Hotel, Manila"
              value={location} onChange={e => setLocation(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date Start</label>
              <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium" 
                type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} />
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
                type="date" min={dateStart} value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
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
              <span className="text-red-500 font-black">REQUIRED</span>
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
            <button type="button" onClick={onCancel} className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all border border-slate-100">Cancel</button>
            <button type="submit" className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-white rounded-xl shadow-lg shadow-blue-900/20 active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg, #1e40af, #2563eb)' }}>
              Confirm Travel
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
  const [leaveType, setLeaveType] = useState('')
  const [reason,    setReason]    = useState('')
  const [dateStart, setDateStart] = useState('')
  const [timeStart, setTimeStart] = useState('08:00')
  const [dateEnd,   setDateEnd]   = useState('')
  const [timeEnd,   setTimeEnd]   = useState('17:00')
  const [error,     setError]     = useState('')
  const [files, setFiles] = useState([])
  const fileInputRef = useRef(null)

  function handleSubmit(e) {
    e.preventDefault()
    if (!leaveType) { setError('Please select a leave type.'); return }
    if (!reason.trim()) { setError('Please provide a reason for the leave.'); return }
    if (!dateStart || !dateEnd) { setError('Start and end dates are required.'); return }
    if (new Date(dateStart) > new Date(dateEnd)) { setError('Start date cannot be after end date.'); return }
    if (dateEnd === dateStart && timeEnd <= timeStart) { setError('End time must be after start time on same day.'); return }
    if (files.length === 0) { setError('Leave attachment is required.'); return }
    onConfirm({ leaveType, reason, dateStart, timeStart, dateEnd, timeEnd, files })
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[9998] animate-in fade-in duration-300" />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300"
        onClick={e => e.target === e.currentTarget && onCancel()}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-4 px-6 py-5"
            style={{ background: 'linear-gradient(135deg, #991b1b, #dc2626)' }}>
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/10">
              <i className="bi bi-calendar-x-fill text-white text-lg" />
            </div>
            <div>
              <p className="text-white font-black text-sm uppercase tracking-tight leading-none">On Leave</p>
              <p className="text-red-200/80 text-[10px] mt-1 font-bold uppercase tracking-widest">Leave Details Required</p>
            </div>
          </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 text-[11px] rounded-xl px-4 py-3 font-bold"><i className="bi bi-exclamation-circle-fill" />{error}</div>}
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Type of Leave</label>
            <div className="grid grid-cols-2 gap-1.5">
              {LEAVE_TYPES.map(type => {
                const active = leaveType === type
                return (
                  <button key={type} type="button" onClick={() => setLeaveType(type)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-black uppercase text-left transition-all
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
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reason</label>
            <textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium resize-none" 
              rows={2} placeholder="Brief reason for leave..."
              value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date Start</label>
              <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium" 
                type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} />
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
                type="date" min={dateStart} value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
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
              <span className="text-red-500 font-black">REQUIRED</span>
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
            <button type="button" onClick={onCancel} className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all border border-slate-100">Cancel</button>
            <button type="submit" className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-white rounded-xl shadow-lg shadow-red-900/20 active:scale-95 transition-all"
              style={{ background: 'linear-gradient(135deg, #991b1b, #dc2626)' }}>
              Confirm Leave
            </button>
          </div>
        </form>
      </div>
    </div>
    </>,
    document.body
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
      const confirmed = window.confirm(`Note: Resetting your availability to "Available" will also clear/delete any active Travel or Leave reminders on your Personal Calendar. Do you want to proceed?`)
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
    onChange?.(fullStatus)
    await updatePresence(userId, fullStatus)
    onSync?.()
  }

  async function confirmTravel(details) {
    const confirmed = window.confirm(`Note: Setting your availability to "Official Travel" will also create/update a corresponding travel reminder on your Personal Calendar for these dates. Do you want to proceed?`)
    if (!confirmed) return

    setModal(null)
    setLoading(true)
    try {
      let fileInfo = ''
      let firstPath = ''
      if (details.files?.length > 0) {
        // C1/C2/C3: Ensure file is uploaded first
        // uploadFiles() returns a pipe-delimited STRING of paths (e.g. "uploads/abc.pdf")
        // NOT an array — use .split('|')[0] to get the first path, not [0] (first character).
        const urlStr = await uploadFiles(details.files)
        firstPath = urlStr ? urlStr.split('|')[0] : null
        if (firstPath) {
          fileInfo = ` [TO:${firstPath}]`
        }
      }

      const fullStatus = `Official Travel — ${details.eventName} at ${details.location} (${details.dateStart} ${details.timeStart} to ${details.dateEnd} ${details.timeEnd})${fileInfo}`
      await commitStatus('travel', fullStatus)

      // Write reminder to local storage
      const key = `philfida_calendar_reminders_${userId}`
      const stored = localStorage.getItem(key)
      let reminders = []
      if (stored) {
        try { reminders = JSON.parse(stored) } catch (e) {}
      }
      // Filter out existing travel/leave reminders
      reminders = reminders.filter(r => r.type !== 'travel' && r.type !== 'leave')
      
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
        returnDate: details.dateEnd,
        attachments: firstPath || '',
        applied: true
      }
      reminders.push(newReminder)
      localStorage.setItem(key, JSON.stringify(reminders))
      window.dispatchEvent(new Event('storage'))
      window.dispatchEvent(new Event('presence-reminders-changed'))
    } catch (error) {
      console.error('Travel update failed:', error)
    } finally {
      setLoading(false)
    }
  }

  async function confirmLeave(details) {
    const confirmed = window.confirm(`Note: Setting your availability to "On Leave" will also create/update a corresponding leave reminder on your Personal Calendar for these dates. Do you want to proceed?`)
    if (!confirmed) return

    setModal(null)
    setLoading(true)
    try {
      let fileInfo = ''
      let firstPath = ''
      if (details.files?.length > 0) {
        const urlStr = await uploadFiles(details.files)
        firstPath = urlStr ? urlStr.split('|')[0] : null
        if (firstPath) {
          fileInfo = ` [TO:${firstPath}]`
        }
      }

      const full = `On Leave — ${details.leaveType}: ${details.reason} (${details.dateStart} ${details.timeStart} to ${details.dateEnd} ${details.timeEnd})${fileInfo}`
      await commitStatus('On Leave', full)

      // Write reminder to local storage
      const key = `philfida_calendar_reminders_${userId}`
      const stored = localStorage.getItem(key)
      let reminders = []
      if (stored) {
        try { reminders = JSON.parse(stored) } catch (e) {}
      }
      reminders = reminders.filter(r => r.type !== 'travel' && r.type !== 'leave')

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
      reminders.push(newReminder)
      localStorage.setItem(key, JSON.stringify(reminders))
      window.dispatchEvent(new Event('storage'))
      window.dispatchEvent(new Event('presence-reminders-changed'))
    } catch (error) {
      console.error('Leave update failed:', error)
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
            title={isActive ? `Currently: ${value}` : `Switch to ${opt.value}`}
            disabled={isActive || loading}
            className={`flex items-center justify-center gap-2 font-bold transition-all duration-200
              ${size === 'large' ? 'px-4 py-4 text-[13px] rounded-2xl border-2' : 'px-3 py-2 text-[11px] sm:text-xs rounded-lg border'}
              ${isActive
                ? `${opt.active} cursor-default scale-[1.02] ${size === 'large' ? 'border-transparent' : ''}`
                : `${opt.inactive} ${loading ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:border-slate-300 hover:bg-slate-50'}`
              }`}>
            {loading && isActive ? (
              <span className={`${size === 'large' ? 'w-4 h-4 border-[3px]' : 'w-2 h-2 border-2'} border-white/30 border-t-white rounded-full animate-spin flex-shrink-0`} />
            ) : (
              <span className={`${size === 'large' ? 'w-2.5 h-2.5' : 'w-2 h-2'} rounded-full flex-shrink-0 ${isActive ? 'bg-white' : opt.dot}`} />
            )}
            <span className={size === 'large' ? 'uppercase tracking-tighter' : ''}>{opt.label}</span>
            {isActive && !loading && <i className={`bi bi-check2 ml-0.5 ${size === 'large' ? 'text-base' : 'text-[10px]'}`} />}
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
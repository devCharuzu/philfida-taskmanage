import { useState } from 'react'
import { useStore } from '../store/useStore'
import { createTask } from '../lib/api'

const ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.mp4,.mp3,.mov,.avi,.csv'

const STATUS_CONFIG = {
  Available:         { pill: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500', ring: 'ring-emerald-400' },
  'Official Travel': { pill: 'bg-blue-100 text-blue-800 border-blue-200',          dot: 'bg-blue-500',    ring: 'ring-blue-400'    },
  'On Leave':        { pill: 'bg-red-100 text-red-700 border-red-200',              dot: 'bg-red-500',     ring: 'ring-red-400'     },
}


// Status is now a full detail string e.g. "Official Travel — Summit Name, Manila"
// This extracts the base key for config lookups
function getStatusKey(status) {
  if (!status || status === 'Available') return 'Available'
  if (status.startsWith('Official Travel')) return 'Official Travel'
  if (status.startsWith('On Leave'))        return 'On Leave'
  return 'Available'
}

function getStatusLabel(status) {
  const key = getStatusKey(status)
  if (key === 'Official Travel') return '(On Travel)'
  if (key === 'On Leave')        return '(On Leave)'
  return ''
}

const PRIORITY_FLAGS = [
  { key: 'Urgent',       label: 'Urgent',       icon: 'bi-lightning-charge-fill', color: 'text-red-600    bg-red-50    border-red-200'    },
  { key: 'Priority',     label: 'Priority',     icon: 'bi-flag-fill',             color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { key: 'Confidential', label: 'Confidential', icon: 'bi-shield-lock-fill',      color: 'text-purple-700 bg-purple-50 border-purple-200' },
]

const PURPOSES = [
  'For compliance',
  'For appropriate action',
  'For information',
  'Please review/comment',
  'Please draft reply',
  'Please monitor/follow up',
  'Please handle',
  'Please attend',
  'Please see me',
  'Please disseminate/circulate',
  'Please return/forward to:',
  'Please schedule',
  'Please file',
]

const ACTION_OPTIONS = [
  { key: 'Noted',      icon: 'bi-check-circle-fill',  color: 'text-green-700  bg-green-50  border-green-200'  },
  { key: 'Approved',   icon: 'bi-hand-thumbs-up-fill', color: 'text-blue-700   bg-blue-50   border-blue-200'   },
  { key: 'Disapproved',icon: 'bi-hand-thumbs-down-fill',color:'text-red-600    bg-red-50    border-red-200'    },
]

function StatusDot({ status }) {
  const cfg = STATUS_CONFIG[getStatusKey(status)]
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
}

function SectionLabel({ num, title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
        style={{ background: '#155414' }}>{num}</span>
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  )
}

export default function CreateTaskForm({ users, onSync }) {
  const session = useStore(s => s.session)

  // ── State ────────────────────────────────────────────────────
  const [empId,        setEmpId]        = useState('')
  const [taskNo,       setTaskNo]       = useState('')
  const [deadline,     setDeadline]     = useState('')
  const [priorities,   setPriorities]   = useState([])   // multi-select
  const [purposes,     setPurposes]     = useState([])   // multi-select
  const [forwardTo,    setForwardTo]    = useState('')   // for "Please return/forward to:"
  const [action,       setAction]       = useState('')   // Noted / Approved / Disapproved
  const [remarks,      setRemarks]      = useState('')
  const [senderName,   setSenderName]   = useState(session?.Name || '')
  const [title,        setTitle]        = useState('')
  const [files,        setFiles]        = useState([])
  const [loading,      setLoading]      = useState(false)
  const [success,      setSuccess]      = useState('')
  const [error,        setError]        = useState('')
  const [showConfirm,  setShowConfirm]  = useState(false)

  const employees    = users.filter(u => u.Role !== 'Director')
  const selectedEmp  = employees.find(u => String(u.ID) === String(empId))
  const empStatus    = selectedEmp?.Status || 'Available'
  const empStatusKey = getStatusKey(empStatus)
  const needsConfirm = empStatusKey !== 'Available'

  const grouped = {
    Available:         employees.filter(u => getStatusKey(u.Status || 'Available') === 'Available'),
    'Official Travel': employees.filter(u => getStatusKey(u.Status) === 'Official Travel'),
    'On Leave':        employees.filter(u => getStatusKey(u.Status) === 'On Leave'),
  }

  function togglePriority(key) {
    setPriorities(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])
  }
  function togglePurpose(key) {
    setPurposes(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])
  }

  function buildTitle() {
    const parts = []
    if (taskNo.trim()) parts.push(`[${taskNo.trim()}]`)
    if (title.trim())  parts.push(title.trim())
    return parts.join(' ') || '(No title)'
  }

  function buildInstructions() {
    const lines = []
    if (purposes.length) {
      const purposeList = purposes.map(p =>
        p === 'Please return/forward to:' && forwardTo ? `${p} ${forwardTo}` : p
      )
      lines.push(`Purpose: ${purposeList.join(', ')}`)
    }
    if (action)   lines.push(`Action: ${action}`)
    if (remarks)  lines.push(`Remarks: ${remarks}`)
    if (senderName) lines.push(`From: ${senderName}`)
    return lines.join('\n')
  }

  async function doDispatch() {
    setLoading(true); setError(''); setSuccess('')
    try {
      const priorityVal = priorities.includes('Urgent') ? 'Urgent'
        : priorities.includes('Priority') ? 'High'
        : 'Normal'

      await createTask({
        empId,
        empName:      selectedEmp.Name,
        title:        buildTitle(),
        instructions: buildInstructions(),
        priority:     priorityVal,
        category:     priorities.includes('Confidential') ? 'Confidential' : 'General',
        deadline,
        files,
        actorName:    session?.Name || 'Director',
      })
      await onSync()
      // Reset
      setTaskNo(''); setTitle(''); setDeadline(''); setFiles([])
      setPriorities([]); setPurposes([]); setForwardTo('')
      setAction(''); setRemarks(''); setEmpId('')
      setSenderName(session?.Name || '')
      setSuccess(`Task dispatched to ${selectedEmp.Name}.`)
      setTimeout(() => setSuccess(''), 4000)
    } catch {
      setError('Failed to create task. Please try again.')
    } finally { setLoading(false) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!empId)   { setError('Please select a unit personnel.'); return }
    if (!title)   { setError('Please enter a task title.'); return }
    if (needsConfirm) { setShowConfirm(true); return }
    await doDispatch()
  }

  return (
    <div className="space-y-6">

      {/* ── 1. AVAILABILITY PREVIEW + ASSIGN ── */}
      <div>
        <SectionLabel num="1" title="Assign To" />
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5 mb-2">
          {employees.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-2">No personnel found.</p>
          ) : Object.entries(grouped).map(([status, group]) => {
            if (group.length === 0) return null
            const cfg = STATUS_CONFIG[getStatusKey(status)]
            return (
              <div key={status}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <StatusDot status={status} />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{status} ({group.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.map(u => (
                    <button key={u.ID} type="button" onClick={() => setEmpId(String(u.ID))}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all
                        ${String(empId) === String(u.ID)
                          ? `${cfg.pill} ring-2 ${cfg.ring} ring-offset-1 shadow-sm`
                          : `${cfg.pill} hover:ring-1 ${cfg.ring} hover:ring-offset-1`}`}>
                      <StatusDot status={status} />
                      {u.Name}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        {selectedEmp && (
          <div className={`mt-1 rounded-xl border overflow-hidden ${STATUS_CONFIG[getStatusKey(empStatus)]?.pill || ''}`}>
            <div className="flex items-center gap-2 text-xs font-semibold px-3 py-2">
              <StatusDot status={empStatus} />
              <span>Selected: <span className="font-bold">{selectedEmp.Name}</span></span>
              <span className="ml-auto font-semibold">{empStatusKey}</span>
            </div>
            {empStatusKey !== 'Available' && empStatus !== empStatusKey && (
              <div className="px-3 pb-2 text-[10px] opacity-80 leading-relaxed border-t border-current/10 pt-1.5">
                {empStatus.replace(/^(Official Travel|On Leave)\s*—\s*/, '')}
              </div>
            )}
          </div>
        )}
        {/* Fallback dropdown */}
        <select className="input mt-2 text-xs" value={empId} onChange={e => setEmpId(e.target.value)} required>
          <option value="">-- Select Unit Personnel --</option>
          {employees.map(u => {
            const s = getStatusLabel(u.Status)
            return <option key={u.ID} value={u.ID}>{u.Name} — {u.Unit || u.Office} {s}</option>
          })}
        </select>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── 2. TASK NO. + DATE ── */}
        <div>
          <SectionLabel num="2" title="Reference &amp; Date" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Task / Document No. <span className="text-slate-400 normal-case font-normal">(Optional)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">#</span>
                <input className="input pl-7" placeholder="e.g. 001 or PHILFIDA-2025-001"
                  value={taskNo} onChange={e => setTaskNo(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Deadline / Date <span className="text-slate-400 normal-case font-normal">(Optional)</span></label>
              {/* Modern date input — custom styled */}
              <div className="relative">
                <input
                  className="input pr-10"
                  type="datetime-local"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  style={{ colorScheme: 'light' }}
                />
                <i className="bi bi-calendar3 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none" />
              </div>
              {deadline && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-green-700 font-semibold">
                  <i className="bi bi-clock" />
                  {new Date(deadline).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                  <button type="button" onClick={() => setDeadline('')} className="ml-auto text-slate-400 hover:text-red-500">
                    <i className="bi bi-x" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 3. TASK TITLE ── */}
        <div>
          <SectionLabel num="3" title="Subject / Title" />
          <input className="input" placeholder="Enter task subject or title" value={title}
            onChange={e => setTitle(e.target.value)} required />
        </div>

        {/* ── 4. PRIORITY FLAGS ── */}
        <div>
          <SectionLabel num="4" title="Priority Flag" />
          <div className="flex flex-wrap gap-2">
            {PRIORITY_FLAGS.map(p => {
              const active = priorities.includes(p.key)
              return (
                <button key={p.key} type="button" onClick={() => togglePriority(p.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all
                    ${active
                      ? `${p.color} ring-2 ring-offset-1 shadow-sm ring-current/30`
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                  <i className={`bi ${p.icon} ${active ? '' : 'opacity-40'}`} />
                  {p.label}
                  {active && <i className="bi bi-check ml-0.5 text-[10px]" />}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">Select all that apply.</p>
        </div>

        {/* ── 5. PURPOSE CHECKBOXES ── */}
        <div>
          <SectionLabel num="5" title="Purpose / Action Required" />
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {PURPOSES.map(p => {
              const isForward = p === 'Please return/forward to:'
              const active = purposes.includes(p)
              return (
                <div key={p}>
                  <label className="flex items-center gap-2 cursor-pointer group py-1 px-1 rounded-lg hover:bg-white transition-colors">
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all
                      ${active ? 'bg-green-700 border-green-700' : 'bg-white border-slate-300 group-hover:border-green-400'}`}
                      onClick={() => togglePurpose(p)}>
                      {active && <i className="bi bi-check text-white text-[10px]" />}
                    </div>
                    <span className="text-xs text-slate-700 font-medium select-none" onClick={() => togglePurpose(p)}>
                      {isForward ? 'Please return/forward to:' : p}
                    </span>
                  </label>
                  {isForward && active && (
                    <input className="input mt-1 ml-6 text-xs py-1.5" style={{ width: 'calc(100% - 24px)' }}
                      placeholder="Specify recipient or office..."
                      value={forwardTo} onChange={e => setForwardTo(e.target.value)} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── 6. ACTION ── */}
        <div>
          <SectionLabel num="6" title="Action (Optional)" />
          <div className="flex flex-wrap gap-2">
            {ACTION_OPTIONS.map(a => {
              const active = action === a.key
              return (
                <button key={a.key} type="button"
                  onClick={() => setAction(active ? '' : a.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all
                    ${active
                      ? `${a.color} ring-2 ring-offset-1 ring-current/30 shadow-sm`
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                  <i className={`bi ${a.icon} ${active ? '' : 'opacity-40'}`} />
                  {a.key}
                  {active && <i className="bi bi-check ml-0.5 text-[10px]" />}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">Optional — click again to deselect.</p>
        </div>

        {/* ── 7. REMARKS ── */}
        <div>
          <SectionLabel num="7" title="Remarks / Comments (Optional)" />
          <textarea className="input resize-none" rows={3}
            placeholder="Additional remarks or comments..."
            value={remarks} onChange={e => setRemarks(e.target.value)} />
        </div>

        {/* ── 8. SENDER NAME ── */}
        <div>
          <SectionLabel num="8" title="Dispatched By" />
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <i className="bi bi-pen-fill text-xs" />
            </span>
            <input className="input pl-8" placeholder="Your full name"
              value={senderName} onChange={e => setSenderName(e.target.value)} />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Auto-filled from your account. Edit if needed.</p>
        </div>

        {/* ── 9. ATTACHMENTS ── */}
        <div>
          <SectionLabel num="9" title="Attachments (Optional)" />
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-5 cursor-pointer hover:border-green-400 hover:bg-green-50 transition-all group">
            <i className="bi bi-cloud-upload text-2xl text-slate-300 group-hover:text-green-500 transition-colors" />
            <span className="text-xs font-semibold text-slate-400 group-hover:text-green-600">Click to attach files</span>
            <span className="text-[10px] text-slate-300">PDF, Word, Excel, images, and more</span>
            <input type="file" multiple accept={ACCEPT} className="hidden"
              onChange={e => setFiles(Array.from(e.target.files))} />
          </label>
          {files.length > 0 && (
            <div className="mt-2 space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                  <i className="bi bi-paperclip text-slate-400 text-xs" />
                  <span className="text-xs text-slate-600 flex-1 truncate">{f.name}</span>
                  <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-slate-300 hover:text-red-500 text-xs transition-colors">
                    <i className="bi bi-x" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alerts */}
        {error   && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 flex items-center gap-2"><i className="bi bi-exclamation-circle-fill" />{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2 flex items-center gap-2"><i className="bi bi-check-circle-fill" />{success}</div>}

        {/* Submit */}
        <button className="btn-primary w-full py-3" disabled={loading}>
          {loading
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Dispatching...</>
            : <><i className="bi bi-send-fill" /> Dispatch Task</>}
        </button>
      </form>

      {/* ── CONFIRM MODAL ── */}
      {showConfirm && selectedEmp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-amber-500 px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <i className="bi bi-exclamation-triangle-fill text-white text-lg" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-none">Availability Notice</p>
                <p className="text-amber-100 text-xs mt-0.5">Please confirm before dispatching</p>
              </div>
            </div>
            <div className="p-5">
              <div className={`flex items-center gap-3 p-3 rounded-xl border mb-4 ${STATUS_CONFIG[getStatusKey(empStatus)]?.pill}`}>
                <StatusDot status={empStatus} />
                <div>
                  <p className="font-bold text-sm">{selectedEmp.Name}</p>
                  <p className="text-xs mt-0.5">Currently: <span className="font-semibold">{empStatusKey}</span></p>
                </div>
              </div>
              <p className="text-slate-600 text-sm mb-5 leading-relaxed">
                This personnel is currently <strong>{empStatusKey}</strong> and may not be able to act immediately. Dispatch anyway?
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowConfirm(false)} className="btn-secondary flex-1 py-2.5">Cancel</button>
                <button onClick={async () => { setShowConfirm(false); await doDispatch() }} disabled={loading} className="btn-primary flex-1 py-2.5">
                  {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : 'Dispatch Anyway'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
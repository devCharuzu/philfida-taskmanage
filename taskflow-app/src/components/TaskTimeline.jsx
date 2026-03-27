import { useState } from 'react'

const STATUS_STEPS = [
  {
    key:       'Assigned',
    label:     'Dispatched',
    icon:      'bi-send-fill',
    color:     'text-amber-700',
    bg:        'bg-amber-50  border-amber-200',
    dot:       'bg-amber-500',
    timeField: 'CreatedAt',
  },
  {
    key:       'Received',
    label:     'Accepted',
    icon:      'bi-check-lg',
    color:     'text-blue-700',
    bg:        'bg-blue-50   border-blue-200',
    dot:       'bg-blue-500',
    timeField: 'ReceivedAt',
  },
  {
    key:       'Completed',
    label:     'Completed',
    icon:      'bi-check2-all',
    color:     'text-emerald-700',
    bg:        'bg-emerald-50 border-emerald-200',
    dot:       'bg-emerald-500',
    timeField: 'CompletedAt',
  },
]

function fmt(iso) {
  if (!iso) return null
  const d = new Date(iso)
  // Convert to GMT+8 timezone
  const gmt8Date = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
  const now = new Date()
  const nowGMT8 = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
  const diffMs = nowGMT8 - gmt8Date
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  let relative
  if (diffMin  <  1)  relative = 'just now'
  else if (diffMin < 60) relative = `${diffMin}m ago`
  else if (diffHr  < 24) relative = `${diffHr}h ago`
  else if (diffDay <  7) relative = `${diffDay}d ago`
  else relative = gmt8Date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

  const exact = gmt8Date.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
  const dateOnly = gmt8Date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  const timeOnly = gmt8Date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

  return { relative, exact, dateOnly, timeOnly }
}

function getActionIcon(action) {
  const m = { Assigned:'bi-send-fill', Dispatched:'bi-send-fill', Received:'bi-check-lg', Completed:'bi-check2-all', Edited:'bi-pencil', Archived:'bi-archive', Restored:'bi-arrow-up-circle' }
  return m[action] || 'bi-dot'
}
function getActionLabel(action) {
  const m = { Assigned:'was assigned this task', Dispatched:'dispatched the task', Received:'accepted the task', Completed:'marked task as completed', Edited:'edited the task', Archived:'archived the task', Restored:'restored from archive' }
  return m[action] || action.toLowerCase()
}

// ── Card mode (Dashboard / UnitHead My Tasks) ─────────────────
function CardTimeline({ task, history }) {
  const [showHistory, setShowHistory] = useState(false)
  const currentIdx = STATUS_STEPS.findIndex(s => s.key === task.Status)

  return (
    <div className="space-y-1.5">
      {/* Step pills row */}
      <div className="flex items-center gap-0">
        {STATUS_STEPS.map((step, idx) => {
          const done    = idx <= currentIdx
          const current = idx === currentIdx
          const time    = fmt(task[step.timeField])
          return (
            <div key={step.key} className="flex items-center flex-shrink-0">
              <div title={time?.exact}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold
                  ${done
                    ? `${step.bg} ${step.color} ${current ? 'ring-1 ring-offset-1 ring-current/30' : 'opacity-75'}`
                    : 'bg-slate-50 border-slate-200 text-slate-300'}`}>
                <i className={`bi ${step.icon}`} />
                <span>{step.label}</span>
                {done && time && <span className="opacity-70">· {time.relative}</span>}
              </div>
              {idx < STATUS_STEPS.length - 1 && (
                <div className={`w-3 h-px mx-0.5 ${idx < currentIdx ? 'bg-slate-300' : 'bg-slate-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* History toggle */}
      {history.length > 0 && (
        <div>
          <button onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-green-700 font-semibold transition-colors">
            <i className={`bi bi-${showHistory ? 'chevron-up' : 'clock-history'}`} />
            {showHistory ? 'Hide history' : `View history (${history.length})`}
          </button>
          {showHistory && <HistoryLog history={history} />}
        </div>
      )}
    </div>
  )
}

// ── Table mode (Director monitor, UnitHead monitor) ───────────
function TableTimeline({ task, history }) {
  const [showHistory, setShowHistory] = useState(false)
  const currentIdx = STATUS_STEPS.findIndex(s => s.key === task.Status)

  return (
    <div className="mt-1.5 space-y-1">
      {/* Stacked timestamp rows — always show all 3 */}
      <div className="space-y-0.5">
        {STATUS_STEPS.map((step, idx) => {
          const done = idx <= currentIdx
          const time = fmt(task[step.timeField])
          return (
            <div key={step.key} className="flex items-center gap-1.5">
              {/* Dot */}
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${done ? step.dot : 'bg-slate-200'}`} />
              {/* Label */}
              <span className={`text-[10px] font-bold w-16 flex-shrink-0 ${done ? step.color : 'text-slate-300'}`}>
                {step.label}
              </span>
              {/* Timestamp */}
              {done && time ? (
                <span className="text-[10px] text-slate-500 font-medium" title={time.exact}>
                  {time.dateOnly}
                  <span className="text-slate-400 ml-1">{time.timeOnly}</span>
                </span>
              ) : (
                <span className="text-[10px] text-slate-300">—</span>
              )}
            </div>
          )
        })}
      </div>

      {/* History toggle */}
      {history.length > 0 && (
        <div>
          <button onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-green-700 font-semibold transition-colors mt-0.5">
            <i className={`bi bi-${showHistory ? 'chevron-up' : 'clock-history'}`} />
            {showHistory ? 'Hide' : `History (${history.length})`}
          </button>
          {showHistory && <HistoryLog history={history} />}
        </div>
      )}
    </div>
  )
}

// ── Shared history log ────────────────────────────────────────
function HistoryLog({ history }) {
  return (
    <div className="mt-1.5 border border-slate-100 rounded-xl overflow-hidden">
      <div className="bg-slate-50 px-3 py-1 border-b border-slate-100">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Activity Log</p>
      </div>
      <div className="divide-y divide-slate-50 max-h-44 overflow-y-auto">
        {history.map((h, i) => {
          const t = fmt(h.CreatedAt)
          return (
            <div key={i} className="flex items-start gap-2 px-3 py-2">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className={`bi ${getActionIcon(h.Action)} text-green-700 text-[9px]`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-700 leading-snug">
                  <span className="font-semibold">{h.Actor}</span>
                  {' '}<span className="text-slate-500">{getActionLabel(h.Action)}</span>
                </p>
                {h.Note && <p className="text-[10px] text-slate-400 mt-0.5 italic">{h.Note}</p>}
              </div>
              {t && (
                <div className="flex-shrink-0 text-right">
                  <p className="text-[10px] text-slate-400 font-medium">{t.relative}</p>
                  <p className="text-[9px] text-slate-300 whitespace-nowrap">{t.exact}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────
export default function TaskTimeline({ task, history = [], compact = false }) {
  if (compact) return <TableTimeline task={task} history={history} />
  return <CardTimeline task={task} history={history} />
}
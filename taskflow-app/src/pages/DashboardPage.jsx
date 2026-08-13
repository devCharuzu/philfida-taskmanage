import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { useSync } from '../hooks/useSync'
import { supabase } from '../lib/supabase'
import { setTaskStatus, getUnreadCommentCount } from '../lib/api'
import NotificationBell from '../components/NotificationBell'
import UserProfileTab from '../components/UserProfileTab'
import ChatModal from '../components/ChatModal'
import FileThumb from '../components/FileThumb'
import Lightbox from '../components/Lightbox'
import TaskTimeline from '../components/TaskTimeline'
import DeadlineProgress from '../components/DeadlineProgress'
import PersonalCalendarTab, { checkAndApplyScheduledPresence } from '../components/PersonalCalendarTab'

export default function DashboardPage() {
  const session    = useStore(s => s.session)
  const globalData = useStore(s => s.globalData)
  const { sync }   = useSync()
  const navigate = useNavigate()

  const [chat,         setChat]         = useState(null)
  const [lightboxFile, setLightboxFile] = useState(null)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [presence,     setPresence]     = useState(session?.Status || 'Available')
  const [loadingTask,  setLoadingTask]  = useState(null)
  const [tab,          setTab]          = useState('my-tasks')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('pf_sidebar_collapsed') === '1')
  const toggleSidebarCollapsed = () => setSidebarCollapsed(v => { localStorage.setItem('pf_sidebar_collapsed', v ? '0' : '1'); return !v })
  const [autoUpdateAlert, setAutoUpdateAlert] = useState(null)
  // Sync presence state with session status (H11 fix for refresh persistence)
  useEffect(() => {
    if (session?.Status) setPresence(session.Status)
  }, [session?.Status])

  // Background automated presence checker (Travel/Leave Scheduler) via calendar reminders
  useEffect(() => {
    if (!session?.ID) return
    
    const runSchedulerCheck = async () => {
      try {
        await checkAndApplyScheduledPresence(session.ID, sync)
      } catch (err) {
        console.error('[PRESENCE-SCHEDULER] error:', err)
      }
    }
    
    // Run immediately on dashboard load
    runSchedulerCheck()
    
    // Periodically run check every 30 seconds
    const checkTimer = setInterval(runSchedulerCheck, 30000)
    return () => clearInterval(checkTimer)
  }, [session?.ID, sync])

  // Listener for auto-applied status toasts
  useEffect(() => {
    const handleAutoUpdate = (e) => {
      const status = e.detail?.status
      if (!status) { sync(); return }
      setAutoUpdateAlert(status)
      setPresence(status)
      sync()
      // Auto-dismiss the float toast after 10 seconds
      const alertTimer = setTimeout(() => setAutoUpdateAlert(null), 10000)
      return () => clearTimeout(alertTimer)
    }
    window.addEventListener('presence-auto-updated', handleAutoUpdate)
    return () => window.removeEventListener('presence-auto-updated', handleAutoUpdate)
  }, [])

  const myTasks = globalData.tasks
    .filter(t => String(t.EmployeeID) === String(session?.ID) && String(t.Archived).toUpperCase() !== 'TRUE')
    .slice().reverse()

  const myCalendarTasks = globalData.tasks
    .filter(t => String(t.EmployeeID) === String(session?.ID))
    .slice().reverse()

  const filteredMyTasks = myTasks.filter(t => {
    if (filterStatus !== 'All' && t.Status !== filterStatus) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      if (!t.Title?.toLowerCase().includes(q)) return false
    }
    return true
  })

  async function handleStatusUpdate(taskId, status) {
    setLoadingTask(taskId)
    try { await setTaskStatus(taskId, status, session?.Name || '', session?.ID); await sync() }
    finally { setLoadingTask(null) }
  }

  const activeCount    = myTasks.filter(t => t.Status !== 'Completed').length
  const completedCount = myTasks.filter(t => t.Status === 'Completed').length
  const assignedCount  = myTasks.filter(t => t.Status === 'Assigned').length
  const receivedCount  = myTasks.filter(t => t.Status === 'Received').length

  return (
    <div className="h-dvh flex overflow-hidden page-bg">

      {/* ── SIDEBAR OVERLAY (mobile) ── */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar-responsive sidebar-gradient fixed md:relative inset-y-0 left-0 z-50 md:z-auto flex flex-col flex-shrink-0 h-full transition-all duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>

        {/* ── Branding + Notification row ── */}
        <div className="sb-head flex items-center justify-between px-4 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/20">
              <img src="/philfida-logo.png" alt="PhilFIDA Logo" className="w-6 h-6 object-contain"
                onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style="font-size:10px;font-weight:900;color:white;">PF</span>' }} />
            </div>
            <div className="sidebar-hide flex flex-col min-w-0">
              <span className="text-white font-black text-[11px] tracking-wider uppercase leading-none">PhilFIDA</span>
              <span className="text-green-300 font-bold text-[10px] mt-0.5 leading-none">Task Management System</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <NotificationBell />
            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-green-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 rounded">
              <i className="bi bi-x-lg text-base" aria-hidden="true" />
              <span className="sr-only">Close sidebar</span>
            </button>
          </div>
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto" role="tablist" aria-label="Dashboard views">
          <button
            role="tab"
            aria-selected={tab === 'my-tasks'}
            aria-controls="panel-my-tasks"
            id="tab-my-tasks"
            onClick={() => setTab('my-tasks')}
            className={`nav-item w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yellow-500 ${tab === 'my-tasks' ? 'active' : ''}`}
          >
            <i className="bi bi-grid-fill text-base" aria-hidden="true" />
            <span className="flex-1 text-sm">My Assignments</span>
            {activeCount > 0 && (
              <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center" aria-label={`${activeCount} active tasks`}>
                {activeCount}
              </span>
            )}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'calendar'}
            aria-controls="panel-calendar"
            id="tab-calendar"
            onClick={() => setTab('calendar')}
            className={`nav-item w-full text-left mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yellow-500 ${tab === 'calendar' ? 'active' : ''}`}
          >
            <i className="bi bi-calendar3 text-base" aria-hidden="true" />
            <span className="flex-1 text-sm">Personal Calendar</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === 'profile'}
            aria-controls="panel-profile"
            id="tab-profile"
            onClick={() => setTab('profile')}
            className={`nav-item w-full text-left mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yellow-500 ${tab === 'profile' ? 'active' : ''}`}
          >
            <i className="bi bi-person-circle text-base" aria-hidden="true" />
            <span className="flex-1 text-sm">My Profile</span>
          </button>
        </nav>

        {/* ── Collapse toggle ── */}
        <div className="hidden md:flex justify-center px-3 py-3 border-t border-white/10 flex-shrink-0">
          <button onClick={toggleSidebarCollapsed}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <i className={`bi ${sidebarCollapsed ? 'bi-chevron-double-right' : 'bi-chevron-double-left'} text-sm`} aria-hidden="true" />
          </button>
        </div>
      </aside>


      {/* ── MAIN ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-40 glass-effect flex items-center justify-between px-4 py-3 bg-white/80 border-b border-slate-200 flex-shrink-0">
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="p-1.5 -ml-1 text-slate-600 hover:text-green-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded-lg"
            aria-label="Open sidebar"
          >
            <i className="bi bi-list text-2xl" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-green-900 rounded-lg flex items-center justify-center overflow-hidden shadow-md">
              <img src="/philfida-logo.png" alt="" className="w-5 h-5 object-contain" onError={e => e.target.style.display='none'} />
            </div>
            <span className="text-green-900 font-black text-sm tracking-tight uppercase">Task Management System</span>
          </div>
          <NotificationBell />
        </div>

        <main className="flex-1 overflow-y-auto flex flex-col md:pb-0 pb-16">

          {/* My Tasks Panel */}
          {tab === 'my-tasks' && (
            <div
              id="panel-my-tasks"
              role="tabpanel"
              aria-labelledby="tab-my-tasks"
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="px-4 md:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white flex-shrink-0">
                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 min-w-0">
                  <div className="min-w-0">
                    <h1 className="mb-0 text-lg sm:text-xl font-bold tracking-tight leading-snug text-slate-900">
                      My Assignments
                    </h1>
                  </div>
                  {myTasks.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 xl:min-w-[520px]">
                      <SummaryStat label="Active" value={activeCount} tone="green" active={filterStatus === 'All'} onClick={() => setFilterStatus('All')} />
                      <SummaryStat label="To Accept" value={assignedCount} tone="amber" active={filterStatus === 'Assigned'} onClick={() => setFilterStatus('Assigned')} />
                      <SummaryStat label="In Progress" value={receivedCount} tone="blue" active={filterStatus === 'Received'} onClick={() => setFilterStatus('Received')} />
                      <SummaryStat label="Completed" value={completedCount} tone="slate" active={filterStatus === 'Completed'} onClick={() => setFilterStatus('Completed')} />
                    </div>
                  )}
                </div>
              </div>

              {myTasks.length > 0 && (
                <div className="px-4 md:px-6 lg:px-8 py-3 border-b border-slate-200 bg-white/95 flex-shrink-0 flex items-center gap-2.5 flex-wrap">
                  <div className="relative flex-1 min-w-[140px] max-w-sm">
                    <label htmlFor="task-search" className="sr-only">Search assignments</label>
                    <i className="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden="true" />
                    <input
                      id="task-search"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                      placeholder="Search tasks..."
                      value={filterSearch}
                      onChange={e => setFilterSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="task-status-filter" className="sr-only">Filter by Status</label>
                    <select 
                      id="task-status-filter"
                      className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 focus-visible:ring-2 focus-visible:ring-green-600"
                      value={filterStatus} 
                      onChange={e => setFilterStatus(e.target.value)}
                    >
                      <option value="All">All Status</option>
                      <option value="Assigned">Assigned</option>
                      <option value="Received">Received</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                  {(filterStatus !== 'All' || filterSearch) && (
                    <button 
                      onClick={() => { setFilterStatus('All'); setFilterSearch('') }}
                      className="px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                    >
                      <i className="bi bi-x-circle-fill" aria-hidden="true" /> Reset
                    </button>
                  )}
                </div>
              )}

              {/* ── TASK CONTENT ── */}
              <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 pt-5 pb-6">
                {myTasks.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm max-w-2xl mx-auto mt-10 text-center py-16 px-6">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-400 ring-1 ring-slate-200" aria-hidden="true">
                      <i className="bi bi-clipboard-check text-2xl" />
                    </div>
                    <h2 className="mb-0 text-base font-bold tracking-tight text-slate-900">No assignments yet</h2>
                    <p className="mb-0 mt-1 text-sm text-slate-500">New tasks assigned to you will appear here.</p>
                  </div>
                ) : (
                  <div className="max-w-full mb-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredMyTasks.length === 0 ? (
                        <div className="col-span-full text-center py-14 text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl">
                          <i className="bi bi-search text-3xl block mb-3 opacity-40" aria-hidden="true" />
                          <p className="mb-0 text-sm font-semibold">No matching tasks found.</p>
                        </div>
                      ) : filteredMyTasks.map(t => (
                        <TaskCard
                          key={t.TaskID}
                          task={t}
                          session={session}
                          comments={globalData.comments}
                          loading={loadingTask === t.TaskID}
                          history={globalData.history.filter(h => String(h.TaskID) === String(t.TaskID))}
                          onStatusUpdate={handleStatusUpdate}
                          onOpenChat={() => setChat({ taskId: t.TaskID, taskTitle: t.Title })}
                          onOpenFile={(url, name) => setLightboxFile({ url, name })}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Calendar Panel */}
          {tab === 'calendar' && (
            <div
              id="panel-calendar"
              role="tabpanel"
              aria-labelledby="tab-calendar"
              className="flex-1 flex flex-col overflow-hidden"
            >
              <PersonalCalendarTab 
                tasks={myCalendarTasks} 
                userId={session?.ID} 
                onViewTask={(taskId, titleText) => {
                  setTab('my-tasks')
                  setFilterSearch(titleText.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim())
                }} 
              />
            </div>
          )}

          {/* Profile Panel */}
          {tab === 'profile' && (
            <div
              id="panel-profile"
              role="tabpanel"
              aria-labelledby="tab-profile"
              className="flex-1 flex flex-col overflow-hidden"
            >
              <UserProfileTab presence={presence} setPresence={setPresence} />
            </div>
          )}
        </main>

      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex z-30 shadow-lg" role="tablist" aria-label="Mobile navigation">
        <button
          role="tab"
          aria-selected={tab === 'my-tasks'}
          aria-controls="panel-my-tasks"
          id="mobile-tab-my-tasks"
          onClick={() => setTab('my-tasks')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-bold transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-600 ${tab === 'my-tasks' ? 'text-green-800' : 'text-slate-500'}`}
        >
          <i className="bi bi-grid-fill text-xl" aria-hidden="true" />
          <span>Assignments</span>
          {activeCount > 0 && (
            <span className="absolute top-2 right-1/4 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center" aria-label={`${activeCount} active tasks`}>
              {activeCount}
            </span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'calendar'}
          aria-controls="panel-calendar"
          id="mobile-tab-calendar"
          onClick={() => setTab('calendar')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-bold transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-600 ${tab === 'calendar' ? 'text-green-800' : 'text-slate-500'}`}
        >
          <i className="bi bi-calendar3 text-xl" aria-hidden="true" />
          <span>Calendar</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'profile'}
          aria-controls="panel-profile"
          id="mobile-tab-profile"
          onClick={() => setTab('profile')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-bold transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-600 ${tab === 'profile' ? 'text-green-800' : 'text-slate-500'}`}
        >
          <i className="bi bi-person-circle text-xl" aria-hidden="true" />
          <span>Profile</span>
        </button>
      </nav>

      {chat         && <ChatModal taskId={chat.taskId} taskTitle={chat.taskTitle} onClose={() => setChat(null)} onSync={sync} />}
      {lightboxFile && <Lightbox file={lightboxFile} onClose={() => setLightboxFile(null)} />}

      {/* ── AUTO-UPDATE TOAST ALERT ── */}
      {autoUpdateAlert && (
        <div className="fixed top-4 right-4 z-toast max-w-sm w-full bg-green-900 text-white rounded-xl shadow-lg border border-green-800/60 p-4 animate-in-right flex items-start gap-3">
          <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/20 text-green-400">
            <i className="bi bi-patch-check-fill text-lg leading-none" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-black uppercase tracking-wider text-green-400">Status Triggered</h4>
            <p className="text-[11px] font-bold text-slate-100 leading-snug mt-1">
              Your availability presence has been auto-updated in advance based on your schedule:
            </p>
            <p className="text-[10px] font-mono bg-black/30 rounded px-2 py-1 mt-1.5 text-green-300 font-semibold border border-white/5 break-all select-all">
              {autoUpdateAlert}
            </p>
          </div>
          <button 
            onClick={() => setAutoUpdateAlert(null)}
            className="text-slate-400 hover:text-white text-base font-bold leading-none select-none transition-colors"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  )
}

// Left accent bar carries the tone instead of a per-tile icon square — four
// decorative icons added noise without adding information the label didn't.
const SUMMARY_ACCENTS = {
  green: 'border-l-green-500',
  amber: 'border-l-amber-400',
  blue:  'border-l-blue-500',
  slate: 'border-l-slate-300',
}

const STATUS_TONES = {
  Assigned: {
    label:  'To accept',
    icon:   'bi-inbox-fill',
    accent: 'border-l-amber-400',
    chip:   'bg-amber-50 text-amber-800 ring-amber-200',
    dot:    'bg-amber-500',
  },
  Received: {
    label:  'In progress',
    icon:   'bi-arrow-repeat',
    accent: 'border-l-blue-500',
    chip:   'bg-blue-50 text-blue-800 ring-blue-200',
    dot:    'bg-blue-500',
  },
  Completed: {
    label:  'Completed',
    icon:   'bi-check2-circle',
    accent: 'border-l-green-600',
    chip:   'bg-green-50 text-green-800 ring-green-200',
    dot:    'bg-green-600',
  },
}

const PRIORITY_TONES = {
  Urgent: 'bg-red-50 text-red-700 ring-red-200',
  High:   'bg-orange-50 text-orange-700 ring-orange-200',
  Medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  Low:    'bg-slate-50 text-slate-700 ring-slate-200',
  Normal: 'bg-green-50 text-green-700 ring-green-200',
}

function SummaryStat({ label, value, tone, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left rounded-xl border border-l-4 ${SUMMARY_ACCENTS[tone] || SUMMARY_ACCENTS.slate} border-slate-100 bg-white px-3.5 py-2.5 shadow-sm transition-all hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1 ${active ? 'ring-2 ring-green-600/40 bg-green-50/30' : ''}`}
    >
      <p className="mb-0 text-[11px] font-bold text-slate-500 uppercase tracking-wider leading-none">{label}</p>
      <p className="mb-0 mt-1.5 text-xl font-black tracking-normal text-slate-900 leading-none">{value}</p>
    </button>
  )
}

function StatusPill({ status }) {
  const tone = STATUS_TONES[status] || STATUS_TONES.Assigned
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${tone.chip}`}>
      <i className={`bi ${tone.icon} text-[10px]`} aria-hidden="true" />
      {tone.label}
    </span>
  )
}

function PriorityPill({ priority }) {
  if (!priority) return <span className="text-sm font-semibold text-slate-400">None</span>
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${PRIORITY_TONES[priority] || PRIORITY_TONES.Normal}`}>
      {priority}
    </span>
  )
}

function getDocNumber(task) {
  if (task.DocumentNo) return task.DocumentNo
  return task.Title?.match(/^\[\s*([^\]]+)\s*\]/)?.[1] || ''
}

function getCleanTitle(task) {
  const title = task.Title || 'Untitled assignment'
  return title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || title
}

function formatDate(iso) {
  if (!iso) return 'No deadline'
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getDeadlineMeta(deadline, status) {
  if (!deadline) return { label: 'No deadline', className: 'text-slate-500', icon: 'bi-calendar' }
  if (status === 'Completed') return { label: formatDate(deadline), className: 'text-green-600 font-semibold', icon: 'bi-calendar-check' }

  const now = new Date()
  const due = new Date(deadline)
  const days = Math.ceil((due - now) / 86400000)

  if (Number.isNaN(due.getTime())) return { label: 'Invalid date', className: 'text-slate-500', icon: 'bi-calendar' }
  if (days < 0) return { label: `${formatDate(deadline)} · Overdue`, className: 'text-red-700 font-bold', icon: 'bi-exclamation-triangle-fill' }
  if (days === 0) return { label: `${formatDate(deadline)} · Due today`, className: 'text-red-700 font-bold', icon: 'bi-exclamation-circle-fill' }
  if (days <= 3) return { label: `${formatDate(deadline)} · ${days}d left`, className: 'text-amber-800 font-bold', icon: 'bi-clock-fill' }
  return { label: formatDate(deadline), className: 'text-slate-700 font-semibold', icon: 'bi-calendar-event' }
}


/** Instructions are written by CreateTaskForm as "Label: value" lines (Purpose / Action / Remarks / From).
 *  Split them back into fields so the card can render them as rows instead of one wall of text.
 *  The "From" line is dropped here — it is shown once in the card header instead. */
function parseInstructions(raw) {
  if (!raw) return { fields: [], from: '', free: '' }
  const fields = []
  const free = []
  let from = ''
  for (const line of raw.split('\n')) {
    const text = line.trim()
    if (!text) continue
    const m = text.match(/^(Purpose|Action|Remarks|From)\s*:\s*(.*)$/i)
    if (!m) { free.push(text); continue }
    const [, label, value] = m
    if (!value) continue
    if (label.toLowerCase() === 'from') from = value
    else fields.push({ label, value })
  }
  return { fields, from, free: free.join('\n') }
}

function TaskCard({ task: t, session, comments, history = [], loading, onStatusUpdate, onOpenChat, onOpenFile }) {
  const [showAll, setShowAll] = useState(false)
  const unreadChat = getUnreadCommentCount(comments, t.TaskID, session?.Name || '')
  const statusTone = STATUS_TONES[t.Status] || STATUS_TONES.Assigned
  const deadline = getDeadlineMeta(t.Deadline, t.Status)
  const docNumber = getDocNumber(t)
  const files = t.FileLink?.split('|').filter(Boolean) || []
  const instructions = parseInstructions(t.Instructions)
  // Assigner: the "From:" line the dispatcher typed, else whoever logged the Dispatched entry.
  const assignedBy = instructions.from || history.find(h => h.Action === 'Dispatched')?.Actor || ''
  const purposeTags = (instructions.fields.find(f => f.label.toLowerCase() === 'purpose')?.value || '')
    .split(',').map(v => v.trim()).filter(Boolean)
  const textLines = [
    ...instructions.fields.filter(f => f.label.toLowerCase() !== 'purpose'),
    ...(instructions.free ? [{ label: '', value: instructions.free }] : []),
  ]

  return (
    <article className={`bg-white border border-l-4 ${statusTone.accent} border-slate-100 rounded-lg shadow-sm hover:shadow-md transition-shadow flex flex-col h-full overflow-hidden`}>
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="mb-1 text-[14px] font-semibold leading-snug tracking-tight text-slate-900">
              {getCleanTitle(t)}
            </h2>
            {/* One meta line instead of a stack of separate badges — keeps the header short. */}
            <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${statusTone.dot}`} aria-hidden="true" />
                {assignedBy ? <>From <span className="font-semibold text-slate-700">{assignedBy}</span></> : 'New assignment'}
              </span>
              {docNumber && <><span aria-hidden="true">·</span><span className="font-semibold text-slate-600">#{docNumber}</span></>}
              {t.Category && <><span aria-hidden="true">·</span><span>{t.Category}</span></>}
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
            <StatusPill status={t.Status} />
            {unreadChat > 0 && (
              <button
                onClick={onOpenChat}
                className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              >
                <i className="bi bi-chat-dots-fill text-[9px]" aria-hidden="true" />
                {unreadChat > 9 ? '9+' : unreadChat} new
              </button>
            )}
          </div>
        </div>

        {(instructions.fields.length > 0 || instructions.free) && (
          <div className="rounded-lg bg-slate-50 px-2.5 py-2">
            {/* Purpose reads as tags; everything else as a short labelled line. */}
            {purposeTags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {purposeTags.map((v, i) => (
                  <span key={i} className="inline-flex items-center rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    {v}
                  </span>
                ))}
              </div>
            )}
            <div
              className="space-y-1"
              style={showAll ? undefined : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {textLines.map(({ label, value }, i) => (
                <p key={i} className="m-0 text-[12.5px] leading-relaxed text-slate-700">
                  {label && <span className="font-semibold text-slate-900">{label}: </span>}
                  {value}
                </p>
              ))}
            </div>
            {textLines.some(l => l.value.length > 120) && (
              <button
                onClick={() => setShowAll(v => !v)}
                className="mt-1.5 rounded text-[11px] font-bold text-green-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
              >
                {showAll ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((url, idx) => {
              const name = decodeURIComponent(url.split('?')[0].split('/').pop())
              return (
                <button key={idx} onClick={() => onOpenFile(url, name)}
                  className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-green-100/50 bg-green-50/50 px-2.5 py-1.5 text-[11px] font-semibold text-green-800 hover:border-green-200 hover:bg-green-100/60 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2">
                  <i className="bi bi-paperclip flex-shrink-0 text-green-700" aria-hidden="true" />
                  <span className="truncate">{name}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <PriorityPill priority={t.Priority} />
          <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${deadline.className}`}>
            <i className={`bi ${deadline.icon} text-[11px]`} aria-hidden="true" />
            {deadline.label}
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg bg-slate-50 px-2.5 py-2">
          <TaskTimeline task={t} history={history} />
        </div>

        {t.Deadline && t.Status !== 'Completed' && (
          <div className="rounded-lg bg-slate-50 px-2.5 py-2">
            <DeadlineProgress task={t} />
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-2.5">
        <div className="flex flex-wrap gap-2">
          {t.Status === 'Assigned' && (
            <button 
              disabled={loading} 
              onClick={() => onStatusUpdate(t.TaskID, 'Received')} 
              className="flex-1 flex min-h-10 items-center justify-center gap-2 rounded-xl bg-green-700 hover:bg-green-800 px-3 py-2 text-[13px] font-bold text-white shadow-sm hover:shadow transition-all disabled:cursor-wait disabled:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 transform active:scale-[0.98]"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" aria-hidden="true" />
              ) : (
                <><i className="bi bi-check-lg" aria-hidden="true" /> Accept Task</>
              )}
            </button>
          )}
          {t.Status === 'Received' && (
            <button 
              disabled={loading} 
              onClick={() => onStatusUpdate(t.TaskID, 'Completed')} 
              className="flex-1 flex min-h-10 items-center justify-center gap-2 rounded-xl bg-green-700 hover:bg-green-800 px-3 py-2 text-[13px] font-bold text-white shadow-sm hover:shadow transition-all disabled:cursor-wait disabled:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 transform active:scale-[0.98]"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" aria-hidden="true" />
              ) : (
                <><i className="bi bi-check2-circle" aria-hidden="true" /> Complete Task</>
              )}
            </button>
          )}
          {t.Status === 'Completed' && (
            <button disabled className="flex-1 flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-500 cursor-not-allowed">
              <i className="bi bi-check-circle-fill text-slate-400" aria-hidden="true" /> Completed
            </button>
          )}
          <button
            onClick={onOpenChat}
            className="relative flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 px-3 py-2 text-[13px] font-bold text-slate-700 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 transform active:scale-[0.98]"
          >
            <i className="bi bi-chat-text-fill text-green-700" aria-hidden="true" />
            <span>Chat</span>
            {unreadChat > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white" aria-label={`${unreadChat} unread comments`}>
                {unreadChat > 9 ? '9+' : unreadChat}
              </span>
            )}
          </button>
        </div>
      </div>
    </article>
  )
}

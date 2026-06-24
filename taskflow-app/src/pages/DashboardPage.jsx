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
      setAutoUpdateAlert(e.detail.status)
      setPresence(e.detail.status)
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

      <aside className={`sidebar-responsive sidebar-gradient fixed md:relative inset-y-0 left-0 z-50 md:z-auto flex flex-col flex-shrink-0 h-full transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>

        {/* ── Branding + Notification row ── */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center flex-shrink-0 border border-white/20 shadow-inner">
              <img src="/philfida-logo.png" alt="PhilFIDA Logo" className="w-6 h-6 object-contain"
                onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style="font-size:10px;font-weight:900;color:white;">PF</span>' }} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-white font-black text-[11px] tracking-wider uppercase leading-none">PhilFIDA</span>
              <span className="text-green-300 font-bold text-[10px] mt-0.5 leading-none">TaskFlow</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {session?.Region && (
              <span className="region-badge px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter bg-white/10 text-white border border-white/20 mr-1">
                {session.Region}
              </span>
            )}
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
            <span className="text-green-900 font-black text-sm tracking-tight uppercase">TaskFlow</span>
            <span className="text-[10px] font-bold text-green-600/70 border-l border-slate-300 pl-2">{session?.Region}</span>
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
                    <p className="mb-0 mt-0.5 text-[13px] text-slate-500 font-medium leading-snug">
                      {session?.Office || session?.Unit || 'PhilFIDA TaskFlow'}
                    </p>
                  </div>
                  {myTasks.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 xl:min-w-[520px]">
                      <SummaryStat label="Active" value={activeCount} tone="green" icon="bi-activity" />
                      <SummaryStat label="To Accept" value={assignedCount} tone="amber" icon="bi-inbox-fill" />
                      <SummaryStat label="In Progress" value={receivedCount} tone="blue" icon="bi-arrow-repeat" />
                      <SummaryStat label="Completed" value={completedCount} tone="slate" icon="bi-check2-circle" />
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
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {filteredMyTasks.length === 0 ? (
                        <div className="xl:col-span-2 text-center py-14 text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl">
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

        {/* FOOTER */}
        <footer className="bg-white border-t border-slate-100/80 py-1.5 sm:py-2 px-3 sm:px-4 md:px-6 lg:px-8 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] sm:text-[10px] text-slate-400 truncate">© {new Date().getFullYear()} PhilFIDA</p>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <span className="text-[9px] sm:text-[10px] text-slate-400 hidden sm:inline">User Dashboard</span>
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gradient-to-r from-[#016837] to-[#027a42]" aria-hidden="true" />
            </div>
          </div>
        </footer>
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
        <div className="fixed top-4 right-4 z-[9999] max-w-sm w-full bg-gradient-to-br from-green-900 to-emerald-950 text-white rounded-2xl shadow-2xl border border-green-500/30 p-4 animate-in-right flex items-start gap-3.5 backdrop-blur-lg">
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

const SUMMARY_TONES = {
  green: 'text-green-800 bg-green-50 ring-green-100',
  amber: 'text-amber-800 bg-amber-50 ring-amber-100',
  blue:  'text-blue-800 bg-blue-50 ring-blue-100',
  slate: 'text-slate-700 bg-slate-50 ring-slate-200',
}

const STATUS_TONES = {
  Assigned: {
    label:  'To accept',
    icon:   'bi-inbox-fill',
    accent: 'border-l-amber-400',
    chip:   'bg-amber-50 text-amber-850 ring-amber-200',
    dot:    'bg-amber-500',
  },
  Received: {
    label:  'In progress',
    icon:   'bi-arrow-repeat',
    accent: 'border-l-blue-500',
    chip:   'bg-blue-50 text-blue-850 ring-blue-200',
    dot:    'bg-blue-500',
  },
  Completed: {
    label:  'Completed',
    icon:   'bi-check2-circle',
    accent: 'border-l-green-600',
    chip:   'bg-green-50 text-green-850 ring-green-200',
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

function SummaryStat({ label, value, tone, icon }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3.5 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="mb-0 text-[11px] font-bold text-slate-500 uppercase tracking-wider leading-none">{label}</p>
          <p className="mb-0 mt-2 text-xl font-black tracking-normal text-slate-900 leading-none">{value}</p>
        </div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${SUMMARY_TONES[tone] || SUMMARY_TONES.slate}`} aria-hidden="true">
          <i className={`bi ${icon} text-sm`} />
        </span>
      </div>
    </div>
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

function InfoTile({ label, icon, children }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 flex flex-col justify-between">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">
        <i className={`bi ${icon} text-[11px]`} aria-hidden="true" />
        {label}
      </span>
      {children}
    </div>
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
  if (status === 'Completed') return { label: formatDate(deadline), className: 'text-slate-650 font-semibold', icon: 'bi-calendar-check' }

  const now = new Date()
  const due = new Date(deadline)
  const days = Math.ceil((due - now) / 86400000)

  if (Number.isNaN(due.getTime())) return { label: 'Invalid date', className: 'text-slate-500', icon: 'bi-calendar' }
  if (days < 0) return { label: `${formatDate(deadline)} · Overdue`, className: 'text-red-750 font-bold', icon: 'bi-exclamation-triangle-fill' }
  if (days === 0) return { label: `${formatDate(deadline)} · Due today`, className: 'text-red-750 font-bold', icon: 'bi-exclamation-circle-fill' }
  if (days <= 3) return { label: `${formatDate(deadline)} · ${days}d left`, className: 'text-amber-800 font-bold', icon: 'bi-clock-fill' }
  return { label: formatDate(deadline), className: 'text-slate-750 font-semibold', icon: 'bi-calendar-event' }
}

function TaskCard({ task: t, session, comments, history = [], loading, onStatusUpdate, onOpenChat, onOpenFile }) {
  const unreadChat = getUnreadCommentCount(comments, t.TaskID, session?.Name || '')
  const statusTone = STATUS_TONES[t.Status] || STATUS_TONES.Assigned
  const deadline = getDeadlineMeta(t.Deadline, t.Status)
  const docNumber = getDocNumber(t)
  const files = t.FileLink?.split('|').filter(Boolean) || []

  return (
    <article className={`bg-white border border-l-4 ${statusTone.accent} border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 flex flex-col h-full overflow-hidden animate-in-up`}>
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
              <span className={`h-2 w-2 rounded-full ${statusTone.dot}`} aria-hidden="true" />
              Assigned to you
            </p>
            {docNumber && (
              <span className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
                <i className="bi bi-hash text-green-700" aria-hidden="true" />
                {docNumber}
              </span>
            )}
            <h2 className="mb-0 text-[15px] sm:text-base font-semibold tracking-tight leading-snug text-slate-900">
              {getCleanTitle(t)}
            </h2>
            {t.Category && (
              <span className="mt-2 inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                {t.Category}
              </span>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-2">
            <StatusPill status={t.Status} />
            {unreadChat > 0 && (
              <button
                onClick={onOpenChat}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              >
                <i className="bi bi-chat-dots-fill text-[10px]" aria-hidden="true" />
                {unreadChat > 9 ? '9+' : unreadChat} new
              </button>
            )}
          </div>
        </div>

        {t.Instructions && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
            <span className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Instructions</span>
            <p
              className="mb-0 text-sm text-slate-700 leading-relaxed font-medium"
              style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {t.Instructions}
            </p>
          </div>
        )}

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((url, idx) => {
              const name = decodeURIComponent(url.split('?')[0].split('/').pop())
              return (
                <button key={idx} onClick={() => onOpenFile(url, name)}
                  className="inline-flex max-w-full items-center gap-1.5 truncate rounded-xl border border-green-100/50 bg-green-50/50 px-3 py-2 text-xs font-semibold text-green-800 hover:border-green-200 hover:bg-green-100/60 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2">
                  <i className="bi bi-paperclip flex-shrink-0 text-green-700" aria-hidden="true" />
                  <span className="truncate">{name}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <InfoTile label="Priority" icon="bi-flag-fill">
            <PriorityPill priority={t.Priority} />
          </InfoTile>
          <InfoTile label="Deadline" icon={deadline.icon}>
            <span className={`text-sm font-bold ${deadline.className}`}>{deadline.label}</span>
          </InfoTile>
          <InfoTile label="Task ID" icon="bi-upc-scan">
            <span className="truncate text-sm font-bold text-slate-700" title={t.TaskID}>{t.TaskID}</span>
          </InfoTile>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 overflow-x-auto">
          <span className="block text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-3">Task timeline</span>
          <TaskTimeline task={t} history={history} />
        </div>

        {t.Deadline && t.Status !== 'Completed' && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-4">
            <DeadlineProgress task={t} />
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap gap-2">
          {t.Status === 'Assigned' && (
            <button 
              disabled={loading} 
              onClick={() => onStatusUpdate(t.TaskID, 'Received')} 
              className="flex-1 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-700 hover:bg-green-800 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:shadow transition-all disabled:cursor-wait disabled:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 transform active:scale-[0.98]"
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
              className="flex-1 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-700 hover:bg-green-800 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:shadow transition-all disabled:cursor-wait disabled:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 transform active:scale-[0.98]"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" aria-hidden="true" />
              ) : (
                <><i className="bi bi-check2-circle" aria-hidden="true" /> Complete Task</>
              )}
            </button>
          )}
          {t.Status === 'Completed' && (
            <button disabled className="flex-1 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-500 cursor-not-allowed">
              <i className="bi bi-check-circle-fill text-slate-400" aria-hidden="true" /> Completed
            </button>
          )}
          <button
            onClick={onOpenChat}
            className="relative flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 transform active:scale-[0.98]"
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

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { useSync } from '../hooks/useSync'
import { setTaskStatus, getStatusBadgeClass, getPriorityClass, getUnreadCommentCount, logHistory, createTask } from '../lib/api'
import NotificationBell from '../components/NotificationBell'
import UserProfileTab from '../components/UserProfileTab'
import ChatModal from '../components/ChatModal'
import FileThumb from '../components/FileThumb'
import Lightbox from '../components/Lightbox'
import CreateTaskForm from '../components/CreateTaskForm'
import EditTaskModal from '../components/EditTaskModal'
import { normalizeStatus } from '../components/PresenceToggle'
import TaskTimeline from '../components/TaskTimeline'
import UserStatusPopover from '../components/UserStatusPopover'
import DeadlineProgress from '../components/DeadlineProgress'
import PersonalCalendarTab, { checkAndApplyScheduledPresence } from '../components/PersonalCalendarTab'

const STATUS_CFG = {
  Available:         { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  'Official Travel': { dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'   },
  'On Leave':        { dot: 'bg-red-500',      text: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200'    },
}

export default function UnitHeadPage() {
  const session    = useStore(s => s.session)
  const rawGlobal = useStore(s => s.globalData)
  const globalData = {
    tasks:         rawGlobal?.tasks         ?? [],
    users:         rawGlobal?.users         ?? [],
    comments:      rawGlobal?.comments      ?? [],
    notifications: rawGlobal?.notifications ?? [],
    history:       rawGlobal?.history       ?? [],
  }
  const { sync }   = useSync()
  const navigate = useNavigate()

  const [tab,          setTab]         = useState('my-tasks')
  const [monitorFilter, setMonitorFilter] = useState('director-assigned')
  const [filterSearch, setFilterSearch]   = useState('')
  const [filterStatus, setFilterStatus]   = useState('All')
  const [chat,         setChat]        = useState(null)
  const [lightboxFile, setLightboxFile]= useState(null)
  const [presence,     setPresence]    = useState(session?.Status || 'Available')
  const [loadingTask,  setLoadingTask] = useState(null)
  const [drawerOpen,   setDrawerOpen]  = useState(false)
  const [sidebarOpen,  setSidebarOpen]  = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('pf_sidebar_collapsed') === '1')
  const toggleSidebarCollapsed = () => setSidebarCollapsed(v => { localStorage.setItem('pf_sidebar_collapsed', v ? '0' : '1'); return !v })
  const [dispatchConfirm, setDispatchConfirm] = useState(null)
  const [pendingDispatch, setPendingDispatch] = useState(null)
  const [editTask,           setEditTask]           = useState(null)



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
  const [autoUpdateAlert, setAutoUpdateAlert] = useState(null)
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

  const myUnit = session?.Unit || session?.Office || ''

  const myTasks = globalData.tasks
    .filter(t => String(t.EmployeeID) === String(session?.ID) && String(t.Archived).toUpperCase() !== 'TRUE')
    .slice().reverse()

  const myCalendarTasks = globalData.tasks
    .filter(t => String(t.EmployeeID) === String(session?.ID))
    .slice().reverse()

  const unitEmployees = globalData.users.filter(u =>
    u.Role === 'Employee' &&
    (u.Unit === myUnit || u.Office === myUnit) &&
    u.AccountStatus === 'Active'
  )

  const unitTasks = globalData.tasks
    .filter(t => {
      const emp = globalData.users.find(u => String(u.ID) === String(t.EmployeeID))
      return emp && (emp.Unit === myUnit || emp.Office === myUnit) &&
        String(t.EmployeeID) !== String(session?.ID) &&
        String(t.Archived).toUpperCase() !== 'TRUE'
    })
    .slice().reverse()

  const filteredUnitTasks = unitTasks.filter(t => {
    if (filterStatus !== 'All' && t.Status !== filterStatus) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      if (!t.Title?.toLowerCase().includes(q) && !t.EmployeeName?.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Separate unit tasks by assignment source using history
  const directorAssignedTasks = filteredUnitTasks.filter(t => {
    const taskHistory = globalData.history.filter(h => String(h.TaskID) === String(t.TaskID))
    const dispatchedEntry = taskHistory.find(h => h.Action === 'Dispatched')
    if (!dispatchedEntry) return false

    // Check if actor is Director or contains 'Director'
    const actorIsDirector = dispatchedEntry.Actor === 'Director' ||
      dispatchedEntry.Actor?.toLowerCase().includes('director')

    // Also check if the actor is a user with Director role
    const actorUser = globalData.users.find(u => u.Name === dispatchedEntry.Actor || u.ID === dispatchedEntry.Actor)
    const actorHasDirectorRole = actorUser?.Role === 'Director'

    return actorIsDirector || actorHasDirectorRole
  })

  const unitHeadAssignedTasks = filteredUnitTasks.filter(t => {
    const taskHistory = globalData.history.filter(h => String(h.TaskID) === String(t.TaskID))
    const dispatchedEntry = taskHistory.find(h => h.Action === 'Dispatched')
    if (!dispatchedEntry) return false

    // Check if actor matches current user (unit head)
    const isUnitHead = dispatchedEntry.Actor === session?.Name ||
      dispatchedEntry.Actor === session?.ID ||
      (session?.Name && dispatchedEntry.Actor?.toLowerCase() === session?.Name?.toLowerCase())

    // Also check if the actor is a user with Unit Head role (if that role exists)
    const actorUser = globalData.users.find(u => u.Name === dispatchedEntry.Actor || u.ID === dispatchedEntry.Actor)
    const actorHasUnitHeadRole = actorUser?.Role === 'Unit Head'

    return isUnitHead || actorHasUnitHeadRole
  })

  // Fallback for tasks without Dispatched history - classify as unit head assigned by default
  const unassignedTasks = filteredUnitTasks.filter(t => {
    const taskHistory = globalData.history.filter(h => String(h.TaskID) === String(t.TaskID))
    const dispatchedEntry = taskHistory.find(h => h.Action === 'Dispatched')
    return !dispatchedEntry
  })

  // Add unassigned tasks to unit head assigned tasks as fallback
  const finalUnitHeadAssignedTasks = [...unitHeadAssignedTasks, ...unassignedTasks]

  async function handleStatusUpdate(taskId, status) {
    setLoadingTask(taskId)
    try { await setTaskStatus(taskId, status, session?.Name || '', session?.ID); await sync() }
    finally { setLoadingTask(null) }
  }




  const stats = {
    myActive:      myTasks.filter(t => t.Status !== 'Completed').length,
    unitActive:    unitTasks.filter(t => t.Status !== 'Completed').length,
    unitCompleted: unitTasks.filter(t => t.Status === 'Completed').length,
  }

  return (
    <div className="h-dvh flex overflow-hidden page-bg">

      {/* Global Print Preview Modal - Above all divs */}

      {/* ── SIDEBAR OVERLAY (mobile) ── */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar-responsive sidebar-gradient fixed md:relative inset-y-0 left-0 z-50 md:z-auto flex flex-col flex-shrink-0 h-full transition-all duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>

        {/* ── Branding + Notification row ── */}
        <div className="sb-head flex items-center justify-between px-4 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/20">
              <img src="/philfida-logo.png" alt="PhilFIDA" className="w-6 h-6 object-contain"
                onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style="font-size:10px;font-weight:900;color:white;">PF</span>' }} />
            </div>
            <div className="sidebar-hide flex flex-col min-w-0">
              <span className="text-white font-black text-[11px] tracking-wider uppercase leading-none">PhilFIDA</span>
              <span className="text-green-300 font-bold text-[10px] mt-0.5 leading-none">Task Management System</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <NotificationBell />
            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-green-300 hover:text-white transition-colors">
              <i className="bi bi-x-lg text-base" />
            </button>
          </div>
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {/* My Assignments */}
          <button onClick={() => { setTab('my-tasks'); setSidebarOpen(false) }}
            className={`nav-item w-full text-left ${tab === 'my-tasks' ? 'active' : ''}`}>
            <i className="bi bi-person-check-fill text-base" />
            <span className="flex-1 text-sm">My Assignments</span>
            {stats.myActive > 0 && (
              <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{stats.myActive}</span>
            )}
          </button>

          {/* Unit Monitor + inline submenu */}
          <button onClick={() => { setTab('monitor'); setMonitorFilter('director-assigned'); setSidebarOpen(false) }}
            className={`nav-item w-full text-left ${tab === 'monitor' ? 'active' : ''}`}>
            <i className="bi bi-speedometer2 text-base" />
            <span className="flex-1 text-sm">Unit Monitor</span>
            {stats.unitActive > 0 && (
              <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{stats.unitActive}</span>
            )}
          </button>
          {tab === 'monitor' && (
            <div className="sidebar-hide ml-4 mt-1 space-y-0.5">
              {[
                { key: 'director-assigned', label: 'Director Assigned', badge: directorAssignedTasks.length },
                { key: 'my-assigned',       label: 'My Assigned',       badge: finalUnitHeadAssignedTasks.length },
              ].map(item => (
                <button key={item.key} onClick={() => { setMonitorFilter(item.key); setSidebarOpen(false) }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center ${
                    monitorFilter === item.key
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}>
                  <span className="flex-1">{item.label}</span>
                  {item.badge > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 bg-red-500/80 text-white text-[9px] font-bold rounded-full">{item.badge}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Personal Calendar */}
          <button onClick={() => { setTab('calendar'); setSidebarOpen(false) }}
            className={`nav-item w-full text-left ${tab === 'calendar' ? 'active' : ''}`}>
            <i className="bi bi-calendar3 text-base" />
            <span className="flex-1 text-sm">Personal Calendar</span>
          </button>

          {/* My Profile */}
          <button onClick={() => { setTab('profile'); setSidebarOpen(false) }}
            className={`nav-item w-full text-left ${tab === 'profile' ? 'active' : ''}`}>
            <i className="bi bi-person-circle text-base" />
            <span className="flex-1 text-sm">My Profile</span>
          </button>
        </nav>

        {/* ── Collapse toggle ── */}
        <div className="hidden md:flex justify-center px-3 py-3 border-t border-white/10 flex-shrink-0">
          <button onClick={toggleSidebarCollapsed}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <i className={`bi ${sidebarCollapsed ? 'bi-chevron-double-right' : 'bi-chevron-double-left'} text-sm`} />
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-40 glass-effect flex items-center justify-between px-4 py-3 bg-white/80 border-b border-slate-200 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 -ml-1 text-slate-600 hover:text-green-800 transition-colors">
            <i className="bi bi-list text-2xl" />
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

          {/* ── MY TASKS TAB ── */}
          {tab === 'my-tasks' && (
            <div className="flex flex-col h-full">
              {/* ── TOP BAR: Page title + Assign button ── */}
              <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white flex-shrink-0 gap-2 min-w-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  <h1 className="mb-0 text-lg sm:text-xl font-bold tracking-tight leading-snug text-slate-900">
                    My Assignments
                  </h1>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{myTasks.length}</span>
                </div>
              </div>

              {/* ── PERSONNEL STATUS BAR ── */}
              {unitEmployees.length > 0 && (
                <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-2 border-b border-slate-200 bg-white flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                      {/* Minimal personnel counts - consistent across all sizes */}
                      <div className="flex items-center gap-1.5">
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-1 rounded border border-emerald-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {unitEmployees.filter(u => normalizeStatus(u.Status) === 'Available').length} Available
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-1 rounded border border-blue-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          {unitEmployees.filter(u => normalizeStatus(u.Status) === 'Official Travel').length} Travel
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 px-1.5 py-1 rounded border border-red-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          {unitEmployees.filter(u => normalizeStatus(u.Status) === 'On Leave').length} Leave
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TASK CARDS ── */}
              <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 pt-4 pb-0">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm max-w-full mb-4">
                  {/* Task Cards View - Consistent responsive grid (900px breakpoint) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start p-4 md:p-6 lg:p-8">
                    {myTasks.length === 0 ? (
                      <div className="col-span-full text-center py-16 text-slate-400">
                        <i className="bi bi-clipboard-x text-3xl block mb-2 opacity-30" />
                        No active assignments from Director.
                      </div>
                    ) : myTasks.map(t => (
                      <UnitHeadTaskCard
                        key={t.TaskID}
                        task={t}
                        session={session}
                        comments={globalData.comments}
                        loading={loadingTask === t.TaskID}
                        onStatusUpdate={handleStatusUpdate}
                        onOpenChat={() => setChat({ taskId: t.TaskID, taskTitle: t.Title })}
                        onOpenFile={(url, name) => setLightboxFile({ url, name })}
                        onEdit={() => setEditTask(t)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── UNIT MONITOR TAB ── */}
          {tab === 'monitor' && (
            <div className="flex flex-col h-full">
              {/* ── TOP BAR: Page title + Assign button ── */}
              <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white flex-shrink-0 gap-2 min-w-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  <h1 className="mb-0 text-lg sm:text-xl font-bold tracking-tight leading-snug text-slate-900">
                    {monitorFilter === 'director-assigned' ? 'Director Assigned Tasks' : 'My Assigned Tasks'}
                  </h1>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {monitorFilter === 'director-assigned' ? directorAssignedTasks.length : finalUnitHeadAssignedTasks.length}
                  </span>
                </div>
                {monitorFilter === 'my-assigned' && (
                  <button
                    onClick={() => { setDrawerOpen(true) }}
                    className="btn-primary-gradient flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-lg shadow-green-900/30 hover:shadow-green-900/40 hover:-translate-y-0.5 active:scale-95 transition-all duration-200 whitespace-nowrap group"
                  >
                    <i className="bi bi-plus-circle-fill text-base group-hover:rotate-90 transition-transform duration-300" />
                    <span>Assign Task</span>
                  </button>
                )}
              </div>

              {/* ── FILTER BAR ── */}
              <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-3 border-b border-slate-200 bg-white flex-shrink-0 flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[140px] max-w-sm">
                  <i className="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                  <input
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none"
                    placeholder="Search task title or personnel..."
                    value={filterSearch}
                    onChange={e => setFilterSearch(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select 
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-green-500/20"
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
                  <button onClick={() => { setFilterStatus('All'); setFilterSearch('') }}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all flex items-center gap-1.5">
                    <i className="bi bi-x-circle-fill" /> Reset
                  </button>
                )}
              </div>

              {/* ── PERSONNEL STATUS BAR ── */}
              {unitEmployees.length > 0 && (
                <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-2 border-b border-slate-200 bg-white flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                      {/* Minimal personnel counts - consistent across all sizes */}
                      <div className="flex items-center gap-1.5">
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-1 rounded border border-emerald-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {unitEmployees.filter(u => normalizeStatus(u.Status) === 'Available').length} Available
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-1 rounded border border-blue-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          {unitEmployees.filter(u => normalizeStatus(u.Status) === 'Official Travel').length} Travel
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 px-1.5 py-1 rounded border border-red-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          {unitEmployees.filter(u => normalizeStatus(u.Status) === 'On Leave').length} Leave
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TASK CARDS ── */}
              <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 pt-4 pb-0">
                <div className={`rounded-xl border overflow-hidden shadow-sm ${
                  monitorFilter === 'director-assigned' 
                    ? 'bg-purple-50/30 border-purple-200' 
                    : 'bg-green-50/30 border-green-200'
                }`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start p-4 md:p-6 lg:p-8">
                    {(() => {
                      const filteredTasks = monitorFilter === 'director-assigned' ? directorAssignedTasks : finalUnitHeadAssignedTasks
                      
                      if (filteredTasks.length === 0) {
                        return (
                          <div className="col-span-full text-center py-16 text-slate-400">
                            <i className={`bi ${filterSearch || filterStatus !== 'All' ? 'bi-search' : 'bi-clipboard-x'} text-3xl block mb-2 opacity-30`} />
                            <p className="text-sm">
                              {(filterSearch || filterStatus !== 'All') 
                                ? 'No matching tasks found for your search/filters.' 
                                : monitorFilter === 'director-assigned' ? 'No director-assigned tasks' : 'No tasks assigned by you yet'}
                            </p>
                          </div>
                        )
                      }

                      return filteredTasks.map(t => {
                        const emp = globalData.users.find(u => String(u.ID) === String(t.EmployeeID))
                        const unit = emp?.Unit || emp?.Office || '—'
                        const unreadChat = getUnreadCommentCount(globalData.comments || [], t.TaskID, session?.Name || '')
                        const isDirectorAssigned = directorAssignedTasks.includes(t)
                        
                        return (
                          <UnitHeadMonitorCard
                            key={t.TaskID}
                            task={t}
                            unit={unit}
                            employee={emp}
                            comments={globalData.comments}
                            session={session}
                            history={globalData.history}
                            unreadChat={unreadChat}
                            onChat={() => setChat({ taskId: t.TaskID, taskTitle: t.Title })}
                            onOpenFile={(url, name) => setLightboxFile({ url, name })}
                            isDirectorAssigned={isDirectorAssigned}
                            onEdit={() => setEditTask(t)}
                          />
                        )
                      })
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── CALENDAR TAB ── */}
          {tab === 'calendar' && (
            <PersonalCalendarTab 
              tasks={myCalendarTasks} 
              userId={session?.ID} 
              onViewTask={(taskId, titleText) => {
                setTab('my-tasks')
                setFilterSearch(titleText.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim())
              }} 
            />
          )}

          {/* ── PROFILE TAB ── */}
          {tab === 'profile' && (
            <UserProfileTab presence={presence} setPresence={setPresence} />
          )}

        </main>

        {/* FOOTER */}
      </div>{/* end flex-1 flex flex-col */}

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex z-30 shadow-lg mobile-nav-safe">
        {[
          { key: 'my-tasks', icon: 'bi-person-check-fill', label: 'My Tasks', badge: stats.myActive },
          { key: 'monitor',  icon: 'bi-speedometer2',       label: 'Monitor',  badge: stats.unitActive },
          { key: 'calendar', icon: 'bi-calendar3',          label: 'Calendar' },
          { key: 'profile',  icon: 'bi-person-circle',      label: 'Profile' },
        ].map(item => (
          <button key={item.key} onClick={() => setTab(item.key)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-semibold transition-colors relative ${tab === item.key ? 'text-green-800' : 'text-slate-400'}`}>
            <i className={`bi ${item.icon} text-xl`} />
            {item.label}
            {item.badge > 0 && (
              <span className="absolute top-2 right-1/4 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ── ASSIGN DRAWER ── */}
      {drawerOpen && !dispatchConfirm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 flex flex-col shadow-2xl"
            style={{ animation: 'slideRight 0.25s ease' }}>
            <style>{`@keyframes slideRight { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
            {/* Drawer header */}
            <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0 header-gradient">
              <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0">
                <i className="bi bi-send-fill text-white text-base" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-0 text-white font-semibold text-[15px] leading-tight tracking-tight">Assign task</p>
                <p className="mb-0 mt-0.5 text-green-100/80 text-[11px] font-medium leading-tight">To unit personnel</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <i className="bi bi-x-lg text-sm" />
              </button>
            </div>
            {/* Drawer body — scrollable */}
            <div className="flex-1 overflow-y-auto p-5">
              <CreateTaskForm
                users={unitEmployees.map(u => ({ ...u, Role: 'Employee' }))}
                onSync={async () => { await sync(); setDrawerOpen(false) }}
                dispatchConfirm={dispatchConfirm}
                setDispatchConfirm={setDispatchConfirm}
                pendingDispatch={pendingDispatch}
                setPendingDispatch={setPendingDispatch}
                onCloseDrawer={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        </>
      )}

      {chat         && <ChatModal taskId={chat.taskId} taskTitle={chat.taskTitle} onClose={() => setChat(null)} onSync={sync} />}
      {lightboxFile && <Lightbox file={lightboxFile} onClose={() => setLightboxFile(null)} />}
      {editTask     && <EditTaskModal task={editTask} onClose={() => setEditTask(null)} onSync={sync} />}

      {/* ── DISPATCH CONFIRM MODAL ── */}
      {dispatchConfirm && createPortal(
        <div className="fixed inset-0 bg-black/50 z-modal flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setDispatchConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden relative z-popover">
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
              <div className={`flex items-center gap-3 p-3 rounded-xl border mb-4 ${
                dispatchConfirm.Status?.startsWith('Official Travel') ? 'bg-blue-100 text-blue-800 border-blue-200' :
                dispatchConfirm.Status?.startsWith('On Leave') ? 'bg-red-100 text-red-800 border-red-200' :
                'bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  dispatchConfirm.Status?.startsWith('Official Travel') ? 'bg-blue-500' :
                  dispatchConfirm.Status?.startsWith('On Leave') ? 'bg-red-500' : 'bg-emerald-500'
                }`} />
                <div>
                  <p className="font-bold text-sm">{dispatchConfirm.Name}</p>
                  <p className="text-xs mt-0.5">Currently: <span className="font-semibold">
                    {dispatchConfirm.Status?.startsWith('Official Travel') ? 'Official Travel' :
                     dispatchConfirm.Status?.startsWith('On Leave') ? 'On Leave' : 'Available'}
                  </span></p>
                </div>
              </div>
              <p className="text-slate-600 text-sm mb-5 leading-relaxed">
                This personnel is currently <strong>
                  {dispatchConfirm.Status?.startsWith('Official Travel') ? 'Official Travel' :
                   dispatchConfirm.Status?.startsWith('On Leave') ? 'On Leave' : 'Unavailable'}
                </strong> and may not be able to act immediately. Dispatch anyway?
              </p>
              <div className="flex gap-3">
                <button onClick={() => { setDispatchConfirm(null); setPendingDispatch(null) }} className="btn-secondary flex-1 py-2.5 btn-enhanced focus-ring">Cancel</button>
                <button onClick={async () => {
                  if (pendingDispatch) {
                    try {
                      await createTask(pendingDispatch)
                      await sync()
                      setDispatchConfirm(null)
                      setPendingDispatch(null)
                      setDrawerOpen(false)
                    } catch (error) {
                      console.error('Dispatch failed:', error)
                      setDispatchConfirm(null)
                      setPendingDispatch(null)
                    }
                  }
                }} className="btn-primary flex-1 py-2.5 btn-enhanced focus-ring">
                  Dispatch Anyway
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* ── AUTO-UPDATE TOAST ALERT ── */}
      {autoUpdateAlert && (
        <div className="fixed top-4 right-4 z-toast max-w-sm w-full bg-green-900 text-white rounded-xl shadow-lg border border-green-800/60 p-4 animate-in-right flex items-start gap-3">
          <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/20 text-green-400">
            <i className="bi bi-patch-check-fill text-lg leading-none" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-xs leading-tight uppercase tracking-wider text-green-400">Status Activated</p>
            <p className="text-[11px] text-green-100 font-medium mt-1 leading-relaxed">
              Your availability status has been automatically updated to <span className="font-bold underline text-white">{autoUpdateAlert}</span> based on your advance personal calendar schedule.
            </p>
          </div>
          <button onClick={() => setAutoUpdateAlert(null)} className="text-white/40 hover:text-white transition-colors p-1 -mt-1 -mr-1">
            <i className="bi bi-x-lg text-xs" />
          </button>
        </div>
      )}
    </div>
  )
}


// ── StatusTimes — shows assigned/accepted/completed timestamps below the badge ──
function StatusTimes({ task: t }) {
  function fmtDT(iso) {
    if (!iso) return null
    const d = new Date(iso)
    const gmt8Date = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
    return {
      date: gmt8Date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: gmt8Date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
    }
  }
  const assigned  = fmtDT(t.CreatedAt)
  const received  = fmtDT(t.ReceivedAt)
  const completed = fmtDT(t.CompletedAt)

  return (
    <div className="mt-1.5 space-y-0.5">
      {assigned && (
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
          <span className="text-[10px] text-slate-400 leading-none">
            <span className="font-semibold text-amber-700">Dispatched</span>
            {' '}{assigned.date} <span className="text-slate-300">{assigned.time}</span>
          </span>
        </div>
      )}
      {received && (
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
          <span className="text-[10px] text-slate-400 leading-none">
            <span className="font-semibold text-blue-700">Accepted</span>
            {' '}{received.date} <span className="text-slate-300">{received.time}</span>
          </span>
        </div>
      )}
      {completed && (
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          <span className="text-[10px] text-slate-400 leading-none">
            <span className="font-semibold text-emerald-700">Completed</span>
            {' '}{completed.date} <span className="text-slate-300">{completed.time}</span>
          </span>
        </div>
      )}
    </div>
  )
}

// ── UnitHeadTaskCard ────────────────────────────────────────────────────────────────
function UnitHeadTaskCard({ task: t, session, comments, loading, onStatusUpdate, onOpenChat, onOpenFile, onEdit }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef()
  const unreadChat = getUnreadCommentCount(comments || [], t.TaskID, session?.Name || '')




  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow flex flex-col h-full overflow-hidden">

      {/* ── SECTION 1: Header with Status & Actions ── */}
      <div className="bg-slate-50/50 px-3 sm:px-4 py-3 border-b border-slate-100 group-hover:bg-green-50/30 transition-colors">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={getStatusBadgeClass(t.Status)}>{t.Status}</span>
            {t.Priority && <span className={getPriorityClass(t.Priority)}>{t.Priority}</span>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {unreadChat > 0 && (
              <button
                onClick={onOpenChat}
                className="flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-100 rounded-full text-red-600 hover:bg-red-100 transition-colors"
              >
                <i className="bi bi-chat-dots-fill text-[12px]" />
                <span className="text-[11px] font-bold">{unreadChat > 9 ? '9+' : unreadChat}</span>
              </button>
            )}
            <button ref={btnRef} onClick={() => setMenuOpen(!menuOpen)}
              className="btn-ghost p-1.5 text-slate-400 hover:text-slate-700 relative">
              <i className="bi bi-three-dots-vertical" />
            </button>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Task Details ── */}
      <div className="px-3 sm:px-4 py-3 sm:py-4 border-b border-slate-100 bg-white">
        <p className="mb-0 font-semibold text-slate-800 text-sm sm:text-base leading-snug">
          {t.Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || t.Title}
        </p>
        {/* Doc number + category on one meta line — the stacked badge + pill said the same thing in three rows. */}
        {(t.DocumentNo || /^\[\s*[^\]]+\s*\]/.test(t.Title) || t.Category) && (
          <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-slate-500">
            {(t.DocumentNo || /^\[\s*[^\]]+\s*\]/.test(t.Title)) && (
              <span className="font-semibold text-slate-600">
                #{t.DocumentNo || t.Title.match(/^\[\s*([^\]]+)\s*\]/)?.[1] || '—'}
              </span>
            )}
            {(t.DocumentNo || /^\[\s*[^\]]+\s*\]/.test(t.Title)) && t.Category && <span aria-hidden="true">·</span>}
            {t.Category && <span>{t.Category}</span>}
          </p>
        )}
      </div>

      {/* ── SECTION 3: File & Meta ── */}
      {t.FileLink && (
        <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-50/30 border-b border-slate-100 flex flex-wrap gap-2">
          {t.FileLink.split('|').filter(Boolean).map((url, idx) => {
            const name = decodeURIComponent(url.split('?')[0].split('/').pop())
            return (
              <button key={idx} onClick={() => onOpenFile(url, name)}
                className="text-[10px] sm:text-[11px] font-medium text-green-700 hover:text-green-800 flex items-center gap-1 sm:gap-1.5 py-1 bg-green-50 px-2 rounded border border-green-100 truncate max-w-[200px]">
                <i className="bi bi-paperclip flex-shrink-0" /> <span className="truncate">{name}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── SECTION 4: Deadline (priority already shown as a badge in the header) ── */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-t border-slate-100">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Deadline</span>
        {t.Deadline
          ? <span className="text-xs font-semibold text-red-500">{new Date(t.Deadline).toLocaleDateString()}</span>
          : <span className="text-xs text-slate-300">—</span>}
      </div>

      {/* ── SECTION 5: Timeline ── */}
      <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-50/30">
        <StatusTimes task={t} />
      </div>

      {/* ── SECTION 6: Progress ── */}
      {t.Deadline && t.Status !== 'Completed' && (
        <div className="px-3 sm:px-4 pb-2.5 sm:pb-3 pt-0.5 sm:pt-1">
          <DeadlineProgress task={t} />
        </div>
      )}

      {/* ── SECTION 7: Action Buttons ── */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2 bg-white border-t border-slate-100">
        {t.Status === 'Assigned' && (
          <button disabled={loading} onClick={() => onStatusUpdate(t.TaskID, 'Received')} className="btn-primary-gradient w-full py-2.5 rounded-lg font-semibold text-sm text-white border-0"
          >
            {loading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : <><i className="bi bi-check-lg" /> Accept Task</>}
          </button>
        )}
        {t.Status === 'Received' && (
          <button disabled={loading} onClick={() => onStatusUpdate(t.TaskID, 'Completed')} className="btn-primary-gradient w-full py-2.5 rounded-lg font-semibold text-sm text-white border-0"
          >
            {loading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : <><i className="bi bi-check2-all" /> Mark Complete</>}
          </button>
        )}
        {t.Status === 'Completed' && (
          <button disabled className="w-full py-2.5 rounded-lg font-semibold text-sm text-green-700 border border-green-100 bg-green-50">
            <i className="bi bi-check-circle-fill" /> Completed
          </button>
        )}
      </div>

      {/* Action Menu Dropdown */}
      <PortalDropdown anchorRef={btnRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
        <button onClick={() => { onEdit && onEdit(); setMenuOpen(false) }}
          className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-700">
          <i className="bi bi-pencil text-blue-600" /> Edit Task
        </button>
        <button onClick={() => { onOpenChat(); setMenuOpen(false) }}
          className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-700">
          <i className="bi bi-chat-dots text-green-700" /> Open Chat
          {unreadChat > 0 && (
            <span className="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadChat > 9 ? '9+' : unreadChat}
            </span>
          )}
        </button>
      </PortalDropdown>
    </div>
  )
}

// ── UnitHeadMonitorCard ────────────────────────────────────────────────────────────────
function UnitHeadMonitorCard({ task: t, unit, employee, comments, session, history, unreadChat, onChat, onOpenFile, isDirectorAssigned = false, onEdit }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef()

  // Get status initial and color based on employee status
  const normalizedStatus = normalizeStatus(employee?.Status)
  const statusConfig = STATUS_CFG[normalizedStatus] || STATUS_CFG['Available']
  const statusInitial = normalizedStatus === 'Available' ? 'A' : normalizedStatus === 'Official Travel' ? 'T' : 'L'

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow flex flex-col h-full overflow-hidden">
      {/* ── SECTION 1: Personnel & Actions Header ── */}
      <div className="bg-slate-50/50 px-3 sm:px-4 py-2.5 border-b border-slate-100 group-hover:bg-green-50/30 transition-colors">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          {/* Personnel Name */}
          <div className="min-w-0 flex-1 flex items-center gap-1.5 sm:gap-2">
            <div className="min-w-0 flex-1">
              <UserStatusPopover 
                name={t.EmployeeName} 
                status={employee?.Status} 
                popoverMaxW={280}
                chipClassName="font-bold text-green-900 text-[13px] sm:text-[15px] leading-tight truncate flex items-center gap-2 cursor-pointer hover:text-green-700 transition-colors"
              />
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5">{unit}</p>
            </div>
            <div className="relative group flex-shrink-0">
              <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold text-white/80 ${statusConfig.dot}`}>
                {statusInitial}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isDirectorAssigned && (
              <button ref={btnRef} onClick={() => setMenuOpen(!menuOpen)}
                className="btn-ghost p-1.5 text-slate-400 hover:text-slate-700 relative">
                <i className="bi bi-three-dots-vertical" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Task Details ── */}
      <div className="px-3 sm:px-4 py-4 border-b border-slate-100 bg-white">
        <p className="mb-0 font-semibold text-slate-800 text-sm sm:text-base leading-snug">
          {t.Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || t.Title}
        </p>
        {/* Doc number + category on one meta line — the stacked badge + pill said the same thing in three rows. */}
        {(t.DocumentNo || /^\[\s*[^\]]+\s*\]/.test(t.Title) || t.Category) && (
          <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-slate-500">
            {(t.DocumentNo || /^\[\s*[^\]]+\s*\]/.test(t.Title)) && (
              <span className="font-semibold text-slate-600">
                #{t.DocumentNo || t.Title.match(/^\[\s*([^\]]+)\s*\]/)?.[1] || '—'}
              </span>
            )}
            {(t.DocumentNo || /^\[\s*[^\]]+\s*\]/.test(t.Title)) && t.Category && <span aria-hidden="true">·</span>}
            {t.Category && <span>{t.Category}</span>}
          </p>
        )}
      </div>

      {/* ── SECTION 3: File & Meta ── */}
      {t.FileLink && (
        <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-50/30 border-b border-slate-100 flex flex-wrap gap-2">
          {t.FileLink.split('|').filter(Boolean).map((url, idx) => {
            const name = decodeURIComponent(url.split('?')[0].split('/').pop())
            return (
              <button key={idx} onClick={() => onOpenFile(url, name)}
                className="text-[10px] sm:text-[11px] font-medium text-green-700 hover:text-green-800 flex items-center gap-1 sm:gap-1.5 py-1 bg-green-50 px-2 rounded border border-green-100 truncate max-w-[200px]">
                <i className="bi bi-paperclip flex-shrink-0" /> <span className="truncate">{name}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── SECTION 4: Status Grid ── */}
      <div className="grid grid-cols-3 gap-0 divide-x divide-slate-100">
        <div className="px-2 sm:px-3 py-2 sm:py-3 text-center">
          <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">Status</p>
          <span className={getStatusBadgeClass(t.Status)}>{t.Status}</span>
        </div>
        <div className="px-2 sm:px-3 py-2 sm:py-3 text-center">
          <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">Priority</p>
          {t.Priority ? <span className={getPriorityClass(t.Priority)}>{t.Priority}</span> : <span className="text-[10px] sm:text-xs text-slate-300">—</span>}
        </div>
        <div className="px-2 sm:px-3 py-2 sm:py-3 text-center">
          <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">Deadline</p>
          {t.Deadline
            ? <p className="text-[10px] sm:text-xs text-red-500 font-semibold">{new Date(t.Deadline).toLocaleDateString()}</p>
            : <p className="text-[10px] sm:text-xs text-slate-300">—</p>}
        </div>
      </div>

      {/* ── SECTION 5: Timeline ── */}
      <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-50/30">
        <StatusTimes task={t} />
      </div>

      {/* ── SECTION 6: Progress ── */}
      {t.Deadline && t.Status !== 'Completed' && (
        <div className="px-3 sm:px-4 pb-2.5 sm:pb-3 pt-0.5 sm:pt-1">
          <DeadlineProgress task={t} />
        </div>
      )}

      {/* Action Menu Dropdown - Only for unit head assigned tasks */}
      {!isDirectorAssigned && (
        <PortalDropdown anchorRef={btnRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
          <button onClick={() => { onEdit && onEdit(); setMenuOpen(false) }}
            className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-700">
            <i className="bi bi-pencil text-blue-600" /> Edit Task
          </button>
          <button onClick={() => { onChat(); setMenuOpen(false) }}
            className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-700">
            <i className="bi bi-chat-dots text-green-700" /> Open Chat
            {unreadChat > 0 && (
              <span className="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadChat > 9 ? '9+' : unreadChat}
              </span>
            )}
          </button>
        </PortalDropdown>
      )}
    </div>
  )
}

// ── Portal Dropdown ────────────────────────────────────────────────────────────
function PortalDropdown({ anchorRef, open, onClose, children }) {
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open || !anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + window.scrollY + 4, left: rect.right + window.scrollX })
  }, [open, anchorRef])

  if (!open) return null
  return createPortal(
    <>
      <div className="fixed inset-0 z-modal-backdrop" onClick={onClose} />
      <div className="fixed z-modal bg-white border border-slate-200 rounded-xl shadow-2xl text-sm overflow-hidden"
        style={{ top: pos.top, right: Math.max(8, window.innerWidth - pos.left), minWidth: '160px', maxWidth: 'calc(100vw - 16px)' }}>
        {children}
      </div>
    </>,
    document.body
  )
}
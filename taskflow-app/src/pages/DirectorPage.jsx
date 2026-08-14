import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { useSync } from '../hooks/useSync'
import { toggleArchive, getStatusBadgeClass, getPriorityClass, getUnreadCommentCount, deleteTask, deleteTasks, restoreTasks, logHistory, createTask, getSignedFileUrl, stripStatusMarkers} from '../lib/api'
import PresenceToggle, { normalizeStatus } from '../components/PresenceToggle'
import NotificationBell from '../components/NotificationBell'
import UserProfileTab from '../components/UserProfileTab'
import AnnouncementsTab from '../components/AnnouncementsTab'
import CreateTaskForm from '../components/CreateTaskForm'
import EditTaskModal from '../components/EditTaskModal'
import ChatModal from '../components/ChatModal'
import Lightbox from '../components/Lightbox'
import UserManagement from '../components/UserManagement'
import TaskTimeline from '../components/TaskTimeline'
import UserStatusPopover from '../components/UserStatusPopover'
import DeadlineProgress from '../components/DeadlineProgress'
import PersonalCalendarTab, { checkAndApplyScheduledPresence } from '../components/PersonalCalendarTab'

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
  Available:        { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  'Official Travel': { dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50' },
  'On Leave':        { dot: 'bg-red-500',      text: 'text-red-700',     bg: 'bg-red-50' },
}

export default function DirectorPage() {
  const session    = useStore(s => s.session)
  const globalData = useStore(s => s.globalData)
  const { sync }   = useSync()

  const [tab,           setTab]           = useState('monitor')
  const [chat,          setChat]          = useState(null)
  const [editTask,      setEditTask]      = useState(null)
  const [lightboxFile,  setLightboxFile]  = useState(null)
  const [sidebarOpen,   setSidebarOpen]   = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('pf_sidebar_collapsed') === '1')
  const toggleSidebarCollapsed = () => setSidebarCollapsed(v => { localStorage.setItem('pf_sidebar_collapsed', v ? '0' : '1'); return !v })
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [selected,      setSelected]      = useState([])
  const [bulkLoading,   setBulkLoading]   = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [personnelModalOpen, setPersonnelModalOpen] = useState(false)
  const [selectedPersonnel, setSelectedPersonnel] = useState(null)
  const [travelOrderSignedUrl, setTravelOrderSignedUrl] = useState('')
  const [travelOrderLoading, setTravelOrderLoading] = useState(false)
  const [presence, setPresence] = useState(session?.Status || 'Available')
  const [dispatchConfirm, setDispatchConfirm] = useState(null)
  const [pendingDispatch, setPendingDispatch] = useState(null)
  const [autoUpdateAlert, setAutoUpdateAlert] = useState(null)

  // Sync presence state with session status (persists across refreshes)
  // "Read more" in the sign-in popup asks the active page to open its tab.
  useEffect(() => {
    const go = () => setTab('announcements')
    window.addEventListener('open-announcements', go)
    return () => window.removeEventListener('open-announcements', go)
  }, [])

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

    runSchedulerCheck()
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
      const alertTimer = setTimeout(() => setAutoUpdateAlert(null), 10000)
      return () => clearTimeout(alertTimer)
    }
    window.addEventListener('presence-auto-updated', handleAutoUpdate)
    return () => window.removeEventListener('presence-auto-updated', handleAutoUpdate)
  }, [])

  // Tasks assigned to the Director themselves — archived included, so past
  // deadlines still show on the calendar.
  const myCalendarTasks = globalData.tasks
    .filter(t => String(t.EmployeeID) === String(session?.ID))
    .slice().reverse()

  // Resolve travel order file path → signed URL when the personnel detail modal opens
  useEffect(() => {
    setTravelOrderSignedUrl('')
    if (!selectedPersonnel?.Status?.startsWith('Official Travel')) return
    const raw = selectedPersonnel.Status
    const match = raw.match(/\[TO:(.*?)\]/)
    const path = match ? match[1] : null
    if (!path) return
    setTravelOrderLoading(true)
    getSignedFileUrl(path)
      .then(url => setTravelOrderSignedUrl(url || ''))
      .catch(() => setTravelOrderSignedUrl(''))
      .finally(() => setTravelOrderLoading(false))
  }, [selectedPersonnel])

  // Filters for task table
  const [filterUnit,   setFilterUnit]   = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterSearch, setFilterSearch] = useState('')
  const [archiveSearch, setArchiveSearch] = useState('')

  const activeTasks   = globalData.tasks.filter(t => String(t.Archived).toUpperCase() !== 'TRUE').slice().reverse()
  const rawArchivedTasks = globalData.tasks.filter(t => String(t.Archived).toUpperCase() === 'TRUE').slice().reverse()
  const archivedTasks = rawArchivedTasks.filter(t => {
    if (!archiveSearch) return true
    const q = archiveSearch.toLowerCase()
    return t.Title?.toLowerCase().includes(q) || t.EmployeeName?.toLowerCase().includes(q)
  })
  const pendingUsers  = globalData.users.filter(u => u.AccountStatus === 'Pending' && u.Role !== 'Director').length
  const nonDirectors  = globalData.users.filter(u => u.Role !== 'Director' && u.AccountStatus === 'Active')
  const units         = [...new Set(nonDirectors.map(u => u.Unit || u.Office).filter(Boolean))]

  // Filtered task list
  const filteredTasks = activeTasks.filter(t => {
    const emp = globalData.users.find(u => String(u.ID) === String(t.EmployeeID))
    const unit = emp?.Unit || emp?.Office || ''
    if (filterUnit   !== 'All' && unit !== filterUnit)        return false
    if (filterStatus !== 'All' && t.Status !== filterStatus)  return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      if (!t.Title?.toLowerCase().includes(q) && !t.EmployeeName?.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Separate tasks by assignment source using history
  // Task classification keys off the "Dispatched" history row. That row stores
  // the actor's *display name* as it was at dispatch time, so renaming a user
  // used to orphan every task they had dispatched: it matched neither the
  // director bucket nor the unit-head one and rendered nowhere, while still
  // being counted in the totals. Match on the stable ActorID first and fall
  // back to the name only for legacy rows written before ActorID existed.
  const dispatchEntryFor = (t) =>
    globalData.history.find(h => String(h.TaskID) === String(t.TaskID) && h.Action === 'Dispatched')

  const actorUserFor = (entry) => {
    if (!entry) return null
    if (entry.ActorID) {
      const byId = globalData.users.find(u => String(u.ID) === String(entry.ActorID))
      if (byId) return byId
    }
    return globalData.users.find(u => u.Name === entry.Actor || String(u.ID) === String(entry.Actor)) || null
  }

  const directorDispatchedTasks = filteredTasks.filter(t => {
    const entry = dispatchEntryFor(t)
    if (!entry) return false
    if (entry.ActorID && String(entry.ActorID) === String(session?.ID)) return true
    const actorUser = actorUserFor(entry)
    if (actorUser) return actorUser.Role === 'Director'
    // Legacy row with no resolvable user — fall back to the recorded name.
    return entry.Actor === session?.Name ||
      (session?.Name && entry.Actor?.toLowerCase() === session?.Name?.toLowerCase())
  })

  const unitHeadDispatchedTasks = filteredTasks.filter(t => {
    const entry = dispatchEntryFor(t)
    if (!entry) return false
    if (entry.ActorID && String(entry.ActorID) === String(session?.ID)) return false
    const actorUser = actorUserFor(entry)
    if (actorUser) return actorUser.Role === 'Unit Head'
    return !!entry.Actor?.toLowerCase().includes('unit head')
  })

  // Catch-all: anything the two buckets above did not claim — including tasks
  // with no Dispatched row at all. Without this a task can be counted yet never
  // rendered, which is how completed tasks appeared to "vanish".
  const unassignedTasks = filteredTasks.filter(t =>
    !directorDispatchedTasks.includes(t) && !unitHeadDispatchedTasks.includes(t)
  )

  // Add unassigned tasks to director dispatched tasks as fallback
  const finalDirectorDispatchedTasks = [...directorDispatchedTasks, ...unassignedTasks]

  async function handleArchive(taskId, archived) {
    await toggleArchive(taskId, archived)
    await logHistory(taskId, archived ? 'Archived' : 'Restored', session?.Name || 'Director')
    await sync()
  }




  function toggleSelect(taskId) {
    setSelected(prev => prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId])
  }
  function toggleSelectAll(taskIds) {
    if (taskIds.every(id => selected.includes(id))) setSelected(prev => prev.filter(id => !taskIds.includes(id)))
    else setSelected(prev => [...new Set([...prev, ...taskIds])])
  }
  async function handleBulkRestore() {
    setBulkLoading('restore')
    await restoreTasks(selected)
    await Promise.all(selected.map(id => logHistory(id, 'Restored', session?.Name || 'Director')))
    setSelected([]); await sync(); setBulkLoading(null)
  }
  async function handleBulkDelete() {
    setBulkLoading('delete')
    await deleteTasks(selected)
    setSelected([]); setDeleteConfirm(false); await sync(); setBulkLoading(null)
  }

  const stats = {
    total:     activeTasks.length,
    assigned:  activeTasks.filter(t => t.Status === 'Assigned').length,
    received:  activeTasks.filter(t => t.Status === 'Received').length,
    completed: activeTasks.filter(t => t.Status === 'Completed').length,
  }

  // Personnel grouped by availability status
  const personnelGroups = {
    Available:         nonDirectors.filter(u => normalizeStatus(u.Status) === 'Available'),
    'Official Travel': nonDirectors.filter(u => normalizeStatus(u.Status) === 'Official Travel'),
    'On Leave':        nonDirectors.filter(u => normalizeStatus(u.Status) === 'On Leave'),
  }

  return (
    <div className="h-dvh flex overflow-hidden page-bg">

      {/* ── SIDEBAR ──────────────────────────────────────────── */}
      {/* ── SIDEBAR OVERLAY (mobile) ── */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar-responsive sidebar-gradient fixed md:relative inset-y-0 left-0 z-50 md:z-auto flex flex-col flex-shrink-0 h-full transition-all duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>

        {/* ── Branding + Notification row ── */}
        <div className="sb-head flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src="/philfida-logo.png" alt="PhilFIDA" className="w-6 h-6 object-contain"
                onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style="font-size:9px;font-weight:900;color:#016837;">PF</span>' }} />
            </div>
            <div className="sidebar-hide">
              <span className="text-white font-bold text-xs block leading-none">PhilFIDA Task Management System</span>
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
          {[
            { key: 'monitor', icon: 'bi-speedometer2',  label: 'Task Monitor' },
            { key: 'archive', icon: 'bi-archive',        label: 'Archive' },
            { key: 'calendar', icon: 'bi-calendar3',     label: 'Personal Calendar' },
            { key: 'users',   icon: 'bi-people-fill',    label: 'User Management', badge: pendingUsers },
            { key: 'announcements', icon: 'bi-megaphone', label: 'Announcements' },
            { key: 'profile', icon: 'bi-person-circle',  label: 'My Profile' },
          ].map(item => (
            <button key={item.key} onClick={() => { setTab(item.key); setSidebarOpen(false) }}
              className={`nav-item w-full text-left ${tab === item.key ? 'active' : ''}`}>
              <i className={`bi ${item.icon} text-base`} />
              <span className="flex-1 text-sm">{item.label}</span>
              {item.badge > 0 && (
                <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
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


      {/* ── MAIN ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0 sticky top-0 z-40 glass-effect">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 -ml-1 text-slate-600 hover:text-green-800 transition-colors">
            <i className="bi bi-list text-2xl" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-green-800 rounded-full flex items-center justify-center overflow-hidden">
              <img src="/philfida-logo.png" alt="" className="w-5 h-5 object-contain" onError={e => e.target.style.display='none'} />
            </div>
            <span className="text-green-900 font-bold text-sm">Task Management System</span>
          </div>
          <NotificationBell />
        </div>

        <main className="flex-1 overflow-y-auto flex flex-col md:pb-0 pb-16">

          {/* ── MONITOR TAB ── */}
          {tab === 'monitor' && (
            <div className="flex flex-col h-full">

              {/* ── TOP BAR: Page title + Dispatch button ── */}
              <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white flex-shrink-0 gap-2 min-w-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  <h1 className="mb-0 text-lg sm:text-xl font-bold tracking-tight leading-snug text-slate-900">
                    Task Monitor
                  </h1>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{filteredTasks.length} of {activeTasks.length}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => { setDrawerOpen(true); setPersonnelModalOpen(false); setSelectedPersonnel(null); }}
                    className="btn-primary-gradient flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-lg shadow-green-900/30 hover:shadow-green-900/40 hover:-translate-y-0.5 active:scale-95 transition-all duration-200 whitespace-nowrap group"
                  >
                    <i className="bi bi-plus-circle-fill text-base group-hover:rotate-90 transition-transform duration-300" />
                    <span>Dispatch Task</span>
                  </button>
                </div>
              </div>

              {/* ── PERSONNEL STATUS BAR ── */}
              <div className="px-4 md:px-8 py-2.5 border-b border-slate-200 bg-white flex-shrink-0 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-0.5">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
                    <span className="text-[11px] font-bold uppercase tracking-tight">{personnelGroups['Available'].length} Available</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100 shadow-sm whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shadow-sm shadow-blue-200" />
                    <span className="text-[11px] font-bold uppercase tracking-tight">{personnelGroups['Official Travel'].length} Travel</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 rounded-full border border-rose-100 shadow-sm whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-200" />
                    <span className="text-[11px] font-bold uppercase tracking-tight">{personnelGroups['On Leave'].length} Leave</span>
                  </div>
                </div>
                
                {nonDirectors.length > 0 && (
                  <button
                    onClick={() => setPersonnelModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all active:scale-95 shadow-sm"
                  >
                    <i className="bi bi-people-fill text-green-700" />
                    Personnel <span className="text-slate-400 font-medium">({nonDirectors.length})</span>
                  </button>
                )}
              </div>

              {/* ── FILTER BAR ── */}
              <div className="px-4 md:px-8 py-3 bg-slate-50/50 border-b border-slate-200 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm group">
                  <i className="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-green-600 transition-colors" />
                  <input
                    className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all shadow-sm"
                    placeholder="Search task or personnel..."
                    value={filterSearch}
                    onChange={e => setFilterSearch(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all shadow-sm cursor-pointer" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="All">All Status</option>
                    <option value="Assigned">Assigned</option>
                    <option value="Received">Received</option>
                    <option value="Completed">Completed</option>
                  </select>
                  <select className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all shadow-sm cursor-pointer" value={filterUnit} onChange={e => setFilterUnit(e.target.value)}>
                    <option value="All">All Units</option>
                    {units.map(u => <option key={u}>{u}</option>)}
                  </select>
                  {(filterUnit !== 'All' || filterStatus !== 'All' || filterSearch) && (
                    <button onClick={() => { setFilterUnit('All'); setFilterStatus('All'); setFilterSearch('') }}
                      className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Clear Filters">
                      <i className="bi bi-x-circle-fill text-lg" />
                    </button>
                  )}
                </div>
              </div>

              {/* ── TASK TABLE ── */}
              <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 pt-4 pb-0 space-y-4">
                {/* My Dispatched Tasks Section */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="px-4 py-3 border-b border-slate-100 bg-white">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-800 text-sm">My Dispatched Tasks</h3>
                      <span className="ml-auto text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{finalDirectorDispatchedTasks.length}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start p-4 md:p-6 lg:p-8">
                    {finalDirectorDispatchedTasks.length === 0 ? (
                      <div className="col-span-full text-center py-12 text-slate-400">
                        <i className={`bi ${filterSearch || filterStatus !== 'All' || filterUnit !== 'All' ? 'bi-search' : 'bi-person-badge'} text-2xl block mb-2 opacity-30`} />
                        <p className="text-sm">{(filterSearch || filterStatus !== 'All' || filterUnit !== 'All') ? 'No search results found.' : 'No tasks dispatched by you yet'}</p>
                      </div>
                    ) : finalDirectorDispatchedTasks.map((t, idx) => {
                      const emp = globalData.users.find(u => String(u.ID) === String(t.EmployeeID))
                      const unit = emp?.Unit || emp?.Office || '—'
                      const unreadChat = getUnreadCommentCount(globalData.comments || [], t.TaskID, session?.Name || '')
                      return (
                        <MobileTaskCard
                          key={t.TaskID}
                          task={t}
                          unit={unit}
                          idx={idx + 1}
                          comments={globalData.comments}
                          session={session}
                          unreadChat={unreadChat}
                          employee={emp}
                          onEdit={() => setEditTask(t)}
                          onChat={() => setChat({ taskId: t.TaskID, taskTitle: t.Title })}
                          onArchive={() => handleArchive(t.TaskID, true)}
                          onOpenFile={(url, name) => setLightboxFile({ url, name })}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Unit Head Assigned Tasks Section */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="px-4 py-3 border-b border-slate-100 bg-white">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-800 text-sm">Unit Head Assigned Tasks</h3>
                      <span className="ml-auto text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{unitHeadDispatchedTasks.length}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start p-4 md:p-6 lg:p-8">
                    {unitHeadDispatchedTasks.length === 0 ? (
                      <div className="col-span-full text-center py-12 text-slate-400">
                        <i className={`bi ${filterSearch || filterStatus !== 'All' || filterUnit !== 'All' ? 'bi-search' : 'bi-person-check'} text-2xl block mb-2 opacity-30`} />
                        <p className="text-sm">{(filterSearch || filterStatus !== 'All' || filterUnit !== 'All') ? 'No search results found.' : 'No tasks assigned by unit heads'}</p>
                      </div>
                    ) : unitHeadDispatchedTasks.map((t, idx) => {
                      const emp = globalData.users.find(u => String(u.ID) === String(t.EmployeeID))
                      const unit = emp?.Unit || emp?.Office || '—'
                      const unreadChat = getUnreadCommentCount(globalData.comments || [], t.TaskID, session?.Name || '')
                      return (
                        <MobileTaskCard
                          key={t.TaskID}
                          task={t}
                          unit={unit}
                          idx={idx + 1}
                          comments={globalData.comments}
                          session={session}
                          unreadChat={unreadChat}
                          employee={emp}
                          onEdit={() => setEditTask(t)}
                          onChat={() => setChat({ taskId: t.TaskID, taskTitle: t.Title })}
                          onArchive={() => handleArchive(t.TaskID, true)}
                          onOpenFile={(url, name) => setLightboxFile({ url, name })}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Empty state when no tasks at all */}
                {activeTasks.length === 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="text-center py-16 text-slate-400">
                      <i className="bi bi-clipboard-x text-3xl block mb-2 opacity-30" />
                      <p className="text-sm">No active tasks yet</p>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ── ARCHIVE TAB ── */}
          {tab === 'archive' && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex flex-col gap-3 px-4 md:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white flex-shrink-0 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <h1 className="mb-0 text-lg sm:text-xl font-bold tracking-tight leading-snug text-slate-900">
                      Archive Repository
                    </h1>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{archivedTasks.length}</span>
                  </div>
                  
                  {/* Archive Search */}
                  <div className="relative w-full sm:max-w-[240px] search-container">
                    <i className="bi bi-search absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] sm:text-xs search-icon" />
                    <input
                      className="input pl-8 sm:pl-10 pr-2.5 sm:pr-3 py-1.5 sm:py-2 text-[10px] sm:text-xs search-input w-full"
                      placeholder="Search archive..."
                      value={archiveSearch}
                      onChange={e => setArchiveSearch(e.target.value)}
                    />
                    {archiveSearch && (
                      <button 
                        onClick={() => setArchiveSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      >
                        <i className="bi bi-x-circle-fill text-[10px] sm:text-xs" />
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Select All Row */}
                {archivedTasks.length > 0 && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={archivedTasks.length > 0 && archivedTasks.every(t => selected.includes(t.TaskID))}
                        onChange={() => toggleSelectAll(archivedTasks.map(t => t.TaskID))}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="text-xs font-medium text-slate-600 group-hover:text-slate-800 transition-colors">
                        Select All ({archivedTasks.length})
                      </span>
                    </label>
                  </div>
                )}
              </div>
              {selected.length > 0 && (
                <div className="px-4 md:px-6 lg:px-8 py-2 border-b border-slate-200 bg-white flex-shrink-0">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleBulkRestore}
                        disabled={!!bulkLoading}
                        className="btn-primary-gradient flex-1 text-xs px-3 py-2 rounded-lg font-semibold text-white border-0"
                      >
                        {bulkLoading === 'restore' ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : <><i className="bi bi-arrow-up-circle" /> Restore</>}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(true)}
                        disabled={!!bulkLoading}
                        className="btn-danger-gradient flex-1 text-xs px-3 py-2 rounded-lg font-semibold text-white border-0"
                      >
                        <i className="bi bi-trash3" /> Delete
                      </button>
                      <button
                        onClick={() => setSelected([])}
                        className="text-xs px-3 py-2 rounded-lg font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 border-0 bg-transparent"
                      >
                        <i className="bi bi-x-lg" />
                      </button>
                    </div>
                    <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50/80 px-3 py-1 rounded-full border border-green-200/60 mx-auto w-fit">
                      <i className="bi bi-check-square-fill text-green-600" />
                      {selected.length} task{selected.length > 1 ? 's' : ''} selected
                    </div>
                  </div>
                </div>
              )}

              {/* Task Cards */}
              <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 pt-4 pb-0">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm max-w-full mb-4">
                  {/* Archive Cards View - Consistent responsive grid (900px breakpoint) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start p-4 md:p-6 lg:p-8">
                    {archivedTasks.length === 0 ? (
                      <div className="col-span-full text-center py-16 text-slate-400">
                        <i className={`bi ${archiveSearch ? 'bi-search' : 'bi-archive'} text-3xl block mb-2 opacity-30`} />
                        {archiveSearch ? 'No archived tasks match your search.' : 'No archived tasks yet.'}
                      </div>
                    ) : archivedTasks.map(t => {
                      const emp = globalData.users.find(u => String(u.ID) === String(t.EmployeeID))
                      const unit = emp?.Unit || emp?.Office || '---'
                      const unreadChat = getUnreadCommentCount(globalData.comments || [], t.TaskID, session?.Name || '')
                      return (
                        <MobileArchiveCard
                          key={t.TaskID}
                          task={t}
                          unit={unit}
                          selected={selected.includes(t.TaskID)}
                          onSelect={() => toggleSelect(t.TaskID)}
                          comments={globalData.comments}
                          session={session}
                          history={globalData.history.filter(h => String(h.TaskID) === String(t.TaskID))}
                          unreadChat={unreadChat}
                          employee={emp}
                          onEdit={() => setEditTask(t)}
                          onChat={() => setChat({ taskId: t.TaskID, taskTitle: t.Title })}
                          onArchive={() => handleArchive(t.TaskID, false)}
                          onDelete={async () => { await deleteTask(t.TaskID); await sync() }}
                          onOpenFile={(url, name) => setLightboxFile({ url, name })}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── USERS TAB ── */}
          {/* ── CALENDAR TAB ── */}
          {tab === 'calendar' && (
            <PersonalCalendarTab
              tasks={myCalendarTasks}
              userId={session?.ID}
              /* Directors dispatch tasks rather than receive them, so the
                 assigned-deadlines list is always empty for this role. */
              showTaskDeadlines={false}
              onViewTask={(taskId, titleText) => {
                setTab('monitor')
                setFilterSearch(titleText.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim())
              }}
            />
          )}

          {tab === 'users' && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white flex-shrink-0">
                <div className="min-w-0">
                  <h1 className="mb-0 text-lg sm:text-xl font-bold tracking-tight leading-snug text-slate-900">User Management</h1>
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 pt-4 pb-0">
                <div className="mb-4">
                  <UserManagement users={globalData.users} onSync={sync} />
                </div>
              </div>
            </div>
          )}

          {/* ── PROFILE TAB ── */}
          {tab === 'announcements' && <AnnouncementsTab />}

          {tab === 'profile' && (
            <UserProfileTab presence={presence} setPresence={setPresence} />
          )}

        </main>

        {/* FOOTER */}
      </div>{/* end flex-1 flex flex-col */}

      {/* ── DISPATCH DRAWER (slide-in from right) ── */}
      {drawerOpen && !dispatchConfirm && (
        <>
          <div id="drawer-backdrop" className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div id="drawer-content" className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 flex flex-col shadow-2xl"
            style={{ animation: 'slideRight 0.25s ease' }}>
            <style>{`@keyframes slideRight { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
            {/* Drawer header */}
            <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0 header-gradient">
              <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0">
                <i className="bi bi-send-fill text-white text-base" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-0 text-white font-semibold text-[15px] leading-tight tracking-tight">Dispatch new task</p>
                <p className="mb-0 mt-0.5 text-green-100/80 text-[11px] font-medium leading-tight">Assign to unit personnel</p>
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
                users={globalData.users}
                onSync={async () => { await sync() }}
                dispatchConfirm={dispatchConfirm}
                setDispatchConfirm={setDispatchConfirm}
                pendingDispatch={pendingDispatch}
                setPendingDispatch={setPendingDispatch}
                setPersonnelModalOpen={setPersonnelModalOpen}
                setSelectedPersonnel={setSelectedPersonnel}
                onCloseDrawer={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        </>
      )}

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex z-30 shadow-lg mobile-nav-safe">
        {[
          { key: 'monitor', icon: 'bi-speedometer2', label: 'Monitor' },
          { key: 'archive', icon: 'bi-archive',       label: 'Archive' },
          { key: 'calendar', icon: 'bi-calendar3',    label: 'Calendar' },
          { key: 'users',   icon: 'bi-people-fill',   label: 'Users', badge: pendingUsers },
          { key: 'announcements', icon: 'bi-megaphone', label: 'News' },
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

      {/* ── MODALS ── */}
      {chat        && <ChatModal      taskId={chat.taskId} taskTitle={chat.taskTitle} onClose={() => setChat(null)} onSync={sync} />}
      {editTask    && <EditTaskModal  task={editTask}      onClose={() => setEditTask(null)} onSync={sync} />}
      {lightboxFile && <Lightbox      file={lightboxFile}  onClose={() => setLightboxFile(null)} />}
      
      {/* Global Print Preview Modal */}
      {/* ── PERSONNEL MODAL ── */}
      {personnelModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setPersonnelModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#0a2e0a,#155414)' }}>
              <div className="flex items-start gap-4">
                <i className="bi bi-people-fill text-white text-base" />
                <div>
                  <p className="text-white font-bold text-sm leading-none mb-0">Personnel Status</p>
                  <p className="text-green-300 text-[10px] leading-none mt-0.5">{nonDirectors.length} active personnel</p>
                </div>
              </div>
              <button onClick={() => setPersonnelModalOpen(false)} className="text-green-300 hover:text-white text-2xl leading-none">&times;</button>
            </div>
            
            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Available */}
              {personnelGroups['Available'].length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Available ({personnelGroups['Available'].length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {personnelGroups['Available'].map(u => (
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
              {personnelGroups['Official Travel'].length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Official Travel ({personnelGroups['Official Travel'].length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {personnelGroups['Official Travel'].map(u => {
                      const detail = u.Status.split(' — ')?.[1] || ''
                      return (
                        <button
                          key={u.ID}
                          onClick={() => setSelectedPersonnel(u)}
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
              {personnelGroups['On Leave'].length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    On Leave ({personnelGroups['On Leave'].length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {personnelGroups['On Leave'].map(u => {
                      const detail = u.Status.split(' — ')?.[1] || ''
                      return (
                        <button
                          key={u.ID}
                          onClick={() => setSelectedPersonnel(u)}
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
              <button onClick={() => setPersonnelModalOpen(false)} className="btn-secondary w-full py-2">
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── PERSONNEL DETAIL MODAL ── */}
      {selectedPersonnel && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setSelectedPersonnel(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className={`flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0 ${
              selectedPersonnel.Status?.startsWith('Official Travel') ? 'bg-blue-600' :
              selectedPersonnel.Status?.startsWith('On Leave') ? 'bg-red-600' : 'bg-emerald-600'
            }`}>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">{selectedPersonnel.Name?.charAt(0) || '?'}</span>
                </div>
                <div>
                  <p className="text-white font-bold text-sm leading-none mb-0">{selectedPersonnel.Name}</p>
                  <p className="text-white/80 text-[10px] leading-none mt-0.5">{selectedPersonnel.Unit || selectedPersonnel.Office || '—'}</p>
                </div>
              </div>
              <button onClick={() => setSelectedPersonnel(null)} className="text-white/80 hover:text-white text-2xl leading-none">&times;</button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              {/* Status Badge */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Current Status</p>
                <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                  selectedPersonnel.Status?.startsWith('Official Travel') ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                  selectedPersonnel.Status?.startsWith('On Leave') ? 'bg-red-50 text-red-700 border border-red-200' :
                  'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    selectedPersonnel.Status?.startsWith('Official Travel') ? 'bg-blue-500' :
                    selectedPersonnel.Status?.startsWith('On Leave') ? 'bg-red-500' : 'bg-emerald-500'
                  }`} />
                  {selectedPersonnel.Status?.split(' — ')?.[0] || selectedPersonnel.Status || 'Available'}
                </div>

                {/* ── Official Travel: parsed detail fields ── */}
                {selectedPersonnel.Status?.startsWith('Official Travel') && (() => {
                  const raw = selectedPersonnel.Status
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
                {selectedPersonnel.Status?.startsWith('On Leave') && selectedPersonnel.Status?.includes(' — ') && (
                  <p className="mt-2 text-sm text-slate-600 italic">
                    {selectedPersonnel.Status.split(' — ')[1]}
                  </p>
                )}
              </div>

              {/* Role */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Role</p>
                <p className="text-sm text-slate-700 font-medium">{selectedPersonnel.Role || 'Employee'}</p>
              </div>

              {/* Employee ID */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Employee ID</p>
                <p className="text-sm text-slate-700 font-mono">{selectedPersonnel.ID}</p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50">
              <button onClick={() => setSelectedPersonnel(null)} className="btn-secondary w-full py-2.5">
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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

      {deleteConfirm && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-red-600 px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <i className="bi bi-trash3-fill text-white text-lg" />
              </div>
              <div>
                <p className="text-white font-bold text-sm">Permanent Deletion</p>
                <p className="text-red-200 text-xs mt-0.5">This cannot be undone</p>
              </div>
            </div>
            <div className="p-5">
              <p className="text-slate-700 text-sm mb-2 leading-relaxed">
                Permanently delete <strong>{selected.length} task{selected.length > 1 ? 's' : ''}</strong> and all associated comments and notifications?
              </p>
              <p className="text-red-600 text-xs font-semibold mb-5">⚠ This action cannot be reversed.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(false)} className="btn-secondary flex-1 py-2.5">Cancel</button>
                <button 
                  onClick={handleBulkDelete} 
                  disabled={bulkLoading === 'delete'} 
                  className="flex-1 py-2.5 rounded-lg font-semibold text-white border-0 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {bulkLoading === 'delete'
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    : <><i className="bi bi-trash3-fill" /> Delete</>}
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

// ── MobileTaskCard ────────────────────────────────────────────────────────────────
function MobileTaskCard({ task: t, unit, idx, comments, session, unreadChat, employee, onEdit, onChat, onArchive, onOpenFile }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef()

  // Get status initial and color based on employee status
  const normalizedStatus = normalizeStatus(employee?.Status)
  const statusConfig = STATUS_CFG[normalizedStatus] || STATUS_CFG['Available']
  const statusInitial = normalizedStatus === 'Available' ? 'A' : normalizedStatus === 'Official Travel' ? 'T' : 'L'

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-full overflow-hidden transition-shadow hover:shadow-md">
      {/* ── SECTION 1: Personnel & Actions Header ── */}
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 border-l-[3px] border-l-green-600">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          {/* Personnel Name - Emphasized with green bg for active tasks */}
          <div className="min-w-0 flex-1 flex items-center gap-1.5 sm:gap-2">
            <div className="min-w-0 flex-1">
              <span className="font-bold text-green-900 text-[13px] sm:text-[15px] leading-tight truncate block">{t.EmployeeName}</span>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5">{unit}</p>
            </div>
            <div className="relative group flex-shrink-0">
              <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold text-white/80 ${statusConfig.dot}`}>
                {statusInitial}
              </span>
              <div className="absolute right-0 top-full mt-2 px-2.5 py-1.5 bg-slate-800 text-white text-[10px] sm:text-[11px] font-medium rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-20 min-w-max">
                {normalizedStatus}
                <div className="absolute right-2 -top-1.5 border-4 border-transparent border-b-slate-800"></div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Comments indicator */}
            {unreadChat > 0 && (
              <button
                onClick={onChat}
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

      {/* Action Menu Dropdown */}
      <PortalDropdown anchorRef={btnRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
        <button onClick={() => { onEdit(); setMenuOpen(false) }}
          className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-700">
          <i className="bi bi-pencil text-green-700" /> Edit Task
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
        <button onClick={() => { onArchive(); setMenuOpen(false) }}
          className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-500">
          <i className="bi bi-archive text-slate-400" /> Archive
        </button>
      </PortalDropdown>
    </div>
  )
}

// ── MobileArchiveCard ────────────────────────────────────────────────────────────────
function MobileArchiveCard({ task: t, unit, selected, onSelect, comments, session, history, unreadChat, employee, onEdit, onChat, onArchive, onDelete, onOpenFile }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef()

  // Get status initial and color based on employee status
  const normalizedStatus = normalizeStatus(employee?.Status)
  const statusConfig = STATUS_CFG[normalizedStatus] || STATUS_CFG['Available']
  const statusInitial = normalizedStatus === 'Available' ? 'A' : normalizedStatus === 'Official Travel' ? 'T' : 'L'

  return (
    <div className={`bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-full overflow-hidden hover:shadow-md transition-shadow ${selected ? 'bg-red-50/60 border-red-200' : ''}`}>
      {/* ── SECTION 1: Checkbox, Personnel & Actions ── */}
      <div className={`px-3 sm:px-4 py-2 sm:py-3 border-b border-red-100 ${selected ? 'bg-red-50/50' : 'bg-red-50/70'}`}>
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <input
              type="checkbox"
              checked={!!selected}
              onChange={onSelect}
              className="w-4 h-4 rounded border-slate-300 accent-green-700 cursor-pointer flex-shrink-0"
            />
            {/* Personnel Name - Emphasized with red bg for archived */}
            <div className="min-w-0 flex-1 flex items-center gap-1.5 sm:gap-2">
              <div className="min-w-0 flex-1">
                <span className="font-bold text-red-900 text-[13px] sm:text-[15px] leading-tight truncate block">{t.EmployeeName}</span>
                <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5">{unit}</p>
              </div>
              <div className="relative group flex-shrink-0">
                <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold text-white/80 ${statusConfig.dot}`}>
                  {statusInitial}
                </span>
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-slate-800 text-white text-[10px] font-medium rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                  {normalizedStatus}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-0.5 border-4 border-transparent border-r-slate-800"></div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Comments indicator */}
            {unreadChat > 0 && (
              <button
                onClick={onChat}
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
          <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">Completed</p>
          {t.CompletedDate
            ? <p className="text-[10px] sm:text-xs text-emerald-600 font-semibold">{new Date(t.CompletedDate).toLocaleDateString()}</p>
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

      {/* Action Menu Dropdown */}
      <PortalDropdown anchorRef={btnRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
        <button onClick={() => { onEdit(); setMenuOpen(false) }}
          className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-700">
          <i className="bi bi-pencil text-green-700" /> Edit Task
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
        <div className="border-t border-slate-100" />
        <button onClick={() => { onArchive(); setMenuOpen(false) }}
          className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-500">
          <i className="bi bi-arrow-up-circle text-slate-400" /> Restore
        </button>
        <div className="border-t border-slate-100" />
        <button onClick={() => { onDelete(); setMenuOpen(false) }}
          className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-red-50 text-left text-red-600">
          <i className="bi bi-trash3 text-red-500" /> Delete Permanently
        </button>
      </PortalDropdown>
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

// ── TaskRow ────────────────────────────────────────────────────────────────────
function TaskRow({ task: t, unit, idx, isArchived, comments, session, history = [], selected, onSelect, onEdit, onChat, onArchive, onDelete, onOpenFile }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef()
  const unreadChat = getUnreadCommentCount(comments || [], t.TaskID, session?.Name || '')

  return (
    <>
      <tr className={`${selected ? (isArchived ? 'bg-red-50/60' : 'bg-green-50') : ''} group`}>
      {/* Checkbox (archive only) */}
      {onSelect !== undefined ? (
        <td className="px-4 py-3">
          <input type="checkbox" checked={!!selected} onChange={onSelect}
            className="w-4 h-4 rounded border-slate-300 accent-green-700 cursor-pointer" />
        </td>
      ) : null}

      {/* Personnel + task */}
      <td className="py-3 px-4">
        <div className="space-y-2">
          {/* Personnel Name - Emphasized with green badge (active) or red badge (archived) */}
          <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 border ${isArchived ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
            <i className={`bi bi-person-fill text-xs ${isArchived ? 'text-red-600' : 'text-green-700'}`} />
            <span className={`font-bold text-sm leading-none ${isArchived ? 'text-red-900' : 'text-green-900'}`}>{t.EmployeeName}</span>
          </span>
          <p className="mb-0 font-semibold text-slate-800 text-sm truncate max-w-[220px]">
            {t.Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || t.Title}
          </p>
          {/* Doc number, category and files share one meta row instead of three stacked ones. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-medium text-slate-500">
            {(t.DocumentNo || /^\[\s*[^\]]+\s*\]/.test(t.Title)) && (
              <span className="font-semibold text-slate-600">
                #{t.DocumentNo || t.Title.match(/^\[\s*([^\]]+)\s*\]/)?.[1] || '—'}
              </span>
            )}
            {t.Category && (
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                {t.Category}
              </span>
            )}
            {t.FileLink && (
              <div className="flex flex-wrap gap-1">
                {t.FileLink.split('|').filter(Boolean).map((url, idx) => {
                  const name = decodeURIComponent(url.split('?')[0].split('/').pop())
                  return (
                    <button key={idx} onClick={() => onOpenFile(url, name)}
                      className="text-[10px] font-medium text-slate-400 hover:text-green-700 flex items-center gap-1 transition-colors max-w-[150px] truncate">
                      <i className="bi bi-paperclip flex-shrink-0" /> <span className="truncate">{name}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Unit — only active table */}
      {unit !== undefined && (
        <td className="px-4">
          <p className="text-xs text-slate-500 max-w-[140px] truncate leading-snug">{unit}</p>
        </td>
      )}

      {/* Status + timestamps */}
      <td className="px-4">
        <span className={getStatusBadgeClass(t.Status)}>{t.Status}</span>
        <StatusTimes task={t} />
      </td>

      {/* Priority */}
      <td className="px-4">
        {t.Priority && <span className={getPriorityClass(t.Priority)}>{t.Priority}</span>}
      </td>

      {/* Deadline — active table only */}
      {unit !== undefined && (
        <td className="px-4">
          {t.Deadline
            ? <p className="text-xs text-red-500 font-semibold whitespace-nowrap">{new Date(t.Deadline).toLocaleDateString()}</p>
            : <p className="text-xs text-slate-300">—</p>}
        </td>
      )}

      {/* Actions */}
      <td className="px-4 text-right">
        <div className="flex items-center justify-end gap-1">
          {/* Comments button - standalone */}
          {unreadChat > 0 && (
            <button
              onClick={onChat}
              className="flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-100 rounded-full text-red-600 hover:bg-red-100 transition-colors"
            >
              <i className="bi bi-chat-dots-fill text-[11px]" />
              <span className="text-[10px] font-bold">{unreadChat > 9 ? '9+' : unreadChat}</span>
            </button>
          )}
          <button ref={btnRef} onClick={() => setMenuOpen(!menuOpen)}
            className="btn-ghost px-2 py-1 text-slate-400 hover:text-slate-700 relative opacity-60 group-hover:opacity-100 transition-opacity">
            <i className="bi bi-three-dots-vertical" />
          </button>
        </div>
        <PortalDropdown anchorRef={btnRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
          <button onClick={() => { onEdit(); setMenuOpen(false) }}
            className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-700">
            <i className="bi bi-pencil text-green-700" /> Edit Task
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
          <div className="border-t border-slate-100" />
          <button onClick={() => { onArchive(); setMenuOpen(false) }}
            className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-500">
            <i className={`bi ${isArchived ? 'bi-arrow-up-circle' : 'bi-archive'} text-slate-400`} />
            {isArchived ? 'Restore' : 'Archive'}
          </button>
          {isArchived && onDelete && (
            <>
              <div className="border-t border-slate-100" />
              <button onClick={() => { onDelete(); setMenuOpen(false) }}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-red-50 text-left text-red-600">
                <i className="bi bi-trash3 text-red-500" /> Delete Permanently
              </button>
            </>
          )}
        </PortalDropdown>
      </td>
    </tr>
      {/* Progress bar row */}
      {!isArchived && t.Deadline && t.Status !== 'Completed' && (
        <tr>
          <td colSpan={onSelect !== undefined ? "7" : "6"} className="px-4 py-2">
            <DeadlineProgress task={t} />
          </td>
        </tr>
      )}
    </>
  )
}

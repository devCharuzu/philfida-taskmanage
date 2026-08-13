import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { useSync } from '../hooks/useSync'
import { toggleArchive, getStatusBadgeClass, getPriorityClass, getUnreadCommentCount, deleteTask, deleteTasks, restoreTasks, logHistory, createTask, getSignedFileUrl } from '../lib/api'
import PresenceToggle, { normalizeStatus } from '../components/PresenceToggle'
import NotificationBell from '../components/NotificationBell'
import UserProfileTab from '../components/UserProfileTab'
import CreateTaskForm from '../components/CreateTaskForm'
import EditTaskModal from '../components/EditTaskModal'
import ChatModal from '../components/ChatModal'
import Lightbox from '../components/Lightbox'
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

export default function RecordsPage() {
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

  // Sync presence state with session status (persists across refreshes)
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

  const finalDirectorDispatchedTasks = [...directorDispatchedTasks, ...unassignedTasks]

  async function handleArchive(taskId, archived) {
    await toggleArchive(taskId, archived)
    await logHistory(taskId, archived ? 'Archived' : 'Restored', session?.Name || 'Records')
    await sync()
  }

  function toggleSelect(taskId) {
    setSelected(prev => prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId])
  }
  
  async function handleBulkRestore() {
    setBulkLoading('restore')
    await restoreTasks(selected)
    await Promise.all(selected.map(id => logHistory(id, 'Restored', session?.Name || 'Records')))
    setSelected([]); await sync(); setBulkLoading(null)
  }
  async function handleBulkDelete() {
    setBulkLoading('delete')
    await deleteTasks(selected)
    setSelected([]); setDeleteConfirm(false); await sync(); setBulkLoading(null)
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
            { key: 'archive', icon: 'bi-archive',       label: 'Archive' },
            { key: 'calendar', icon: 'bi-calendar3',    label: 'Personal Calendar' },
            { key: 'profile', icon: 'bi-person-circle',  label: 'My Profile' },
          ].map(item => (
            <button key={item.key} onClick={() => { setTab(item.key); setSidebarOpen(false) }}
              className={`nav-item w-full text-left ${tab === item.key ? 'active' : ''}`}>
              <i className={`bi ${item.icon} text-base`} />
              <span className="flex-1 text-sm">{item.label}</span>
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
                {/* Official Dispatched Tasks Section */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="px-4 py-3 border-b border-slate-100 bg-white">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-800 text-sm">Official Dispatched Tasks</h3>
                      <span className="ml-auto text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{finalDirectorDispatchedTasks.length}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start p-4 md:p-6 lg:p-8">
                    {finalDirectorDispatchedTasks.length === 0 ? (
                      <div className="col-span-full text-center py-12 text-slate-400">
                        <i className={`bi ${filterSearch || filterStatus !== 'All' || filterUnit !== 'All' ? 'bi-search' : 'bi-person-badge'} text-2xl block mb-2 opacity-30`} />
                        <p className="text-sm">{(filterSearch || filterStatus !== 'All' || filterUnit !== 'All') ? 'No search results found.' : 'No tasks dispatched yet'}</p>
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
                  <div className="relative w-full sm:max-w-[240px]">
                    <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                    <input
                      className="input pl-10 pr-3 py-2 text-xs w-full"
                      placeholder="Search archive..."
                      value={archiveSearch}
                      onChange={e => setArchiveSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              
              {selected.length > 0 && (
                <div className="px-4 md:px-6 lg:px-8 py-2 border-b border-slate-200 bg-white flex-shrink-0">
                   <div className="flex items-center gap-2">
                      <button onClick={handleBulkRestore} disabled={!!bulkLoading} className="flex-1 text-xs px-3 py-2 rounded-lg font-semibold text-white bg-green-600 hover:bg-green-700">
                        {bulkLoading === 'restore' ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : 'Restore Selected'}
                      </button>
                      <button onClick={() => setDeleteConfirm(true)} disabled={!!bulkLoading} className="flex-1 text-xs px-3 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700">
                        Delete Selected
                      </button>
                   </div>
                </div>
              )}

              {/* Task Cards */}
              <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-8">
                  {archivedTasks.length === 0 ? (
                    <div className="col-span-full text-center py-16 text-slate-400">
                      <i className="bi bi-archive text-3xl block mb-2 opacity-30" />
                      No archived tasks yet.
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
          )}

          {/* ── CALENDAR TAB ── */}
          {tab === 'calendar' && (
            <PersonalCalendarTab 
              tasks={myCalendarTasks} 
              userId={session?.ID} 
              onViewTask={(taskId, titleText) => {
                setTab('monitor')
                setFilterSearch(titleText.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim())
              }} 
            />
          )}

          {/* ── PROFILE TAB ── */}
          {tab === 'profile' && (
            <UserProfileTab presence={presence} setPresence={setPresence} />
          )}

        </main>

      </div>

      {/* ── DISPATCH DRAWER ── */}
      {drawerOpen && !dispatchConfirm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 flex flex-col shadow-2xl">
            <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0 bg-green-800">
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
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex z-30 shadow-lg">
        {[
          { key: 'monitor',  icon: 'bi-speedometer2', label: 'Monitor' },
          { key: 'archive',  icon: 'bi-archive',      label: 'Archive' },
          { key: 'calendar', icon: 'bi-calendar3',    label: 'Calendar' },
          { key: 'profile',  icon: 'bi-person-circle', label: 'Profile' },
        ].map(item => (
          <button key={item.key} onClick={() => setTab(item.key)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-semibold ${tab === item.key ? 'text-green-800' : 'text-slate-400'}`}>
            <i className={`bi ${item.icon} text-xl`} />
            {item.label}
          </button>
        ))}
      </nav>

      {/* ── MODALS ── */}
      {chat        && <ChatModal      taskId={chat.taskId} taskTitle={chat.taskTitle} onClose={() => setChat(null)} onSync={sync} />}
      {editTask    && <EditTaskModal  task={editTask}      onClose={() => setEditTask(null)} onSync={sync} />}
      {lightboxFile && <Lightbox      file={lightboxFile}  onClose={() => setLightboxFile(null)} />}
      
      {/* ── PERSONNEL MODAL ── */}
      {personnelModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPersonnelModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 bg-green-900 text-white flex items-center justify-between">
              <span className="font-bold">Personnel Status</span>
              <button onClick={() => setPersonnelModalOpen(false)} className="text-2xl">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
               {['Available', 'Official Travel', 'On Leave'].map(status => (
                 <div key={status} className="mb-6">
                   <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{status} ({personnelGroups[status].length})</h4>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                     {personnelGroups[status].map(u => (
                       <div key={u.ID} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                         <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center text-white font-bold text-xs">
                           {u.Name?.charAt(0)}
                         </div>
                         <div className="min-w-0 flex-1">
                           <p className="font-semibold text-slate-800 text-sm truncate">{u.Name}</p>
                           <p className="text-[10px] text-slate-500">{u.Unit || u.Office}</p>
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteConfirm && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center">
            <i className="bi bi-trash3 text-red-500 text-4xl mb-4" />
            <h3 className="text-lg font-bold mb-2">Confirm Delete</h3>
            <p className="text-slate-600 text-sm mb-6">Permanently delete {selected.length} selected tasks?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)} className="flex-1 btn-secondary py-2">Cancel</button>
              <button onClick={handleBulkDelete} className="flex-1 bg-red-600 text-white rounded-lg font-bold py-2">Delete</button>
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

  const normalizedStatus = normalizeStatus(employee?.Status)
  const statusConfig = STATUS_CFG[normalizedStatus] || STATUS_CFG['Available']
  const statusInitial = normalizedStatus === 'Available' ? 'A' : normalizedStatus === 'Official Travel' ? 'T' : 'L'

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-full overflow-hidden hover:shadow-md transition-shadow">
      <div className="px-4 py-3 border-b border-slate-100 border-l-[3px] border-l-green-600">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <span className="font-bold text-green-900 text-sm sm:text-base leading-tight truncate block">{t.EmployeeName}</span>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5">{unit}</p>
            </div>
            <div className="relative group flex-shrink-0">
              <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold text-white/80 ${statusConfig.dot}`}>
                {statusInitial}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {unreadChat > 0 && (
              <button onClick={onChat} className="flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-100 rounded-full text-red-600 hover:bg-red-100 transition-colors">
                <i className="bi bi-chat-dots-fill text-[12px]" />
                <span className="text-[11px] font-bold">{unreadChat > 9 ? '9+' : unreadChat}</span>
              </button>
            )}
            <button ref={btnRef} onClick={() => setMenuOpen(!menuOpen)} className="p-1.5 text-slate-400 hover:text-slate-700 relative">
              <i className="bi bi-three-dots-vertical" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 border-b border-slate-100 bg-white">
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

      {t.FileLink && (
        <div className="px-4 py-2 bg-slate-50/30 border-b border-slate-100 flex flex-wrap gap-2">
          {t.FileLink.split('|').filter(Boolean).map((url, idx) => {
            const name = decodeURIComponent(url.split('?')[0].split('/').pop())
            return (
              <button key={idx} onClick={() => onOpenFile(url, name)}
                className="text-[10px] sm:text-[11px] font-medium text-green-700 hover:text-green-800 flex items-center gap-1.5 py-1 bg-green-50 px-2 rounded border border-green-100 truncate max-w-[200px]">
                <i className="bi bi-paperclip flex-shrink-0" /> <span className="truncate">{name}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-3 gap-0 divide-x divide-slate-100">
        <div className="px-3 py-3 text-center">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</p>
          <span className={getStatusBadgeClass(t.Status)}>{t.Status}</span>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Priority</p>
          {t.Priority ? <span className={getPriorityClass(t.Priority)}>{t.Priority}</span> : <span className="text-xs text-slate-300">—</span>}
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Deadline</p>
          {t.Deadline
            ? <p className="text-xs text-red-500 font-semibold">{new Date(t.Deadline).toLocaleDateString()}</p>
            : <p className="text-xs text-slate-300">—</p>}
        </div>
      </div>

      <div className="px-4 py-2 bg-slate-50/30">
        <StatusTimes task={t} />
      </div>

      {t.Deadline && t.Status !== 'Completed' && (
        <div className="px-4 pb-3 pt-1">
          <DeadlineProgress task={t} />
        </div>
      )}

      <PortalDropdown anchorRef={btnRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
        <button onClick={() => { onEdit(); setMenuOpen(false) }} className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-700">
          <i className="bi bi-pencil text-green-700" /> Edit Task
        </button>
        <button onClick={() => { onChat(); setMenuOpen(false) }} className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-700">
          <i className="bi bi-chat-dots text-green-700" /> Open Chat
        </button>
        <button onClick={() => { onArchive(); setMenuOpen(false) }} className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-500">
          <i className="bi bi-archive text-slate-400" /> Archive
        </button>
      </PortalDropdown>
    </div>
  )
}

// ── MobileArchiveCard ────────────────────────────────────────────────────────────────
function MobileArchiveCard({ task: t, unit, selected, onSelect, comments, session, unreadChat, employee, onEdit, onChat, onArchive, onDelete, onOpenFile }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef()

  const normalizedStatus = normalizeStatus(employee?.Status)
  const statusConfig = STATUS_CFG[normalizedStatus] || STATUS_CFG['Available']
  const statusInitial = normalizedStatus === 'Available' ? 'A' : normalizedStatus === 'Official Travel' ? 'T' : 'L'

  return (
    <div className={`bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-full overflow-hidden hover:shadow-md transition-shadow ${selected ? 'bg-red-50/60 border-red-200' : ''}`}>
      <div className={`px-4 py-3 border-b border-red-100 ${selected ? 'bg-red-50/50' : 'bg-red-50/70'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <input type="checkbox" checked={!!selected} onChange={onSelect} className="w-4 h-4 rounded border-slate-300 accent-green-700 cursor-pointer flex-shrink-0" />
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <span className="font-bold text-red-900 text-sm sm:text-base leading-tight truncate block">{t.EmployeeName}</span>
                <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5">{unit}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button ref={btnRef} onClick={() => setMenuOpen(!menuOpen)} className="p-1.5 text-slate-400 hover:text-slate-700 relative">
              <i className="bi bi-three-dots-vertical" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 border-b border-slate-100 bg-white">
        <p className="font-semibold text-slate-800 text-sm sm:text-base leading-snug">
          {t.Title}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-0 divide-x divide-slate-100">
        <div className="px-3 py-3 text-center">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</p>
          <span className={getStatusBadgeClass(t.Status)}>{t.Status}</span>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Priority</p>
          {t.Priority ? <span className={getPriorityClass(t.Priority)}>{t.Priority}</span> : <span className="text-xs text-slate-300">—</span>}
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Completed</p>
          {t.CompletedAt
            ? <p className="text-xs text-emerald-600 font-semibold">{new Date(t.CompletedAt).toLocaleDateString()}</p>
            : <p className="text-xs text-slate-300">—</p>}
        </div>
      </div>

      <PortalDropdown anchorRef={btnRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
        <button onClick={() => { onArchive(); setMenuOpen(false) }} className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-700">
          <i className="bi bi-arrow-up-circle text-green-700" /> Restore
        </button>
        <button onClick={() => { onDelete(); setMenuOpen(false) }} className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-red-50 text-left text-red-600">
          <i className="bi bi-trash3 text-red-500" /> Delete Permanently
        </button>
      </PortalDropdown>
    </div>
  )
}

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

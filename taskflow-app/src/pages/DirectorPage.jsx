import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { useSync } from '../hooks/useSync'
import { toggleArchive, getStatusBadgeClass, getPriorityClass, getUnreadCommentCount, deleteTask, deleteTasks, restoreTasks, logHistory, createTask } from '../lib/api'
import { normalizeStatus } from '../components/PresenceToggle'
import NotificationBell from '../components/NotificationBell'
import SettingsModal from '../components/SettingsModal'
import DirectorProfileModal from '../components/DirectorProfileModal'
import CreateTaskForm from '../components/CreateTaskForm'
import EditTaskModal from '../components/EditTaskModal'
import ChatModal from '../components/ChatModal'
import Lightbox from '../components/Lightbox'
import UserManagement from '../components/UserManagement'
import TaskTimeline from '../components/TaskTimeline'
import UserStatusPopover from '../components/UserStatusPopover'
import DeadlineProgress from '../components/DeadlineProgress'

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
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [selected,      setSelected]      = useState([])
  const [bulkLoading,   setBulkLoading]   = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [profileOpen,   setProfileOpen]   = useState(false)
  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [personnelModalOpen, setPersonnelModalOpen] = useState(false)
  const [selectedPersonnel, setSelectedPersonnel] = useState(null)
  const [dispatchConfirm, setDispatchConfirm] = useState(null)
  const [pendingDispatch, setPendingDispatch] = useState(null)
  const profileRef = useRef()

  // Close profile dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Filters for task table
  const [filterUnit,   setFilterUnit]   = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterSearch, setFilterSearch] = useState('')

  const activeTasks   = globalData.tasks.filter(t => String(t.Archived).toUpperCase() !== 'TRUE').slice().reverse()
  const archivedTasks = globalData.tasks.filter(t => String(t.Archived).toUpperCase() === 'TRUE').slice().reverse()
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
  const directorDispatchedTasks = activeTasks.filter(t => {
    const taskHistory = globalData.history.filter(h => String(h.TaskID) === String(t.TaskID))
    const dispatchedEntry = taskHistory.find(h => h.Action === 'Dispatched')
    if (!dispatchedEntry) return false

    // Check if actor matches current user (director)
    const isCurrentDirector = dispatchedEntry.Actor === session?.Name ||
      dispatchedEntry.Actor === session?.ID ||
      (session?.Name && dispatchedEntry.Actor?.toLowerCase() === session?.Name?.toLowerCase())

    // Also check if the actor is a user with Director role
    const actorUser = globalData.users.find(u => u.Name === dispatchedEntry.Actor || u.ID === dispatchedEntry.Actor)
    const actorHasDirectorRole = actorUser?.Role === 'Director'

    return isCurrentDirector || actorHasDirectorRole
  })

  const unitHeadDispatchedTasks = activeTasks.filter(t => {
    const taskHistory = globalData.history.filter(h => String(h.TaskID) === String(t.TaskID))
    const dispatchedEntry = taskHistory.find(h => h.Action === 'Dispatched')
    if (!dispatchedEntry) return false

    // Check if actor is Unit Head or contains 'Unit Head'
    const actorIsUnitHead = dispatchedEntry.Actor?.toLowerCase().includes('unit head')

    // Also check if the actor is a user with Unit Head role
    const actorUser = globalData.users.find(u => u.Name === dispatchedEntry.Actor || u.ID === dispatchedEntry.Actor)
    const actorHasUnitHeadRole = actorUser?.Role === 'Unit Head' || actorUser?.Role === 'UnitHead'

    // Exclude if it's the current director
    const isCurrentDirector = dispatchedEntry.Actor === session?.Name ||
      dispatchedEntry.Actor === session?.ID ||
      (session?.Name && dispatchedEntry.Actor?.toLowerCase() === session?.Name?.toLowerCase())

    return (actorIsUnitHead || actorHasUnitHeadRole) && !isCurrentDirector
  })

  // Fallback for tasks without Dispatched history - classify as director dispatched by default
  const unassignedTasks = activeTasks.filter(t => {
    const taskHistory = globalData.history.filter(h => String(h.TaskID) === String(t.TaskID))
    const dispatchedEntry = taskHistory.find(h => h.Action === 'Dispatched')
    return !dispatchedEntry
  })

  // Add unassigned tasks to director dispatched tasks as fallback
  const finalDirectorDispatchedTasks = [...directorDispatchedTasks, ...unassignedTasks]

  function logout() { useStore.getState().clearSession(); window.location.href = '/' }

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
    <div className="h-dvh flex overflow-hidden" style={{ background: '#f0f4f0' }}>

      {/* ── SIDEBAR ──────────────────────────────────────────── */}
      {/* ── SIDEBAR OVERLAY (mobile) ── */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar-responsive fixed md:relative inset-y-0 left-0 z-50 md:z-auto flex flex-col flex-shrink-0 h-full transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`} style={{ background: '#016837' }}>

        {/* ── Branding + Notification row ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src="/philfida-logo.png" alt="PhilFIDA" className="w-6 h-6 object-contain"
                onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style="font-size:9px;font-weight:900;color:#016837;">PF</span>' }} />
            </div>
            <span className="text-white font-bold text-xs truncate">PhilFIDA TaskFlow</span>
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
            { key: 'users',   icon: 'bi-people-fill',    label: 'User Management', badge: pendingUsers },
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

        {/* ── Profile (clickable) ── */}
        <div className="relative flex-shrink-0 border-t border-white/10" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(o => !o)}
            className="w-full flex items-center gap-1.5 rounded-lg px-2 sm:px-3 py-1.5 transition-all group"
            style={{ background: profileOpen ? 'rgba(255,255,255,0.12)' : 'transparent' }}
          >
            <i className="bi bi-person-badge-fill text-sm flex-shrink-0" style={{ color: '#f9921f' }} />
            <div className="flex flex-col min-w-0 flex-1 text-left justify-center">
              <span className="font-semibold text-white text-sm sm:text-base leading-none truncate">{session?.Name}</span>
              <span className="text-white/40 text-[9px] sm:text-[10px] leading-none">Director — PhilFIDA</span>
            </div>
            <i className={`bi bi-chevron-${profileOpen ? 'down' : 'up'} text-white/50 text-[9px] sm:text-[10px] flex-shrink-0 transition-transform`} />
          </button>

          {/* Profile dropdown (appears above) */}
          {profileOpen && (
            <div className="absolute left-0 right-0 bottom-full bg-white/95 backdrop-blur-sm border border-white/20 shadow-lg z-50 overflow-hidden mx-2 rounded-lg mb-2">
              <button
                onClick={() => { setProfileOpen(false); setProfileEditOpen(true) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100/50 transition-colors text-left"
              >
                <i className="bi bi-person-gear text-base text-slate-500" /> Edit Profile
              </button>
              <button
                onClick={() => { setProfileOpen(false); setSettingsOpen(true) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100/50 transition-colors text-left"
              >
                <i className="bi bi-sliders text-base text-slate-500" /> Settings
              </button>
              <button
                onClick={logout}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50/50 transition-colors text-left"
              >
                <i className="bi bi-box-arrow-right text-base text-red-500" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </aside>


      {/* ── MAIN ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 -ml-1 text-slate-600 hover:text-green-800 transition-colors">
            <i className="bi bi-list text-2xl" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-green-800 rounded-full flex items-center justify-center overflow-hidden">
              <img src="/philfida-logo.png" alt="" className="w-5 h-5 object-contain" onError={e => e.target.style.display='none'} />
            </div>
            <span className="text-green-900 font-bold text-sm">TaskFlow</span>
          </div>
          <NotificationBell />
        </div>

        <main className="flex-1 overflow-y-auto flex flex-col md:pb-0 pb-16">

          {/* ── MONITOR TAB ── */}
          {tab === 'monitor' && (
            <div className="flex flex-col h-full">

              {/* ── TOP BAR: Page title + Dispatch button ── */}
              <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 py-3 border-b border-slate-200 bg-white flex-shrink-0 gap-2 min-w-0">
                <div className="min-w-0">
                  <h2 className="font-bold text-green-900 text-base sm:text-lg leading-none">Task Monitor</h2>
                  <p className="text-slate-400 text-xs mt-1">{filteredTasks.length} of {activeTasks.length} tasks shown</p>
                </div>
                <button
                  onClick={() => { setDrawerOpen(true); setPersonnelModalOpen(false); setSelectedPersonnel(null); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap"
                  style={{
                    background: 'linear-gradient(135deg, #016837 0%, #027a42 50%, #016837 100%)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    boxShadow: '0 4px 12px rgba(16, 71, 17, 0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #027a42 0%, #038c4d 50%, #027a42 100%)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 71, 17, 0.35), inset 0 1px 0 rgba(255,255,255,0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #016837 0%, #027a42 50%, #016837 100%)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 71, 17, 0.25), inset 0 1px 0 rgba(255,255,255,0.2)';
                  }}
                >
                  <i className="bi bi-plus-lg text-base" />
                  <span>Dispatch Task</span>
                </button>
              </div>

              {/* ── PERSONNEL STATUS BAR ── */}
              <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-2 border-b border-slate-200 bg-white flex-shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                    {/* Minimal personnel counts - consistent across all sizes */}
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-1 rounded border border-emerald-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {personnelGroups['Available'].length} Available
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-1 rounded border border-blue-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        {personnelGroups['Official Travel'].length} Travel
                      </span>
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 px-1.5 py-1 rounded border border-red-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        {personnelGroups['On Leave'].length} Leave
                      </span>
                      {nonDirectors.length === 0 && (
                        <span className="text-[10px] text-slate-400">No personnel</span>
                      )}
                    </div>
                  </div>
                  {/* View All button - minimal */}
                  {nonDirectors.length > 0 && (
                    <button
                      onClick={() => setPersonnelModalOpen(true)}
                      className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors flex-shrink-0"
                    >
                      <i className="bi bi-people-fill text-green-700 text-xs" />
                      View
                      <span className="text-[10px] text-slate-400">({nonDirectors.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* ── FILTER BAR ── */}
              <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-2 sm:py-3 border-b border-slate-200 bg-white flex-shrink-0 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[100px] sm:min-w-[120px] max-w-xs search-container">
                  <i className="bi bi-search absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] sm:text-xs search-icon" />
                  <input
                    className="input pl-8 sm:pl-10 pr-2.5 sm:pr-3 py-1 sm:py-1.5 text-[10px] sm:text-xs search-input"
                    placeholder="Search..."
                    value={filterSearch}
                    onChange={e => setFilterSearch(e.target.value)}
                  />
                </div>
                <select className="input py-1 sm:py-1.5 text-[10px] sm:text-xs flex-1 min-w-[70px] sm:min-w-[90px] max-w-[110px] sm:max-w-[130px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="All">All</option>
                  <option value="Assigned">Assigned</option>
                  <option value="Received">Received</option>
                  <option value="Completed">Completed</option>
                </select>
                <select className="input py-1 sm:py-1.5 text-[10px] sm:text-xs flex-1 min-w-[80px] sm:min-w-[90px] max-w-[120px] sm:max-w-[160px]" value={filterUnit} onChange={e => setFilterUnit(e.target.value)}>
                  <option value="All">Units</option>
                  {units.map(u => <option key={u}>{u}</option>)}
                </select>
                {(filterUnit !== 'All' || filterStatus !== 'All' || filterSearch) && (
                  <button onClick={() => { setFilterUnit('All'); setFilterStatus('All'); setFilterSearch('') }}
                    className="btn-ghost text-[10px] sm:text-xs px-1.5 sm:px-2 py-1 sm:py-1.5 text-slate-400 flex-shrink-0">
                    <i className="bi bi-x-circle" /><span className="hidden sm:inline ms-1">Clear</span>
                  </button>
                )}
              </div>

              {/* ── TASK TABLE ── */}
              <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 pt-4 pb-0 space-y-4">
                {/* My Dispatched Tasks Section */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="bg-gradient-to-r from-green-50 to-green-100 px-4 py-2 border-b border-green-200">
                    <div className="flex items-center gap-2">
                      <i className="bi bi-person-badge-fill text-green-700" />
                      <h3 className="font-semibold text-green-900 text-sm">My Dispatched Tasks</h3>
                      <span className="ml-auto text-xs font-bold text-green-700 bg-green-200 px-2 py-0.5 rounded-full">{finalDirectorDispatchedTasks.length}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 min-[900px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 items-start p-4 md:p-6 lg:p-8">
                    {finalDirectorDispatchedTasks.length === 0 ? (
                      <div className="col-span-full text-center py-12 text-slate-400">
                        <i className="bi bi-person-badge text-2xl block mb-2 opacity-30" />
                        <p className="text-sm">No tasks dispatched by you yet</p>
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
                  <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-4 py-2 border-b border-purple-200">
                    <div className="flex items-center gap-2">
                      <i className="bi bi-person-check-fill text-purple-700" />
                      <h3 className="font-semibold text-purple-900 text-sm">Unit Head Assigned Tasks</h3>
                      <span className="ml-auto text-xs font-bold text-purple-700 bg-purple-200 px-2 py-0.5 rounded-full">{unitHeadDispatchedTasks.length}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 min-[900px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 items-start p-4 md:p-6 lg:p-8">
                    {unitHeadDispatchedTasks.length === 0 ? (
                      <div className="col-span-full text-center py-12 text-slate-400">
                        <i className="bi bi-person-check text-2xl block mb-2 opacity-30" />
                        <p className="text-sm">No tasks assigned by unit heads</p>
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
              <div className="flex flex-col gap-3 px-4 md:px-6 lg:px-8 py-3 border-b border-slate-200 bg-white flex-shrink-0 min-w-0">
                <div className="min-w-0">
                  <h2 className="font-bold text-green-900 text-base sm:text-lg leading-none">Archive Repository</h2>
                  <p className="text-slate-400 text-xs mt-1">{archivedTasks.length} archived tasks</p>
                </div>
                {selected.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleBulkRestore}
                        disabled={!!bulkLoading}
                        className="flex-1 text-xs px-3 py-2 rounded-lg font-semibold text-white border-0"
                        style={{
                          background: 'linear-gradient(135deg, #16a34a, #15803d)',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, #15803d, #166534)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, #16a34a, #15803d)'}
                      >
                        {bulkLoading === 'restore' ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : <><i className="bi bi-arrow-up-circle" /> Restore</>}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(true)}
                        disabled={!!bulkLoading}
                        className="flex-1 text-xs px-3 py-2 rounded-lg font-semibold text-white border-0"
                        style={{
                          background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, #b91c1c, #991b1b)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)'}
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
                )}
              </div>

              {/* Task Cards */}
              <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 pt-4 pb-0">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm max-w-full mb-4">
                  {/* Archive Cards View - Consistent responsive grid (900px breakpoint) */}
                  <div className="grid grid-cols-1 min-[900px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 items-start p-4 md:p-6 lg:p-8">
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
          {tab === 'users' && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 py-3 border-b border-slate-200 bg-white flex-shrink-0">
                <div className="min-w-0">
                  <h2 className="font-bold text-green-900 text-base sm:text-lg leading-none">User Management</h2>
                  <p className="text-slate-400 text-xs mt-1">Approve registrations, manage roles and access</p>
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

        </main>

        {/* FOOTER */}
        <footer className="bg-white border-t border-slate-100/80 py-1.5 sm:py-2 px-3 sm:px-4 md:px-6 lg:px-8 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] sm:text-[10px] text-slate-400 truncate">© 2025 PhilFIDA</p>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <span className="text-[9px] sm:text-[10px] text-slate-400 hidden sm:inline">Director Dashboard</span>
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gradient-to-r from-[#016837] to-[#027a42]"></span>
            </div>
          </div>
        </footer>
      </div>{/* end flex-1 flex flex-col */}

      {/* ── DISPATCH DRAWER (slide-in from right) ── */}
      {drawerOpen && !dispatchConfirm && (
        <>
          <div id="drawer-backdrop" className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div id="drawer-content" className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 flex flex-col shadow-2xl"
            style={{ animation: 'slideRight 0.25s ease' }}>
            <style>{`@keyframes slideRight { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#016837,#027a42)' }}>
              <div>
                <p className="text-white font-bold text-sm">Dispatch New Task</p>
                <p className="text-green-300 text-xs mt-0.5">Assign to unit personnel</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-green-300 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors">
                &times;
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
          { key: 'users',   icon: 'bi-people-fill',   label: 'Users', badge: pendingUsers },
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
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} session={session} />}
      {profileEditOpen && <DirectorProfileModal onClose={() => setProfileEditOpen(false)} />}

      {/* ── PERSONNEL MODAL ── */}
      {personnelModalOpen && (
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
        </div>
      )}

      {/* ── PERSONNEL DETAIL MODAL ── */}
      {selectedPersonnel && (
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
              {/* Status */}
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
                {(selectedPersonnel.Status?.includes(' — ')) && (
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
        </div>
      )}

      {/* ── DISPATCH CONFIRM MODAL ── */}
      {dispatchConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[99999] flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setDispatchConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden relative z-[100000]">
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
        </div>
      )}

      {deleteConfirm && (
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
                <button onClick={handleBulkDelete} disabled={bulkLoading === 'delete'} className="btn-danger flex-1 py-2.5">
                  {bulkLoading === 'delete'
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    : <><i className="bi bi-trash3-fill" /> Delete</>}
                </button>
              </div>
            </div>
          </div>
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
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-full overflow-hidden">
      {/* ── SECTION 1: Personnel & Actions Header ── */}
      <div className="bg-green-50/70 px-3 sm:px-4 py-2 sm:py-3 border-b border-green-100">
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
        {/* Document Number Badge - Modern Stacked Layout */}
        {(t.DocumentNo || /^\[\s*[^\]]+\s*\]/.test(t.Title)) && (
          <div className="mb-1.5 sm:mb-2">
            <span className="inline-flex items-center gap-1 sm:gap-1.5 bg-gradient-to-r from-[#016837] to-[#027a42] text-white rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 shadow-sm">
              <i className="bi bi-file-earmark-text text-white/90 text-[10px] sm:text-xs" />
              <span className="text-[10px] sm:text-xs font-bold tracking-wide">
                {t.DocumentNo || t.Title.match(/^\[\s*([^\]]+)\s*\]/)?.[1] || '—'}
              </span>
            </span>
          </div>
        )}
        {/* Clean Title - Document Number Extracted */}
        <p className="font-semibold text-slate-800 text-sm sm:text-base leading-snug">
          {t.Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || t.Title}
        </p>
        {/* Category badge */}
        {t.Category && (
          <span className="text-[10px] sm:text-[11px] font-medium bg-slate-100 text-slate-600 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded mt-1.5 sm:mt-2 inline-block">
            {t.Category}
          </span>
        )}
      </div>

      {/* ── SECTION 3: File & Meta ── */}
      {t.FileLink && (
        <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-50/30 border-b border-slate-100">
          <button onClick={() => { const url = t.FileLink.split('|')[0]; const name = decodeURIComponent(url.split('?')[0].split('/').pop()); onOpenFile(url, name) }}
            className="text-[10px] sm:text-[11px] font-medium text-green-700 hover:text-green-800 flex items-center gap-1 sm:gap-1.5 py-1">
            <i className="bi bi-paperclip" /> Attachment
          </button>
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
    <div className={`bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-full overflow-hidden ${selected ? 'bg-red-50/60 border-red-200' : ''}`}>
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
        {/* Document Number Badge - Modern Stacked Layout */}
        {(t.DocumentNo || /^\[\s*[^\]]+\s*\]/.test(t.Title)) && (
          <div className="mb-1.5 sm:mb-2">
            <span className="inline-flex items-center gap-1 sm:gap-1.5 bg-gradient-to-r from-[#016837] to-[#027a42] text-white rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 shadow-sm">
              <i className="bi bi-file-earmark-text text-white/90 text-[10px] sm:text-xs" />
              <span className="text-[10px] sm:text-xs font-bold tracking-wide">
                {t.DocumentNo || t.Title.match(/^\[\s*([^\]]+)\s*\]/)?.[1] || '—'}
              </span>
            </span>
          </div>
        )}
        {/* Clean Title - Document Number Extracted */}
        <p className="font-semibold text-slate-800 text-sm sm:text-base leading-snug">
          {t.Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || t.Title}
        </p>
        {/* Category badge */}
        {t.Category && (
          <span className="text-[10px] sm:text-[11px] font-medium bg-slate-100 text-slate-600 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded mt-1.5 sm:mt-2 inline-block">
            {t.Category}
          </span>
        )}
      </div>

      {/* ── SECTION 3: File & Meta ── */}
      {t.FileLink && (
        <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-50/30 border-b border-slate-100">
          <button onClick={() => { const url = t.FileLink.split('|')[0]; const name = decodeURIComponent(url.split('?')[0].split('/').pop()); onOpenFile(url, name) }}
            className="text-[10px] sm:text-[11px] font-medium text-green-700 hover:text-green-800 flex items-center gap-1 sm:gap-1.5 py-1">
            <i className="bi bi-paperclip" /> Attachment
          </button>
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
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div className="fixed z-[9999] bg-white border border-slate-200 rounded-xl shadow-2xl text-sm overflow-hidden"
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
          {/* Document Number Badge */}
          {(t.DocumentNo || /^\[\s*[^\]]+\s*\]/.test(t.Title)) && (
            <div className="mb-1.5">
              <span className="inline-flex items-center gap-1 bg-gradient-to-r from-[#104711] to-[#1a5c1c] text-white rounded px-2 py-0.5 shadow-sm">
                <i className="bi bi-file-earmark-text text-white/90 text-[10px]" />
                <span className="text-[10px] font-bold tracking-wide">
                  {t.DocumentNo || t.Title.match(/^\[\s*([^\]]+)\s*\]/)?.[1] || '—'}
                </span>
              </span>
            </div>
          )}
          {/* Clean Title - Document Number Extracted */}
          <p className="font-semibold text-slate-800 text-sm truncate max-w-[220px]">
            {t.Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || t.Title}
          </p>
          {/* Category & File Row */}
          <div className="flex items-center gap-2">
            {t.Category && (
              <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                {t.Category}
              </span>
            )}
            {t.FileLink && (
              <button onClick={() => { const url = t.FileLink.split('|')[0]; const name = decodeURIComponent(url.split('?')[0].split('/').pop()); onOpenFile(url, name) }}
                className="text-[10px] font-medium text-slate-400 hover:text-green-700 flex items-center gap-1 transition-colors">
                <i className="bi bi-paperclip" /> Attachment
              </button>
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
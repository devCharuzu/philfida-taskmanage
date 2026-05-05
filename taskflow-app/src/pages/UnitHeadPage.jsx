import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { useSync } from '../hooks/useSync'
import { setTaskStatus, getStatusBadgeClass, getPriorityClass, getUnreadCommentCount, logHistory, createTask } from '../lib/api'
import NotificationBell from '../components/NotificationBell'
import SettingsModal from '../components/SettingsModal'
import EditProfileModal from '../components/EditProfileModal'
import ChatModal from '../components/ChatModal'
import FileThumb from '../components/FileThumb'
import Lightbox from '../components/Lightbox'
import CreateTaskForm from '../components/CreateTaskForm'
import PresenceToggle, { normalizeStatus } from '../components/PresenceToggle'
import TaskTimeline from '../components/TaskTimeline'
import UserStatusPopover from '../components/UserStatusPopover'
import DeadlineProgress from '../components/DeadlineProgress'

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
  const [chat,         setChat]        = useState(null)
  const [lightboxFile, setLightboxFile]= useState(null)
  const [presence,     setPresence]    = useState(session?.Status || 'Available')
  const [loadingTask,  setLoadingTask] = useState(null)
  const [profileOpen,      setProfileOpen]      = useState(false)
  const [profileEditOpen,  setProfileEditOpen]  = useState(false)
  const [settingsOpen,     setSettingsOpen]     = useState(false)
  const [drawerOpen,   setDrawerOpen]  = useState(false)
  const [sidebarOpen,  setSidebarOpen]  = useState(false)
  const [dispatchConfirm, setDispatchConfirm] = useState(null)
  const [pendingDispatch, setPendingDispatch] = useState(null)
  const profileRef = useRef()

  useEffect(() => {
    function handler(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const myUnit = session?.Unit || session?.Office || ''

  const myTasks = globalData.tasks
    .filter(t => String(t.EmployeeID) === String(session?.ID) && String(t.Archived).toUpperCase() !== 'TRUE')
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

  // Separate unit tasks by assignment source using history
  const directorAssignedTasks = unitTasks.filter(t => {
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

  const unitHeadAssignedTasks = unitTasks.filter(t => {
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
  const unassignedTasks = unitTasks.filter(t => {
    const taskHistory = globalData.history.filter(h => String(h.TaskID) === String(t.TaskID))
    const dispatchedEntry = taskHistory.find(h => h.Action === 'Dispatched')
    return !dispatchedEntry
  })

  // Add unassigned tasks to unit head assigned tasks as fallback
  const finalUnitHeadAssignedTasks = [...unitHeadAssignedTasks, ...unassignedTasks]

  async function logout() {
    await supabase.auth.signOut()
    useStore.getState().clearSession()
    localStorage.removeItem('philfida_session')
    window.location.href = '/'
  }

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

  const TABS = [
    { key: 'my-tasks', label: 'My Assignments', icon: 'bi-person-check-fill' },
    { key: 'monitor',  label: 'Unit Monitor',   icon: 'bi-speedometer2' },
  ]

  return (
    <div className="h-dvh flex overflow-hidden" style={{ background: '#f0f4f0' }}>

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
            { key: 'my-tasks', icon: 'bi-person-check-fill', label: 'My Assignments', badge: stats.myActive },
            { key: 'monitor',  icon: 'bi-speedometer2',       label: 'Unit Monitor',   badge: stats.unitActive },
          ].map(item => (
            <button key={item.key} onClick={() => { setTab(item.key); if (item.key === 'monitor') setMonitorFilter('director-assigned'); setSidebarOpen(false) }}
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

          {/* Submenu for Unit Monitor */}
          {tab === 'monitor' && (
            <div className="ml-4 mt-1 space-y-0.5">
              {[
                { key: 'director-assigned', label: 'Director Assigned', badge: directorAssignedTasks.length },
                { key: 'my-assigned', label: 'My Assigned', badge: finalUnitHeadAssignedTasks.length },
              ].map(item => (
                <button key={item.key} onClick={() => { setMonitorFilter(item.key); setSidebarOpen(false) }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    monitorFilter === item.key 
                      ? 'bg-white/20 text-white' 
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}>
                  <span className="flex-1">{item.label}</span>
                  {item.badge > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 bg-red-500/80 text-white text-[9px] font-bold rounded-full">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
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
              <span className="text-white/40 text-[9px] sm:text-[10px] leading-none">Unit Head — {myUnit.split(' ').slice(0,2).join(' ')}</span>
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

      {/* ── MAIN ── */}
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

          {/* ── MY TASKS TAB ── */}
          {tab === 'my-tasks' && (
            <div className="flex flex-col h-full">
              {/* ── TOP BAR: Page title + Assign button ── */}
              <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 py-3 border-b border-slate-200 bg-white flex-shrink-0 gap-2 min-w-0">
                <div className="min-w-0">
                  <h2 className="font-bold text-green-900 text-base sm:text-lg leading-none">My Assignments</h2>
                  <p className="text-slate-400 text-xs mt-1">{myTasks.length} task{myTasks.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <PresenceToggle value={presence} userId={session?.ID} onChange={setPresence} />
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
                  <div className="grid grid-cols-1 min-[900px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 items-start p-4 md:p-6 lg:p-8">
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
              <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 py-3 border-b border-slate-200 bg-white flex-shrink-0 gap-2 min-w-0">
                <div className="min-w-0">
                  <h2 className="font-bold text-green-900 text-base sm:text-lg leading-none">
                    {monitorFilter === 'director-assigned' ? 'Director Assigned Tasks' : 'My Assigned Tasks'}
                  </h2>
                  <p className="text-slate-400 text-xs mt-1">
                    {monitorFilter === 'director-assigned' ? directorAssignedTasks.length : finalUnitHeadAssignedTasks.length} task{
                      (monitorFilter === 'director-assigned' ? directorAssignedTasks.length : finalUnitHeadAssignedTasks.length) !== 1 ? 's' : ''}
                  </p>
                </div>
                {monitorFilter === 'my-assigned' && (
                  <button
                    onClick={() => { setDrawerOpen(true) }}
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
                    <span>Assign Task</span>
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
                  <div className="grid grid-cols-1 min-[900px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 items-start p-4 md:p-6 lg:p-8">
                    {(() => {
                      const filteredTasks = monitorFilter === 'director-assigned' ? directorAssignedTasks : finalUnitHeadAssignedTasks
                      
                      if (filteredTasks.length === 0) {
                        return (
                          <div className="col-span-full text-center py-16 text-slate-400">
                            <i className="bi bi-clipboard-x text-3xl block mb-2 opacity-30" />
                            <p className="text-sm">
                              {monitorFilter === 'director-assigned' ? 'No director-assigned tasks' : 'No tasks assigned by you yet'}
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
                            history={globalData.history.filter(h => String(h.TaskID) === String(t.TaskID))}
                            unreadChat={unreadChat}
                            onChat={() => setChat({ taskId: t.TaskID, taskTitle: t.Title })}
                            onOpenFile={(url, name) => setLightboxFile({ url, name })}
                            isDirectorAssigned={isDirectorAssigned}
                          />
                        )
                      })
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* FOOTER */}
        <footer className="bg-white border-t border-slate-100/80 py-1.5 sm:py-2 px-3 sm:px-4 md:px-6 lg:px-8 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] sm:text-[10px] text-slate-400 truncate">© {new Date().getFullYear()} PhilFIDA</p>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <span className="text-[9px] sm:text-[10px] text-slate-400 hidden sm:inline">Unit Head Dashboard</span>
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gradient-to-r from-[#016837] to-[#027a42]"></span>
            </div>
          </div>
        </footer>
      </div>{/* end flex-1 flex flex-col */}

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex z-30 shadow-lg mobile-nav-safe">
        {[
          { key: 'my-tasks', icon: 'bi-person-check-fill', label: 'My Tasks', badge: stats.myActive },
          { key: 'monitor', icon: 'bi-speedometer2',       label: 'Monitor', badge: stats.unitActive },
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
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#016837,#027a42)' }}>
              <div>
                <p className="text-white font-bold text-sm">Assign Task</p>
                <p className="text-green-300 text-xs mt-0.5">To unit personnel</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-green-300 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors">
                &times;
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
      {settingsOpen     && <SettingsModal     onClose={() => setSettingsOpen(false)}     session={session} />}
      {profileEditOpen && <EditProfileModal onClose={() => setProfileEditOpen(false)} />}

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
function UnitHeadTaskCard({ task: t, session, comments, loading, onStatusUpdate, onOpenChat, onOpenFile }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef()
  const unreadChat = getUnreadCommentCount(comments || [], t.TaskID, session?.Name || '')

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-full overflow-hidden">
      {/* ── SECTION 1: Header with Status & Actions ── */}
      <div className="bg-green-50/70 px-3 sm:px-4 py-2 sm:py-3 border-b border-green-100">
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
        {/* Document Number Badge */}
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
        {/* Clean Title */}
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
      <div className="grid grid-cols-2 gap-0 divide-x divide-slate-100">
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

      {/* ── SECTION 7: Action Buttons ── */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2 bg-white border-t border-slate-100">
        {t.Status === 'Assigned' && (
          <button disabled={loading} onClick={() => onStatusUpdate(t.TaskID, 'Received')} className="w-full py-2.5 rounded-lg font-semibold text-sm text-white border-0"
            style={{
              background: 'linear-gradient(135deg, #16a34a, #15803d)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, #15803d, #166534)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, #16a34a, #15803d)'}
          >
            {loading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : <><i className="bi bi-check-lg" /> Accept Task</>}
          </button>
        )}
        {t.Status === 'Received' && (
          <button disabled={loading} onClick={() => onStatusUpdate(t.TaskID, 'Completed')} className="w-full py-2.5 rounded-lg font-semibold text-sm text-white border-0"
            style={{
              background: 'linear-gradient(135deg, #16a34a, #15803d)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, #15803d, #166534)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, #16a34a, #15803d)'}
          >
            {loading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : <><i className="bi bi-check2-all" /> Mark Complete</>}
          </button>
        )}
        {t.Status === 'Completed' && (
          <button disabled className="w-full py-2.5 rounded-lg font-semibold text-sm text-green-700 border-0 bg-gradient-to-r from-green-50 to-emerald-50">
            <i className="bi bi-check-circle-fill" /> Completed
          </button>
        )}
      </div>

      {/* Action Menu Dropdown */}
      <PortalDropdown anchorRef={btnRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
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
function UnitHeadMonitorCard({ task: t, unit, employee, comments, session, history, unreadChat, onChat, onOpenFile, isDirectorAssigned = false }) {
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
          {/* Personnel Name */}
          <div className="min-w-0 flex-1 flex items-center gap-1.5 sm:gap-2">
            <div className="min-w-0 flex-1">
              <span className="font-bold text-green-900 text-[13px] sm:text-[15px] leading-tight truncate block">{t.EmployeeName}</span>
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
      <div className="px-3 sm:px-4 py-3 sm:py-4 border-b border-slate-100 bg-white">
        {/* Document Number Badge */}
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
        {/* Clean Title */}
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
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div className="fixed z-[9999] bg-white border border-slate-200 rounded-xl shadow-2xl text-sm overflow-hidden"
        style={{ top: pos.top, right: Math.max(8, window.innerWidth - pos.left), minWidth: '160px', maxWidth: 'calc(100vw - 16px)' }}>
        {children}
      </div>
    </>,
    document.body
  )
}
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { useSync } from '../hooks/useSync'
import { toggleArchive, getStatusBadgeClass, getPriorityClass, getUnreadCommentCount, deleteTask, deleteTasks, restoreTasks, logHistory } from '../lib/api'
import { normalizeStatus } from '../components/PresenceToggle'
import NotificationBell from '../components/NotificationBell'
import SettingsModal from '../components/SettingsModal'
import CreateTaskForm from '../components/CreateTaskForm'
import EditTaskModal from '../components/EditTaskModal'
import ChatModal from '../components/ChatModal'
import Lightbox from '../components/Lightbox'
import UserManagement from '../components/UserManagement'
import TaskTimeline from '../components/TaskTimeline'
import UserStatusPopover from '../components/UserStatusPopover'

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
  const [settingsOpen,  setSettingsOpen]  = useState(false)
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
      <aside className={`
        absolute md:relative inset-y-0 left-0 z-40
        w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0
        transform transition-transform h-full
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>

        {/* ── Branding + Notification row ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0a2e0a,#155414)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src="/philfida-logo.png" alt="PhilFIDA" className="w-6 h-6 object-contain"
                onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style="font-size:9px;font-weight:900;color:#155414;">PF</span>' }} />
            </div>
            <span className="text-white font-bold text-xs truncate">PhilFIDA TaskFlow</span>
          </div>
          <div className="flex-shrink-0">
            <NotificationBell />
          </div>
        </div>

        {/* ── Profile (clickable) ── */}
        <div className="relative flex-shrink-0" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(o => !o)}
            className="w-full flex items-center gap-3 px-4 py-4 border-b border-slate-100 hover:bg-green-50 transition-colors group"
            style={{ background: profileOpen ? '#f0faf0' : undefined }}
          >
            <img
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(session?.Name||'')}&background=155414&color=fff&size=80`}
              className="w-10 h-10 rounded-xl flex-shrink-0 ring-2 ring-green-200 group-hover:ring-green-400 transition-all"
              alt={session?.Name}
            />
            <div className="min-w-0 text-left flex-1">
              <p className="font-bold text-green-900 text-sm truncate leading-none">{session?.Name}</p>
              <p className="text-slate-400 text-[11px] mt-1">Director — PhilFIDA</p>
            </div>
            <i className={`bi bi-chevron-${profileOpen ? 'up' : 'down'} text-slate-300 text-xs flex-shrink-0 transition-transform`} />
          </button>

          {/* Profile dropdown */}
          {profileOpen && (
            <div className="absolute left-0 right-0 top-full bg-white border border-slate-200 shadow-xl z-50 overflow-hidden mx-2 rounded-xl">
              <div className="px-4 py-3 bg-green-50 border-b border-slate-100">
                <p className="font-bold text-green-900 text-xs">{session?.Name}</p>
                <p className="text-slate-400 text-[10px] mt-0.5">Director · PhilFIDA Central Office</p>
              </div>
              <button
                onClick={() => { setProfileOpen(false); setSettingsOpen(true) }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left border-b border-slate-100"
              >
                <i className="bi bi-gear-fill text-green-700 text-base" /> Settings
              </button>
              <button
                onClick={logout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors text-left"
              >
                <i className="bi bi-box-arrow-left text-base" /> Sign Out
              </button>
            </div>
          )}
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 py-2">Navigation</p>
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

        {/* ── Mini stats ── */}
        <div className="p-3 border-t border-slate-100 space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-2">Quick Stats</p>
          {[
            { label: 'Total Active', val: stats.total,     color: 'bg-green-600' },
            { label: 'Assigned',     val: stats.assigned,  color: 'bg-amber-500' },
            { label: 'In Progress',  val: stats.received,  color: 'bg-blue-500' },
            { label: 'Completed',    val: stats.completed, color: 'bg-emerald-600' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2 px-1">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.color}`} />
              <span className="text-xs text-slate-500 flex-1">{s.label}</span>
              <span className="text-xs font-bold text-slate-700">{s.val}</span>
            </div>
          ))}
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* ── MAIN ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar — only visible on small screens */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 text-slate-500 hover:text-green-800">
            <i className="bi bi-list text-xl" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-green-800 rounded-full flex items-center justify-center overflow-hidden">
              <img src="/philfida-logo.png" alt="PhilFIDA" className="w-5 h-5 object-contain"
                onError={e => { e.target.style.display='none' }} />
            </div>
            <span className="text-green-900 font-bold text-sm">TaskFlow</span>
          </div>
          <NotificationBell />
        </div>

        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">

          {/* ── MONITOR TAB ── */}
          {tab === 'monitor' && (
            <div className="flex flex-col h-full">

              {/* ── TOP BAR: Page title + Dispatch button ── */}
              <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0 gap-2 min-w-0">
                <div className="min-w-0">
                  <h2 className="font-bold text-green-900 text-base sm:text-lg leading-none">Task Monitor</h2>
                  <p className="text-slate-400 text-xs mt-1">{filteredTasks.length} of {activeTasks.length} tasks shown</p>
                </div>
                <button
                  onClick={() => setDrawerOpen(true)}
                  className="btn-primary gap-2 px-4 py-2.5 shadow-sm"
                >
                  <i className="bi bi-plus-lg text-base" />
                  <span className="hidden sm:inline">Dispatch Task</span>
                  <span className="sm:hidden">New</span>
                </button>
              </div>

              {/* ── PERSONNEL STATUS BAR ── */}
              <div className="px-4 md:px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
                <div className="flex items-start gap-4 flex-wrap">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 flex-shrink-0">Personnel</p>
                  <div className="flex flex-wrap gap-1.5 flex-1 max-h-20 overflow-y-auto">
                    {nonDirectors.length === 0 ? (
                      <p className="text-xs text-slate-400">No active personnel.</p>
                    ) : Object.entries(personnelGroups).map(([status, group]) => {
                      if (group.length === 0) return null
                      const cfg = STATUS_CFG[status]
                      return group.map(u => (
                        <UserStatusPopover
                          key={u.ID}
                          name={u.Name}
                          status={u.Status}
                          title={u.Status}
                          chipClassName={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-default ${cfg.bg} ${cfg.text} border-slate-200`}
                          dotClassName={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`}
                          popoverMinW={200}
                          popoverMaxW={260}
                        />
                      ))
                    })}
                  </div>
                  {/* Legend */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {Object.entries(STATUS_CFG).map(([s, c]) => (
                      <div key={s} className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                        <span className="text-[10px] text-slate-400 hidden lg:inline">{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── FILTER BAR ── */}
              <div className="px-4 md:px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0 flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[120px] max-w-xs">
                  <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                  <input
                    className="input pl-8 py-1.5 text-xs"
                    placeholder="Search..."
                    value={filterSearch}
                    onChange={e => setFilterSearch(e.target.value)}
                  />
                </div>
                <select className="input py-1.5 text-xs flex-1 min-w-[90px] max-w-[130px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="All">All Status</option>
                  <option value="Assigned">Assigned</option>
                  <option value="Received">Received</option>
                  <option value="Completed">Completed</option>
                </select>
                <select className="input py-1.5 text-xs flex-1 min-w-[90px] max-w-[160px]" value={filterUnit} onChange={e => setFilterUnit(e.target.value)}>
                  <option value="All">All Units</option>
                  {units.map(u => <option key={u}>{u}</option>)}
                </select>
                {(filterUnit !== 'All' || filterStatus !== 'All' || filterSearch) && (
                  <button onClick={() => { setFilterUnit('All'); setFilterStatus('All'); setFilterSearch('') }}
                    className="btn-ghost text-xs px-2 py-1.5 text-slate-400 flex-shrink-0">
                    <i className="bi bi-x-circle me-1" /><span className="hidden sm:inline">Clear</span>
                  </button>
                )}
              </div>

              {/* ── TASK TABLE ── */}
              <div className="flex-1 overflow-auto px-4 md:px-6 py-4">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th className="w-10 hidden sm:table-cell">
                          <span className="text-[10px] font-bold uppercase text-white/70">#</span>
                        </th>
                        <th>Unit Personnel / Task</th>
                        <th className="hidden sm:table-cell">Unit</th>
                        <th>Status</th>
                        <th className="hidden md:table-cell">Priority</th>
                        <th className="hidden lg:table-cell">Deadline</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="text-center py-16 text-slate-400">
                            <i className="bi bi-clipboard-x text-3xl block mb-2 opacity-30" />
                            {activeTasks.length === 0 ? 'No active tasks yet.' : 'No tasks match the current filters.'}
                          </td>
                        </tr>
                      ) : filteredTasks.map((t, idx) => {
                        const emp = globalData.users.find(u => String(u.ID) === String(t.EmployeeID))
                        const unit = emp?.Unit || emp?.Office || '—'
                        return (
                          <TaskRow
                            key={t.TaskID}
                            task={t}
                            unit={unit}
                            idx={idx + 1}
                            isArchived={false}
                            comments={globalData.comments}
                            session={session}
                            onEdit={() => setEditTask(t)}
                            onChat={() => setChat({ taskId: t.TaskID, taskTitle: t.Title })}
                            onArchive={() => handleArchive(t.TaskID, true)}
                            onOpenFile={(url, name) => setLightboxFile({ url, name })}
                          />
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ── ARCHIVE TAB ── */}
          {tab === 'archive' && (
            <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto pb-20 md:pb-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-bold text-green-900 text-lg sm:text-xl">Archive Repository</h2>
                  <p className="text-slate-500 text-xs mt-1">Completed and archived task records</p>
                </div>
                {selected.length > 0 && (
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm w-full sm:w-auto">
                    <span className="text-xs font-bold text-slate-600 flex-1 sm:flex-none sm:mr-1">{selected.length} selected</span>
                    <button onClick={handleBulkRestore} disabled={!!bulkLoading} className="btn-success text-xs px-3 py-1.5 flex-1 sm:flex-none">
                      {bulkLoading === 'restore' ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : <><i className="bi bi-arrow-up-circle" /> Restore</>}
                    </button>
                    <button onClick={() => setDeleteConfirm(true)} disabled={!!bulkLoading} className="btn-danger text-xs px-3 py-1.5 flex-1 sm:flex-none">
                      <i className="bi bi-trash3" /> Delete
                    </button>
                    <button onClick={() => setSelected([])} className="btn-ghost text-xs px-2 py-1.5 text-slate-400 flex-shrink-0">
                      <i className="bi bi-x-lg" />
                    </button>
                  </div>
                )}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>
                          <input type="checkbox"
                            className="w-4 h-4 rounded border-green-300 accent-green-700 cursor-pointer"
                            checked={archivedTasks.length > 0 && archivedTasks.every(t => selected.includes(t.TaskID))}
                            onChange={() => toggleSelectAll(archivedTasks.map(t => t.TaskID))}
                          />
                        </th>
                        <th>Unit Personnel / Task</th>
                        <th>Status</th>
                        <th className="hidden md:table-cell">Priority</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedTasks.length === 0 ? (
                        <tr><td colSpan="5" className="text-center py-12 text-slate-400">
                          <i className="bi bi-archive text-3xl block mb-2 opacity-30" />No archived tasks.
                        </td></tr>
                      ) : archivedTasks.map(t => (
                        <TaskRow
                          key={t.TaskID}
                          task={t}
                          isArchived={true}
                          comments={globalData.comments}
                          session={session}
                          history={globalData.history.filter(h => String(h.TaskID) === String(t.TaskID))}
                          selected={selected.includes(t.TaskID)}
                          onSelect={() => toggleSelect(t.TaskID)}
                          onEdit={() => setEditTask(t)}
                          onChat={() => setChat({ taskId: t.TaskID, taskTitle: t.Title })}
                          onArchive={() => handleArchive(t.TaskID, false)}
                          onDelete={async () => { await deleteTask(t.TaskID); await sync() }}
                          onOpenFile={(url, name) => setLightboxFile({ url, name })}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── USERS TAB ── */}
          {tab === 'users' && (
            <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto pb-20 md:pb-6">
              <div>
                <h2 className="font-bold text-green-900 text-xl">User Management</h2>
                <p className="text-slate-500 text-xs mt-1">Approve registrations, manage roles and access</p>
              </div>
              <UserManagement users={globalData.users} onSync={sync} />
            </div>
          )}

        </main>
      </div>{/* end flex-1 flex flex-col */}

      {/* ── DISPATCH DRAWER (slide-in from right) ── */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 flex flex-col shadow-2xl"
            style={{ animation: 'slideRight 0.25s ease' }}>
            <style>{`@keyframes slideRight { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#0e3d0e,#155414)' }}>
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
                onSync={async () => { await sync(); setDrawerOpen(false) }}
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


// ── StatusTimes — shows assigned/accepted/completed timestamps below the badge ──
function StatusTimes({ task: t }) {
  function fmtDT(iso) {
    if (!iso) return null
    const d = new Date(iso)
    return {
      date: d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
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
    <tr className={`${selected ? 'bg-green-50' : ''} group`}>
      {/* Checkbox (archive only) or row number */}
      {onSelect !== undefined ? (
        <td className="px-4 py-3">
          <input type="checkbox" checked={!!selected} onChange={onSelect}
            className="w-4 h-4 rounded border-slate-300 accent-green-700 cursor-pointer" />
        </td>
      ) : idx !== undefined ? (
        <td className="px-4 py-3 hidden sm:table-cell">
          <span className="text-xs text-slate-300 font-mono">{String(idx).padStart(2,'0')}</span>
        </td>
      ) : null}

      {/* Personnel + task */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
            style={{ background: '#155414' }}>
            {t.EmployeeName?.charAt(0) || '?'}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-green-900 text-sm leading-none">{t.EmployeeName}</p>
            <p className="text-slate-500 text-xs mt-0.5 truncate max-w-[200px]">{t.Title}</p>
            {t.Category && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded mt-1 inline-block">{t.Category}</span>}
          </div>
        </div>
        {t.FileLink && (
          <button onClick={() => { const url = t.FileLink.split('|')[0]; const name = decodeURIComponent(url.split('?')[0].split('/').pop()); onOpenFile(url, name) }}
            className="text-[10px] text-green-700 hover:underline mt-1 flex items-center gap-1 ml-9">
            <i className="bi bi-paperclip" /> Attachment
          </button>
        )}
      </td>

      {/* Unit — only active table */}
      {unit !== undefined && (
        <td className="px-4 hidden sm:table-cell">
          <p className="text-xs text-slate-500 max-w-[140px] truncate leading-snug">{unit}</p>
        </td>
      )}

      {/* Status + timestamps */}
      <td className="px-4">
        <span className={getStatusBadgeClass(t.Status)}>{t.Status}</span>
        <StatusTimes task={t} />
      </td>

      {/* Priority */}
      <td className="px-4 hidden md:table-cell">
        {t.Priority && <span className={getPriorityClass(t.Priority)}>{t.Priority}</span>}
      </td>

      {/* Deadline — active table only */}
      {unit !== undefined && (
        <td className="px-4 hidden lg:table-cell">
          {t.Deadline
            ? <p className="text-xs text-red-500 font-semibold whitespace-nowrap">{new Date(t.Deadline).toLocaleDateString()}</p>
            : <p className="text-xs text-slate-300">—</p>}
        </td>
      )}

      {/* Actions */}
      <td className="px-4 text-right">
        <button ref={btnRef} onClick={() => setMenuOpen(!menuOpen)}
          className="btn-ghost px-2 py-1 text-slate-400 hover:text-slate-700 relative opacity-60 group-hover:opacity-100 transition-opacity">
          <i className="bi bi-three-dots-vertical" />
          {unreadChat > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
              {unreadChat > 9 ? '9+' : unreadChat}
            </span>
          )}
        </button>
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
  )
}
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { useSync } from '../hooks/useSync'
import { setTaskStatus, getStatusBadgeClass, getPriorityClass, getUnreadCommentCount, logHistory } from '../lib/api'
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
import PersonalCalendarSide from '../components/PersonalCalendarSide'
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
  const [chat,         setChat]        = useState(null)
  const [lightboxFile, setLightboxFile]= useState(null)
  const [presence,     setPresence]    = useState(session?.Status || 'Available')
  const [loadingTask,  setLoadingTask] = useState(null)
  const [profileOpen,      setProfileOpen]      = useState(false)
  const [profileEditOpen,  setProfileEditOpen]  = useState(false)
  const [settingsOpen,     setSettingsOpen]     = useState(false)
  const [drawerOpen,   setDrawerOpen]  = useState(false)
  const [sidebarOpen,  setSidebarOpen]  = useState(false)
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

  function logout() { useStore.getState().clearSession(); window.location.href = '/' }

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
    <div className="h-screen-responsive flex overflow-hidden" style={{ background: '#f0f4f0' }}>

      {/* ── SIDEBAR OVERLAY (mobile) ── */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* ── SIDEBAR ── */}
      <aside className={`sidebar-responsive fixed md:relative inset-y-0 left-0 z-50 md:z-auto bg-white border-r border-slate-200 flex flex-col flex-shrink-0 h-full transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>

        {/* Branding strip */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0a2e0a,#155414)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src="/philfida-logo.png" alt="PhilFIDA" className="w-6 h-6 object-contain"
                onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style="font-size:9px;font-weight:900;color:#155414;">PF</span>' }} />
            </div>
            <span className="text-white font-bold text-xs truncate">PhilFIDA TaskFlow</span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-green-300 hover:text-white transition-colors">
              <i className="bi bi-x-lg text-base" />
            </button>
          </div>
        </div>

        {/* Profile */}
        <div className="relative flex-shrink-0" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(o => !o)}
            className="w-full flex items-center gap-3 px-4 py-4 border-b border-slate-100 hover:bg-green-50 transition-colors group"
            style={{ background: profileOpen ? '#f0faf0' : undefined }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white bg-green-700 flex-shrink-0 ring-2 ring-green-200 group-hover:ring-green-400 transition-all">
              {session?.Name?.charAt(0) || '?'}
            </div>
            <div className="min-w-0 text-left flex-1">
              <p className="font-bold text-green-900 text-sm truncate leading-none">{session?.Name}</p>
              <p className="text-slate-400 text-[11px] mt-1">Unit Head · {myUnit.split(' ').slice(0,2).join(' ')}</p>
            </div>
            <i className={`bi bi-chevron-${profileOpen ? 'up' : 'down'} text-slate-300 text-xs flex-shrink-0`} />
          </button>
          {profileOpen && (
            <div className="absolute left-0 right-0 top-full bg-white border border-slate-200 shadow-xl z-50 overflow-hidden mx-2 rounded-xl">
              <div className="px-4 py-3 bg-green-50 border-b border-slate-100">
                <p className="font-bold text-green-900 text-xs">{session?.Name}</p>
                <p className="text-slate-400 text-[10px] mt-0.5">{myUnit}</p>
              </div>
              <button onClick={() => { setProfileOpen(false); setProfileEditOpen(true) }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left border-b border-slate-100">
                <i className="bi bi-gear-fill text-green-700 text-base" /> Edit Profile
              </button>
              <button onClick={() => { setProfileOpen(false); setSettingsOpen(true) }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left border-b border-slate-100">
                <i className="bi bi-gear-fill text-green-700 text-base" /> Settings
              </button>
              <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors text-left">
                <i className="bi bi-box-arrow-left text-base" /> Sign Out
              </button>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 py-2">Navigation</p>
          {TABS.map(item => (
            <button key={item.key} onClick={() => { setTab(item.key); setSidebarOpen(false) }}
              className={`nav-item w-full text-left ${tab === item.key ? 'active' : ''}`}>
              <i className={`bi ${item.icon} text-base`} />
              <span className="flex-1 text-sm">{item.label}</span>
            </button>
          ))}
          <button onClick={() => { navigate('/calendar'); setSidebarOpen(false) }} className="nav-item w-full text-left">
            <i className="bi bi-calendar-event text-base" />
            <span className="flex-1 text-sm">My Calendar</span>
          </button>
        </nav>

        <PersonalCalendarSide />
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <div className="mobile-only flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="btn-touch p-1.5 -ml-1 text-slate-600 hover:text-green-800 transition-colors">
            <i className="bi bi-list text-2xl-responsive" />
          </button>
          <div className="flex items-center gap-responsive">
            <NotificationBell />
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="btn-touch w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center text-green-700 hover:bg-green-200 transition-colors"
            >
              <i className="bi bi-person-fill text-sm-responsive" />
            </button>
          </div>
        </div>

        {/* Page top bar */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0 gap-2 min-w-0">
          <div className="min-w-0">
            <h2 className="font-bold text-green-900 text-base sm:text-lg leading-none truncate">
              {tab === 'my-tasks' ? 'My Assignments' : 'Unit Monitor'}
            </h2>
            <p className="text-slate-400 text-xs mt-1 truncate">{myUnit}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <PresenceToggle value={presence} userId={session?.ID} onChange={setPresence} />
            <button onClick={() => setDrawerOpen(true)} className="btn-primary gap-1.5 px-3 py-2 text-sm shadow-sm hidden md:flex">
              <i className="bi bi-plus-lg" /> Assign Task
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex bg-white border-b border-slate-200 px-4 md:px-6 gap-0 flex-shrink-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all
                ${tab === t.key ? 'border-green-700 text-green-800' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
              <i className={`bi ${t.icon}`} />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* Personnel availability bar — unit members only */}
        {unitEmployees.length > 0 && (
          <div className="px-4 md:px-6 py-2.5 border-b border-slate-200 bg-white flex-shrink-0">
            <div className="flex items-start gap-3 flex-wrap">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 flex-shrink-0">Unit Personnel</p>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {unitEmployees.map(u => {
                  const base = normalizeStatus(u.Status)
                  const cfg  = STATUS_CFG[base] || STATUS_CFG['Available']
                  return (
                    <UserStatusPopover
                      key={u.ID}
                      name={u.Name}
                      status={u.Status}
                      title={u.Status}
                      chipClassName={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-default ${cfg.bg} ${cfg.text} ${cfg.border}`}
                      dotClassName={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`}
                      popoverMinW={200}
                      popoverMaxW={240}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-4 md:px-6 py-4">

          {/* MY TASKS */}
          {tab === 'my-tasks' && (
            <div className="max-w-2xl mx-auto space-y-3">
              {myTasks.length === 0 ? (
                <EmptyState icon="bi-inbox" text="No active assignments from Director." />
              ) : myTasks.map(t => (
                <TaskCard key={t.TaskID} task={t} session={session} comments={globalData.comments}
                  loading={loadingTask === t.TaskID} onStatusUpdate={handleStatusUpdate}
                  onOpenChat={() => setChat({ taskId: t.TaskID, taskTitle: t.Title })}
                  onOpenFile={(url, name) => setLightboxFile({ url, name })} />
              ))}
            </div>
          )}

          {/* UNIT MONITOR */}
          {tab === 'monitor' && (
            <div className="max-w-5xl mx-auto space-y-4">
              {unitTasks.length === 0 ? (
                <EmptyState icon="bi-clipboard" text="No tasks assigned in your unit yet." />
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="gov-table">
                      <thead>
                        <tr>
                          <th>Unit Personnel / Task</th>
                          <th>Status</th>
                          <th className="hidden sm:table-cell">Priority</th>
                          <th className="hidden md:table-cell">Deadline</th>
                          <th className="text-right">Chat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unitTasks.map(t => {
                          const unread = getUnreadCommentCount(globalData.comments, t.TaskID, session.Name)
                          return (
                            <tr key={t.TaskID} className="group">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white bg-green-700">
                                    {t.EmployeeName?.charAt(0) || '?'}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-green-900 text-sm leading-none">{t.EmployeeName}</p>
                                    <p className="text-slate-500 text-xs mt-0.5 truncate max-w-[180px]">{t.Title}</p>
                                    <div className="mt-1">
                                      <TaskTimeline task={t} history={globalData.history.filter(h => String(h.TaskID) === String(t.TaskID))} compact />
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4">
                                <span className={getStatusBadgeClass(t.Status)}>{t.Status}</span>
                                <StatusTimes task={t} />
                              </td>
                              <td className="px-4 hidden sm:table-cell">{t.Priority && <span className={getPriorityClass(t.Priority)}>{t.Priority}</span>}</td>
                              <td className="px-4 hidden md:table-cell">
                                {t.Deadline ? <p className="text-xs text-red-500 font-semibold">{new Date(t.Deadline).toLocaleDateString('en-US', { timeZone: 'Asia/Manila' })}</p> : <p className="text-xs text-slate-300">—</p>}
                              </td>
                              <td className="px-4 text-right">
                                <button onClick={() => setChat({ taskId: t.TaskID, taskTitle: t.Title })}
                                  className="btn-ghost px-2 py-1.5 text-slate-400 hover:text-green-800 relative opacity-60 group-hover:opacity-100 transition-opacity">
                                  <i className="bi bi-chat-dots text-base" />
                                  {unread > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                                      {unread > 9 ? '9+' : unread}
                                    </span>
                                  )}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>


      </div>

      {/* ── ASSIGN DRAWER ── */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white z-50 flex flex-col shadow-2xl"
            style={{ animation: 'slideRight 0.25s ease' }}>
            <style>{`@keyframes slideRight { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#0e3d0e,#155414)' }}>
              <div>
                <p className="text-white font-bold text-sm">Assign Task</p>
                <p className="text-green-300 text-xs mt-0.5">To unit personnel</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-green-300 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors">
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <CreateTaskForm
                users={unitEmployees.map(u => ({ ...u, Role: 'Employee' }))}
                onSync={async () => { await sync(); setDrawerOpen(false) }}
              />
            </div>
          </div>
        </>
      )}

      {chat         && <ChatModal taskId={chat.taskId} taskTitle={chat.taskTitle} onClose={() => setChat(null)} onSync={sync} />}
      {lightboxFile && <Lightbox file={lightboxFile} onClose={() => setLightboxFile(null)} />}
      {settingsOpen     && <SettingsModal     onClose={() => setSettingsOpen(false)}     session={session} />}
      {profileEditOpen && <EditProfileModal onClose={() => setProfileEditOpen(false)} />}
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

function EmptyState({ icon, text }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 text-center py-16 shadow-sm">
      <i className={`bi ${icon} text-4xl text-slate-200 block mb-3`} />
      <p className="text-slate-400 text-sm font-medium">{text}</p>
    </div>
  )
}

function TaskCard({ task: t, session, comments, history = [], loading, onStatusUpdate, onOpenChat, onOpenFile }) {
  const unreadChat = getUnreadCommentCount(comments, t.TaskID, session.Name)
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={getStatusBadgeClass(t.Status)}>{t.Status}</span>
          {t.Priority && <span className={getPriorityClass(t.Priority)}>{t.Priority}</span>}
          {t.Category && <span className="text-xs bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded">{t.Category}</span>}
        </div>
        <span className="text-[10px] text-slate-300 font-mono flex-shrink-0 mt-0.5">#{t.TaskID}</span>
      </div>
      <div className="mb-3">
        <TaskTimeline task={t} history={history} />
      </div>
      <h3 className="font-bold text-green-900 text-base mb-1 leading-snug">{t.Title}</h3>
      <p className="text-sm text-slate-500 mb-2 leading-relaxed">{t.Instructions}</p>
      <DeadlineProgress task={t} />
      {t.Deadline && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 font-semibold mb-2 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
          <i className="bi bi-clock-fill" />Deadline: {new Date(t.Deadline).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}
        </div>
      )}
      <FileThumb fileLink={t.FileLink} onOpen={onOpenFile} />
      <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
        {t.Status === 'Assigned'  && <button disabled={loading} onClick={() => onStatusUpdate(t.TaskID, 'Received')}  className="btn-primary flex-1 py-2.5 text-sm">{loading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : <><i className="bi bi-check-lg" /> Accept</>}</button>}
        {t.Status === 'Received'  && <button disabled={loading} onClick={() => onStatusUpdate(t.TaskID, 'Completed')} className="btn-success flex-1 py-2.5 text-sm">{loading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : <><i className="bi bi-check2-all" /> Complete</>}</button>}
        {t.Status === 'Completed' && <button disabled className="btn flex-1 py-2.5 text-sm bg-slate-50 text-slate-400 border border-slate-200"><i className="bi bi-check-circle-fill text-emerald-500 me-1" /> Done</button>}
        <button onClick={onOpenChat} className="btn-secondary px-4 py-2.5 text-sm flex-shrink-0 relative">
          <i className="bi bi-chat-text-fill text-green-700" />
          {unreadChat > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">{unreadChat > 9 ? '9+' : unreadChat}</span>}
        </button>
      </div>
    </div>
  )
}
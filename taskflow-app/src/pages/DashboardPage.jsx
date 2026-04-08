import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { useSync } from '../hooks/useSync'
import { setTaskStatus, getStatusBadgeClass, getPriorityClass, getUnreadCommentCount } from '../lib/api'
import NotificationBell from '../components/NotificationBell'
import SettingsModal from '../components/SettingsModal'
import EditProfileModal from '../components/EditProfileModal'
import ChatModal from '../components/ChatModal'
import FileThumb from '../components/FileThumb'
import Lightbox from '../components/Lightbox'
import PresenceToggle from '../components/PresenceToggle'
import TaskTimeline from '../components/TaskTimeline'
import PersonalCalendarSide from '../components/PersonalCalendarSide'

export default function DashboardPage() {
  const session    = useStore(s => s.session)
  const globalData = useStore(s => s.globalData)
  const { sync }   = useSync()
  const navigate = useNavigate()

  const [chat,         setChat]         = useState(null)
  const [lightboxFile, setLightboxFile] = useState(null)
  const [presence,     setPresence]     = useState(session?.Status || 'Available')
  const [loadingTask,  setLoadingTask]  = useState(null)
  const [profileOpen,  setProfileOpen]  = useState(false)
  const [settingsOpen,     setSettingsOpen]     = useState(false)
  const [profileEditOpen, setProfileEditOpen] = useState(() => !!session?._needsProfileSetup)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const profileRef = useRef()

  useEffect(() => {
    function handler(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const myTasks = globalData.tasks
    .filter(t => String(t.EmployeeID) === String(session?.ID) && String(t.Archived).toUpperCase() !== 'TRUE')
    .slice().reverse()

  function logout() { useStore.getState().clearSession(); window.location.href = '/' }

  async function handleStatusUpdate(taskId, status) {
    setLoadingTask(taskId)
    try { await setTaskStatus(taskId, status, session?.Name || ''); await sync() }
    finally { setLoadingTask(null) }
  }

  const activeCount    = myTasks.filter(t => t.Status !== 'Completed').length
  const completedCount = myTasks.filter(t => t.Status === 'Completed').length

  return (
    <div className="h-dvh flex overflow-hidden" style={{ background: '#f0f4f0' }}>

      {/* ── SIDEBAR OVERLAY (mobile) ── */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* ── SIDEBAR ── */}
      <aside className={`fixed md:relative inset-y-0 left-0 z-50 md:z-auto w-72 md:w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 h-full transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>

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
            <img
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(session?.Name||'')}&background=155414&color=fff&size=80`}
              className="w-10 h-10 rounded-xl flex-shrink-0 ring-2 ring-green-200 group-hover:ring-green-400 transition-all"
              alt={session?.Name}
            />
            <div className="min-w-0 text-left flex-1">
              <p className="font-bold text-green-900 text-sm truncate leading-none">{session?.Name}</p>
              <p className="text-slate-400 text-[11px] mt-1">{session?.Designation || session?.Role}</p>
              <p className="text-slate-400 text-[10px] mt-0.5 truncate">{session?.Office || session?.Unit}</p>
            </div>
            <i className={`bi bi-chevron-${profileOpen ? 'up' : 'down'} text-slate-300 text-xs flex-shrink-0`} />
          </button>
          {profileOpen && (
            <div className="absolute left-0 right-0 top-full bg-white border border-slate-200 shadow-xl z-50 overflow-hidden mx-2 rounded-xl">
              <div className="px-4 py-3 bg-green-50 border-b border-slate-100">
                <p className="font-bold text-green-900 text-xs">{session?.Name}</p>
                {session?.Designation && <p className="text-green-700 text-[10px] mt-0.5 font-semibold">{session?.Designation}</p>}
                <p className="text-slate-400 text-[10px] mt-0.5">{session?.Office || session?.Unit}</p>
              </div>
              <button onClick={() => { setProfileOpen(false); setProfileEditOpen(true) }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left border-b border-slate-100">
                <i className="bi bi-person-gear text-green-700 text-base" /> Edit Profile
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
          <button className="nav-item w-full text-left active" onClick={() => navigate('/dashboard')}>
            <i className="bi bi-grid-fill text-base" />
            <span className="flex-1 text-sm">My Assignments</span>
          </button>
          <button onClick={() => navigate('/calendar')} className="nav-item w-full text-left">
            <i className="bi bi-calendar-event text-base" />
            <span className="flex-1 text-sm">My Calendar</span>
          </button>
        </nav>

        <PersonalCalendarSide />
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

        {/* Page top bar */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0 gap-2 min-w-0">
          <div className="min-w-0">
            <h2 className="font-bold text-green-900 text-base sm:text-lg leading-none">My Assignments</h2>
            <p className="text-slate-400 text-xs mt-1 truncate">{session?.Office || session?.Unit}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1.5 rounded-full whitespace-nowrap">
              {activeCount} Active
            </span>
            <PresenceToggle value={presence} userId={session?.ID} onChange={setPresence} />
          </div>
        </div>

        {/* Task feed */}
        <main className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          <div className="max-w-2xl mx-auto space-y-3">
            {myTasks.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 text-center py-20 shadow-sm">
                <i className="bi bi-inbox text-5xl text-slate-200 block mb-3" />
                <p className="text-slate-400 font-semibold text-sm">No active assignments.</p>
                <p className="text-slate-300 text-xs mt-1">You will be notified when a task is assigned.</p>
              </div>
            ) : myTasks.map(t => (
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
        </main>


      </div>

      {chat         && <ChatModal taskId={chat.taskId} taskTitle={chat.taskTitle} onClose={() => setChat(null)} onSync={sync} />}
      {lightboxFile && <Lightbox file={lightboxFile} onClose={() => setLightboxFile(null)} />}
      {settingsOpen     && <SettingsModal     onClose={() => setSettingsOpen(false)}     session={session} />}
      {profileEditOpen && <EditProfileModal onClose={() => setProfileEditOpen(false)} />}
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
      {t.Deadline && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 font-semibold mb-2 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
          <i className="bi bi-clock-fill" />Deadline: {new Date(t.Deadline).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}
        </div>
      )}
      <FileThumb fileLink={t.FileLink} onOpen={onOpenFile} />
      <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
        {t.Status === 'Assigned' && (
          <button disabled={loading} onClick={() => onStatusUpdate(t.TaskID, 'Received')} className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-60">
            {loading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : <><i className="bi bi-check-lg" /> Accept Task</>}
          </button>
        )}
        {t.Status === 'Received' && (
          <button disabled={loading} onClick={() => onStatusUpdate(t.TaskID, 'Completed')} className="btn-success flex-1 py-2.5 text-sm disabled:opacity-60">
            {loading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : <><i className="bi bi-check2-all" /> Mark Complete</>}
          </button>
        )}
        {t.Status === 'Completed' && (
          <button disabled className="btn flex-1 py-2.5 text-sm bg-slate-50 text-slate-400 border border-slate-200">
            <i className="bi bi-check-circle-fill text-emerald-500 me-1" /> Completed
          </button>
        )}
        <button onClick={onOpenChat} className="btn-secondary px-4 py-2.5 text-sm flex-shrink-0 relative">
          <i className="bi bi-chat-text-fill text-green-700" />
          {unreadChat > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
              {unreadChat > 9 ? '9+' : unreadChat}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
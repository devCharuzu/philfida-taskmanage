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
import DeadlineProgress from '../components/DeadlineProgress'

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
    try { await setTaskStatus(taskId, status, session?.Name || '', session?.ID); await sync() }
    finally { setLoadingTask(null) }
  }

  const activeCount    = myTasks.filter(t => t.Status !== 'Completed').length
  const completedCount = myTasks.filter(t => t.Status === 'Completed').length

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
          <button
            onClick={() => navigate('/dashboard')}
            className="nav-item w-full text-left active"
          >
            <i className="bi bi-grid-fill text-base" />
            <span className="flex-1 text-sm">My Assignments</span>
            {activeCount > 0 && (
              <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
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
              <span className="text-white/40 text-[9px] sm:text-[10px] leading-none">{session?.Designation || session?.Role} — {session?.Office || session?.Unit}</span>
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

          {/* ── TOP BAR ── */}
          <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 py-3 border-b border-slate-200 bg-white flex-shrink-0 gap-2 min-w-0">
            <div className="min-w-0">
              <h2 className="font-bold text-green-900 text-base sm:text-lg leading-none">My Assignments</h2>
              <p className="text-slate-400 text-xs mt-1">{session?.Office || session?.Unit || session?.Designation || session?.Role}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-1 rounded border border-emerald-100">
                {activeCount} Active
              </span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-1 rounded border border-blue-100">
                {completedCount} Done
              </span>
              <PresenceToggle value={presence} userId={session?.ID} onChange={setPresence} />
            </div>
          </div>

          {/* ── TASK CONTENT ── */}
          <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 pt-4 pb-0">
            {myTasks.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm max-w-full mb-4 text-center py-16">
                <i className="bi bi-clipboard-x text-3xl block mb-2 opacity-30 text-slate-400" />
                <p className="text-slate-400">No tasks assigned yet.</p>
              </div>
            ) : (
              <>
                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <div className="text-2xl font-bold text-emerald-600">{activeCount}</div>
                    <div className="text-xs text-slate-500 font-medium mt-1">Active Tasks</div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <div className="text-2xl font-bold text-blue-600">{completedCount}</div>
                    <div className="text-xs text-slate-500 font-medium mt-1">Completed</div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <div className="text-2xl font-bold text-purple-600">{myTasks.length}</div>
                    <div className="text-xs text-slate-500 font-medium mt-1">Total Tasks</div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <div className="text-2xl font-bold text-orange-600">
                      {Math.round((completedCount / myTasks.length) * 100) || 0}%
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-1">Completion Rate</div>
                  </div>
                </div>

                {/* Task Cards */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm max-w-full mb-4">
                  <div className="p-4 md:p-6 lg:p-8 space-y-4">
                    {myTasks.map(t => (
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
              </>
            )}
          </div>

        </main>

        {/* FOOTER */}
        <footer className="bg-white border-t border-slate-100/80 py-1.5 sm:py-2 px-3 sm:px-4 md:px-6 lg:px-8 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] sm:text-[10px] text-slate-400 truncate">© 2025 PhilFIDA</p>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <span className="text-[9px] sm:text-[10px] text-slate-400 hidden sm:inline">User Dashboard</span>
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gradient-to-r from-[#016837] to-[#027a42]"></span>
            </div>
          </div>
        </footer>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex z-30 shadow-lg">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-semibold transition-colors relative text-green-800"
        >
          <i className="bi bi-grid-fill text-xl" />
          Assignments
          {activeCount > 0 && (
            <span className="absolute top-2 right-1/4 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
      </nav>

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
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-full overflow-hidden">
      {/* ── SECTION 1: Task Header ── */}
      <div className="bg-green-50/70 px-3 sm:px-4 py-2 sm:py-3 border-b border-green-100">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          {/* Task ID & Status */}
          <div className="min-w-0 flex-1 flex items-center gap-1.5 sm:gap-2">
            <div className="min-w-0 flex-1">
              <span className="font-bold text-green-900 text-[13px] sm:text-[15px] leading-tight truncate block">#{t.TaskID}</span>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5">Assigned to you</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Comments indicator */}
            {unreadChat > 0 && (
              <button
                onClick={onOpenChat}
                className="flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-100 rounded-full text-red-600 hover:bg-red-100 transition-colors"
              >
                <i className="bi bi-chat-dots-fill text-[12px]" />
                <span className="text-[11px] font-bold">{unreadChat > 9 ? '9+' : unreadChat}</span>
              </button>
            )}
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
        <TaskTimeline task={t} history={history} />
      </div>

      {/* ── SECTION 6: Progress ── */}
      {t.Deadline && t.Status !== 'Completed' && (
        <div className="px-3 sm:px-4 pb-2.5 sm:pb-3 pt-0.5 sm:pt-1">
          <DeadlineProgress task={t} />
        </div>
      )}

      {/* ── SECTION 7: Actions ── */}
      <div className="px-3 sm:px-4 py-3 border-t border-slate-100 bg-white">
        <div className="flex gap-2">
          {t.Status === 'Assigned' && (
            <button 
              disabled={loading} 
              onClick={() => onStatusUpdate(t.TaskID, 'Received')} 
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-white shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
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
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
              ) : (
                <><i className="bi bi-check-lg" /> Accept Task</>
              )}
            </button>
          )}
          {t.Status === 'Received' && (
            <button 
              disabled={loading} 
              onClick={() => onStatusUpdate(t.TaskID, 'Completed')} 
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-white shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, #15803d, #166534)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, #16a34a, #15803d)'}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
              ) : (
                <><i className="bi bi-check-lg" /> Complete Task</>
              )}
            </button>
          )}
          {t.Status === 'Completed' && (
            <button disabled className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-white bg-slate-400 cursor-not-allowed">
              <i className="bi bi-check-circle-fill" /> Completed
            </button>
          )}
          <button 
            onClick={onOpenChat} 
            className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all relative"
          >
            <i className="bi bi-chat-text-fill text-green-700" />
            Chat
            {unreadChat > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                {unreadChat > 9 ? '9+' : unreadChat}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
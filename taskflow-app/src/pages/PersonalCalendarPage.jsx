import { useState, useEffect, useRef } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import NotificationBell from '../components/NotificationBell'
import SettingsModal from '../components/SettingsModal'
import EditProfileModal from '../components/EditProfileModal'
import PresenceToggle from '../components/PresenceToggle'
import PersonalCalendarSide from '../components/PersonalCalendarSide'
import { getStatusBadgeClass } from '../lib/api'

// Helper function to convert date to Philippines timezone
function toPHTime(date) {
  return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
}

function buildMonth(year, month) {
  const first = new Date(year, month, 1)
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7)) // start Monday
  const weeks = []
  let cur = new Date(start)
  for (let w = 0; w < 6; w++) {
    const days = []
    for (let d = 0; d < 7; d++) {
      days.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(days)
  }
  return weeks
}

export default function PersonalCalendarPage() {
  const session = useStore(s => s.session)
  const globalData = useStore(s => s.globalData)
  const navigate = useNavigate()

  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const [presence, setPresence] = useState(session?.Status || 'Available')
  const profileRef = useRef()

  useEffect(() => {
    function handler(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!session) return <Navigate to="/" replace />
  if (session.Role === 'Director') return <Navigate to="/director" replace />

  const uid = session.ID
  const calKey = `pf_calendar_${uid}`
  const todoKey = `pf_todos_${uid}`

  const now = toPHTime(new Date())
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState(toPHTime(new Date()))
  const [events, setEvents] = useState(() => {
    try { return JSON.parse(localStorage.getItem(calKey) || '{}') } catch { return {} }
  })
  const [completedRanges, setCompletedRanges] = useState([])
  const [todos, setTodos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(todoKey) || '[]') } catch { return [] }
  })

  useEffect(() => localStorage.setItem(calKey, JSON.stringify(events)), [events])
  useEffect(() => localStorage.setItem(todoKey, JSON.stringify(todos)), [todos])

  // Sync tasks from globalData into calendar events and compute completed ranges
  useEffect(() => {
    if (!globalData || !session) return
    
    // Get all users except directors
    const nonDirectorUsers = (globalData.users || []).filter(u => u.Role !== 'Director')
    const nonDirectorIds = nonDirectorUsers.map(u => String(u.ID))
    
    // Get tasks assigned to all non-director users
    const tasks = (globalData.tasks || []).filter(t => 
      nonDirectorIds.includes(String(t.EmployeeID)) && 
      String(t.Archived).toUpperCase() !== 'TRUE'
    )

    // Build completed ranges
    const ranges = tasks
      .filter(t => String(t.Status).toLowerCase() === 'completed' && (t.Deadline || t.StartDate))
      .map(t => ({ id: t.TaskID, start: t.StartDate || t.Deadline, end: t.Deadline }))
    setCompletedRanges(ranges)

    // Sync all tasks as events on their deadlines with status colors
    setEvents(prev => {
      const next = {}
      // copy previous non-task events
      for (const k of Object.keys(prev || {})) {
        next[k] = (prev[k] || []).filter(e => !String(e.id).startsWith('task-'))
        if (next[k].length === 0) delete next[k]
      }

      tasks.forEach(t => {
        if (!t.Deadline) return
        try {
          const key = new Date(t.Deadline).toISOString().slice(0,10)
          const ev = { 
            id: `task-${t.TaskID}`, 
            title: t.Title || 'Task',
            status: t.Status,
            employeeName: t.EmployeeName,
            badgeClass: getStatusBadgeClass(t.Status)
          }
          next[key] = [...(next[key]||[]), ev]
        } catch (e) { /* ignore malformed dates */ }
      })

      return next
    })
  }, [globalData, session])

  function prevMonth() {
    setMonth(m => { const nm = m - 1; if (nm < 0) { setYear(y => y-1); return 11 } return nm })
  }
  function nextMonth() {
    setMonth(m => { const nm = m + 1; if (nm > 11) { setYear(y => y+1); return 0 } return nm })
  }
  function goToday() {
    const t = toPHTime(new Date())
    setYear(t.getFullYear()); setMonth(t.getMonth()); setSelectedDate(t)
  }

  function addEvent(title, date) {
    const key = new Date(date).toISOString().slice(0,10)
    setEvents(prev => ({ ...prev, [key]: [...(prev[key]||[]), { id: Date.now(), title }] }))
  }
  function removeEvent(dateKey, id) {
    setEvents(prev => ({ ...prev, [dateKey]: (prev[dateKey]||[]).filter(e => e.id !== id) }))
  }

  function addTodo(text, due) {
    setTodos(prev => [{ id: Date.now(), text, done: false, due: due || null }, ...prev])
  }
  function toggleTodo(id) { setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t)) }
  function removeTodo(id) { setTodos(prev => prev.filter(t => t.id !== id)) }

  const weeks = buildMonth(year, month)
  const monthEvents = (d) => events[new Date(d).toISOString().slice(0,10)] || []
  const [showMonthPicker, setShowMonthPicker] = useState(false)

  return (
    <div className="h-dvh flex overflow-hidden bg-gradient-to-br from-slate-50 to-green-50">

      {/* SIDEBAR */}
      <aside className="hidden lg:flex w-72 bg-white/80 backdrop-blur-sm border-r border-green-100 flex-col flex-shrink-0 h-full shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-green-100 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0f4c0f,#1a5d1a)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
              <img src="/philfida-logo.png" alt="PhilFIDA" className="w-6 h-6 object-contain"
                onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style="font-size:10px;font-weight:900;color:#155414;">PF</span>' }} />
            </div>
            <div>
              <span className="text-white font-bold text-sm">PhilFIDA TaskFlow</span>
              <div className="text-green-200 text-[10px]">Calendar View</div>
            </div>
          </div>
          <NotificationBell />
        </div>

        <div className="relative flex-shrink-0" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(o => !o)}
            className="w-full flex items-center gap-3 px-6 py-4 border-b border-green-50 hover:bg-green-50/50 transition-all duration-200 group"
            style={{ background: profileOpen ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : undefined }}
          >
            <div className="relative">
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(session?.Name||'')}&background=155414&color=fff&size=80`}
                className="w-12 h-12 rounded-2xl flex-shrink-0 ring-2 ring-green-200 group-hover:ring-green-400 transition-all shadow-md"
                alt={session?.Name}
              />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
            </div>
            <div className="min-w-0 text-left flex-1">
              <p className="font-bold text-green-900 text-sm truncate leading-none">{session?.Name}</p>
              <p className="text-green-600 text-[11px] mt-1 font-medium">{session?.Designation || session?.Role}</p>
              <p className="text-slate-400 text-[10px] mt-0.5 truncate">{session?.Office || session?.Unit}</p>
            </div>
            <i className={`bi bi-chevron-${profileOpen ? 'up' : 'down'} text-green-400 text-xs flex-shrink-0`} />
          </button>
          {profileOpen && (
            <div className="absolute left-0 right-0 top-full bg-white border border-green-100 shadow-2xl z-50 overflow-hidden mx-4 rounded-2xl">
              <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-100">
                <p className="font-bold text-green-900 text-xs">{session?.Name}</p>
                {session?.Designation && <p className="text-green-700 text-[10px] mt-0.5 font-semibold">{session?.Designation}</p>}
                <p className="text-slate-400 text-[10px] mt-0.5">{session?.Office || session?.Unit}</p>
              </div>
              <button onClick={() => { setProfileOpen(false); setProfileEditOpen(true) }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-green-50 transition-colors text-left border-b border-green-50">
                <i className="bi bi-person-gear text-green-700 text-base" /> Edit Profile
              </button>
              <button onClick={() => { setProfileOpen(false); setSettingsOpen(true) }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-green-50 transition-colors text-left border-b border-green-50">
                <i className="bi bi-gear-fill text-green-700 text-base" /> Settings
              </button>
              <button onClick={() => { useStore.getState().clearSession(); window.location.href = '/' }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors text-left">
                <i className="bi bi-box-arrow-left text-base" /> Sign Out
              </button>
            </div>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 py-2">Navigation</p>
          <button onClick={() => navigate('/dashboard')} className="nav-item w-full text-left">
            <i className="bi bi-grid-fill text-base" />
            <span className="flex-1 text-sm">My Assignments</span>
          </button>
          <button onClick={() => navigate('/calendar')} className="nav-item w-full text-left active">
            <i className="bi bi-calendar-event text-base" />
            <span className="flex-1 text-sm">My Calendar</span>
          </button>
        </nav>

        <PersonalCalendarSide compact />
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white/90 backdrop-blur-sm border-b border-green-100 flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-green-800 rounded-lg flex items-center justify-center overflow-hidden shadow-sm">
              <img src="/philfida-logo.png" alt="" className="w-5 h-5 object-contain" onError={e => e.target.style.display='none'} />
            </div>
            <span className="text-green-900 font-bold text-sm">TaskFlow</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button onClick={() => { useStore.getState().clearSession(); window.location.href = '/' }} className="p-1.5 text-red-400 hover:text-red-600">
              <i className="bi bi-box-arrow-left text-lg" />
            </button>
          </div>
        </div>

        {/* Page top bar */}
        <div className="flex items-center justify-between px-6 lg:px-8 py-4 border-b border-green-100 bg-white/80 backdrop-blur-sm flex-shrink-0 gap-2 min-w-0 shadow-sm">
          <div className="min-w-0">
            <h2 className="font-bold text-green-900 text-lg lg:text-xl leading-none">Team Calendar</h2>
            <p className="text-slate-500 text-sm mt-1">View all team tasks and deadlines</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg border border-green-200">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-700 font-medium">PH Time</span>
            </div>
            <PresenceToggle value={presence} userId={session?.ID} onChange={setPresence} />
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 pb-20 lg:pb-6">
          <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-4 gap-6">
              <div className="xl:col-span-3 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-green-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <button onClick={prevMonth} className="btn-ghost px-3 py-2 text-sm rounded-xl hover:bg-green-50 transition-colors">
                    <i className="bi bi-chevron-left" />
                  </button>
                  <div className="relative">
                    <button onClick={() => setShowMonthPicker(s => !s)} className="btn-ghost px-4 py-2 text-sm rounded-xl flex items-center gap-2 hover:bg-green-50 transition-colors">
                      <span className="font-semibold text-green-900">{new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                      <i className="bi bi-caret-down-fill text-xs text-green-400" />
                    </button>
                    {showMonthPicker && (
                      <div className="absolute mt-2 bg-white border border-green-100 rounded-xl shadow-xl p-4 z-40 w-48">
                        <div className="grid grid-cols-3 gap-1 mb-3">
                          {Array.from({length:12}).map((_,mi) => (
                            <button key={mi} onClick={() => { setMonth(mi); setShowMonthPicker(false) }} className={`text-xs py-2 rounded-lg transition-colors ${mi===month? 'bg-green-500 text-white' : 'hover:bg-green-50'}`}> {new Date(0,mi).toLocaleString('default',{month:'short'})} </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setYear(y => y-1) }} className="btn-ghost px-2 py-1 rounded-lg hover:bg-green-50">-</button>
                          <input type="number" value={year} onChange={e => setYear(Number(e.target.value)||year)} className="input w-20 text-sm text-center" />
                          <button onClick={() => { setYear(y => y+1) }} className="btn-ghost px-2 py-1 rounded-lg hover:bg-green-50">+</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={nextMonth} className="btn-ghost px-3 py-2 text-sm rounded-xl hover:bg-green-50 transition-colors">
                    <i className="bi bi-chevron-right" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={goToday} className="btn-primary px-4 py-2 text-sm rounded-xl">Today</button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-2 text-[12px] text-slate-600 mb-3">
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <div key={d} className="text-center font-semibold text-xs py-2">{d}</div>)}
              </div>
              <div className="space-y-2">
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-2">
                    {week.map((d, di) => {
                      const iso = d.toISOString().slice(0,10)
                      const inMonth = d.getMonth() === month
                      const isCompletedRange = completedRanges.some(r => {
                        try {
                          const dd = new Date(d)
                          const start = new Date(r.start)
                          const end = new Date(r.end)
                          start.setHours(0,0,0,0)
                          end.setHours(23,59,59,999)
                          return dd >= start && dd <= end
                        } catch (e) { return false }
                      })
                      const isSelected = iso === selectedDate.toISOString().slice(0,10)
                      const isToday = iso === toPHTime(new Date()).toISOString().slice(0,10)
                      
                      return (
                        <button key={di} onClick={() => setSelectedDate(new Date(d))}
                          className={`p-3 h-24 text-left rounded-xl border transition-all duration-200 hover:shadow-md hover:scale-105 ${
                            isCompletedRange 
                              ? 'bg-slate-100 text-slate-400 opacity-70 border-slate-200' 
                              : inMonth 
                                ? isSelected
                                  ? 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg border-green-400'
                                  : isToday
                                    ? 'bg-green-50 text-green-900 border-green-200 font-semibold'
                                    : 'bg-white text-slate-700 border-green-100 hover:border-green-200'
                                : 'bg-slate-50 text-slate-300 border-slate-100'
                          }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className={`text-sm font-bold ${isSelected ? 'text-white' : isToday ? 'text-green-700' : ''}`}>
                              {d.getDate()}
                            </div>
                            {isToday && !isSelected && (
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            )}
                          </div>
                          <div className="space-y-1 overflow-hidden">
                            {monthEvents(d).slice(0,2).map(ev => (
                              <div key={ev.id} className="truncate text-[10px] leading-tight">
                                <div className={`flex items-center gap-1 ${isSelected ? 'text-white/90' : 'text-slate-600'}`}>
                                  {ev.badgeClass && (
                                    <span className={`text-[7px] font-bold px-1 py-0.5 rounded ${
                                      isSelected 
                                        ? 'bg-white/20 text-white'
                                        : ev.badgeClass.replace('badge-', 'bg-').replace('assigned', 'bg-yellow-100 text-yellow-700').replace('received', 'bg-green-100 text-green-700').replace('completed', 'bg-emerald-100 text-emerald-700')
                                    }`}>
                                      {ev.status?.[0]}
                                    </span>
                                  )}
                                  <span className="truncate">{ev.employeeName?.split(' ').map(n => n[0]).join('')}: {ev.title}</span>
                                </div>
                              </div>
                            ))}
                            {monthEvents(d).length > 2 && (
                              <div className={`text-[9px] ${isSelected ? 'text-white/70' : 'text-slate-400'} font-medium`}>
                                +{monthEvents(d).length - 2} more
                              </div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            <aside className="xl:col-span-1 space-y-4">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-green-100 p-5">
                <h3 className="font-semibold text-green-900 text-sm mb-4 flex items-center gap-2">
                  <i className="bi bi-calendar-check text-green-600"></i>
                  Tasks for {selectedDate.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}
                </h3>
                <EventList events={events[new Date(selectedDate).toISOString().slice(0,10)] || []} onAdd={addEvent} onRemove={removeEvent} dateKey={new Date(selectedDate).toISOString().slice(0,10)} />
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-green-100 p-5">
                <h3 className="font-semibold text-green-900 text-sm mb-4 flex items-center gap-2">
                  <i className="bi bi-check-square text-green-600"></i>
                  My Todo List
                </h3>
                <TodoList todos={todos} onAdd={addTodo} onToggle={toggleTodo} onRemove={removeTodo} />
              </div>

            </aside>
          </div>
        </main>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} session={session} />}
      {profileEditOpen && <EditProfileModal onClose={() => setProfileEditOpen(false)} />}
    </div>
  )
}

function EventList({ events, onAdd, onRemove, dateKey }) {
  const [text, setText] = useState('')
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input 
          value={text} 
          onChange={e => setText(e.target.value)} 
          placeholder="Add event..." 
          className="input flex-1 text-sm bg-white/60 border-green-200 focus:border-green-400 rounded-lg" 
        />
        <button 
          onClick={() => { if (!text) return; onAdd(text, dateKey); setText('') }} 
          className="btn-primary px-4 py-2 text-sm rounded-lg bg-green-500 hover:bg-green-600 shadow-sm"
        >
          Add
        </button>
      </div>
      <div className="space-y-2 max-h-64 overflow-auto">
        {events.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            <i className="bi bi-calendar-x text-2xl block mb-2"></i>
            No tasks or events for this date
          </div>
        ) : (
          events.map(ev => (
            <div key={ev.id} className="flex items-center justify-between text-sm p-3 bg-white/60 rounded-xl border border-green-100 hover:bg-white/80 transition-all">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {ev.badgeClass && (
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-sm ${
                    ev.badgeClass.replace('badge-', 'bg-').replace('assigned', 'bg-yellow-100 text-yellow-700 border border-yellow-200').replace('received', 'bg-green-100 text-green-700 border border-green-200').replace('completed', 'bg-emerald-100 text-emerald-700 border border-emerald-200')
                  }`}>
                    {ev.status?.[0]}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-700 truncate">{ev.title}</div>
                  {ev.employeeName && (
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      <i className="bi bi-person text-[8px]"></i> {ev.employeeName}
                    </div>
                  )}
                </div>
              </div>
              <button 
                onClick={() => onRemove(dateKey, ev.id)} 
                className="text-red-400 hover:text-red-600 text-xs p-1 hover:bg-red-50 rounded-lg transition-colors"
              >
                <i className="bi bi-trash"></i>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function TodoList({ todos, onAdd, onToggle, onRemove }) {
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input 
          value={text} 
          onChange={e => setText(e.target.value)} 
          placeholder="New todo..." 
          className="input flex-1 text-sm bg-white/60 border-green-200 focus:border-green-400 rounded-lg" 
        />
        <input 
          type="date" 
          value={due} 
          onChange={e => setDue(e.target.value)} 
          className="input w-32 text-sm bg-white/60 border-green-200 focus:border-green-400 rounded-lg" 
        />
        <button 
          onClick={() => { if (!text) return; onAdd(text, due || null); setText(''); setDue('') }} 
          className="btn-primary px-4 py-2 text-sm rounded-lg bg-green-500 hover:bg-green-600 shadow-sm"
        >
          Add
        </button>
      </div>
      <div className="space-y-2 max-h-64 overflow-auto">
        {todos.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            <i className="bi bi-check-square text-2xl block mb-2"></i>
            No todos yet
          </div>
        ) : (
          todos.map(t => (
            <div key={t.id} className="flex items-center gap-3 text-sm p-3 bg-white/60 rounded-xl border border-green-100 hover:bg-white/80 transition-all">
              <input 
                type="checkbox" 
                checked={t.done} 
                onChange={() => onToggle(t.id)} 
                className="w-4 h-4 text-green-600 rounded border-green-300 focus:ring-green-500" 
              />
              <div className={`flex-1 min-w-0 ${t.done ? 'line-through text-slate-400' : ''}`}>
                <div className="truncate font-medium text-slate-700">{t.text}</div>
                {t.due && (
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    <i className="bi bi-calendar-event text-[8px]"></i> Due {t.due}
                  </div>
                )}
              </div>
              <button 
                onClick={() => onRemove(t.id)} 
                className="text-red-400 hover:text-red-600 text-xs p-1 hover:bg-red-50 rounded-lg transition-colors"
              >
                <i className="bi bi-trash"></i>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

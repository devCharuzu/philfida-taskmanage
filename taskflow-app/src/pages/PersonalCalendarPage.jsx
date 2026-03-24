import { useState, useEffect, useRef } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import NotificationBell from '../components/NotificationBell'
import SettingsModal from '../components/SettingsModal'
import EditProfileModal from '../components/EditProfileModal'
import PresenceToggle from '../components/PresenceToggle'
import PersonalCalendarSide from '../components/PersonalCalendarSide'

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

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState(new Date())
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
    const tasks = (globalData.tasks || []).filter(t => String(t.EmployeeID) === String(session.ID) && String(t.Archived).toUpperCase() !== 'TRUE')

    // Build completed ranges
    const ranges = tasks
      .filter(t => String(t.Status).toLowerCase() === 'completed' && (t.Deadline || t.StartDate))
      .map(t => ({ id: t.TaskID, start: t.StartDate || t.Deadline, end: t.Deadline }))
    setCompletedRanges(ranges)

    // Sync active (non-completed) tasks as events on their deadlines
    setEvents(prev => {
      const next = {}
      // copy previous non-task events
      for (const k of Object.keys(prev || {})) {
        next[k] = (prev[k] || []).filter(e => !String(e.id).startsWith('task-'))
        if (next[k].length === 0) delete next[k]
      }

      tasks.forEach(t => {
        if (String(t.Status).toLowerCase() === 'completed') return
        if (!t.Deadline) return
        try {
          const key = new Date(t.Deadline).toISOString().slice(0,10)
          const ev = { id: `task-${t.TaskID}`, title: t.Title || 'Task' }
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
    const t = new Date()
    setYear(t.getFullYear()); setMonth(t.getMonth()); setSelectedDate(new Date())
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
    <div className="h-dvh flex overflow-hidden" style={{ background: '#f0f4f0' }}>

      {/* SIDEBAR */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col flex-shrink-0 h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0a2e0a,#155414)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src="/philfida-logo.png" alt="PhilFIDA" className="w-6 h-6 object-contain"
                onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style="font-size:9px;font-weight:900;color:#155414;">PF</span>' }} />
            </div>
            <span className="text-white font-bold text-xs truncate">PhilFIDA TaskFlow</span>
          </div>
          <NotificationBell />
        </div>

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
              <button onClick={() => { useStore.getState().clearSession(); window.location.href = '/' }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors text-left">
                <i className="bi bi-box-arrow-left text-base" /> Sign Out
              </button>
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
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

        <div className="p-3 border-t border-slate-100 space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-2">Quick Stats</p>
          {[
            { label: 'Active Tasks', val: (globalData?.tasks||[]).filter(t => String(t.EmployeeID) === String(session?.ID) && t.Status !== 'Completed').length, color: 'bg-amber-500' },
            { label: 'Completed',    val: (globalData?.tasks||[]).filter(t => String(t.EmployeeID) === String(session?.ID) && t.Status === 'Completed').length, color: 'bg-emerald-600' },
            { label: 'Total',        val: (globalData?.tasks||[]).filter(t => String(t.EmployeeID) === String(session?.ID)).length, color: 'bg-green-600' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2 px-1">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.color}`} />
              <span className="text-xs text-slate-500 flex-1">{s.label}</span>
              <span className="text-xs font-bold text-slate-700">{s.val}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-green-800 rounded-full flex items-center justify-center overflow-hidden">
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
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0 gap-2 min-w-0">
          <div className="min-w-0">
            <h2 className="font-bold text-green-900 text-base sm:text-lg leading-none">My Calendar</h2>
            <p className="text-slate-400 text-xs mt-1 truncate">Personal calendar and todo list</p>
            {/* month navigation moved below header */}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <PresenceToggle value={presence} userId={session?.ID} onChange={setPresence} />
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-4 md:px-6 py-4 pb-20 md:pb-4">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <button onClick={prevMonth} className="btn-ghost px-2 py-1 text-sm rounded">
                    <i className="bi bi-chevron-left" />
                  </button>
                  <div className="relative">
                    <button onClick={() => setShowMonthPicker(s => !s)} className="btn-ghost px-3 py-1 text-sm rounded flex items-center gap-2">
                      <span className="font-semibold">{new Date(year, month, 1).toLocaleString('default', { month: 'long' })} {year}</span>
                      <i className="bi bi-caret-down-fill text-xs text-slate-400" />
                    </button>
                    {showMonthPicker && (
                      <div className="absolute mt-2 bg-white border border-slate-200 rounded shadow p-3 z-40 w-44">
                        <div className="grid grid-cols-3 gap-1 mb-2">
                          {Array.from({length:12}).map((_,mi) => (
                            <button key={mi} onClick={() => { setMonth(mi); setShowMonthPicker(false) }} className={`text-xs py-1 rounded ${mi===month? 'bg-green-50 text-green-700' : 'hover:bg-slate-50'}`}> {new Date(0,mi).toLocaleString('default',{month:'short'})} </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setYear(y => y-1) }} className="btn-ghost px-2 py-1">-</button>
                          <input type="number" value={year} onChange={e => setYear(Number(e.target.value)||year)} className="input w-20 text-sm" />
                          <button onClick={() => { setYear(y => y+1) }} className="btn-ghost px-2 py-1">+</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={nextMonth} className="btn-ghost px-2 py-1 text-sm rounded">
                    <i className="bi bi-chevron-right" />
                  </button>
                </div>
                <div>
                  <button onClick={goToday} className="btn-ghost px-3 py-1 text-sm rounded">Today</button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-[12px] text-slate-500 mb-2">
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <div key={d} className="text-center font-semibold">{d}</div>)}
              </div>
              <div>
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
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
                      return (
                        <button key={di} onClick={() => setSelectedDate(new Date(d))}
                          className={`p-2 h-20 text-left rounded-lg border ${isCompletedRange ? 'bg-slate-100 text-slate-400 opacity-80' : (inMonth ? 'bg-white' : 'bg-slate-50 text-slate-300')} ${iso === selectedDate.toISOString().slice(0,10) ? 'ring-2 ring-green-300' : ''}`}>
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-semibold">{d.getDate()}</div>
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            {monthEvents(d).slice(0,3).map(ev => (
                              <div key={ev.id} className="truncate">• {ev.title}</div>
                            ))}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            <aside className="bg-white rounded-xl shadow-sm p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-slate-700 text-sm">Events on {selectedDate.toDateString()}</h3>
                <EventList events={events[new Date(selectedDate).toISOString().slice(0,10)] || []} onAdd={addEvent} onRemove={removeEvent} dateKey={new Date(selectedDate).toISOString().slice(0,10)} />
              </div>

              <div>
                <h3 className="font-semibold text-slate-700 text-sm">My Todo List</h3>
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
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Event title" className="input flex-1" />
        <button onClick={() => { if (!text) return; onAdd(text, dateKey); setText('') }} className="btn-primary">Add</button>
      </div>
      <div className="space-y-1 max-h-36 overflow-auto">
        {events.length === 0 ? <div className="text-xs text-slate-400">No events.</div> : events.map(ev => (
          <div key={ev.id} className="flex items-center justify-between text-sm">
            <div className="truncate">{ev.title}</div>
            <div className="flex items-center gap-2">
              <button onClick={() => onRemove(dateKey, ev.id)} className="text-red-500 text-xs">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TodoList({ todos, onAdd, onToggle, onRemove }) {
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="New todo" className="input flex-1" />
        <input type="date" value={due} onChange={e => setDue(e.target.value)} className="input w-36" />
        <button onClick={() => { if (!text) return; onAdd(text, due || null); setText(''); setDue('') }} className="btn-primary">Add</button>
      </div>
      <div className="space-y-2 max-h-52 overflow-auto">
        {todos.length === 0 ? <div className="text-xs text-slate-400">No todos.</div> : todos.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={t.done} onChange={() => onToggle(t.id)} className="w-4 h-4" />
              <div className={`${t.done ? 'line-through text-slate-400' : ''}`}>
                <div className="truncate w-48">{t.text}</div>
                {t.due && <div className="text-[11px] text-slate-400">Due {t.due}</div>}
              </div>
            </div>
            <button onClick={() => onRemove(t.id)} className="text-red-500 text-xs">Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}

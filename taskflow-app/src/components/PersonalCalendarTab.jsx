import { useState, useEffect, lazy, Suspense} from 'react'
import { updatePresence, uploadFiles, getSignedFileUrl, buildTravelStatus} from '../lib/api'

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
]
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// Manila timezone date formatter helpers
const getManilaDateString = (dateInput) => {
  if (!dateInput) return ''
  const d = new Date(dateInput)
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    return formatter.format(d)
  } catch (error) {
    return d.toISOString().split('T')[0]
  }
}

const LocationPicker = lazy(() => import('./LocationPicker'))

/** Task cards elsewhere show the document number, not the internal TaskID. */
function getDocNo(task) {
  return task?.DocumentNo || task?.Title?.match(/^\[\s*([^\]]+)\s*\]/)?.[1] || task?.TaskID || ''
}

export default function PersonalCalendarTab({ tasks, userId, onViewTask, showTaskDeadlines = true }) {
  // ── States ───────────────────────────────────────────────────
  const todayStr = getManilaDateString(new Date())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth()) // 0-indexed
  const [selectedDateStr, setSelectedDateStr] = useState('')
  const [reminders, setReminders] = useState([])
  const [liveTime, setLiveTime] = useState('')
  const [liveDate, setLiveDate] = useState('')
  const [selectedDetailTask, setSelectedDetailTask] = useState(null)
  
  // Reminder form states
  const [showAddForm, setShowAddForm] = useState(false)
  const [remTitle, setRemTitle] = useState('')
  const [remNotes, setRemNotes] = useState('')
  const [remTime, setRemTime] = useState('08:00')
  const [remColor, setRemColor] = useState('gold') // gold, blue, red, green

  // Automated Presence States
  const [remType, setRemType] = useState('normal') // normal, travel, leave
  const [travelActivity, setTravelActivity] = useState('')
  const [travelLocation, setTravelLocation] = useState('')
  const [travelGeo, setTravelGeo] = useState(null)   // { lat, lng } once pinned
  const [leaveType, setLeaveType] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [returnTime, setReturnTime] = useState('17:00')

  // Editing and Attachment States
  const [reminderToDelete, setReminderToDelete] = useState(null)
  const [editingReminderId, setEditingReminderId] = useState(null)
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [remAttachments, setRemAttachments] = useState('') // pipe separated string

  // Sync returnDate when active calendar date changes
  useEffect(() => {
    if (selectedDateStr) {
      setReturnDate(selectedDateStr)
    }
  }, [selectedDateStr])

  // ── Manila Live Clock ──────────────────────────────────────────
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setLiveTime(now.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }))
      setLiveDate(now.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  // Expiry and activation both live in checkAndApplyScheduledPresence(), which
  // every page runs on a 30s timer. A second copy used to run here whenever the
  // calendar tab was mounted, so two writers raced on the same reminder list and
  // on Users.Status — one of them clearing `applied` while the other set it.
  // Removed; this component now only reads the list.

  // ── Load & Persist Reminders ──────────────────────────────────
  useEffect(() => {
    if (!userId) return
    const loadReminders = () => {
      const stored = localStorage.getItem(`philfida_calendar_reminders_${userId}`)
      if (stored) {
        try { setReminders(JSON.parse(stored)) } catch (e) { console.error(e) }
      }
    }
    loadReminders()
    window.addEventListener('storage', loadReminders)
    window.addEventListener('presence-reminders-changed', loadReminders)
    return () => {
      window.removeEventListener('storage', loadReminders)
      window.removeEventListener('presence-reminders-changed', loadReminders)
    }
  }, [userId])

  const saveReminders = (updated) => {
    setReminders(updated)
    if (userId) {
      localStorage.setItem(`philfida_calendar_reminders_${userId}`, JSON.stringify(updated))
      window.dispatchEvent(new Event('storage'))
      window.dispatchEvent(new Event('presence-reminders-changed'))
    }
  }

  // Get today's date string in Manila time zone
  const getTodayManilaString = () => {
    return getManilaDateString(new Date())
  }

  // Set default selected date to Today on initial load
  useEffect(() => {
    setSelectedDateStr(getTodayManilaString())
  }, [])

  // ── Calendar Calculations ────────────────────────────────────
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay()

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(prev => prev - 1)
    } else {
      setCurrentMonth(prev => prev - 1)
    }
  }

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(prev => prev + 1)
    } else {
      setCurrentMonth(prev => prev + 1)
    }
  }

  const handleGoToToday = () => {
    const today = new Date()
    setCurrentMonth(today.getMonth())
    setCurrentYear(today.getFullYear())
    setSelectedDateStr(getTodayManilaString())
  }

  // Create active month days grid data
  const gridCells = []
  
  // Fill offset days (from previous month)
  for (let i = 0; i < firstDayIndex; i++) {
    gridCells.push({ isSpacer: true, key: `spacer-${i}` })
  }

  // Active month days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(currentYear, currentMonth, day)
    const dateStr = getManilaDateString(dateObj)
    gridCells.push({
      isSpacer: false,
      day,
      dateStr,
      key: `day-${day}`
    })
  }

  // Match tasks & reminders to date
  const getTasksForDate = (dateStr) => {
    return tasks.filter(t => t.Deadline && getManilaDateString(t.Deadline) === dateStr)
  }

  const getRemindersForDate = (dateStr) => {
    return reminders.filter(r => r.date === dateStr).sort((a, b) => a.time.localeCompare(b.time))
  }

  // ── Reminder Handlers ─────────────────────────────────────────
  const handleAddReminder = (e) => {
    e.preventDefault()
    
    if (selectedDateStr < todayStr) {
      alert("You cannot add or edit reminders on past dates.")
      return
    }

    if (remType === 'travel' || remType === 'leave') {
      const S1 = selectedDateStr
      const E1 = returnDate || selectedDateStr

      const hasOverlap = reminders.some(r => {
        if (editingReminderId && r.id === editingReminderId) return false
        if (r.type !== 'travel' && r.type !== 'leave') return false
        
        const S2 = r.date
        const E2 = r.returnDate || r.date
        return S1 <= E2 && S2 <= E1
      })

      if (hasOverlap) {
        alert(`You already have a scheduled Official Travel or Leave that overlaps with this date range (${S1} to ${E1}). You cannot add duplicate or overlapping availability reminders.`)
        return
      }

      const confirmed = window.confirm(`Note: Scheduling this ${remType === 'travel' ? 'Official Travel' : 'Leave'} presence reminder will automatically update/change your active availability status in your Profile to match this schedule. Do you want to proceed?`)
      if (!confirmed) return
    }
    
    let titleToSave = remTitle.trim()
    let notesToSave = remNotes.trim()
    let finalColor = remColor

    if (remType === 'travel') {
      if (!travelActivity.trim() || !travelLocation.trim() || !returnDate) return
      titleToSave = `Official Travel: ${travelActivity.trim()} at ${travelLocation.trim()}`
      notesToSave = `Official Travel schedule. Start: ${selectedDateStr} ${remTime}. Return: ${returnDate} ${returnTime}.`
      finalColor = 'blue'
    } else if (remType === 'leave') {
      if (!leaveType || !leaveReason.trim() || !returnDate) return
      titleToSave = `On Leave: ${leaveType} — ${leaveReason.trim()}`
      notesToSave = `Leave schedule. Start: ${selectedDateStr} ${remTime}. Return: ${returnDate} ${returnTime}.`
      finalColor = 'red'
    } else {
      if (!titleToSave) return
    }

    let updated;
    if (editingReminderId) {
      updated = reminders.map(r => {
        if (r.id === editingReminderId) {
          const startDateTime = `${selectedDateStr} ${remTime}`
          
          // Get true current time in Asia/Manila (Philippines Standard Time)
          const now = new Date()
          let manilaNowStr = ''
          try {
            const formatter = new Intl.DateTimeFormat('en-US', {
              timeZone: 'Asia/Manila',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            })
            const parts = formatter.formatToParts(now)
            const map = {}
            parts.forEach(p => { map[p.type] = p.value })
            manilaNowStr = `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`
          } catch (error) {
            manilaNowStr = getManilaDateString(now) + ' 08:00'
          }

          let isCurrentlyApplied = r.applied
          if ((remType === 'travel' || remType === 'leave') && (r.applied || manilaNowStr >= startDateTime)) {
            let fullStatus = ''
            if (remType === 'travel') {
              fullStatus = buildTravelStatus({
                activity: travelActivity.trim(),
                location: travelLocation.trim(),
                dateRange: `${selectedDateStr} ${remTime} to ${returnDate} ${returnTime}`,
                lat: travelGeo?.lat, lng: travelGeo?.lng,
              })
            } else {
              fullStatus = `On Leave — ${leaveType}: ${leaveReason.trim()} (${selectedDateStr} ${remTime} to ${returnDate} ${returnTime})`
            }
            // Surface a failed write instead of marking it applied silently —
            // the reminder would otherwise look active to this user while the
            // database, and so every other account, still held the old status.
            updatePresence(userId, fullStatus).catch(err => {
              console.error('Realtime edit presence fail:', err)
              window.alert(`Saved to your calendar, but your availability could not be updated.\n\n${err.message || 'Please try again.'}`)
            })
            isCurrentlyApplied = true
          }

          return {
            ...r,
            title: titleToSave,
            notes: notesToSave,
            time: remTime,
            timeEnd: remType !== 'normal' ? returnTime : undefined,
            date: selectedDateStr,
            color: finalColor,
            type: remType,
            travelActivity: remType === 'travel' ? travelActivity.trim() : undefined,
            travelLocation: remType === 'travel' ? travelLocation.trim() : undefined,
            travelLat: remType === 'travel' ? (travelGeo?.lat ?? null) : undefined,
            travelLng: remType === 'travel' ? (travelGeo?.lng ?? null) : undefined,
            leaveType: remType === 'leave' ? leaveType : undefined,
            leaveReason: remType === 'leave' ? leaveReason.trim() : undefined,
            returnDate: remType !== 'normal' ? returnDate : undefined,
            attachments: remAttachments,
            applied: isCurrentlyApplied
          }
        }
        return r
      })
    } else {
      const startDateTime = `${selectedDateStr} ${remTime}`
      const now = new Date()
      let manilaNowStr = ''
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Manila',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        })
        const parts = formatter.formatToParts(now)
        const map = {}
        parts.forEach(p => { map[p.type] = p.value })
        manilaNowStr = `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`
      } catch (error) {
        manilaNowStr = getManilaDateString(now) + ' 08:00'
      }

      let isCurrentlyApplied = false
      if ((remType === 'travel' || remType === 'leave') && manilaNowStr >= startDateTime) {
        let fullStatus = ''
        if (remType === 'travel') {
          fullStatus = buildTravelStatus({
            activity: travelActivity.trim(),
            location: travelLocation.trim(),
            dateRange: `${selectedDateStr} ${remTime} to ${returnDate} ${returnTime}`,
            lat: travelGeo?.lat, lng: travelGeo?.lng,
          })
        } else {
          fullStatus = `On Leave — ${leaveType}: ${leaveReason.trim()} (${selectedDateStr} ${remTime} to ${returnDate} ${returnTime})`
        }
        // Same here: a failed write must not pass for success.
        updatePresence(userId, fullStatus).catch(err => {
          console.error('Realtime add presence fail:', err)
          window.alert(`Saved to your calendar, but your availability could not be updated.\n\n${err.message || 'Please try again.'}`)
        })
        isCurrentlyApplied = true
        window.dispatchEvent(new CustomEvent('presence-auto-updated', {
          detail: { status: fullStatus }
        }))
      }

      const newReminder = {
        id: Date.now().toString(),
        title: titleToSave,
        notes: notesToSave,
        time: remTime,
        timeEnd: remType !== 'normal' ? returnTime : undefined,
        date: selectedDateStr,
        color: finalColor,
        type: remType,
        travelActivity: remType === 'travel' ? travelActivity.trim() : undefined,
        travelLocation: remType === 'travel' ? travelLocation.trim() : undefined,
        travelLat: remType === 'travel' ? (travelGeo?.lat ?? null) : undefined,
        travelLng: remType === 'travel' ? (travelGeo?.lng ?? null) : undefined,
        leaveType: remType === 'leave' ? leaveType : undefined,
        leaveReason: remType === 'leave' ? leaveReason.trim() : undefined,
        returnDate: remType !== 'normal' ? returnDate : undefined,
        attachments: remAttachments,
        applied: isCurrentlyApplied
      }
      updated = [...reminders, newReminder]
    }

    saveReminders(updated)

    // Reset Form
    setRemTitle('')
    setRemNotes('')
    setRemTime('08:00')
    setRemColor('gold')
    setRemType('normal')
    setTravelActivity('')
    setTravelLocation(''); setTravelGeo(null)
    setLeaveType('')
    setLeaveReason('')
    setRemAttachments('')
    setEditingReminderId(null)
    setShowAddForm(false)
  }

  const handleEditReminderClick = (r) => {
    setEditingReminderId(r.id)
    setRemTitle(r.type === 'normal' ? r.title : '')
    setRemNotes(r.type === 'normal' ? r.notes : '')
    setRemTime(r.time)
    setRemColor(r.color)
    setRemType(r.type || 'normal')
    setTravelActivity(r.travelActivity || '')
    setTravelLocation(r.travelLocation || '')
    setTravelGeo(r.travelLat != null && r.travelLng != null ? { lat: r.travelLat, lng: r.travelLng } : null)
    setLeaveType(r.leaveType || '')
    setLeaveReason(r.leaveReason || '')
    setReturnDate(r.returnDate || r.date)
    setReturnTime(r.timeEnd || '17:00')
    setRemAttachments(r.attachments || '')
    setShowAddForm(true)
  }

  const handleFileChange = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploadingFiles(true)
    try {
      const paths = await uploadFiles(files)
      if (paths) {
        setRemAttachments(prev => prev ? `${prev}|${paths}` : paths)
      }
    } catch (err) {
      alert(`Upload failed: ${err.message}`)
    } finally {
      setUploadingFiles(false)
    }
  }

  const handleRemoveAttachment = (pathToRemove) => {
    const updated = remAttachments.split('|').filter(p => p !== pathToRemove).join('|')
    setRemAttachments(updated)
  }

  const handleDeleteReminder = (id) => {
    const target = reminders.find(r => r.id === id)
    if (!target) return
    if (target.type === 'travel' || target.type === 'leave') {
      setReminderToDelete(target)
    } else {
      const updated = reminders.filter(r => r.id !== id)
      saveReminders(updated)
    }
  }

  // Monthly stats
  const activeMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
  const monthlyTasksCount = tasks.filter(t => t.Deadline && getManilaDateString(t.Deadline).startsWith(activeMonthStr)).length
  const monthlyRemindersCount = reminders.filter(r => r.date.startsWith(activeMonthStr)).length
  const selectedDayEventsCount = getTasksForDate(selectedDateStr).length + getRemindersForDate(selectedDateStr).length

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      
      {/* ── HEADER ── */}
      <div className="px-4 md:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h1 className="mb-0 text-lg sm:text-xl font-bold tracking-tight leading-snug text-slate-900">
            Personal Calendar &amp; Reminders
          </h1>
        </div>

        {/* Stats strip */}
        <div className="flex gap-6 mt-4 pt-4 border-t border-slate-100 flex-wrap">
          {showTaskDeadlines && (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Month Task Deadlines: <strong className="text-slate-800">{monthlyTasksCount}</strong></span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Month Reminders: <strong className="text-slate-800">{monthlyRemindersCount}</strong></span>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT GRID ── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 pt-5 pb-6 custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-7xl mx-auto">

          {/* Left Column: Interactive Calendar (7 Cols) */}
          <div className="md:col-span-7 xl:col-span-8 bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5 flex flex-col h-fit">
            
            {/* Calendar Control Bar */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-1">
                <h3 className="font-black text-slate-800 text-base uppercase tracking-tight">
                  {MONTH_NAMES[currentMonth]} {currentYear}
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={handlePrevMonth} className="btn-ghost p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-green-800 transition-colors">
                  <i className="bi bi-chevron-left text-sm font-bold" />
                </button>
                <button onClick={handleGoToToday} className="px-3 py-1.5 bg-slate-100 hover:bg-green-50 text-slate-600 hover:text-green-800 text-[10px] font-black uppercase rounded-lg border border-slate-200/60 transition-all active:scale-95">
                  Today
                </button>
                <button onClick={handleNextMonth} className="btn-ghost p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-green-800 transition-colors">
                  <i className="bi bi-chevron-right text-sm font-bold" />
                </button>
              </div>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {DAY_NAMES.map(name => (
                <div key={name} className="text-[10px] font-black text-slate-400 uppercase tracking-widest py-1 select-none">
                  {name}
                </div>
              ))}
            </div>

            {/* Calendar Day Grid */}
            <div className="grid grid-cols-7 gap-1 flex-1">
              {gridCells.map((cell) => {
                if (cell.isSpacer) {
                  return <div key={cell.key} className="aspect-square bg-slate-50/20 rounded-xl" />
                }

                const dayTasks = getTasksForDate(cell.dateStr)
                const dayReminders = getRemindersForDate(cell.dateStr)
                const isSelected = selectedDateStr === cell.dateStr
                const isToday = todayStr === cell.dateStr
                const hasTasks = dayTasks.length > 0
                const hasReminders = dayReminders.length > 0

                // Premium visual styling based on content
                let cellClasses = 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                if (isSelected) {
                  cellClasses = 'border-green-600 ring-2 ring-green-600/10 bg-green-50/20 shadow-sm'
                } else if (isToday) {
                  cellClasses = 'border-green-300 bg-green-50/10 hover:border-green-500'
                } else if (hasTasks) {
                  const hasActive = dayTasks.some(t => String(t.Archived).toUpperCase() !== 'TRUE')
                  if (hasActive) {
                    cellClasses = 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-400 hover:bg-emerald-50/60 shadow-sm'
                  } else {
                    cellClasses = 'border-slate-200 bg-slate-100/10 hover:border-slate-300 hover:bg-slate-100/30 border-dashed opacity-75 shadow-sm'
                  }
                } else if (hasReminders) {
                  cellClasses = 'border-amber-100 bg-amber-50/20 hover:border-amber-300 hover:bg-amber-50/40 shadow-sm'
                }

                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => { setSelectedDateStr(cell.dateStr); setShowAddForm(false) }}
                    className={`aspect-square relative rounded-xl border flex flex-col p-1.5 sm:p-2.5 items-start justify-between transition-all group overflow-hidden ${cellClasses}`}
                  >
                    
                    {/* Top row: Day number & mini-badge */}
                    <div className="w-full flex items-center justify-between">
                      <span className={`text-[11px] sm:text-xs font-black select-none rounded-md px-1.5 py-0.5 leading-none transition-colors
                        ${isToday 
                          ? 'bg-gradient-to-r from-[#016837] to-[#027a42] text-white font-black' 
                          : isSelected 
                            ? 'text-green-900 font-black' 
                            : hasTasks
                              ? 'text-emerald-950 font-black bg-emerald-100/60'
                              : 'text-slate-600 font-bold group-hover:text-green-800'}`}
                      >
                        {cell.day}
                      </span>

                      {/* Premium Content Badges for high visibility */}
                      {hasTasks ? (
                        (() => {
                          const hasActive = dayTasks.some(t => String(t.Archived).toUpperCase() !== 'TRUE')
                          return (
                            <span className={`text-[7px] sm:text-[9px] font-black uppercase px-1 sm:px-1.5 py-0.5 rounded shadow-sm tracking-tighter select-none leading-none scale-90 sm:scale-100
                              ${hasActive ? 'bg-emerald-600 text-white' : 'bg-slate-400 text-white opacity-80'}`}>
                              <span className="hidden xs:inline">{dayTasks.length} {dayTasks.length === 1 ? 'Task' : 'Tasks'}</span>
                              <span className="xs:hidden">{dayTasks.length}T</span>
                            </span>
                          )
                        })()
                      ) : hasReminders ? (
                        <span className="text-[7px] sm:text-[9px] font-black uppercase bg-amber-500 text-white px-1 sm:px-1.5 py-0.5 rounded shadow-sm tracking-tighter select-none leading-none scale-90 sm:scale-100">
                          <span className="hidden xs:inline">{dayReminders.length} Rem</span>
                          <span className="xs:hidden">{dayReminders.length}R</span>
                        </span>
                      ) : null}
                    </div>

                    {/* Bottom: Inline details/previews inside the calendar grid on larger devices */}
                    {hasTasks && (
                      <div className="w-full mt-2 hidden lg:block overflow-hidden text-left pointer-events-none">
                        <p className={`text-[8px] font-bold truncate leading-tight ${dayTasks.some(t => String(t.Archived).toUpperCase() !== 'TRUE') ? 'text-emerald-800' : 'text-slate-500 italic'}`}>
                          {dayTasks[0].Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim()}
                        </p>
                        {dayTasks.length > 1 && (
                          <p className="text-[7px] text-slate-400 font-semibold mt-0.5 tracking-tight">
                            + {dayTasks.length - 1} more deadline{dayTasks.length > 2 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    )}

                    {!hasTasks && hasReminders && (
                      <div className="w-full mt-2 hidden lg:block overflow-hidden text-left pointer-events-none">
                        <p className="text-[8px] font-bold text-amber-800 truncate leading-tight">
                          {dayReminders[0].title}
                        </p>
                        {dayReminders.length > 1 && (
                          <p className="text-[7px] text-amber-600 font-semibold mt-0.5 tracking-tight">
                            + {dayReminders.length - 1} more item{dayReminders.length > 2 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right Column: Events & Reminders for selected day (5 Cols) */}
          <div className="md:col-span-5 xl:col-span-4 space-y-4">
            
            {/* Clock Panel */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 bg-gradient-to-br from-[#014d2a] to-[#027a42] text-white px-4 py-3">
                <div className="text-center border-r border-white/20 pr-3">
                  <span className="text-[9px] font-black uppercase tracking-widest text-green-300 block mb-0.5">Manila Time (PST)</span>
                  <span className="text-lg font-black font-mono tracking-tight text-white">{liveTime || '00:00:00 AM'}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-[8px] font-black uppercase tracking-wider text-green-300 block">Current Date</span>
                  <span className="text-[11px] font-bold text-white leading-tight truncate">{liveDate || 'Loading date...'}</span>
                </div>
              </div>
            </div>

            {/* Schedule & Details Panel */}
            <div className="bg-white border-l-4 border-l-green-700 border-y border-r border-slate-200 rounded-2xl shadow-md overflow-hidden flex flex-col h-fit">
              
              {/* Selected Date Header */}
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="min-w-0">
                  <h4 className="font-black text-slate-800 text-[10px] uppercase tracking-widest leading-none">Schedule &amp; Details</h4>
                  <p className="text-slate-500 text-xs font-bold mt-1.5 truncate">
                    {new Date(selectedDateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[9px] font-black rounded-lg uppercase">
                  {selectedDayEventsCount} {selectedDayEventsCount === 1 ? 'Event' : 'Events'}
                </span>
              </div>

            {/* Content list */}
            <div className="p-5 space-y-4">
              
              {/* ── Deadlines Section ── */}
              {showTaskDeadlines && (
              <div>
                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Assigned Deadlines
                </h5>
                
                {getTasksForDate(selectedDateStr).length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic py-1 bg-slate-50/50 rounded-lg px-2 text-center border border-slate-100">No deadlines scheduled today.</p>
                ) : (
                  <div className="space-y-2">
                    {getTasksForDate(selectedDateStr).map(t => {
                      const isArchived = String(t.Archived).toUpperCase() === 'TRUE'
                      return (
                        <div 
                          key={t.TaskID} 
                          className={`border rounded-xl p-3 transition-all flex flex-col gap-2 relative group cursor-pointer hover:shadow-sm
                            ${isArchived 
                              ? 'bg-slate-50/40 border-slate-200 border-dashed opacity-75 hover:opacity-100 hover:border-slate-300' 
                              : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}
                          onClick={() => setSelectedDetailTask(t)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isArchived && (
                                <span className="text-[8px] font-black uppercase bg-slate-200 border border-slate-300 text-slate-500 px-1.5 py-0.5 rounded leading-none flex items-center gap-0.5 select-none">
                                  <i className="bi bi-archive-fill" /> Archived
                                </span>
                              )}
                            </div>
                            <span className={`text-[8px] font-black uppercase px-1 py-0.5 rounded leading-none
                              ${t.Priority === 'Urgent' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-slate-100 text-slate-600'}`}>
                              {t.Priority || 'Normal'}
                            </span>
                          </div>
                          <p className={`text-xs font-bold leading-tight ${isArchived ? 'text-slate-500 italic' : 'text-slate-800'}`}>
                            {t.Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || t.Title}
                          </p>
                          <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-1">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Status: <strong className="text-slate-600">{t.Status}</strong></span>
                            
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isArchived) {
                                  setSelectedDetailTask(t)
                                } else {
                                  onViewTask?.(t.TaskID, t.Title)
                                }
                              }}
                              className="text-[9px] font-black uppercase text-green-700 hover:text-green-900 flex items-center gap-0.5 select-none"
                            >
                              {isArchived ? 'View Details' : 'Jump to task'} <i className="bi bi-arrow-right-short text-base leading-none" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              )}

              {/* ── Reminders Section ── */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2.5">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Personal Reminders
                  </h5>
                  {!showAddForm && (
                    selectedDateStr >= todayStr ? (
                      <button onClick={() => setShowAddForm(true)} className="text-[9px] font-black uppercase text-green-700 hover:text-green-900 flex items-center gap-1 select-none">
                        <i className="bi bi-plus-circle" /> Add New
                      </button>
                    ) : (
                      <span className="text-[9px] font-black uppercase text-slate-400 italic flex items-center gap-1 select-none cursor-not-allowed" title="Reminders cannot be scheduled for past dates.">
                        <i className="bi bi-lock-fill text-slate-300" /> Past Date
                      </span>
                    )
                  )}
                </div>

                {/* Add Form Inside Panel */}
                {showAddForm && (
                  <form onSubmit={handleAddReminder} className="bg-slate-50/80 border border-green-200/80 rounded-xl p-3.5 space-y-3 mb-3 animate-in-up">
                    <div className="flex items-center justify-between border-b border-green-100 pb-1.5 mb-1">
                      <span className="text-[10px] font-black text-green-800 uppercase tracking-wide">{editingReminderId ? 'Edit Reminder' : 'Create Reminder'}</span>
                      <button 
                        type="button" 
                        onClick={() => {
                          setRemTitle('')
                          setRemNotes('')
                          setRemTime('08:00')
                          setRemColor('gold')
                          setRemType('normal')
                          setTravelActivity('')
                          setTravelLocation(''); setTravelGeo(null)
                          setLeaveType('')
                          setLeaveReason('')
                          setRemAttachments('')
                          setEditingReminderId(null)
                          setShowAddForm(false)
                        }} 
                        className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                      >
                        &times;
                      </button>
                    </div>

                    {/* Category Selector */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Set Availability in Advance?</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => { setRemType('normal'); setRemColor('gold') }}
                          className={`py-1.5 px-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase border transition-all text-center flex items-center justify-center gap-1
                            ${remType === 'normal' ? 'bg-amber-500 text-white border-amber-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        >
                          Normal
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRemType('travel'); setRemColor('blue') }}
                          className={`py-1.5 px-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase border transition-all text-center flex items-center justify-center gap-1
                            ${remType === 'travel' ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        >
                          <i className="bi bi-airplane-fill" /> Travel
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRemType('leave'); setRemColor('red') }}
                          className={`py-1.5 px-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase border transition-all text-center flex items-center justify-center gap-1
                            ${remType === 'leave' ? 'bg-red-500 text-white border-red-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        >
                          <i className="bi bi-calendar-x-fill" /> Leave
                        </button>
                      </div>
                    </div>

                    {/* Conditional Fields based on Category */}
                    {remType === 'normal' && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Title *</label>
                          <input
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:ring-1 focus:ring-green-500 outline-none"
                            placeholder="e.g. Prepare Accomplishment Report"
                            value={remTitle}
                            onChange={e => setRemTitle(e.target.value)}
                            required
                            autoFocus
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Time</label>
                            <input
                              type="time"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-green-500 outline-none"
                              value={remTime}
                              onChange={e => setRemTime(e.target.value)}
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Marker Theme</label>
                            <div className="flex items-center gap-1.5 h-8">
                              {['gold', 'blue', 'red', 'green'].map(c => {
                                const bgClass = 
                                  c === 'gold' ? 'bg-amber-500 ring-amber-300' :
                                  c === 'blue' ? 'bg-blue-500 ring-blue-300' :
                                  c === 'red' ? 'bg-red-500 ring-red-300' : 'bg-emerald-500 ring-emerald-300'
                                return (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => setRemColor(c)}
                                    className={`w-5 h-5 rounded-full transition-transform ${bgClass}
                                      ${remColor === c ? 'scale-125 ring-2 ring-offset-1' : 'hover:scale-110'}`}
                                  />
                                )
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Notes / Details <span className="text-slate-400 normal-case">(Optional)</span></label>
                          <textarea
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:ring-1 focus:ring-green-500 outline-none resize-none"
                            rows={2}
                            placeholder="Additional details or instructions..."
                            value={remNotes}
                            onChange={e => setRemNotes(e.target.value)}
                          />
                        </div>
                      </>
                    )}

                    {remType === 'travel' && (
                      <div className="space-y-3 bg-blue-50/40 p-3 rounded-xl border border-blue-100 animate-in-up">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-blue-800 uppercase tracking-wider block">Event / Activity Name *</label>
                          <input
                            className="w-full bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="e.g. Regional Fiber Industry Summit"
                            value={travelActivity}
                            onChange={e => setTravelActivity(e.target.value)}
                            required
                            autoFocus
                          />
                        </div>
                        <Suspense fallback={
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-blue-800 uppercase tracking-wider block">Location / Venue *</label>
                            <div className="h-[60px] rounded-lg border border-blue-200 bg-white animate-pulse" />
                          </div>
                        }>
                          <LocationPicker
                            value={travelLocation}
                            initialCoords={travelGeo}
                            onChange={({ address, lat, lng }) => {
                              setTravelLocation(address)
                              setTravelGeo(lat != null && lng != null ? { lat, lng } : null)
                            }}
                          />
                        </Suspense>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-blue-800 uppercase tracking-wider block">Start Time</label>
                            <input
                              type="time"
                              className="w-full bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                              value={remTime}
                              onChange={e => setRemTime(e.target.value)}
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-blue-800 uppercase tracking-wider block">Return Date *</label>
                            <input
                              type="date"
                              min={selectedDateStr}
                              className="w-full bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                              value={returnDate}
                              onChange={e => setReturnDate(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-blue-800 uppercase tracking-wider block">Return Time</label>
                          <input
                            type="time"
                            className="w-full bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                            value={returnTime}
                            onChange={e => setReturnTime(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    )}

                    {remType === 'leave' && (
                      <div className="space-y-3 bg-red-50/40 p-3 rounded-xl border border-red-100 animate-in-up">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-red-800 uppercase tracking-wider block">Type of Leave *</label>
                          <select
                            className="w-full bg-white border border-red-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-red-500 outline-none"
                            value={leaveType}
                            onChange={e => setLeaveType(e.target.value)}
                            required
                          >
                            <option value="">Select Leave</option>
                            <option value="Vacation Leave">Vacation Leave</option>
                            <option value="Sick Leave">Sick Leave</option>
                            <option value="Maternity Leave">Maternity Leave</option>
                            <option value="Paternity Leave">Paternity Leave</option>
                            <option value="Special Leave">Special Leave</option>
                            <option value="Emergency Leave">Emergency Leave</option>
                            <option value="Study Leave">Study Leave</option>
                            <option value="Others">Others</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-red-800 uppercase tracking-wider block">Reason / Details *</label>
                          <textarea
                            className="w-full bg-white border border-red-200 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:ring-1 focus:ring-red-500 outline-none resize-none"
                            rows={2}
                            placeholder="Brief reason for leave..."
                            value={leaveReason}
                            onChange={e => setLeaveReason(e.target.value)}
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-red-800 uppercase tracking-wider block">Start Time</label>
                            <input
                              type="time"
                              className="w-full bg-white border border-red-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-red-500 outline-none"
                              value={remTime}
                              onChange={e => setRemTime(e.target.value)}
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-red-800 uppercase tracking-wider block">Return Date *</label>
                            <input
                              type="date"
                              min={selectedDateStr}
                              className="w-full bg-white border border-red-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-red-500 outline-none"
                              value={returnDate}
                              onChange={e => setReturnDate(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-red-800 uppercase tracking-wider block">Return Time</label>
                          <input
                            type="time"
                            className="w-full bg-white border border-red-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:ring-1 focus:ring-red-500 outline-none"
                            value={returnTime}
                            onChange={e => setReturnTime(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    )}

                    {/* ── File Attachments ── */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">
                        Files &amp; Documentation <span className="text-slate-400 normal-case">(Optional)</span>
                      </label>
                      
                      {/* Upload Trigger Button */}
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer bg-white hover:bg-slate-50 border border-slate-200 hover:border-green-300 text-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 transition-all select-none shadow-sm">
                          <i className="bi bi-paperclip text-green-700 text-sm leading-none" />
                          {uploadingFiles ? 'Uploading...' : 'Attach Files'}
                          <input 
                            type="file" 
                            multiple 
                            onChange={handleFileChange} 
                            className="hidden" 
                            disabled={uploadingFiles}
                          />
                        </label>
                        {uploadingFiles && (
                          <span className="text-[9px] font-bold text-slate-400 animate-pulse flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping" /> Uploading to cloud...
                          </span>
                        )}
                      </div>

                      {/* Display Uploaded File List inside form */}
                      {remAttachments ? (
                        <div className="space-y-1 mt-2 max-h-24 overflow-y-auto">
                          {remAttachments.split('|').map((path, idx) => {
                            const fileName = path.split('/').pop().replace(/^\d+_([^_]+)/, '$1')
                            return (
                              <div key={idx} className="flex items-center justify-between bg-white border border-slate-100 rounded-md p-1 px-2 text-[9px] font-bold text-slate-600">
                                <span className="truncate max-w-[180px]">{fileName}</span>
                                <button 
                                  type="button" 
                                  onClick={() => handleRemoveAttachment(path)}
                                  className="text-red-500 hover:text-red-700 text-xs font-bold leading-none px-1 select-none"
                                >
                                  &times;
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setRemTitle('')
                          setRemNotes('')
                          setRemTime('08:00')
                          setRemColor('gold')
                          setRemType('normal')
                          setTravelActivity('')
                          setTravelLocation(''); setTravelGeo(null)
                          setLeaveType('')
                          setLeaveReason('')
                          setRemAttachments('')
                          setEditingReminderId(null)
                          setShowAddForm(false)
                        }}
                        className="px-2.5 py-1 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={uploadingFiles}
                        className={`px-3 py-1 bg-green-700 hover:bg-green-800 text-white text-[10px] font-black uppercase rounded-lg shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 ${uploadingFiles ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        Save
                      </button>
                    </div>
                  </form>
                )}

                {getRemindersForDate(selectedDateStr).length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic py-1 bg-slate-50/50 rounded-lg px-2 text-center border border-slate-100">No personal reminders set for today.</p>
                ) : (
                  <div className="space-y-2">
                    {getRemindersForDate(selectedDateStr).map(r => {
                      const colorThemeClass = 
                        r.color === 'gold' ? 'border-amber-200 bg-amber-50/30 text-amber-800 marker-amber' :
                        r.color === 'blue' ? 'border-blue-200 bg-blue-50/30 text-blue-800 marker-blue' :
                        r.color === 'red' ? 'border-red-200 bg-red-50/30 text-red-800 marker-red' :
                        'border-emerald-200 bg-emerald-50/30 text-emerald-800 marker-green'
                      
                      const dotColorClass = 
                        r.color === 'gold' ? 'bg-amber-500' :
                        r.color === 'blue' ? 'bg-blue-500' :
                        r.color === 'red' ? 'bg-red-500' : 'bg-emerald-500'

                      return (
                        <div key={r.id} className={`border rounded-xl p-3 flex items-start gap-3 relative group transition-all hover:shadow-sm ${colorThemeClass}`}>
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${dotColorClass}`} />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-black text-slate-500 font-mono tracking-tight">
                                  {r.type === 'travel' || r.type === 'leave' 
                                    ? `${r.time}${r.timeEnd ? ' - ' + r.timeEnd : ''}`
                                    : r.time}
                                </span>
                                {r.type === 'travel' && (
                                  <span className="text-[8px] font-black uppercase bg-blue-100 border border-blue-200 text-blue-800 px-1.5 py-0.5 rounded flex items-center gap-0.5 select-none leading-none">
                                    <i className="bi bi-airplane-fill" /> Travel
                                  </span>
                                )}
                                {r.type === 'leave' && (
                                  <span className="text-[8px] font-black uppercase bg-red-100 border border-red-200 text-red-800 px-1.5 py-0.5 rounded flex items-center gap-0.5 select-none leading-none">
                                    <i className="bi bi-calendar-x-fill" /> Leave
                                  </span>
                                )}
                                {r.applied && (
                                  <span className="text-[8px] font-black uppercase bg-emerald-100 border border-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded flex items-center gap-0.5 select-none leading-none">
                                    <i className="bi bi-patch-check-fill animate-pulse" /> Active Presence
                                  </span>
                                )}
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2 flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleEditReminderClick(r)}
                                  className="text-slate-400 hover:text-green-700 text-xs p-1 leading-none select-none"
                                  title="Edit reminder"
                                >
                                  <i className="bi bi-pencil-fill" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteReminder(r.id)}
                                  className="text-slate-400 hover:text-red-600 text-xs p-1 leading-none select-none font-bold"
                                  title="Remove reminder"
                                >
                                  &times;
                                </button>
                              </div>
                            </div>
                            <p className="text-xs font-black text-slate-800 leading-tight mt-1.5">{r.title}</p>
                            {r.notes && (
                              <p className="text-[10px] text-slate-500 leading-normal font-medium mt-1 pr-4">{r.notes}</p>
                            )}
                            
                            {/* Render Attached Files */}
                            {r.attachments ? (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {r.attachments.split('|').map((path, idx) => (
                                  <SignedAttachmentLink key={idx} path={path} />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
          </div>

        </div>
      </div>

      {/* ── Task Details Modal ── */}
      {selectedDetailTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in-up">
            
            {/* Modal Header — same pattern as the other standardised modals */}
            <div className="flex items-center gap-3 px-6 py-4 rounded-t-2xl bg-green-800">
              <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0">
                <i className="bi bi-clipboard-check text-white text-base" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-0 truncate text-white font-semibold text-[15px] leading-tight tracking-tight">
                  {selectedDetailTask.Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || selectedDetailTask.Title}
                </p>
                <p className="mb-0 mt-0.5 truncate text-green-100/80 text-[11px] font-medium leading-tight">
                  {getDocNo(selectedDetailTask)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailTask(null)}
                aria-label="Close"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <i className="bi bi-x-lg text-sm" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              
              {/* Status chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1
                  ${selectedDetailTask.Priority === 'Urgent'
                    ? 'bg-red-50 text-red-700 ring-red-200'
                    : 'bg-slate-50 text-slate-700 ring-slate-200'}`}>
                  {selectedDetailTask.Priority || 'Normal'}
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                  {selectedDetailTask.Category || 'General'}
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1
                  ${selectedDetailTask.Status === 'Completed'
                    ? 'bg-green-50 text-green-700 ring-green-200'
                    : selectedDetailTask.Status === 'Received'
                      ? 'bg-blue-50 text-blue-700 ring-blue-200'
                      : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
                  {selectedDetailTask.Status}
                </span>
                {String(selectedDetailTask.Archived).toUpperCase() === 'TRUE' && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-300">
                    Archived
                  </span>
                )}
              </div>

              {/* Instructions */}
              <div className="space-y-1">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Instructions</h4>
                <div className="whitespace-pre-wrap rounded-xl border border-slate-200 p-3.5 text-[13px] leading-relaxed text-slate-700">
                  {selectedDetailTask.Instructions || <span className="italic text-slate-400">No instructions provided.</span>}
                </div>
              </div>

              {/* Details Grid */}
              <dl className="grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Deadline</dt>
                  <dd className="m-0 mt-1 text-[13px] font-semibold text-slate-700">
                    {selectedDetailTask.Deadline ? new Date(selectedDetailTask.Deadline).toLocaleDateString('en-PH', { dateStyle: 'long' }) : 'No deadline'}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Assigned</dt>
                  <dd className="m-0 mt-1 text-[13px] font-semibold text-slate-700">
                    {selectedDetailTask.CreatedAt ? new Date(selectedDetailTask.CreatedAt).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : 'Unknown'}
                  </dd>
                </div>
              </dl>

              {/* File Attachments */}
              {selectedDetailTask.FileUrl && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Attachments</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedDetailTask.FileUrl.split('|').map((path, idx) => (
                      <SignedAttachmentLink key={idx} path={path} />
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-100 px-6 py-3.5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDetailTask(null)}
                className="rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Deletion Confirmation Modal ── */}
      {reminderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in-up">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 bg-red-50 border border-red-200 text-red-600 rounded-full flex items-center justify-center mx-auto text-xl">
                <i className="bi bi-exclamation-triangle-fill" />
              </div>
              <h3 className="mb-0 text-base font-bold tracking-tight text-slate-900">Remove availability schedule?</h3>
              <p className="mb-0 text-[13px] leading-relaxed text-slate-500">
                Are you sure you want to delete this {reminderToDelete.type === 'travel' ? 'Official Travel' : 'Leave'} schedule? This will remove the scheduled presence and reset your status to <strong className="text-green-700 font-bold">Available</strong> across the system.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                type="button"
                onClick={() => setReminderToDelete(null)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = reminderToDelete.id
                  // If it's active or applied, reset user status in Supabase to 'Available'
                  if (reminderToDelete.applied) {
                    try {
                      await updatePresence(userId, 'Available')
                      // Fire custom event to sync active status immediately across components
                      window.dispatchEvent(new CustomEvent('presence-auto-updated', {
                        detail: { status: 'Available' }
                      }))
                    } catch (e) {
                      console.error('[PRESENCE-RESET] Error resetting status:', e)
                    }
                  }
                  const updated = reminders.filter(r => r.id !== id)
                  saveReminders(updated)
                  setReminderToDelete(null)
                }}
                className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function SignedAttachmentLink({ path }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const fetchUrl = async () => {
      try {
        const signed = await getSignedFileUrl(path)
        if (active) {
          setUrl(signed)
          setLoading(false)
        }
      } catch (err) {
        console.error('[CALENDAR-ATTACHMENT-LINK] Error signing:', err)
        if (active) setLoading(false)
      }
    }
    fetchUrl()
    return () => { active = false }
  }, [path])

  if (loading) return <span className="text-[9px] text-slate-400">Loading file...</span>
  if (!url) return null

  const fileName = path.split('/').pop().replace(/^\d+_([^_]+)/, '$1')
  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-green-50 border border-slate-200 hover:border-green-300 text-slate-700 hover:text-green-900 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight shadow-sm transition-all"
    >
      <i className="bi bi-file-earmark-arrow-down-fill text-green-700" />
      {fileName.length > 20 ? `${fileName.substring(0, 17)}...` : fileName}
    </a>
  )
}

// ── Background Automated Presence Scheduler Helper ────────────────────────
export async function checkAndApplyScheduledPresence(userId, syncCallback) {
  if (!userId) return
  const stored = localStorage.getItem(`philfida_calendar_reminders_${userId}`)
  if (!stored) return

  try {
    const reminders = JSON.parse(stored)
    let modified = false

    // True current time in Asia/Manila, as "YYYY-MM-DD HH:MM" so it compares
    // lexicographically against the stored date/time strings.
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const map = {}
    formatter.formatToParts(now).forEach(part => { map[part.type] = part.value })
    const manilaNowStr = `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`

    const windowOf = (r) => ({
      start: `${r.date} ${r.time || '00:00'}`,
      end: r.returnDate && r.timeEnd ? `${r.returnDate} ${r.timeEnd}`
         : r.returnDate ? `${r.returnDate} 23:59`
         : `${r.date} 23:59`,
    })

    const statusFor = (r) => r.type === 'travel'
      ? buildTravelStatus({
          activity: r.travelActivity || 'Official Travel',
          location: r.travelLocation || 'Field',
          dateRange: `${r.date} to ${r.returnDate || r.date}`,
          filePath: r.attachments ? String(r.attachments).split('|')[0] : '',
          lat: r.travelLat, lng: r.travelLng,
        })
      : `On Leave — ${r.leaveType || 'Leave'}: ${r.leaveReason || 'Reason'} (${r.date} to ${r.returnDate || r.date})`

    // Reconcile the stored `applied` flag against whether NOW actually falls
    // inside each reminder's window, and act only on the transitions.
    //
    // The previous version expired a finished trip by clearing `applied`, then
    // a second loop re-applied anything whose start time had passed — which is
    // every finished trip. That flipped presence between the trip and
    // "Available" on every 30s tick. A reminder is now applied only while
    // start <= now < end, so an ended one can never be picked up again.
    let becameActive = null
    let anyDeactivated = false

    for (const r of reminders) {
      if (r.type !== 'travel' && r.type !== 'leave') continue
      const { start: winStart, end: winEnd } = windowOf(r)
      const inWindow = manilaNowStr >= winStart && manilaNowStr < winEnd

      if (inWindow && !r.applied) {
        r.applied = true
        modified = true
        becameActive = r
      } else if (!inWindow && r.applied) {
        r.applied = false
        modified = true
        anyDeactivated = true
      }
    }

    // One write per transition, never one per tick.
    if (becameActive) {
      const fullStatus = statusFor(becameActive)
      await updatePresence(userId, fullStatus)
      window.dispatchEvent(new CustomEvent('presence-auto-updated', { detail: { status: fullStatus } }))
    } else if (anyDeactivated && !reminders.some(r => r.applied && (r.type === 'travel' || r.type === 'leave'))) {
      await updatePresence(userId, 'Available')
      window.dispatchEvent(new CustomEvent('presence-auto-updated', { detail: { status: 'Available' } }))
    }

    if (modified) {
      localStorage.setItem(`philfida_calendar_reminders_${userId}`, JSON.stringify(reminders))
      // Tell any mounted calendar/profile view to re-read the reminder list.
      window.dispatchEvent(new Event('presence-reminders-changed'))
      if (syncCallback) await syncCallback()
    }
  } catch (err) {
    console.error('[PRESENCE-SCHEDULER] error:', err)
  }
}

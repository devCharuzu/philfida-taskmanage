import { useState, useEffect } from 'react'
import { updatePresence, uploadFiles, getSignedFileUrl } from '../lib/api'

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

export default function PersonalCalendarTab({ tasks, userId, onViewTask }) {
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

  // ── Automatic Availability Status Change ─────────────────────
  useEffect(() => {
    if (!userId) return

    const checkAvailabilityStatus = () => {
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
        manilaNowStr = getManilaDateString(now) + ' ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      }

      const stored = localStorage.getItem(`philfida_calendar_reminders_${userId}`)
      if (!stored) return

      let reminders = []
      try { reminders = JSON.parse(stored) } catch (e) { return }

      let needsUpdate = false
      let updatedReminders = reminders.map(r => {
        if (!r.applied || (r.type !== 'travel' && r.type !== 'leave')) return r

        const endDateTime = r.returnDate && r.timeEnd 
          ? `${r.returnDate} ${r.timeEnd}`
          : r.returnDate 
            ? `${r.returnDate} 23:59`
            : `${r.date} 23:59`

        if (manilaNowStr >= endDateTime) {
          // This reminder has expired, mark as not applied
          needsUpdate = true
          return { ...r, applied: false }
        }

        return r
      })

      if (needsUpdate) {
        localStorage.setItem(`philfida_calendar_reminders_${userId}`, JSON.stringify(updatedReminders))
        setReminders(updatedReminders)
        window.dispatchEvent(new Event('storage'))
        window.dispatchEvent(new Event('presence-reminders-changed'))

        // Check if all travel/leave reminders are now unapplied
        const hasActiveTravelLeave = updatedReminders.some(r => r.applied && (r.type === 'travel' || r.type === 'leave'))
        
        if (!hasActiveTravelLeave) {
          // Automatically set status to Available
          updatePresence(userId, 'Available').catch(err => console.error('Auto-availability fail:', err))
          window.dispatchEvent(new Event('presence-auto-updated'))
        }
      }
    }

    // Check immediately on mount
    checkAvailabilityStatus()

    // Check every minute
    const interval = setInterval(checkAvailabilityStatus, 60000)
    return () => clearInterval(interval)
  }, [userId])

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
              fullStatus = `Official Travel — ${travelActivity.trim()} at ${travelLocation.trim()} (${selectedDateStr} ${remTime} to ${returnDate} ${returnTime})`
            } else {
              fullStatus = `On Leave — ${leaveType}: ${leaveReason.trim()} (${selectedDateStr} ${remTime} to ${returnDate} ${returnTime})`
            }
            // Update Supabase in real-time
            updatePresence(userId, fullStatus).catch(err => console.error('Realtime edit presence fail:', err))
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
          fullStatus = `Official Travel — ${travelActivity.trim()} at ${travelLocation.trim()} (${selectedDateStr} ${remTime} to ${returnDate} ${returnTime})`
        } else {
          fullStatus = `On Leave — ${leaveType}: ${leaveReason.trim()} (${selectedDateStr} ${remTime} to ${returnDate} ${returnTime})`
        }
        // Update Supabase in real-time
        updatePresence(userId, fullStatus).catch(err => console.error('Realtime add presence fail:', err))
        isCurrentlyApplied = true
        window.dispatchEvent(new Event('presence-auto-updated'))
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
    setTravelLocation('')
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
          <p className="mb-0 mt-0.5 text-[13px] text-slate-500 font-medium leading-snug">Track your assigned task deadlines and organize personal reminders</p>
        </div>

        {/* Stats strip */}
        <div className="flex gap-6 mt-4 pt-4 border-t border-slate-100 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Month Task Deadlines: <strong className="text-slate-800">{monthlyTasksCount}</strong></span>
          </div>
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
                            <span className={`text-[7px] sm:text-[9px] font-black uppercase px-1 sm:px-1.5 py-0.5 rounded shadow-sm tracking-tighter flex items-center gap-0.5 select-none leading-none scale-90 sm:scale-100
                              ${hasActive ? 'bg-emerald-600 text-white' : 'bg-slate-400 text-white opacity-80'}`}>
                              <i className={`bi ${hasActive ? 'bi-clipboard-check-fill' : 'bi-archive-fill'} text-[8px] sm:text-[10px]`} />
                              <span className="hidden xs:inline">{dayTasks.length} {dayTasks.length === 1 ? 'Task' : 'Tasks'}</span>
                              <span className="xs:hidden">{dayTasks.length}T</span>
                            </span>
                          )
                        })()
                      ) : hasReminders ? (
                        <span className="text-[7px] sm:text-[9px] font-black uppercase bg-amber-500 text-white px-1 sm:px-1.5 py-0.5 rounded shadow-sm tracking-tighter flex items-center gap-0.5 select-none leading-none scale-90 sm:scale-100">
                          <i className="bi bi-bell-fill text-[8px] sm:text-[10px]" />
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
                              ? 'bg-slate-50/40 border-slate-200 border-dashed opacity-75 hover:opacity-100 hover:300' 
                              : 'bg-slate-50 border-slate-200 hover:200'}`}
                          onClick={() => setSelectedDetailTask(t)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] font-black bg-emerald-50 border border-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded uppercase leading-none">
                                Task
                              </span>
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
                          setTravelLocation('')
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
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-blue-800 uppercase tracking-wider block">Location / Venue *</label>
                          <input
                            className="w-full bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="e.g. Manila Hotel, Manila"
                            value={travelLocation}
                            onChange={e => setTravelLocation(e.target.value)}
                            required
                          />
                        </div>
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
                            <option value="">-- Select Leave --</option>
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
                          setTravelLocation('')
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
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#016837] to-[#027a42] px-6 py-4 flex items-center justify-between text-white">
              <div>
                <span className="text-[9px] font-black tracking-widest uppercase bg-white/20 px-2 py-0.5 rounded font-mono">
                  {selectedDetailTask.TaskID}
                </span>
                <h3 className="text-sm sm:text-base font-black mt-1 leading-tight">
                  {selectedDetailTask.Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim()}
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedDetailTask(null)}
                className="text-white/85 hover:text-white text-2xl font-bold p-1 leading-none select-none transition-colors"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              
              {/* Badges row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md border
                  ${selectedDetailTask.Priority === 'Urgent' 
                    ? 'bg-red-50 border-red-200 text-red-700' 
                    : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  Priority: {selectedDetailTask.Priority || 'Normal'}
                </span>
                
                <span className="text-[9px] font-black uppercase px-2 py-1 rounded-md border bg-green-50 border-green-200 text-green-800">
                  Category: {selectedDetailTask.Category || 'General'}
                </span>

                <span className="text-[9px] font-black uppercase px-2 py-1 rounded-md border bg-blue-50 border-blue-200 text-blue-800">
                  Status: {selectedDetailTask.Status}
                </span>

                {String(selectedDetailTask.Archived).toUpperCase() === 'TRUE' && (
                  <span className="text-[9px] font-black uppercase px-2 py-1 rounded-md border bg-slate-100 300 text-slate-600 flex items-center gap-1.5 leading-none">
                    <i className="bi bi-archive-fill text-slate-500" /> Archived Task
                  </span>
                )}
              </div>

              {/* Instructions */}
              <div className="space-y-1">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Instructions</h4>
                <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3.5 text-xs text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
                  {selectedDetailTask.Instructions || <span className="italic text-slate-400">No instructions provided.</span>}
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-1">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Deadline</h4>
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <i className="bi bi-calendar-event text-emerald-700 text-sm" />
                    {selectedDetailTask.Deadline ? new Date(selectedDetailTask.Deadline).toLocaleDateString('en-PH', { dateStyle: 'long' }) : 'No deadline'}
                  </p>
                </div>
                <div className="space-y-1">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Assigned At</h4>
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <i className="bi bi-clock text-slate-400 text-sm" />
                    {selectedDetailTask.CreatedAt ? new Date(selectedDetailTask.CreatedAt).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : 'Unknown'}
                  </p>
                </div>
              </div>

              {/* File Attachments */}
              {selectedDetailTask.FileUrl && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Documentation / Attached Files</h4>
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
                className="px-4 py-1.5 bg-[#016837] hover:bg-[#027a42] text-white text-xs font-black uppercase rounded-xl shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                Close Details
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
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">Remove Availability Schedule?</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Are you sure you want to delete this {reminderToDelete.type === 'travel' ? 'Official Travel' : 'Leave'} schedule? This will remove the scheduled presence and reset your status to <strong className="text-green-700 font-bold">Available</strong> across the system.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                type="button"
                onClick={() => setReminderToDelete(null)}
                className="w-full px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-xs font-black uppercase rounded-xl transition-all"
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
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase rounded-xl shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                Yes, Remove
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

    // Get true current time in Asia/Manila (Philippines Standard Time)
    const now = new Date()
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
    // Output standard YYYY-MM-DD HH:MM
    const manilaNowStr = `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`

    for (let r of reminders) {
      if ((r.type === 'travel' || r.type === 'leave') && !r.applied) {
        const startDateTime = `${r.date} ${r.time}`
        if (manilaNowStr >= startDateTime) {
          // The scheduled time has arrived! Update presence.
          let fullStatus = ''
          if (r.type === 'travel') {
            fullStatus = `Official Travel — ${r.travelActivity || 'Summit'} at ${r.travelLocation || 'Field'} (${r.date} to ${r.returnDate || r.date})`
          } else {
            fullStatus = `On Leave — ${r.leaveType || 'Leave'}: ${r.leaveReason || 'Reason'} (${r.date} to ${r.returnDate || r.date})`
          }

          await updatePresence(userId, fullStatus)

          r.applied = true
          modified = true

          // Fire a custom alert event to prompt UI updates/toasts
          window.dispatchEvent(new CustomEvent('presence-auto-updated', {
            detail: { status: fullStatus }
          }))
        }
      }
    }

    if (modified) {
      localStorage.setItem(`philfida_calendar_reminders_${userId}`, JSON.stringify(reminders))
      if (syncCallback) {
        await syncCallback()
      }
    }
  } catch (err) {
    console.error('[PRESENCE-SCHEDULER] error:', err)
  }
}

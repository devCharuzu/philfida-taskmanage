export function getManilaDateTimeString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`
}

const firstFive = value => String(value || '').slice(0, 5)

export function getPresenceScheduleWindow(schedule) {
  const startDate = schedule.StartDate || schedule.date || ''
  const endDate = schedule.EndDate || schedule.returnDate || startDate
  return {
    start: `${startDate} ${firstFive(schedule.StartTime || schedule.time || '00:00')}`,
    end: `${endDate} ${firstFive(schedule.EndTime || schedule.timeEnd || '23:59')}`,
  }
}

export function isPresenceScheduleVisible(schedule, now = new Date()) {
  if (!schedule || (schedule.Type || schedule.type) !== 'travel' && (schedule.Type || schedule.type) !== 'leave') return false
  const { end } = getPresenceScheduleWindow(schedule)
  return Boolean(end) && end > getManilaDateTimeString(now)
}

export function toPresenceScheduleRecord(reminder) {
  return {
    ID: String(reminder.id),
    Type: reminder.type,
    StartDate: reminder.date,
    StartTime: firstFive(reminder.time) || '00:00',
    EndDate: reminder.returnDate || reminder.date,
    EndTime: firstFive(reminder.timeEnd) || '23:59',
    TravelActivity: reminder.travelActivity || '',
    TravelLocation: reminder.travelLocation || '',
    TravelLat: reminder.travelLat ?? null,
    TravelLng: reminder.travelLng ?? null,
    LeaveType: reminder.leaveType || '',
    LeaveReason: reminder.leaveReason || '',
    Attachments: reminder.attachments || '',
  }
}

export function toCalendarReminder(schedule, existing = {}) {
  const type = schedule.Type || schedule.type
  const date = schedule.StartDate || schedule.date
  const returnDate = schedule.EndDate || schedule.returnDate || date
  const time = firstFive(schedule.StartTime || schedule.time) || '00:00'
  const timeEnd = firstFive(schedule.EndTime || schedule.timeEnd) || '23:59'
  const travelActivity = schedule.TravelActivity || schedule.travelActivity || ''
  const travelLocation = schedule.TravelLocation || schedule.travelLocation || ''
  const leaveType = schedule.LeaveType || schedule.leaveType || ''
  const leaveReason = schedule.LeaveReason || schedule.leaveReason || ''
  const attachments = schedule.Attachments || schedule.attachments || ''
  const title = type === 'travel'
    ? `Official Travel: ${travelActivity} at ${travelLocation}`
    : `On Leave: ${leaveType} — ${leaveReason}`

  return {
    ...existing,
    id: String(schedule.ID || schedule.id),
    title,
    notes: `${type === 'travel' ? 'Official Travel' : 'Leave'} schedule. Start: ${date} ${time}. Return: ${returnDate} ${timeEnd}.`,
    time,
    timeEnd,
    date,
    color: type === 'travel' ? 'blue' : 'red',
    type,
    travelActivity: type === 'travel' ? travelActivity : undefined,
    travelLocation: type === 'travel' ? travelLocation : undefined,
    travelLat: type === 'travel' ? (schedule.TravelLat ?? schedule.travelLat ?? null) : undefined,
    travelLng: type === 'travel' ? (schedule.TravelLng ?? schedule.travelLng ?? null) : undefined,
    leaveType: type === 'leave' ? leaveType : undefined,
    leaveReason: type === 'leave' ? leaveReason : undefined,
    returnDate,
    attachments,
    applied: Boolean(existing.applied),
    shared: true,
  }
}

export function createPresenceScheduleId(type) {
  const suffix = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 12)
  return `scheduled-${type}-${Date.now()}-${suffix}`
}

export function getPresenceScheduleLabel(schedule) {
  return (schedule.Type || schedule.type) === 'travel' ? 'Official Travel' : 'On Leave'
}

export function formatPresenceScheduleRange(schedule) {
  const startDate = schedule.StartDate || schedule.date || ''
  const endDate = schedule.EndDate || schedule.returnDate || startDate
  const formatDate = value => {
    if (!value) return ''
    const [year, month, day] = value.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', timeZone: 'UTC',
    })
  }
  const range = formatDate(startDate) === formatDate(endDate)
    ? formatDate(startDate)
    : `${formatDate(startDate)} – ${formatDate(endDate)}`
  return `${range} · ${firstFive(schedule.StartTime || schedule.time || '00:00')}–${firstFive(schedule.EndTime || schedule.timeEnd || '23:59')}`
}

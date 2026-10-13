import { isPresenceScheduleVisible, getPresenceScheduleWindow } from './availability.js'

export function getSchedulesForPersonnel(schedules = [], userId, now = new Date()) {
  return schedules
    .filter(schedule => String(schedule.UserID) === String(userId) && isPresenceScheduleVisible(schedule, now))
    .sort((a, b) => getPresenceScheduleWindow(a).start.localeCompare(getPresenceScheduleWindow(b).start))
}

export function getDispatchRecipients(users = [], selectedIds = [], schedules = [], now = new Date()) {
  const selected = new Set(selectedIds.map(String))
  const recipients = users.filter(user =>
    selected.has(String(user.ID))
    && user.Role !== 'Director'
    && user.AccountStatus === 'Active'
  )
  const warnings = recipients
    .map(person => ({
      ...person,
      upcomingSchedules: getSchedulesForPersonnel(schedules, person.ID, now),
    }))
    .filter(person =>
      person.Status?.startsWith('Official Travel')
      || person.Status?.startsWith('On Leave')
      || person.upcomingSchedules.length > 0
    )

  return { recipients, warnings }
}

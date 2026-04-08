import { supabase } from './supabase'

const UNITS = [
  'Administrative and Management Unit',
  'Planning Unit',
  'Regulatory Unit',
  'Technical Assistance Unit',
  'Research Unit',
]

const OFFICES = [
  'Office of the Director General',
  'Administrative Division',
  'Finance Division',
  'Planning Division',
  'Research & Development',
  'Operations Division',
  'Regional Office',
]

export { UNITS, OFFICES }

// ── FILE UPLOAD ────────────────────────────────────────────
export async function uploadFiles(fileList) {
  if (!fileList || fileList.length === 0) return ''
  const urls = await Promise.all(
    Array.from(fileList).map(async (file) => {
      const ext = file.name.split('.').pop()
      const path = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage
        .from('taskflow-files')
        .upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('taskflow-files').getPublicUrl(path)
      return data.publicUrl
    })
  )
  return urls.join('|')
}

// ── AUTH ───────────────────────────────────────────────────
export async function getAllUsers() {
  const { data, error } = await supabase.from('Users').select('*')
  if (error) throw error
  return data
}

export async function registerUser({ id, name, email = '', unit, role, pass }) {
  const { error } = await supabase.from('Users').insert({
    ID: id,
    Name: name,
    Email: email,
    Office: unit,
    Unit: unit,
    Role: role,
    Password: pass,
    ProfilePic: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`,
    Status: 'Available',
    AccountStatus: 'Pending',
  })
  if (error) {
    if (error.code === '23505') return 'EXISTS'
    throw error
  }
  return 'SUCCESS'
}

export async function updateUserAccountStatus(userId, status) {
  const { error } = await supabase.from('Users')
    .update({ AccountStatus: status })
    .eq('ID', userId)
  if (error) throw error
}

export async function updateUserRole(userId, role, unit) {
  const { error } = await supabase.from('Users')
    .update({ Role: role, Unit: unit, Office: unit })
    .eq('ID', userId)
  if (error) throw error
}

// ── DATA FETCH ─────────────────────────────────────────────
export async function getData(userId) {
  const [tasks, users, comments, notifications, history] = await Promise.all([
    supabase.from('Tasks').select('*').order('CreatedAt', { ascending: true }),
    supabase.from('Users').select('*'),
    supabase.from('Comments').select('*').order('ID', { ascending: true }),
    userId
      ? supabase.from('Notifications').select('*')
          .eq('UserID', userId)
          .order('ID', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    supabase.from('TaskHistory').select('*').order('CreatedAt', { ascending: true }),
  ])
  return {
    tasks:         tasks.data         || [],
    users:         users.data         || [],
    comments:      comments.data      || [],
    notifications: notifications.data || [],
    history:       history.data       || [],
  }
}


// ── TASK HISTORY ────────────────────────────────────────────
export async function logHistory(taskId, action, actor, note = '') {
  await supabase.from('TaskHistory').insert({
    TaskID: String(taskId), Action: action, Actor: actor,
    Note: note, CreatedAt: new Date().toISOString(),
  })
}

export async function getTaskHistory(taskId) {
  const { data } = await supabase.from('TaskHistory')
    .select('*').eq('TaskID', taskId).order('CreatedAt', { ascending: true })
  return data || []
}

// ── TASKS ──────────────────────────────────────────────────
export async function createTask({ empId, empName, title, instructions, priority, category, deadline, files, actorName = 'Director' }) {
  const taskId = 'T-' + Date.now()
  const fileUrl = files?.length ? await uploadFiles(files) : ''
  const { error } = await supabase.from('Tasks').insert({
    TaskID: taskId, EmployeeID: empId, EmployeeName: empName,
    Title: title, Instructions: instructions,
    FileLink: fileUrl, Status: 'Assigned',
    Archived: 'FALSE', Deadline: deadline || '',
    Priority: priority || 'Normal', Category: category || 'General',
    CreatedAt: new Date().toISOString(),
  })
  if (error) throw error
  await createNotification(empId, `📋 New task assigned to you: "${title}"`, 'task', taskId)
  // Log history — actor is the dispatcher (fetched from task record)
  await logHistory(taskId, 'Dispatched', actorName)
  return taskId
}

export async function editTask({ taskId, title, instructions, priority, category, deadline, files }) {
  const updates = { Title: title, Instructions: instructions, Priority: priority, Category: category, Deadline: deadline || '' }
  if (files?.length) updates.FileLink = await uploadFiles(files)
  const { error } = await supabase.from('Tasks').update(updates).eq('TaskID', taskId)
  if (error) throw error
  // History logged externally with actor name
}

export async function setTaskStatus(taskId, status, actorName = '') {
  const col = status === 'Received' ? 'ReceivedAt' : 'CompletedAt'
  const { error } = await supabase.from('Tasks').update({
    Status: status, [col]: new Date().toISOString(),
  }).eq('TaskID', taskId)
  if (error) throw error
  if (actorName) await logHistory(taskId, status, actorName)
}

export async function toggleArchive(taskId, archived) {
  const { error } = await supabase.from('Tasks')
    .update({ Archived: archived ? 'TRUE' : 'FALSE' })
    .eq('TaskID', taskId)
  if (error) throw error
}

// ── COMMENTS ───────────────────────────────────────────────
export async function addComment({ taskId, sender, message, files }) {
  let fileUrl = ''
  if (files?.length) fileUrl = await uploadFiles(files)
  const payload = fileUrl
    ? JSON.stringify({ text: message || '', files: fileUrl })
    : (message || '')

  const { error } = await supabase.from('Comments').insert({
    TaskID: taskId, SenderName: sender,
    Message: payload, TimeStamp: new Date().toISOString(), HiddenBy: '',
  })
  if (error) throw error

  const { data: task } = await supabase.from('Tasks').select('*').eq('TaskID', taskId).single()
  if (task) {
    const notifyId = sender === task.EmployeeName ? null : task.EmployeeID
    if (notifyId) {
      const notifText = fileUrl ? '📎 Sent an attachment' : (message || '').substring(0, 50)
      await createNotification(notifyId, `💬 New message on "${task.Title}": ${notifText}`, 'chat', taskId)
    }
  }
}

// ── NOTIFICATIONS ──────────────────────────────────────────
export async function createNotification(userId, message, type = 'info', taskId = '') {
  await supabase.from('Notifications').insert({
    UserID: String(userId), Message: message, Type: type,
    IsRead: 'FALSE', CreatedAt: new Date().toISOString(), TaskID: String(taskId),
  })
}

export async function markNotificationsRead(userId) {
  await supabase.from('Notifications').update({ IsRead: 'TRUE' }).eq('UserID', userId)
}

// ── PRESENCE ───────────────────────────────────────────────

export async function updateProfile(userId, { name, designation, email, unit }) {
  const { error } = await supabase.from('Users').update({
    Name:        name,
    Designation: designation,
    Email:       email,
    Unit:        unit,
    Office:      unit,
    ProfilePic:  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=155414&color=fff&size=80`,
  }).eq('ID', userId)
  if (error) throw error
}

export async function updatePresence(userId, status) {
  await supabase.from('Users').update({ Status: status }).eq('ID', userId)
}

// ── HELPERS ────────────────────────────────────────────────
export function parseMsg(raw) {
  try { const p = JSON.parse(raw); if (p.files !== undefined) return p } catch (e) {}
  return { text: raw, files: '' }
}

export function getStatusBadgeClass(status) {
  return { Assigned: 'badge-assigned', Received: 'badge-received', Completed: 'badge-completed' }[status] || 'badge-assigned'
}

export function getPriorityClass(priority) {
  return { Urgent: 'priority-urgent', High: 'priority-high', Medium: 'priority-medium', Low: 'priority-low', Normal: 'priority-normal' }[priority] || 'priority-normal'
}

export function getUnreadCommentCount(comments, taskId, sessionName) {
  return comments.filter(c =>
    String(c.TaskID) === String(taskId) &&
    c.SenderName !== sessionName &&
    !String(c.HiddenBy || '').includes(sessionName)
  ).length
}

// ── DELETE TASK PERMANENTLY ────────────────────────────────
export async function deleteTask(taskId) {
  // Delete comments first (foreign key)
  await supabase.from('Comments').delete().eq('TaskID', taskId)
  await supabase.from('Notifications').delete().eq('TaskID', taskId)
  const { error } = await supabase.from('Tasks').delete().eq('TaskID', taskId)
  if (error) throw error
}

export async function deleteTasks(taskIds) {
  await Promise.all(taskIds.map(id => deleteTask(id)))
}

export async function restoreTasks(taskIds) {
  await Promise.all(taskIds.map(id => toggleArchive(id, false)))
}

export async function deleteUser(userId) {
  // Remove all tasks, comments, notifications tied to this user
  const { data: tasks } = await supabase.from('Tasks').select('TaskID').eq('EmployeeID', userId)
  if (tasks?.length) {
    const ids = tasks.map(t => t.TaskID)
    await supabase.from('Comments').delete().in('TaskID', ids)
    await supabase.from('Notifications').delete().in('TaskID', ids)
    await supabase.from('Tasks').delete().eq('EmployeeID', userId)
  }
  await supabase.from('Notifications').delete().eq('UserID', userId)
  const { error } = await supabase.from('Users').delete().eq('ID', userId)
  if (error) throw error
}

export async function clearNotifications(userId) {
  await supabase.from('Notifications').delete().eq('UserID', userId)
}

export async function markChatRead(taskId, sessionName) {
  // Append sessionName to HiddenBy on all messages they haven't sent in this task
  const { data: comments } = await supabase
    .from('Comments')
    .select('ID, HiddenBy, SenderName')
    .eq('TaskID', taskId)

  if (!comments?.length) return

  const toUpdate = comments.filter(c =>
    c.SenderName !== sessionName &&
    !String(c.HiddenBy || '').includes(sessionName)
  )

  await Promise.all(toUpdate.map(c =>
    supabase.from('Comments').update({
      HiddenBy: c.HiddenBy ? `${c.HiddenBy},${sessionName}` : sessionName
    }).eq('ID', c.ID)
  ))
}
// ── GOOGLE AUTH ────────────────────────────────────────────────
export async function signInWithGoogle() {
  // Do not call signOut() here: it clears the PKCE code_verifier from storage and can cause
  // "OAuth state not found or expired" when combined with Strict Mode or slow redirects.
  // Account switching is handled with prompt=select_account on the authorize URL.

  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : ''

  console.debug('[auth] signInWithGoogle redirectTo', redirectTo)

  // Get the OAuth URL from Supabase
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true, // add prompt on the URL below (Google account picker)
    },
  })
  // #region agent log
  {
    let oauthHost = null
    let redirectToParam = null
    let googleOAuthRedirectHost = null
    try {
      if (data?.url) {
        const parsed = new URL(data.url)
        oauthHost = parsed.host
        redirectToParam = parsed.searchParams.get('redirect_to')
        const ru = parsed.searchParams.get('redirect_uri')
        if (ru) googleOAuthRedirectHost = new URL(decodeURIComponent(ru)).host
      }
    } catch (_) {}
  }
  if (error) throw error

  const url = new URL(data.url)
  url.searchParams.set('prompt', 'select_account')
  window.location.href = url.toString()
}

/** PKCE: exchange ?code= using verifier in storage. Call before stripping the URL. */
export async function exchangePkceAuthCode(authCode) {
  if (!authCode) return { error: null }
  const { error } = await supabase.auth.exchangeCodeForSession(authCode)
  return { error }
}

export async function handleGoogleCallback() {
  // Get Supabase auth session (handles PKCE code exchange automatically)
  const { data: { session: authSession }, error: sessionError } = await supabase.auth.getSession()

  if (sessionError) { console.error('Session error:', sessionError); return null }
  if (!authSession) { console.warn('No session found'); return null }

  const authUser  = authSession.user
  const email     = (authUser.email || '').toLowerCase().trim()
  const name      = authUser.user_metadata?.full_name ||
                    authUser.user_metadata?.name ||
                    email.split('@')[0]
  const avatar    = authUser.user_metadata?.avatar_url ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=155414&color=fff`

  if (!email) { console.error('No email from Google'); return null }

  // Find existing user — match by email (case-insensitive)
  const { data: users, error: usersError } = await supabase.from('Users').select('*')
  if (usersError) { console.error('Users fetch error:', usersError); return null }

  const existing = users?.find(u =>
    u.Email && u.Email.toLowerCase().trim() === email
  )

  if (existing) {
    // Backfill email if it was missing
    if (!existing.Email) {
      await supabase.from('Users').update({ Email: email }).eq('ID', existing.ID)
    }
    return { user: { ...existing, Email: email }, isNew: false }
  }

  // New Google user — insert as Pending
  const newId = 'G-' + Date.now()
  const { error: insertError } = await supabase.from('Users').insert({
    ID:            newId,
    Name:          name,
    Email:         email,
    Office:        '',
    Unit:          '',
    Role:          'Employee',
    Password:      '',
    ProfilePic:    avatar,
    Status:        'Available',
    AccountStatus: 'Pending',
    Designation:   '',
  })

  if (insertError) { console.error('Insert error:', insertError); return null }

  const { data: newUser } = await supabase.from('Users').select('*').eq('ID', newId).single()
  return { user: newUser, isNew: true }
}

export async function signOutGoogle() {
  await supabase.auth.signOut()
}

// ── Presence helpers ───────────────────────────────────────────
// Normalize full status string to base value
export function getPresenceBase(status) {
  if (!status || status === 'Available') return 'Available'
  if (status.startsWith('Official Travel')) return 'Official Travel'
  if (status.startsWith('On Leave')) return 'On Leave'
  return 'Available'
}

// Extract detail note from full status string
export function getPresenceDetail(status) {
  if (!status) return ''
  const dash = status.indexOf(' — ')
  return dash !== -1 ? status.slice(dash + 3) : ''
}
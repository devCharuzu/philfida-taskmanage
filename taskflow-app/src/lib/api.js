import { supabase } from './supabase'
import { useStore } from '../store/useStore'

// Helper: get actor credentials for RPC calls
// Returns { id, password } from the current session
function getActorCredentials() {
  const session = useStore.getState().session
  return {
    id: session?.ID || '',
    password: session?.Password || '',
  }
}

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

const REGIONS = [
  'Region I',
  'Region IV',
  'Region V',
  'Region VI',
  'Region VII',
  'Region VIII',
  'Region IX',
  'Region X',
  'Region XI',
  'Region XIII',
]

export { UNITS, OFFICES, REGIONS }

// ── FILE UPLOAD ────────────────────────────────────────────
// H8 FIX: Bucket is private, so use createSignedUrl (1 hour expiry) instead of getPublicUrl
export async function uploadFiles(fileList) {
  if (!fileList || fileList.length === 0) return ''
  const urls = await Promise.all(
    Array.from(fileList).map(async (file) => {
      // Validate file size — reject files over 50 MB (L8 fix)
      if (file.size > 50 * 1024 * 1024) throw new Error(`File "${file.name}" exceeds 50 MB limit.`)
      const ext = file.name.split('.').pop()
      const path = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage
        .from('taskflow-files')
        .upload(path, file, { upsert: true })
      if (error) throw error
      // Store the path itself; generate signed URLs on read via getSignedUrl()
      return path
    })
  )
  return urls.join('|')
}

// Generate a temporary signed URL from a stored path (valid 1 hour)
export async function getSignedFileUrl(path) {
  if (!path) return ''
  // If it's already a full URL (legacy data), return as-is
  if (path.startsWith('http')) return path
  const { data, error } = await supabase.storage
    .from('taskflow-files')
    .createSignedUrl(path, 3600)
  if (error) { console.warn('Failed to sign URL:', path, error); return '' }
  return data.signedUrl
}

// ── AUTH ───────────────────────────────────────────────────
// C3 FIX: getAllUsers still exists for director admin use (UserManagement),
// but login now uses loginUser() which only returns a single user matched by ID.
export async function getAllUsers() {
  const { data, error } = await supabase.from('Users').select('*')
  if (error) throw error
  return data
}

// C2/C3 FIX: Authenticate a single user by ID — never exposes other users' data.
// Returns the matching user or null; password comparison happens here so the
// full user list is never sent to the client during login.
export async function loginUser(userId, password, region) {
  const { data: user, error } = await supabase
    .from('Users')
    .select('*')
    .eq('ID', userId.trim())
    .single()
  if (error || !user) return { error: 'invalid_credentials' }
  if (user.Password !== password) return { error: 'invalid_credentials' }
  
  // Verify region if provided (skip for users without region set yet during migration)
  if (region && user.Region && user.Region !== region) {
    return { error: 'invalid_region' }
  }
  
  if (user.AccountStatus === 'Pending') return { error: 'pending' }
  if (user.AccountStatus === 'Deactivated') return { error: 'deactivated' }
  return { user }
}

export async function registerUser({ id, name, email = '', unit, role, pass, region }) {
  const { error } = await supabase.from('Users').insert({
    ID: id,
    Name: name,
    Email: email?.trim() || null,
    Office: unit,
    Unit: unit,
    Role: role,
    Password: pass,
    Region: region || 'Region I',
    ProfilePic: '',
    Status: 'Available',
    AccountStatus: 'Pending',
  })
  if (error) {
    if (error.code === '23505') return 'EXISTS'
    throw error
  }
  return 'SUCCESS'
}

/** True when Supabase Auth has a JWT (e.g. Google). Manual Personnel-ID login has no Auth session — director actions need RPC + password. */
export async function hasSupabaseAuthSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return !!(session?.user)
}

export async function updateUserAccountStatus(userId, status, actorDirectorId, directorPassword = '') {
  const { error } = await supabase.rpc('director_set_account_status', {
    p_director_id: actorDirectorId,
    p_director_password: directorPassword || null,
    p_target_user_id: userId,
    p_account_status: status,
  })
  if (error) throw error
}

export async function updateUserRole(userId, role, unit, actorDirectorId, directorPassword = '') {
  const { error } = await supabase.rpc('director_update_user_role', {
    p_director_id: actorDirectorId,
    p_director_password: directorPassword || null,
    p_target_user_id: userId,
    p_role: role,
    p_unit: unit || '',
  })
  if (error) throw error
}

// ── DATA FETCH ─────────────────────────────────────────────
export async function getData(userId, region = 'Region I') {
  const [tasks, users, comments, notifications, history] = await Promise.all([
    supabase.from('Tasks').select('*').eq('Region', region).order('CreatedAt', { ascending: true }),
    supabase.from('Users').select('*').eq('Region', region),
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

async function refreshGlobalDataForCurrentSession() {
  try {
    const session = useStore.getState().session
    if (!session?.ID) return
    const data = await getData(session.ID, session.Region || 'Region I')
    if (data) useStore.getState().setGlobalData(data)
  } catch (e) {
    console.warn('refreshGlobalDataForCurrentSession failed', e)
  }
}

// ── TASK HISTORY ────────────────────────────────────────────
export async function logHistory(taskId, action, actor, note = '') {
  const { id, password } = getActorCredentials()
  const { error } = await supabase.rpc('rpc_log_history', {
    p_actor_id: id,
    p_actor_password: password,
    p_task_id: String(taskId),
    p_action: action,
    p_actor_name: actor,
    p_note: note || '',
  })
  if (error) {
    console.warn('[logHistory] RPC failed, falling back to direct insert:', error.message)
    await supabase.from('TaskHistory').insert({
      TaskID: String(taskId), Action: action, Actor: actor,
      Note: note, CreatedAt: new Date().toISOString(),
    })
  }
}

export async function getTaskHistory(taskId) {
  const { data } = await supabase.from('TaskHistory')
    .select('*').eq('TaskID', taskId).order('CreatedAt', { ascending: true })
  return data || []
}

// ── TASKS ──────────────────────────────────────────────────
export async function createTask({ empId, empName, title, instructions, priority, category, deadline, files, actorName = 'Director', priorityFlags = [], purposeCheckboxes = [], approvalAction = '' }) {
  const taskId = 'T-' + Date.now()
  const fileUrl = files?.length ? await uploadFiles(files) : ''
  
  const session = useStore.getState().session
  const region = session?.Region || 'Region I'
  const { id, password } = getActorCredentials()

  const { error } = await supabase.rpc('rpc_create_task', {
    p_actor_id: id,
    p_actor_password: password,
    p_task_id: taskId,
    p_employee_id: empId,
    p_employee_name: empName,
    p_title: title,
    p_instructions: instructions,
    p_file_link: fileUrl,
    p_deadline: deadline || null,
    p_priority: priority || 'Normal',
    p_category: category || 'General',
    p_priority_flags: priorityFlags || [],
    p_purpose_checkboxes: purposeCheckboxes || [],
    p_approval_action: approvalAction || '',
    p_region: region,
  })
  if (error) throw error
  await createNotification(empId, `📋 New task assigned to you: "${title}"`, 'task', taskId)
  await logHistory(taskId, 'Dispatched', actorName)
  return taskId
}

export async function editTask({ taskId, title, instructions, priority, category, deadline, files }) {
  const fileUrl = files?.length ? await uploadFiles(files) : null
  const { id, password } = getActorCredentials()

  const { error } = await supabase.rpc('rpc_update_task', {
    p_actor_id: id,
    p_actor_password: password,
    p_task_id: taskId,
    p_title: title,
    p_instructions: instructions,
    p_priority: priority,
    p_category: category,
    p_deadline: deadline || null,
    p_file_link: fileUrl,
  })
  if (error) throw error
}

export async function setTaskStatus(taskId, status, actorName = '', actorId = null) {
  const { id, password } = getActorCredentials()

  const { error } = await supabase.rpc('rpc_set_task_status', {
    p_actor_id: id,
    p_actor_password: password,
    p_task_id: taskId,
    p_status: status,
  })
  if (error) throw error
  if (actorName) await logHistory(taskId, status, actorName)

  if (['Received', 'Completed'].includes(status)) {
    const { data: task } = await supabase.from('Tasks').select('*').eq('TaskID', taskId).single()
    if (task) {
      const msg = status === 'Received'
        ? `✅ ${task.EmployeeName} accepted "${task.Title}"`
        : `✅ ${task.EmployeeName} completed "${task.Title}"`

      const { data: adminUsers, error: dirError } = await supabase.from('Users').select('ID').in('Role', ['Director', 'Records'])
      if (!dirError && adminUsers?.length) {
        await Promise.all(adminUsers
          .filter(d => String(d.ID) !== String(actorId || ''))
          .map(d => createNotification(d.ID, msg, 'task', taskId))
        )
      }
    }
  }
}

export async function toggleArchive(taskId, archived) {
  const { id, password } = getActorCredentials()
  const { error } = await supabase.rpc('rpc_toggle_archive', {
    p_actor_id: id,
    p_actor_password: password,
    p_task_id: taskId,
    p_archived: archived ? 'TRUE' : 'FALSE',
  })
  if (error) throw error
}

// ── COMMENTS ───────────────────────────────────────────────
export async function addComment({ taskId, sender, message, files }) {
  let fileUrl = ''
  if (files?.length) fileUrl = await uploadFiles(files)
  const payload = fileUrl
    ? JSON.stringify({ text: message || '', files: fileUrl })
    : (message || '')

  const { id, password } = getActorCredentials()
  const { error } = await supabase.rpc('rpc_add_comment', {
    p_actor_id: id,
    p_actor_password: password,
    p_task_id: taskId,
    p_sender_name: sender,
    p_message: payload,
    p_hidden_by: '',
  })
  if (error) throw error

  const { data: task } = await supabase.from('Tasks').select('*').eq('TaskID', taskId).single()
  if (task) {
    const notifText = fileUrl ? '📎 Sent an attachment' : (message || '').substring(0, 50)
    const messageText = `💬 New message on "${task.Title}": ${notifText}`

    const senderNorm = String(sender || '').trim().toLowerCase()
    const employeeNameNorm = String(task.EmployeeName || '').trim().toLowerCase()
    const isEmployeeSender = senderNorm === employeeNameNorm

    if (isEmployeeSender) {
      const { data: adminUsers, error: dirError } = await supabase.from('Users').select('ID').in('Role', ['Director', 'Records'])
      if (!dirError && adminUsers?.length) {
        await Promise.all(adminUsers
          .filter(d => String(d.ID) !== String(task.EmployeeID))
          .map(d => createNotification(d.ID, messageText, 'chat', taskId))
        )
      }
    } else {
      const notifyId = task.EmployeeID
      if (notifyId) {
        await createNotification(notifyId, messageText, 'chat', taskId)
      }
    }
  }
}

// ── NOTIFICATIONS ──────────────────────────────────────────
export async function createNotification(userId, message, type = 'info', taskId = '') {
  const { id, password } = getActorCredentials()
  const { error } = await supabase.rpc('rpc_create_notification', {
    p_actor_id: id,
    p_actor_password: password,
    p_user_id: String(userId),
    p_message: message,
    p_type: type,
    p_task_id: String(taskId),
  })
  if (error) {
    console.warn('[createNotification] RPC failed, falling back:', error.message)
    await supabase.from('Notifications').insert({
      UserID: String(userId), Message: message, Type: type,
      IsRead: 'FALSE', CreatedAt: new Date().toISOString(), TaskID: String(taskId),
    })
  }
}

export async function markNotificationsRead(userId) {
  const { id, password } = getActorCredentials()
  const { error } = await supabase.rpc('rpc_mark_notifications_read', {
    p_actor_id: id,
    p_actor_password: password,
    p_user_id: userId,
  })
  if (error) {
    console.warn('[markNotificationsRead] RPC failed, falling back:', error.message)
    await supabase.from('Notifications').update({ IsRead: 'TRUE' }).eq('UserID', userId)
  }
}

export async function markNotificationRead(notifId) {
  const { id, password } = getActorCredentials()
  const { error } = await supabase.rpc('rpc_mark_notification_read', {
    p_actor_id: id,
    p_actor_password: password,
    p_notif_id: notifId,
  })
  if (error) {
    console.warn('[markNotificationRead] RPC failed, falling back:', error.message)
    await supabase.from('Notifications').update({ IsRead: 'TRUE' }).eq('ID', notifId)
  }
}

export async function markChatNotificationsRead(taskId, userId) {
  if (!taskId || !userId) return
  const { id, password } = getActorCredentials()
  const { error } = await supabase.rpc('rpc_mark_chat_notifications_read', {
    p_actor_id: id,
    p_actor_password: password,
    p_task_id: String(taskId),
    p_user_id: String(userId),
  })
  if (error) {
    console.warn('[markChatNotificationsRead] RPC failed, falling back:', error.message)
    await supabase.from('Notifications')
      .update({ IsRead: 'TRUE' })
      .eq('TaskID', String(taskId))
      .eq('Type', 'chat')
      .eq('UserID', String(userId))
      .eq('IsRead', 'FALSE')
  }
}

export async function deleteNotification(notifId) {
  const { id, password } = getActorCredentials()
  const { error } = await supabase.rpc('rpc_delete_notification', {
    p_actor_id: id,
    p_actor_password: password,
    p_notif_id: notifId,
  })
  if (error) {
    console.warn('[deleteNotification] RPC failed, falling back:', error.message)
    await supabase.from('Notifications').delete().eq('ID', notifId)
  }
}

// ── PRESENCE ───────────────────────────────────────────────

// Profile updates use SECURITY DEFINER RPC: Users.ID ≠ auth.uid(); manual login uses anon.
export async function updateProfile(userId, {
  name,
  designation,
  email,
  unit,
  password,
  profilePic,
  sessionPassword,
}) {
  const rpcArgs = {
    p_user_id: userId,
    p_verify_password: sessionPassword ?? '',
    p_name: name !== undefined ? name : null,
    p_designation: designation !== undefined ? designation : null,
    p_email: email !== undefined ? email : null,
    p_unit: unit !== undefined ? unit : null,
    p_new_password:
      password !== undefined && password !== null && String(password).trim() !== ''
        ? String(password).trim()
        : null,
    p_profile_pic: profilePic !== undefined ? profilePic : null,
  }

  const { error } = await supabase.rpc('user_update_own_profile', rpcArgs)
  if (error) throw error
  await refreshGlobalDataForCurrentSession()
}

export async function updatePresence(userId, status) {
  // Manual login users (anon) cannot update public.Users directly due to RLS.
  // We use the SECURITY DEFINER RPC to bypass this.
  const { error } = await supabase.rpc('user_update_status', {
    p_user_id: userId,
    p_status: status,
    p_verify_password: useStore.getState().session?.Password || ''
  })
  
  if (error) {
    console.error('[PRESENCE] Update failed:', error.message)
    // We still update local store for optimistic UI, but refresh will revert it
  }

  // Update session in store to reflect the change
  const session = useStore.getState().session
  if (session && String(session.ID) === String(userId)) {
    useStore.getState().updateSession({ Status: status })
  }
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
  const { id, password } = getActorCredentials()
  const { error } = await supabase.rpc('rpc_delete_task', {
    p_actor_id: id,
    p_actor_password: password,
    p_task_id: taskId,
  })
  if (error) throw error
}

export async function deleteTasks(taskIds) {
  await Promise.all(taskIds.map(id => deleteTask(id)))
}

export async function restoreTasks(taskIds) {
  await Promise.all(taskIds.map(id => toggleArchive(id, false)))
}

export async function deleteUser(userId, actorDirectorId, directorPassword = '') {
  const { error } = await supabase.rpc('director_delete_user', {
    p_director_id: actorDirectorId,
    p_director_password: directorPassword || null,
    p_target_user_id: userId,
  })
  if (error) throw error
}

export async function clearNotifications(userId) {
  const { id, password } = getActorCredentials()
  const { error } = await supabase.rpc('rpc_clear_notifications', {
    p_actor_id: id,
    p_actor_password: password,
    p_user_id: userId,
  })
  if (error) {
    console.warn('[clearNotifications] RPC failed, falling back:', error.message)
    await supabase.from('Notifications').delete().eq('UserID', userId)
  }
}

export async function markChatRead(taskId, sessionName) {
  const { id, password } = getActorCredentials()
  const { error } = await supabase.rpc('rpc_mark_chat_read', {
    p_actor_id: id,
    p_actor_password: password,
    p_task_id: taskId,
    p_session_name: sessionName,
  })
  if (error) {
    console.warn('[markChatRead] RPC failed, falling back to direct update:', error.message)
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
}
// ── GOOGLE AUTH ────────────────────────────────────────────────
export async function signInWithGoogle() {
  // Do not call signOut() here: it clears the PKCE code_verifier from storage and can cause
  // "OAuth state not found or expired" when combined with Strict Mode or slow redirects.
  // Account switching is handled with prompt=select_account on the authorize URL.

  const redirectTo =
    typeof window !== 'undefined'
      ? window.location.origin
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

export async function handleGoogleCallback(selectedRegion = 'Region I') {
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

  // H7 FIX: Query directly by email instead of fetching all users
  const { data: existing, error: findError } = await supabase
    .from('Users')
    .select('*')
    .ilike('Email', email)
    .maybeSingle()

  if (findError) { console.error('User lookup error:', findError); return null }

  if (existing) {
    // Backfill email if it was missing
    if (!existing.Email) {
      await supabase.from('Users').update({ Email: email }).eq('ID', existing.ID)
    }
    return { user: { ...existing, Email: email }, isNew: false }
  }

  // New Google user — insert as Pending, using their exact Supabase Auth UUID
  const newId = authUser.id
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
    Region:        selectedRegion,
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
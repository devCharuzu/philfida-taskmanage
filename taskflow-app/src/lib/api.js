import { supabase } from './supabase'
import { useStore } from '../store/useStore'

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
  // Never '*' — that would include Password. See SECURITY-lock-passwords.sql.
  const { data, error } = await supabase.from('Users').select('ID, Name, Email, Role, Unit, Office, Designation, ProfilePic, Status, AccountStatus, CreatedAt, UpdatedAt, Region, SignatoryName, SignatoryDesignation')
  if (error) throw error
  return data
}

// C2/C3 FIX: Authenticate a single user by ID — never exposes other users' data.
// Returns the matching user or null; password comparison happens here so the
// full user list is never sent to the client during login.
export async function loginUser(userId, password, region) {
  // Verified inside the database by login_user() (SECURITY DEFINER). This used
  // to SELECT * and compare Password in the browser, which required the anon
  // role to be able to read the password column — and since the anon key ships
  // in the client bundle, that made every account's plaintext password
  // world-readable over the REST API. See SECURITY-lock-passwords.sql.
  const { data, error } = await supabase.rpc('login_user', {
    p_id: String(userId).trim(),
    p_password: password,
    p_region: region || null,
  })

  if (error) {
    console.error('loginUser failed:', error.message)
    return { error: 'invalid_credentials' }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { error: 'invalid_credentials' }
  if (row.login_error) return { error: row.login_error }

  const { login_error, ...user } = row
  // Manual Personnel-ID sessions still need the password to authorise the
  // director RPCs, which have no JWT to verify against. It is held only in this
  // user's own browser and is never read back from the server.
  return { user: { ...user, Password: password } }
}

// Registration is silent otherwise — the Director only finds a pending
// signup if they happen to open the Pending tab. Best-effort: a failure here
// must never block registration itself.
async function notifyDirectorsOfRegion(region, message) {
  try {
    const { data: directors } = await supabase
      .from('Users')
      .select('ID')
      .eq('Role', 'Director')
      .eq('Region', region)
    if (directors?.length) {
      await Promise.all(directors.map(d => createNotification(d.ID, message, 'info', '')))
    }
  } catch (e) {
    console.warn('notifyDirectorsOfRegion failed', e)
  }
}

/** Enter ID, no password — used by the login page's "check my status" link.
 *  Deliberately coarse (active vs not) so an unauthenticated caller can't use
 *  it to enumerate which employee IDs exist or their exact account state. */
export async function checkAccountStatus(idOrEmail) {
  const input = (idOrEmail || '').trim()
  if (!input) return 'inactive'
  // Google users only know their email — their ID is an auth UUID they never
  // see. Anything with '@' is treated as an email lookup instead.
  const query = supabase.from('Users').select('AccountStatus')
  const { data: user } = input.includes('@')
    ? await query.ilike('Email', input.toLowerCase()).maybeSingle()
    : await query.eq('ID', input).maybeSingle()
  return user?.AccountStatus === 'Active' ? 'active' : 'inactive'
}

/** Availability of the approving Director for a region — shown to users at
 *  registration/pending-login so they know whether approval is likely soon.
 *  Anon-readable by design (Users has an anon SELECT policy); exposes only
 *  name + coarse status. */
export async function getDirectorAvailability(region) {
  try {
    const { data } = await supabase
      .from('Users')
      .select('Name, Status')
      .eq('Role', 'Director')
      .eq('Region', region)
      .eq('AccountStatus', 'Active')
      .limit(1)
    if (!data?.length) return null
    const raw = data[0].Status || 'Available'
    const status = raw.startsWith('Official Travel') ? 'Official Travel'
      : raw.startsWith('On Leave') ? 'On Leave'
      : 'Available'
    return { name: data[0].Name, status }
  } catch {
    return null
  }
}

export async function registerUser({ id, name, email = '', unit, role, pass, region }) {
  const normEmail = (email || '').trim().toLowerCase()

  // Email is optional (no SMTP feature depends on it anymore), but if given
  // it must still be unique: handleGoogleCallback() looks users up by email
  // with maybeSingle(), which errors outright if two rows match — a duplicate
  // here would break Google sign-in for both accounts. Skipped entirely when
  // no email is provided, since empty values shouldn't collide with each other.
  if (normEmail) {
    const { data: emailTaken } = await supabase
      .from('Users').select('ID').ilike('Email', normEmail).maybeSingle()
    if (emailTaken) return 'EXISTS'
  }

  const { error } = await supabase.from('Users').insert({
    ID: id,
    Name: name,
    Email: normEmail || null,
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
  await notifyDirectorsOfRegion(region || 'Region I', `🆕 New account pending approval: ${name} (ID: ${id})`)
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

  // In-app notice waiting for them next time they log in. Doesn't reach them
  // before that (no email/push wired — needs an email provider + Edge
  // Function this project doesn't have yet), but closes the loop the moment
  // they do check back, instead of a silent status flip.
  if (status === 'Active') {
    await createNotification(userId, '✅ Your account has been approved. You can now log in.', 'info', '')
  } else if (status === 'Deactivated') {
    await createNotification(userId, '⛔ Your account access has changed. Contact your Director for details.', 'info', '')
  }
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

/** Routing-slip signatory for the Director's own account. Pass null/empty
 *  name+designation to clear the override (falls back to the Director's own
 *  Name/Designation wherever the print template reads it). */
export async function updateDirectorSignatory(directorId, signatoryName, signatoryDesignation, directorPassword = '') {
  const { error } = await supabase.rpc('director_update_signatory', {
    p_director_id: directorId,
    p_director_password: directorPassword || null,
    p_signatory_name: signatoryName || null,
    p_signatory_designation: signatoryDesignation || null,
  })
  if (error) throw error
}

// ── DATA FETCH ─────────────────────────────────────────────
export async function getData(userId, region = 'Region I') {
  const [tasks, users, comments, notifications, history] = await Promise.all([
    supabase.from('Tasks').select('*').eq('Region', region).order('CreatedAt', { ascending: true }),
    supabase.from('Users').select('ID, Name, Email, Role, Unit, Office, Designation, ProfilePic, Status, AccountStatus, CreatedAt, UpdatedAt, Region, SignatoryName, SignatoryDesignation').eq('Region', region),
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
  const session = useStore.getState().session
  const actorId = session?.ID || null
  await supabase.from('TaskHistory').insert({
    TaskID: String(taskId), Action: action, Actor: actor, ActorID: actorId,
    Note: note, CreatedAt: new Date().toISOString(),
  })
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
  
  // Get creator's region
  const session = useStore.getState().session
  const region = session?.Region || 'Region I'

  const { error } = await supabase.from('Tasks').insert({
    TaskID: taskId, EmployeeID: empId, EmployeeName: empName,
    Title: title, Instructions: instructions,
    FileLink: fileUrl, Status: 'Assigned',
    Archived: 'FALSE', Deadline: deadline || null,
    Priority: priority || 'Normal', Category: category || 'General',
    PriorityFlags: priorityFlags || [],
    PurposeCheckboxes: purposeCheckboxes || [],
    ApprovalAction: approvalAction || '',
    Region: region,
    CreatedAt: new Date().toISOString(),
  })
  if (error) throw error
  await createNotification(empId, `📋 New task assigned to you: "${title}"`, 'task', taskId)
  // Log history — actor is the dispatcher (fetched from task record)
  await logHistory(taskId, 'Dispatched', actorName)
  return taskId
}

export async function editTask({ taskId, title, instructions, priority, category, deadline, files }) {
  const updates = { Title: title, Instructions: instructions, Priority: priority, Category: category, Deadline: deadline || null }
  if (files?.length) updates.FileLink = await uploadFiles(files)
  const { error } = await supabase.from('Tasks').update(updates).eq('TaskID', taskId)
  if (error) throw error
  // History logged externally with actor name
}

export async function setTaskStatus(taskId, status, actorName = '', actorId = null) {
  const col = status === 'Received' ? 'ReceivedAt' : 'CompletedAt'
  const { error } = await supabase.from('Tasks').update({
    Status: status, [col]: new Date().toISOString(),
  }).eq('TaskID', taskId)
  if (error) throw error
  if (actorName) await logHistory(taskId, status, actorName)

  if (['Received', 'Completed'].includes(status)) {
    const { data: task } = await supabase.from('Tasks').select('*').eq('TaskID', taskId).single()
    if (task) {
      const msg = status === 'Received'
        ? `✅ ${task.EmployeeName} accepted "${task.Title}"`
        : `✅ ${task.EmployeeName} completed "${task.Title}"`

      // Find the user who dispatched (attached) this task
      const { data: historyEntries } = await supabase
        .from('TaskHistory')
        .select('*')
        .eq('TaskID', taskId)
        .eq('Action', 'Dispatched')
        .order('CreatedAt', { ascending: true })
        .limit(1)

      const dispatchEntry = historyEntries?.[0]
      let dispatcherId = null

      if (dispatchEntry) {
        if (dispatchEntry.ActorID) {
          dispatcherId = dispatchEntry.ActorID
        } else if (dispatchEntry.Actor) {
          // Look up user by Name as fallback
          const { data: usr } = await supabase
            .from('Users')
            .select('ID')
            .eq('Name', dispatchEntry.Actor)
            .limit(1)
          if (usr?.length) {
            dispatcherId = usr[0].ID
          }
        }
      }

      if (dispatcherId) {
        if (String(dispatcherId) !== String(actorId || '')) {
          await createNotification(dispatcherId, msg, 'task', taskId)
        }
      } else {
        // Safe fallback: notify Directors only
        const { data: directors } = await supabase.from('Users').select('ID').eq('Role', 'Director')
        if (directors?.length) {
          await Promise.all(directors
            .filter(d => String(d.ID) !== String(actorId || ''))
            .map(d => createNotification(d.ID, msg, 'task', taskId))
          )
        }
      }
    }
  }
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

  const senderId = useStore.getState().session?.ID || null
  const { error } = await supabase.from('Comments').insert({
    TaskID: taskId, SenderName: sender, SenderID: senderId ? String(senderId) : null,
    Message: payload, TimeStamp: new Date().toISOString(), HiddenBy: '',
  })
  if (error) throw error

  const { data: task } = await supabase.from('Tasks').select('*').eq('TaskID', taskId).single()
  if (task) {
    const notifText = fileUrl ? '📎 Sent an attachment' : (message || '').substring(0, 50)
    const messageText = `💬 New message on "${task.Title}": ${notifText}`

    // Find the task sender (dispatcher) who attached the task
    const { data: historyEntries } = await supabase
      .from('TaskHistory')
      .select('*')
      .eq('TaskID', taskId)
      .eq('Action', 'Dispatched')
      .order('CreatedAt', { ascending: true })
      .limit(1)

    const dispatchEntry = historyEntries?.[0]
    let dispatcherId = null

    if (dispatchEntry) {
      if (dispatchEntry.ActorID) {
        dispatcherId = dispatchEntry.ActorID
      } else if (dispatchEntry.Actor) {
        // Fallback: look up user by Name
        const { data: usr } = await supabase
          .from('Users')
          .select('ID')
          .eq('Name', dispatchEntry.Actor)
          .limit(1)
        if (usr?.length) {
          dispatcherId = usr[0].ID
        }
      }
    }

    const session = useStore.getState().session
    const currentUserId = session?.ID

    const senderNorm = String(sender || '').trim().toLowerCase()
    const employeeNameNorm = String(task.EmployeeName || '').trim().toLowerCase()
    const isEmployeeSender = senderNorm === employeeNameNorm

    if (isEmployeeSender) {
      // Receiver (Employee) sent a comment -> notify the task sender (dispatcher)
      if (dispatcherId && String(dispatcherId) !== String(currentUserId || '')) {
        await createNotification(dispatcherId, messageText, 'chat', taskId)
      }
    } else {
      // Task sender (dispatcher) sent a comment -> notify the task receiver (Employee)
      const notifyId = task.EmployeeID
      if (notifyId && String(notifyId) !== String(currentUserId || '')) {
        await createNotification(notifyId, messageText, 'chat', taskId)
      }
    }
  }
}

// ── NOTIFICATIONS ──────────────────────────────────────────
export async function createNotification(userId, message, type = 'info', taskId = '') {
  // TaskID has a foreign key to Tasks — '' is a real non-null value that
  // matches no row and fails the constraint, unlike NULL. Every non-task
  // notification (director-registration alert, approval notice) was silently
  // failing this insert until now; the caller only saw a swallowed error.
  const { data, error } = await supabase.from('Notifications').insert({
    UserID: String(userId), Message: message, Type: type,
    IsRead: 'FALSE', CreatedAt: new Date().toISOString(), TaskID: taskId ? String(taskId) : null,
  }).select('ID').single()
  if (error) { console.error('createNotification failed:', error.message); return }
  deliverPush(data?.ID)
}

// ── PUSH SUBSCRIPTIONS ─────────────────────────────────────
/** Stores this device's push subscription so the sender's browser can reach it
 *  even when the recipient's browser is closed. See push-subscriptions.sql. */
export async function savePushSubscription(userId, subscription) {
  const keys = subscription?.keys || {}
  if (!userId || !subscription?.endpoint || !keys.p256dh || !keys.auth) return
  const { error } = await supabase.rpc('save_push_subscription', {
    p_user_id: String(userId),
    p_endpoint: subscription.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
  })
  if (error) console.warn('savePushSubscription failed:', error.message)
}

export async function removePushSubscription(endpoint) {
  if (!endpoint) return
  const { error } = await supabase.rpc('delete_push_subscription', { p_endpoint: endpoint })
  if (error) console.warn('removePushSubscription failed:', error.message)
}

/** Asks the serverless function to deliver an already-created notification to
 *  the recipient's devices. Fire-and-forget: push is an enhancement, so a
 *  failure here must never surface to the user or block the calling action. */
function deliverPush(notificationId) {
  if (notificationId == null || typeof fetch === 'undefined') return
  fetch('/api/push-send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notificationId }),
  }).catch(() => {})
}

export async function markNotificationsRead(userId) {
  await supabase.from('Notifications').update({ IsRead: 'TRUE' }).eq('UserID', userId)
}

export async function markNotificationRead(notifId) {
  await supabase.from('Notifications').update({ IsRead: 'TRUE' }).eq('ID', notifId)
}

export async function markChatNotificationsRead(taskId, userId) {
  if (!taskId || !userId) return
  await supabase.from('Notifications')
    .update({ IsRead: 'TRUE' })
    .eq('TaskID', String(taskId))
    .eq('Type', 'chat')
    .eq('UserID', String(userId))
    .eq('IsRead', 'FALSE')
}

export async function deleteNotification(notifId) {
  await supabase.from('Notifications').delete().eq('ID', notifId)
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

// Presence strings carry trailing machine-readable markers appended to the
// human text: `[TO:<path>]` for the travel-order file and `[GEO:<lat>,<lng>]`
// for a pinned location. Every display site must strip ALL of them — five
// separate call sites previously stripped only [TO:], so any new marker would
// have leaked into the UI as literal text.
const STATUS_MARKER_RE = /\s*\[(?:TO|GEO):[^\]]*\]/g

/** Builds an "Official Travel" presence string with its markers attached.
 *  Four call sites (profile toggle, calendar add/edit, profile edit modal, and
 *  the auto-apply scheduler) each assembled this by hand, and three of them
 *  omitted the [GEO:] marker — so a pinned location was silently dropped the
 *  moment the trip was edited or auto-applied. `dateRange` stays caller-supplied
 *  because the callers legitimately format it differently. */
export function buildTravelStatus({ activity, location, dateRange, filePath, lat, lng }) {
  const file = filePath ? ` [TO:${filePath}]` : ''
  const geo = (lat != null && lng != null && lat !== '' && lng !== '') ? ` [GEO:${lat},${lng}]` : ''
  return `Official Travel — ${activity} at ${location} (${dateRange})${file}${geo}`
}

export function stripStatusMarkers(status) {
  return String(status || '').replace(STATUS_MARKER_RE, '').trim()
}

/** Reads the pinned coordinates back out of a presence string, if present. */
export function parseStatusGeo(status) {
  const m = String(status || '').match(/\[GEO:(-?[\d.]+),(-?[\d.]+)\]/)
  if (!m) return null
  const lat = parseFloat(m[1])
  const lng = parseFloat(m[2])
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
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

/** Unsends one of your own messages for everyone in the thread. The row stays
 *  as a tombstone (Unsent=true, Message cleared) so both sides keep a
 *  "... unsent a message" placeholder rather than having text silently vanish.
 *  Ownership is re-checked server-side by the unsend_comment RPC — the client
 *  only decides whether to *offer* the action. See unsend-comment-rpc.sql. */
export async function unsendComment(commentId, userId, senderName) {
  const { error } = await supabase.rpc('unsend_comment', {
    p_comment_id: commentId,
    p_user_id: userId ? String(userId) : null,
    p_sender_name: senderName,
  })
  if (error) throw error
}

export function getUnreadCommentCount(comments, taskId, sessionName) {
  return comments.filter(c =>
    String(c.TaskID) === String(taskId) &&
    c.SenderName !== sessionName &&
    !c.Unsent &&
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

export async function deleteUser(userId, actorDirectorId, directorPassword = '') {
  const { error } = await supabase.rpc('director_delete_user', {
    p_director_id: actorDirectorId,
    p_director_password: directorPassword || null,
    p_target_user_id: userId,
  })
  if (error) throw error
}

export async function clearNotifications(userId) {
  await supabase.from('Notifications').delete().eq('UserID', userId)
}

export async function markChatRead(taskId, sessionName) {
  // Single atomic write via RPC (see mark-chat-read-rpc.sql) — avoids the
  // N-individual-UPDATE race that let a stale resync clobber the store.
  // Non-throwing: if the RPC hasn't been applied yet, chat still works,
  // it just won't clear the unread badge server-side until it is.
  const { error } = await supabase.rpc('mark_chat_read', { p_task_id: String(taskId), p_session_name: sessionName })
  if (error) console.error('markChatRead failed:', error.message)
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

  await notifyDirectorsOfRegion(selectedRegion, `🆕 New Google sign-up pending approval: ${name} (${email})`)

  const { data: newUser } = await supabase.from('Users').select('ID, Name, Email, Role, Unit, Office, Designation, ProfilePic, Status, AccountStatus, CreatedAt, UpdatedAt, Region, SignatoryName, SignatoryDesignation').eq('ID', newId).single()
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
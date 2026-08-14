import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import {
  updateUserAccountStatus,
  updateUserRole,
  deleteUser,
  getAllUsers,
  UNITS,
  OFFICES,
  hasSupabaseAuthSession,
} from '../lib/api'
import { withErrorHandling, validateForm, ERROR_MESSAGES } from '../lib/errorHandler'
import UserStatusPopover from './UserStatusPopover'
import DirectorPasswordModal from './DirectorPasswordModal'

const ROLE_COLORS = {
  Director:    'bg-purple-100 text-purple-700 border-purple-200',
  'Unit Head': 'bg-blue-100 text-blue-700 border-blue-200',
  Employee:    'bg-green-100 text-green-700 border-green-200',
  Records:     'bg-slate-100 text-slate-700 border-slate-200',
}

const STATUS_COLORS = {
  Active:      'bg-green-100 text-green-700',
  Pending:     'bg-amber-100 text-amber-700',
  Deactivated: 'bg-red-100 text-red-700',
}

export default function UserManagement({ users, onSync }) {
  const session = useStore(s => s.session)

  const [filter,       setFilter]       = useState('Pending')
  const [editUser,     setEditUser]     = useState(null)
  const [editRole,     setEditRole]     = useState('')
  const [editUnit,     setEditUnit]     = useState('')
  const [loading,      setLoading]      = useState(null)

  // Delete flow
  const [deleteTarget, setDeleteTarget] = useState(null) // user to delete
  const [dirPassword,  setDirPassword]  = useState('')
  const [showPass,     setShowPass]     = useState(false)
  const [deleteError,  setDeleteError]  = useState('')
  const [deleteLoading,setDeleteLoading]= useState(false)
  const [oauthForDelete,setOauthForDelete]= useState(false) // Supabase Auth session → delete RPC uses JWT email

  // Approve / Deactivate / Reactivate flow — same password-confirm modal as
  // Delete, themed per action instead of a bare window.prompt().
  const [pendingAction, setPendingAction] = useState(null) // { type, userId }
  const [editPasswordOpen, setEditPasswordOpen] = useState(false)
  const [editError, setEditError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const filteredUsers = filter === 'All' ? users : users.filter(u => u.AccountStatus === filter)
  const pendingCount   = users.filter(u => u.AccountStatus === 'Pending').length

  const ACTION_CONFIG = {
    approve:    { status: 'Active',      icon: 'bi-check-circle-fill', title: 'Approve Account',    subtitle: 'Grant this user access', theme: 'success', confirmLabel: 'Approve',    confirmIcon: 'bi-check-lg' },
    deactivate: { status: 'Deactivated', icon: 'bi-person-dash-fill',  title: 'Deactivate Account',  subtitle: 'This user will lose access', theme: 'warning', confirmLabel: 'Deactivate', confirmIcon: 'bi-slash-circle' },
    reactivate: { status: 'Active',      icon: 'bi-arrow-clockwise',   title: 'Reactivate Account',  subtitle: "Restore this user's access", theme: 'success', confirmLabel: 'Reactivate', confirmIcon: 'bi-check-lg' },
  }

  async function requestAction(type, userId) {
    // Google-auth directors verify via JWT email inside the RPC — no password step needed.
    if (await hasSupabaseAuthSession()) {
      await runAction(type, userId, '')
      return
    }
    setPendingAction({ type, userId })
  }

  async function runAction(type, userId, password) {
    setLoading(userId + '_' + type)
    setActionLoading(true)
    try {
      await withErrorHandling(async () => {
        await updateUserAccountStatus(userId, ACTION_CONFIG[type].status, session.ID, password)
      }, ERROR_MESSAGES.DATABASE)
      await onSync()
      setPendingAction(null)
    } catch (error) {
      console.error(`Failed to ${type} user:`, error)
      alert(`Failed to ${type} user: ${error.message}`)
    } finally {
      setLoading(null)
      setActionLoading(false)
    }
  }

  const handleApprove    = (userId) => requestAction('approve', userId)
  const handleDeactivate = (userId) => requestAction('deactivate', userId)
  const handleReactivate = (userId) => requestAction('reactivate', userId)

  async function handleSaveEdit() {
    setEditError('')

    const validation = validateForm(
      { editRole, editUnit },
      {
        editRole: { required: true, label: 'Role' },
        editUnit: { required: true, label: editRole === 'Director' ? 'Office' : 'Unit' }
      }
    )

    if (!validation.isValid) {
      setEditError(Object.values(validation.errors)[0])
      return
    }

    // Google-auth directors verify via JWT email inside the RPC — no password step.
    if (await hasSupabaseAuthSession()) {
      await runSaveEdit('')
      return
    }
    setEditPasswordOpen(true)
  }

  async function runSaveEdit(password) {
    if (!editUser) return
    setLoading(editUser.ID + '_edit')
    try {
      await withErrorHandling(async () => {
        await updateUserRole(editUser.ID, editRole, editUnit, session.ID, password)
      }, ERROR_MESSAGES.DATABASE)
      await onSync()
      setEditPasswordOpen(false)
      setEditUser(null)
    } catch (error) {
      console.error('Failed to update user role:', error)
      setEditError(error.message || 'Failed to update user. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  function openDeleteConfirm(user) {
    setDeleteTarget(user)
    setDirPassword('')
    setDeleteError('')
    setShowPass(false)
    hasSupabaseAuthSession().then(setOauthForDelete)
  }

  async function handleConfirmDelete() {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const oauth = await hasSupabaseAuthSession()
      let secret = ''
      if (!oauth) {
        if (!dirPassword.trim()) {
          setDeleteError('Please enter your password.')
          setDeleteLoading(false)
          return
        }
        secret = dirPassword.trim()
      }
      await withErrorHandling(async () => {
        await deleteUser(deleteTarget.ID, session.ID, secret)
      }, ERROR_MESSAGES.DATABASE)
      
      await onSync()
      setDeleteTarget(null)
      setDirPassword('')
    } catch (error) {
      console.error('Failed to delete user:', error)
      setDeleteError(`Failed to delete user: ${error.message}`)
    } finally {
      setDeleteLoading(false)
    }
  }

  const Spinner = () => <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />

  // ── UserCard ────────────────────────────────────────────────────────
  function UserCard({ user: u, loading, onApprove, onDeactivate, onReactivate, onEdit, onDelete }) {
    const [menuOpen, setMenuOpen] = useState(false)
    const btnRef = useRef()

    const getStatusStyle = (status) => {
      switch (status) {
        case 'Active': return 'bg-emerald-50 border-emerald-100 text-emerald-800'
        case 'Pending': return 'bg-amber-50 border-amber-100 text-amber-800'
        case 'Deactivated': return 'bg-rose-50 border-rose-100 text-rose-800'
        default: return 'bg-slate-50 border-slate-100 text-slate-700'
      }
    }

    const getRoleIcon = (role) => {
      switch (role) {
        case 'Director': return 'bi-briefcase-fill'
        case 'Unit Head': return 'bi-person-badge-fill'
        default: return 'bi-person-fill'
      }
    }

    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-full overflow-hidden hover:shadow-md transition-shadow">
        {/* ── SECTION 1: User Header ── */}
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 border-l-[3px] border-l-blue-600">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex items-center gap-1.5 min-w-0">
                <i className={`bi ${getRoleIcon(u.Role)} text-blue-600 text-sm flex-shrink-0`} />
                <UserStatusPopover
                  name={u.Name}
                  status={u.Status}
                  popoverMaxW={280}
                  chipClassName="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate cursor-pointer hover:text-blue-700 transition-colors"
                />
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 mt-2 min-w-0">
                <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 bg-slate-100 px-1.5 sm:px-2 py-0.5 rounded flex-shrink-0">ID: {u.ID}</span>
                <span className="text-[10px] sm:text-[11px] text-slate-400 truncate min-w-0">{u.Unit || u.Office || 'Unassigned Unit'}</span>
              </div>
            </div>
            <button ref={btnRef} onClick={() => setMenuOpen(!menuOpen)}
              className="btn-ghost p-1.5 text-slate-400 hover:text-slate-700 relative flex-shrink-0 -mr-1">
              <i className="bi bi-three-dots-vertical text-lg" />
            </button>
          </div>
        </div>

        {/* ── SECTION 2: Role & Status with Dividers ── */}
        <div className="grid grid-cols-2 gap-0 divide-x divide-slate-100 min-w-0">
          <div className="px-2 sm:px-4 py-3.5 text-center min-w-0">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Role</p>
            <span className={`inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2 sm:px-3 py-1.5 rounded-full border truncate max-w-full ${ROLE_COLORS[u.Role] || 'bg-slate-100 text-slate-600'}`}>
              <i className={`bi ${getRoleIcon(u.Role)} flex-shrink-0`} />
              <span className="truncate">{u.Role}</span>
            </span>
          </div>
          <div className="px-2 sm:px-4 py-3.5 text-center min-w-0">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Status</p>
            <span className={`inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2 sm:px-3 py-1.5 rounded-full border truncate max-w-full ${getStatusStyle(u.AccountStatus)}`}>
              <i className={`bi bi-circle-fill text-[6px] flex-shrink-0 ${u.AccountStatus === 'Active' ? 'text-emerald-500' : u.AccountStatus === 'Pending' ? 'text-amber-500' : 'text-rose-500'}`} />
              <span className="truncate">{u.AccountStatus || 'Active'}</span>
            </span>
          </div>
        </div>

        {/* ── SECTION 3: Footer Info ── */}
        <div className="px-3 sm:px-4 py-2 bg-slate-50/50 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 min-w-0">
            <span className="flex items-center gap-1 min-w-0 truncate">
              <i className="bi bi-envelope text-slate-300 flex-shrink-0" />
              <span className="truncate">{u.Email || 'No email'}</span>
            </span>
            <span className="flex items-center gap-1 flex-shrink-0">
              <i className="bi bi-shield-check text-slate-300" />
              <span className="hidden sm:inline">{u.Role}</span>
            </span>
          </div>
        </div>

        {/* Action Menu Dropdown */}
        <PortalDropdown anchorRef={btnRef} open={menuOpen} onClose={() => setMenuOpen(false)}>
          {u.AccountStatus === 'Pending' && (
            <button onClick={() => { onApprove(); setMenuOpen(false) }} disabled={loading === u.ID + '_approve'}
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 text-left text-slate-700">
              <i className="bi bi-check-lg text-green-700" /> Approve Account
            </button>
          )}
          {u.AccountStatus === 'Active' && (
            <button onClick={() => { onDeactivate(); setMenuOpen(false) }} disabled={loading === u.ID + '_deactivate'}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left text-slate-700">
              <i className="bi bi-person-x text-amber-600" /> Deactivate Account
            </button>
          )}
          {u.AccountStatus === 'Deactivated' && (
            <button onClick={() => { onReactivate(); setMenuOpen(false) }} disabled={loading === u.ID + '_reactivate'}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left text-slate-700">
              <i className="bi bi-person-check text-emerald-600" /> Reactivate Account
            </button>
          )}
          <div className="border-t border-slate-100" />
          <button onClick={() => { onEdit(); setMenuOpen(false) }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left text-slate-700">
            <i className="bi bi-pencil text-green-700" /> Edit User
          </button>
          <div className="border-t border-slate-100" />
          <button onClick={() => { onDelete(); setMenuOpen(false) }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 text-left text-red-600">
            <i className="bi bi-trash3 text-red-500" /> Delete Permanently
          </button>
        </PortalDropdown>
      </div>
    )
  }

  // ── Portal Dropdown ─────────────────────────────────
  function PortalDropdown({ anchorRef, open, onClose, children }) {
    const [pos, setPos] = useState({ top: 0, left: 0 })
    const dropdownRef = useRef()

    // Position dropdown
    useEffect(() => {
      if (open && anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect()
        const viewportHeight = window.innerHeight
        const viewportWidth = window.innerWidth
        const dropdownHeight = 200
        const dropdownWidth = 200

        let left = rect.left + rect.width / 2 - dropdownWidth / 2
        let top = rect.bottom + 4

        if (left < 8) left = 8
        if (left + dropdownWidth > viewportWidth - 8) left = viewportWidth - dropdownWidth - 8
        if (top + dropdownHeight > viewportHeight - 8) top = rect.top - dropdownHeight - 4

        setPos({ top, left })
      }
    }, [open, anchorRef])

    // Click outside to close
    useEffect(() => {
      if (!open) return
      function handleClick(e) {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
            anchorRef.current && !anchorRef.current.contains(e.target)) {
          onClose()
        }
      }
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }, [open, onClose, anchorRef])

    // ESC key to close
    useEffect(() => {
      if (!open) return
      function handleKey(e) {
        if (e.key === 'Escape') onClose()
      }
      document.addEventListener('keydown', handleKey)
      return () => document.removeEventListener('keydown', handleKey)
    }, [open, onClose])

    if (!open) return null

    return createPortal(
      <div
        ref={dropdownRef}
        className="fixed bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 min-w-[180px] max-w-[220px]"
        style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>,
      document.body
    )
  }

  return (
    <div className="space-y-6 w-full">

      {/* Filter tabs - premium segmented control style */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-100/50 p-1.5 rounded-2xl w-fit">
        {['Pending', 'Active', 'Deactivated', 'All'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200
              ${filter === f 
                ? 'bg-white text-green-800 shadow-sm ring-1 ring-black/5' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}>
            {f}
            {f === 'Pending' && pendingCount > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* User Cards - All Screen Sizes */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm w-full">
        {/* Cards Grid View - Responsive for desktop (900px breakpoint) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start p-4 md:p-6 lg:p-8">
          {filteredUsers.length === 0 ? (
            <div className="col-span-full text-center py-16 text-slate-400">
              <i className="bi bi-people text-3xl block mb-2 opacity-30" />
              No users in this category.
            </div>
          ) : filteredUsers.map(u => (
            <UserCard
              key={u.ID}
              user={u}
              loading={loading}
              onApprove={() => handleApprove(u.ID)}
              onDeactivate={() => handleDeactivate(u.ID)}
              onReactivate={() => handleReactivate(u.ID)}
              onEdit={() => { setEditUser(u); setEditRole(u.Role); setEditUnit(u.Unit || u.Office || ''); setEditError('') }}
              onDelete={() => openDeleteConfirm(u)}
            />
          ))}
        </div>
      </div>

      {/* ── EDIT MODAL ── */}
      {editUser && createPortal(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setEditUser(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header — the action is the title, the person is the subject beneath it.
                Previously both were crammed into one line as "Edit User — <name>",
                which left the name competing with the action and truncating badly. */}
            <div className="flex items-center gap-3 px-6 py-4 rounded-t-2xl bg-green-800">
              <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0">
                <i className="bi bi-person-gear text-white text-base" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-0 text-white font-semibold text-[15px] leading-tight tracking-tight">Edit user</p>
                <p className="mb-0 mt-0.5 truncate text-green-100/80 text-[11px] font-medium leading-tight">{editUser.Name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditUser(null)}
                aria-label="Close"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <i className="bi bi-x-lg text-sm" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label htmlFor="eu-role" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Role</label>
                <select
                  id="eu-role"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  value={editRole}
                  onChange={e => { setEditRole(e.target.value); setEditUnit(''); setEditError('') }}
                >
                  <option value="Employee">Unit Personnel</option>
                  <option value="Unit Head">Unit Head</option>
                  <option value="Director">Director</option>
                  <option value="Records">Records</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="eu-unit" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  {editRole === 'Director' ? 'Office' : 'Unit'}
                </label>
                <select
                  id="eu-unit"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  value={editUnit}
                  onChange={e => { setEditUnit(e.target.value); setEditError('') }}
                >
                  <option value="">Select {editRole === 'Director' ? 'Office' : 'Unit'}</option>
                  {(editRole === 'Director' ? OFFICES : UNITS).map(u => <option key={u}>{u}</option>)}
                </select>
              </div>

              {editError && (
                <p className="mb-0 flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                  <i className="bi bi-exclamation-circle-fill" aria-hidden="true" />{editError}
                </p>
              )}
            </div>

            {/* Footer — Cancel/Save pair, matching the other form modals; the ×
                used to be the only way to back out. */}
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setEditUser(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={loading === editUser.ID + '_edit'}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-900 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
              >
                {loading === editUser.ID + '_edit'
                  ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Saving…</>
                  : 'Save changes'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── APPROVE / DEACTIVATE / REACTIVATE CONFIRM MODAL ── */}
      {editPasswordOpen && editUser && (
        <DirectorPasswordModal
          icon="bi-person-gear"
          title="Save User Changes"
          subtitle={`Update role and unit for ${editUser.Name}`}
          theme="success"
          confirmLabel="Save"
          confirmIcon="bi-check-lg"
          loading={loading === editUser.ID + '_edit'}
          onCancel={() => setEditPasswordOpen(false)}
          onConfirm={runSaveEdit}
        />
      )}

      {pendingAction && (
        <DirectorPasswordModal
          {...ACTION_CONFIG[pendingAction.type]}
          loading={actionLoading}
          onCancel={() => setPendingAction(null)}
          onConfirm={(password) => runAction(pendingAction.type, pendingAction.userId, password)}
        />
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
      {deleteTarget && createPortal(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

            {/* Header — same metrics as the other standardised modals, in the
                destructive colour. It had no close control at all before. */}
            <div className="flex items-center gap-3 px-6 py-4 rounded-t-2xl bg-red-600">
              <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0">
                <i className="bi bi-person-x-fill text-white text-base" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-0 text-white font-semibold text-[15px] leading-tight tracking-tight">Delete account</p>
                <p className="mb-0 mt-0.5 text-red-100/80 text-[11px] font-medium leading-tight">This cannot be undone</p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                aria-label="Close"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <i className="bi bi-x-lg text-sm" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Who is being deleted. The separator is only rendered when there
                  is a unit to follow it — it used to print a dangling "·". */}
              <div className="rounded-xl border border-red-100 bg-red-50 p-3.5">
                <p className="mb-0 text-sm font-semibold text-slate-900 leading-tight">{deleteTarget.Name}</p>
                <p className="mb-0 mt-1 text-[11px] text-slate-500 leading-tight">
                  ID: {deleteTarget.ID}
                  {(deleteTarget.Unit || deleteTarget.Office) ? ` · ${deleteTarget.Unit || deleteTarget.Office}` : ''}
                </p>
              </div>

              <p className="mb-0 text-[13px] leading-relaxed text-slate-600">
                This permanently removes the user, all their assigned tasks, and associated data.
              </p>

              {/* Director password confirmation (manual login only; Google OAuth uses JWT inside RPC). */}
              {oauthForDelete ? (
                <p className="mb-0 text-[13px] text-slate-600">You are signed in with Google — no director password needed.</p>
              ) : (
                <div className="space-y-1">
                  <label htmlFor="del-pass" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Your Director Password
                  </label>
                  <div className="relative">
                    <input
                      id="del-pass"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 pr-11 text-sm font-medium text-slate-800 outline-none transition-all focus:bg-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                      type={showPass ? 'text' : 'password'}
                      placeholder="Enter your password to confirm"
                      value={dirPassword}
                      onChange={e => { setDirPassword(e.target.value); setDeleteError('') }}
                      onKeyDown={e => e.key === 'Enter' && handleConfirmDelete()}
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600">
                      <i className={`bi bi-${showPass ? 'eye-slash' : 'eye'}`} />
                    </button>
                  </div>
                </div>
              )}
              {deleteError && (
                <p className="mb-0 flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                  <i className="bi bi-exclamation-circle-fill" aria-hidden="true" />{deleteError}
                </p>
              )}
            </div>

            {/* Footer — Cancel carries no colour weight so the destructive action
                is the only emphasised control, rather than the two sharing width. */}
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteLoading || (!oauthForDelete && !dirPassword.trim())}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
              >
                {deleteLoading
                  ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Deleting…</>
                  : 'Delete account'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store/useStore'
import { updateUserAccountStatus, updateUserRole, deleteUser, getAllUsers, UNITS, OFFICES } from '../lib/api'

const ROLE_COLORS = {
  Director:    'bg-purple-100 text-purple-700 border-purple-200',
  'Unit Head': 'bg-blue-100 text-blue-700 border-blue-200',
  Employee:    'bg-green-100 text-green-700 border-green-200',
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
  const [approvalError, setApprovalError] = useState('')

  // Delete flow
  const [deleteTarget, setDeleteTarget] = useState(null) // user to delete
  const [dirPassword,  setDirPassword]  = useState('')
  const [showPass,     setShowPass]     = useState(false)
  const [deleteError,  setDeleteError]  = useState('')
  const [deleteLoading,setDeleteLoading]= useState(false)

  const filteredUsers = filter === 'All' ? users : users.filter(u => u.AccountStatus === filter)
  const pendingCount   = users.filter(u => u.AccountStatus === 'Pending').length

  async function handleApprove(userId) {
    setLoading(userId + '_approve')
    setApprovalError('')
    try {
      await updateUserAccountStatus(userId, 'Active')
      await onSync()
    } catch (error) {
      console.error('Failed to approve user:', error)
      setApprovalError('Failed to approve user. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  async function handleDeactivate(userId) {
    setLoading(userId + '_deactivate')
    setApprovalError('')
    try {
      await updateUserAccountStatus(userId, 'Deactivated')
      await onSync()
    } catch (error) {
      console.error('Failed to deactivate user:', error)
      setApprovalError('Failed to deactivate user. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  async function handleReactivate(userId) {
    setLoading(userId + '_reactivate')
    setApprovalError('')
    try {
      await updateUserAccountStatus(userId, 'Active')
      await onSync()
    } catch (error) {
      console.error('Failed to reactivate user:', error)
      setApprovalError('Failed to reactivate user. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  async function handleSaveEdit() {
    if (!editRole || !editUnit) return
    setLoading(editUser.ID + '_edit')
    await updateUserRole(editUser.ID, editRole, editUnit)
    await onSync()
    setLoading(null)
    setEditUser(null)
  }

  function openDeleteConfirm(user) {
    setDeleteTarget(user)
    setDirPassword('')
    setDeleteError('')
    setShowPass(false)
  }

  async function handleConfirmDelete() {
    if (!dirPassword.trim()) { setDeleteError('Please enter your password.'); return }
    setDeleteLoading(true)
    setDeleteError('')
    try {
      // Verify director password against DB
      const allUsers = await getAllUsers()
      const director = allUsers.find(u => String(u.ID) === String(session.ID))
      if (!director || director.Password !== dirPassword) {
        setDeleteError('Incorrect password. Please try again.')
        setDeleteLoading(false)
        return
      }
      await deleteUser(deleteTarget.ID)
      await onSync()
      setDeleteTarget(null)
      setDirPassword('')
    } catch (e) {
      setDeleteError('Failed to delete user. Please try again.')
    } finally {
      setDeleteLoading(false)
    }
  }

  const Spinner = () => <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />

  // ── UserCard ────────────────────────────────────────────────────────
  function UserCard({ user: u, loading, onApprove, onDeactivate, onReactivate, onEdit, onDelete }) {
    const [menuOpen, setMenuOpen] = useState(false)
    const btnRef = useRef()

    // Blue/purple variation style for User Management (different from task cards)
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
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-full overflow-hidden hover:shadow-md transition-shadow">
        {/* ── SECTION 1: User Header with Badge Style (Blue variation) ── */}
        <div className="bg-gradient-to-r from-slate-50 to-blue-50/30 px-3 sm:px-4 py-3.5 border-b border-slate-100">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 overflow-hidden">
              {/* Name Badge - Blue variation style */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex items-center gap-1.5 bg-white border border-blue-100 rounded-xl px-2.5 sm:px-3 py-1.5 shadow-sm min-w-0 max-w-full">
                  <i className={`bi ${getRoleIcon(u.Role)} text-blue-600 text-sm flex-shrink-0`} />
                  <span className="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">{u.Name}</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 mt-2 ml-0.5 min-w-0">
                <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 bg-slate-100 px-1.5 sm:px-2 py-0.5 rounded flex-shrink-0">ID: {u.ID}</span>
                <span className="text-[10px] sm:text-[11px] text-slate-400 truncate min-w-0">{u.Unit || u.Office}</span>
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

      {/* Approval Error Alert */}
      {approvalError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <i className="bi bi-exclamation-triangle-fill flex-shrink-0 mt-0.5" />
          <span>{approvalError}</span>
          <button onClick={() => setApprovalError('')} className="ml-auto text-red-400 hover:text-red-600">
            <i className="bi bi-x-lg" />
          </button>
        </div>
      )}

      {/* Filter tabs - responsive grid: 2x2 below 800px, 4 columns above */}
      <div className="grid grid-cols-2 min-[800px]:grid-cols-4 gap-3 max-w-2xl">
        {['Pending', 'Active', 'Deactivated', 'All'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-2 py-2.5 rounded-lg text-xs min-[800px]:text-sm font-bold transition-colors text-center whitespace-nowrap
              ${filter === f ? 'bg-green-800 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'}`}>
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
        <div className="grid grid-cols-1 min-[900px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 items-start p-4 md:p-6 lg:p-8">
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
              onEdit={() => { setEditUser(u); setEditRole(u.Role); setEditUnit(u.Unit || u.Office || '') }}
              onDelete={() => openDeleteConfirm(u)}
            />
          ))}
        </div>
      </div>

      {/* ── EDIT MODAL ── */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setEditUser(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg,#0a2e0a,#155414)' }}>
              <p className="text-white font-bold text-sm">Edit User — {editUser.Name}</p>
              <button onClick={() => setEditUser(null)} className="text-green-300 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Role</label>
                <select className="input" value={editRole} onChange={e => { setEditRole(e.target.value); setEditUnit('') }}>
                  <option value="Employee">Unit Personnel</option>
                  <option value="Unit Head">Unit Head</option>
                  <option value="Director">Director</option>
                </select>
              </div>
              <div>
                <label className="label">{editRole === 'Director' ? 'Office' : 'Unit'}</label>
                <select className="input" value={editUnit} onChange={e => setEditUnit(e.target.value)}>
                  <option value="">-- Select {editRole === 'Director' ? 'Office' : 'Unit'} --</option>
                  {(editRole === 'Director' ? OFFICES : UNITS).map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <button onClick={handleSaveEdit} disabled={loading === editUser.ID + '_edit'} className="btn-primary w-full py-2.5">
                {loading === editUser.ID + '_edit' ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

            {/* Red header */}
            <div className="bg-red-600 px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <i className="bi bi-person-x-fill text-white text-lg" />
              </div>
              <div>
                <p className="text-white font-bold text-sm">Delete Account Permanently</p>
                <p className="text-red-200 text-xs mt-0.5">This cannot be undone</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Who is being deleted */}
              <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl p-3">
                <div className="w-9 h-9 rounded-full bg-red-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-red-700 font-bold text-sm">{deleteTarget.Name?.charAt(0)}</span>
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 text-sm">{deleteTarget.Name}</p>
                  <p className="text-slate-500 text-xs">ID: {deleteTarget.ID} · {deleteTarget.Unit || deleteTarget.Office}</p>
                </div>
              </div>

              <p className="text-slate-600 text-sm leading-relaxed">
                Deleting this account will permanently remove the user, all their assigned tasks, and associated data.
              </p>

              {/* Director password confirmation */}
              <div>
                <label className="label">Your Director Password</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPass ? 'text' : 'password'}
                    placeholder="Enter your password to confirm"
                    value={dirPassword}
                    onChange={e => { setDirPassword(e.target.value); setDeleteError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleConfirmDelete()}
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <i className={`bi bi-${showPass ? 'eye-slash' : 'eye'}`} />
                  </button>
                </div>
                {deleteError && (
                  <p className="text-red-600 text-xs mt-1.5 flex items-center gap-1">
                    <i className="bi bi-exclamation-circle-fill" />{deleteError}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1 py-2.5">
                  Cancel
                </button>
                <button onClick={handleConfirmDelete} disabled={deleteLoading || !dirPassword.trim()}
                  className="btn-danger flex-1 py-2.5 disabled:opacity-50">
                  {deleteLoading
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    : <><i className="bi bi-trash3-fill" /> Delete</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
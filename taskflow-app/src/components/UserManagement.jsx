import { useState } from 'react'
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
    await updateUserAccountStatus(userId, 'Active')
    await onSync()
    setLoading(null)
  }

  async function handleDeactivate(userId) {
    setLoading(userId + '_deactivate')
    await updateUserAccountStatus(userId, 'Deactivated')
    await onSync()
    setLoading(null)
  }

  async function handleReactivate(userId) {
    setLoading(userId + '_reactivate')
    await updateUserAccountStatus(userId, 'Active')
    await onSync()
    setLoading(null)
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

  return (
    <div className="space-y-4">

      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {['Pending', 'Active', 'Deactivated', 'All'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors
              ${filter === f ? 'bg-green-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {f}
            {f === 'Pending' && pendingCount > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* User table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="gov-table">
            <thead>
              <tr>
                <th>Unit Personnel</th>
                <th className="hidden sm:table-cell">Unit</th>
                <th className="hidden md:table-cell">Role</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-10 text-slate-400">No users in this category.</td></tr>
              ) : filteredUsers.map(u => (
                <tr key={u.ID} className="group">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white bg-green-700">
                        {u.Name?.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm leading-none">{u.Name}</p>
                        <p className="text-slate-400 text-xs mt-0.5">ID: {u.ID}</p>
                        <p className="text-slate-400 text-xs sm:hidden truncate max-w-[140px]">{u.Unit || u.Office}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 hidden sm:table-cell">
                    <p className="text-xs text-slate-600 max-w-[160px] leading-snug">{u.Unit || u.Office || '—'}</p>
                  </td>
                  <td className="px-4 hidden md:table-cell">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ROLE_COLORS[u.Role] || 'bg-slate-100 text-slate-600'}`}>{u.Role}</span>
                  </td>
                  <td className="px-4">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[u.AccountStatus] || 'bg-slate-100 text-slate-500'}`}>
                      {u.AccountStatus || 'Active'}
                    </span>
                  </td>
                  <td className="px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {u.AccountStatus === 'Pending' && (
                        <button onClick={() => handleApprove(u.ID)} disabled={loading === u.ID + '_approve'}
                          className="btn-success text-xs px-3 py-1.5">
                          {loading === u.ID + '_approve' ? <Spinner /> : <><i className="bi bi-check-lg" /> Approve</>}
                        </button>
                      )}
                      {u.AccountStatus === 'Active' && (
                        <button onClick={() => handleDeactivate(u.ID)} disabled={loading === u.ID + '_deactivate'}
                          className="btn-secondary text-xs px-3 py-1.5">
                          {loading === u.ID + '_deactivate' ? <Spinner /> : 'Deactivate'}
                        </button>
                      )}
                      {u.AccountStatus === 'Deactivated' && (
                        <button onClick={() => handleReactivate(u.ID)} disabled={loading === u.ID + '_reactivate'}
                          className="btn-secondary text-xs px-3 py-1.5">
                          {loading === u.ID + '_reactivate' ? <Spinner /> : 'Reactivate'}
                        </button>
                      )}
                      {/* Edit */}
                      <button onClick={() => { setEditUser(u); setEditRole(u.Role); setEditUnit(u.Unit || u.Office || '') }}
                        className="btn-ghost text-xs px-2 py-1.5 text-slate-400 hover:text-slate-700" title="Edit">
                        <i className="bi bi-pencil" />
                      </button>
                      {/* Delete */}
                      <button onClick={() => openDeleteConfirm(u)}
                        className="btn-ghost text-xs px-2 py-1.5 text-red-400 hover:text-red-600 hover:bg-red-50" title="Delete permanently">
                        <i className="bi bi-trash3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── EDIT MODAL ── */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setEditUser(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

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
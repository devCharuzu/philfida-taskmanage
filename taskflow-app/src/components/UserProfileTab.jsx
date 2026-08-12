import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { updateProfile, getSignedFileUrl, uploadFiles, UNITS, OFFICES } from '../lib/api'
import PresenceToggle, { normalizeStatus } from './PresenceToggle'
import { supabase } from '../lib/supabase'
import SettingsModal from './SettingsModal'

export default function UserProfileTab({ presence, setPresence }) {
  const session = useStore(s => s.session)
  const setSession = useStore(s => s.setSession)
  const globalData = useStore(s => s.globalData)
  const [name, setName] = useState(session?.Name || '')
  const [email, setEmail] = useState(session?.Email || '')
  const [unit, setUnit] = useState(session?.Unit || session?.Office || '')
  const [designation, setDesignation] = useState(session?.Designation || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const isGoogleUser = !session?.Password
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Presence Reminders / Availability Schedule States
  const [reminders, setReminders] = useState([])
  const [editingReminder, setEditingReminder] = useState(null)
  const [editingFields, setEditingFields] = useState({
    travelActivity: '',
    travelLocation: '',
    leaveType: 'Sick Leave',
    leaveReason: '',
    time: '08:00',
    returnDate: '',
    returnTime: '17:00',
    attachments: ''
  })
  const [uploadingFiles, setUploadingFiles] = useState(false)

  useEffect(() => {
    if (!session?.ID) return
    const loadReminders = () => {
      const stored = localStorage.getItem(`philfida_calendar_reminders_${session.ID}`)
      if (stored) {
        try {
          setReminders(JSON.parse(stored))
        } catch (e) {
          console.error(e)
        }
      }
    }
    loadReminders()
    window.addEventListener('storage', loadReminders)
    window.addEventListener('presence-reminders-changed', loadReminders)
    return () => {
      window.removeEventListener('storage', loadReminders)
      window.removeEventListener('presence-reminders-changed', loadReminders)
    }
  }, [session?.ID])

  const saveReminders = (updated) => {
    setReminders(updated)
    if (session?.ID) {
      localStorage.setItem(`philfida_calendar_reminders_${session.ID}`, JSON.stringify(updated))
      window.dispatchEvent(new Event('storage'))
      window.dispatchEvent(new Event('presence-reminders-changed'))
    }
  }

  const handleEditActivePresenceClick = (statusData) => {
    const isTravel = statusData.type === 'Official Travel'
    
    // Find active reminder in reminders list to preserve original dates and times if possible
    const activeReminder = reminders.find(r => r.applied && (r.type === 'travel' || r.type === 'leave'))
    
    setEditingReminder(activeReminder || {
      id: 'active-status',
      type: isTravel ? 'travel' : 'leave',
      date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), // fallback to today
      time: '08:00',
      attachments: statusData.attachments || ''
    })

    setEditingFields({
      travelActivity: isTravel ? statusData.title : '',
      travelLocation: isTravel ? statusData.location : '',
      leaveType: !isTravel ? statusData.title : 'Sick Leave',
      leaveReason: !isTravel ? statusData.reason : '',
      time: activeReminder?.time || '08:00',
      returnDate: activeReminder?.returnDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
      returnTime: activeReminder?.timeEnd || '17:00',
      attachments: statusData.attachments || ''
    })
  }

  const handleSavePresence = () => {
    if (!editingReminder) return
    
    const isTravel = editingReminder.type === 'travel'
    const confirmed = window.confirm(`Note: Modifying your active ${isTravel ? 'Official Travel' : 'Leave'} details here will also update the corresponding calendar reminder on your Personal Calendar. Do you want to proceed?`)
    if (!confirmed) return

    const newTitle = isTravel 
      ? `Official Travel — ${editingFields.travelActivity} at ${editingFields.travelLocation}`
      : `On Leave — ${editingFields.leaveType}: ${editingFields.leaveReason}`

    // Format display date range with times
    const startDateObj = new Date(editingReminder.date)
    const endDateObj = new Date(editingFields.returnDate)
    
    const startStr = startDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const endStr = endDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    
    const dateRangeStr = startStr === endStr ? startStr : `${startStr} to ${endStr}`
    const timeRangeStr = `${editingFields.time} to ${editingFields.returnTime}`
    
    const presenceStr = `${newTitle} (${dateRangeStr} ${timeRangeStr})${editingFields.attachments ? ` [TO:${editingFields.attachments}]` : ''}`

    // Update real scheduled reminder in the reminders list if it exists, or create/update based on active-status
    let updatedReminders = [...reminders]
    const targetId = editingReminder.id

    if (targetId !== 'active-status') {
      updatedReminders = reminders.map(r => {
        if (r.id === targetId) {
          const startDateTime = `${r.date}T${editingFields.time}`
          const manilaNowStr = new Date().toLocaleString('sv', { timeZone: 'Asia/Manila' }).replace(' ', 'T')
          const isTriggered = manilaNowStr >= startDateTime || r.applied
          
          return {
            ...r,
            title: isTravel 
              ? `Official Travel: ${editingFields.travelActivity} at ${editingFields.travelLocation}`
              : `On Leave: ${editingFields.leaveType} — ${editingFields.leaveReason}`,
            time: editingFields.time,
            timeEnd: editingFields.returnTime,
            travelActivity: isTravel ? editingFields.travelActivity : undefined,
            travelLocation: isTravel ? editingFields.travelLocation : undefined,
            leaveType: !isTravel ? editingFields.leaveType : undefined,
            leaveReason: !isTravel ? editingFields.leaveReason : undefined,
            returnDate: editingFields.returnDate,
            attachments: editingFields.attachments,
            applied: isTriggered
          }
        }
        return r
      })
    } else {
      // Find if we have any existing travel/leave reminder of the same type
      const existingIdx = reminders.findIndex(r => r.type === editingReminder.type)
      const dateStr = editingReminder.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
      const itemToSave = {
        id: 'active-' + editingReminder.type + '-' + Date.now(),
        title: isTravel 
          ? `Official Travel: ${editingFields.travelActivity} at ${editingFields.travelLocation}`
          : `On Leave: ${editingFields.leaveType} — ${editingFields.leaveReason}`,
        notes: isTravel 
          ? `Official Travel schedule. Start: ${dateStr} ${editingFields.time}. Return: ${editingFields.returnDate} ${editingFields.returnTime}.`
          : `Leave schedule. Start: ${dateStr} ${editingFields.time}. Return: ${editingFields.returnDate} ${editingFields.returnTime}.`,
        date: dateStr,
        time: editingFields.time,
        timeEnd: editingFields.returnTime,
        color: isTravel ? 'blue' : 'red',
        type: editingReminder.type,
        travelActivity: isTravel ? editingFields.travelActivity : undefined,
        travelLocation: isTravel ? editingFields.travelLocation : undefined,
        leaveType: !isTravel ? editingFields.leaveType : undefined,
        leaveReason: !isTravel ? editingFields.leaveReason : undefined,
        returnDate: editingFields.returnDate,
        attachments: editingFields.attachments,
        applied: true
      }
      if (existingIdx >= 0) {
        updatedReminders[existingIdx] = itemToSave
      } else {
        updatedReminders.push(itemToSave)
      }
    }
    saveReminders(updatedReminders)
    window.dispatchEvent(new Event('presence-reminders-changed'))

    setPresence(presenceStr)
    setEditingReminder(null)

    // Save presence to Supabase database
    supabase.from('Users')
      .update({ Status: presenceStr })
      .eq('ID', session.ID)
      .then(({ error }) => {
        if (error) console.error('Failed to sync presence status', error)
        else {
          window.dispatchEvent(new Event('presence-status-changed'))
        }
      })
  }

  const handleEditFileChange = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploadingFiles(true)
    try {
      const paths = await uploadFiles(files)
      if (paths) {
        setEditingFields(prev => ({
          ...prev,
          attachments: prev.attachments ? `${prev.attachments}|${paths}` : paths
        }))
      }
    } catch (err) {
      alert(`Upload failed: ${err.message}`)
    } finally {
      setUploadingFiles(false)
    }
  }

  const handleRemoveEditAttachment = (pathToRemove) => {
    const updated = editingFields.attachments.split('|').filter(p => p !== pathToRemove).join('|')
    setEditingFields(prev => ({
      ...prev,
      attachments: updated
    }))
  }

  const [signedUrl, setSignedUrl] = useState('')
  const [loadingUrl, setLoadingUrl] = useState(false)

  useEffect(() => {
    if (!presence) return
    const fileMatch = presence.match(/\[TO:(.*?)\]/)
    const rawUrl = fileMatch ? fileMatch[1] : null
    if (rawUrl) {
      setLoadingUrl(true)
      getSignedFileUrl(rawUrl)
        .then(url => { setSignedUrl(url); setLoadingUrl(false) })
        .catch(() => setLoadingUrl(false))
    } else {
      setSignedUrl('')
    }
  }, [presence])

  const director = globalData.users.find(u => u.Role === 'Director')
  const [dirSignedUrl, setDirSignedUrl] = useState('')
  const [loadingDirUrl, setLoadingDirUrl] = useState(false)

  useEffect(() => {
    if (!director?.Status) return
    const fileMatch = director.Status.match(/\[TO:(.*?)\]/)
    const rawUrl = fileMatch ? fileMatch[1] : null
    if (rawUrl) {
      setLoadingDirUrl(true)
      getSignedFileUrl(rawUrl)
        .then(url => { setDirSignedUrl(url); setLoadingDirUrl(false) })
        .catch(() => setLoadingDirUrl(false))
    } else {
      setDirSignedUrl('')
    }
  }, [director?.Status])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Full name is required.')
      return
    }
    if (!isGoogleUser && password && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError('')

    try {
      await updateProfile(session.ID, {
        name: name.trim(),
        email: email.trim() || null,
        unit: unit.trim() || null,
        designation: designation.trim() || null,
        password: password ? password.trim() : undefined,
        sessionPassword: session?.Password ?? '',
      })

      setSession({
        ...session,
        Name: name.trim(),
        Email: email.trim() || null,
        Unit: unit.trim() || null,
        Office: unit.trim() || null,
        Designation: designation.trim() || null,
        ...(password?.trim() ? { Password: password.trim() } : {}),
      })

      setPassword('')
      setConfirmPassword('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error(err)
      setError('Failed to save profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    useStore.getState().clearSession()
    localStorage.removeItem('philfida_session')
    window.location.href = '/'
  }

  const roleTheme = session?.Role === 'Director'
    ? {
        badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        avatarClass: 'from-emerald-50 to-emerald-100/40 border-emerald-200/50 text-emerald-800 shadow-emerald-100/50',
        dotClass: 'bg-emerald-500',
        roleText: '700'
      }
    : session?.Role === 'Unit Head'
    ? {
        badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        avatarClass: 'from-indigo-50 to-indigo-100/40 border-indigo-200/50 text-indigo-800 shadow-indigo-100/50',
        dotClass: 'bg-indigo-500',
        roleText: 'text-indigo-700'
      }
    : session?.Role === 'Records'
    ? {
        badgeBg: 'bg-teal-50 text-teal-700 border-teal-100',
        avatarClass: 'from-teal-50 to-teal-100/40 border-teal-200/50 text-teal-800 shadow-teal-100/50',
        dotClass: 'bg-teal-500',
        roleText: '700'
      }
    : {
        badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        avatarClass: 'from-emerald-50 to-emerald-100/40 border-emerald-200/50 text-emerald-800 shadow-emerald-100/50',
        dotClass: 'bg-emerald-500',
        roleText: '700'
      }

  return (
    <div className="flex flex-col h-full bg-slate-50/30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white flex-shrink-0 gap-2 min-w-0">
        <div className="min-w-0">
          <h1 className="mb-0 text-lg sm:text-xl font-bold tracking-tight leading-snug text-slate-900">My Profile</h1>
          <p className="mb-0 mt-0.5 text-[13px] text-slate-500 font-medium leading-snug">Manage your personal details and active availability schedule</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 pt-5 pb-6 custom-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto">

          {/* Left Column: Status & Actions */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6 order-2 lg:order-1">

            {/* User Info Overview Badge */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              {/* Ambient accent glows */}
              <div className="absolute -right-10 -top-10 w-28 h-28 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />
              <div className="absolute -left-10 -bottom-10 w-28 h-28 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />
              
              <div className="relative flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <h4 className="font-extrabold text-base text-slate-800 tracking-tight leading-tight uppercase">{session?.Name}</h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${roleTheme.roleText}`}>{session?.Role || 'User'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Region</span>
                  <span className="font-bold text-xs text-slate-700 mt-1 block">{session?.Region || 'Central Office'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Unit / Office</span>
                  <span className="font-bold text-xs text-slate-700 mt-1 block truncate">{session?.Designation || session?.Unit || session?.Office || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Availability Section */}
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b 100/40 bg-slate-50/40">
                <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                  <i className="bi bi-clock-history text-slate-600" />
                  My Availability
                </h3>
              </div>
              <div className="p-5 space-y-5">
                <PresenceToggle value={presence} userId={session?.ID} onChange={setPresence} size="large" />

                {(() => {
                  const statusData = (() => {
                    if (!presence || presence === 'Available') return null
                    const fileMatch = presence.match(/\[TO:(.*?)\]/)
                    const fileUrl = fileMatch ? fileMatch[1] : null
                    const attachments = fileUrl || ''
                    const cleanStr = presence.replace(/\[TO:.*?\]/, '').trim()

                    if (cleanStr.startsWith('Official Travel — ')) {
                      const content = cleanStr.replace('Official Travel — ', '')
                      const dateMatch = content.match(/\((.*?)\)$/)
                      const dates = dateMatch ? dateMatch[1] : ''
                      const rest = content.replace(/\s*\(.*?\)$/, '')
                      const parts = rest.split(' at ')
                      return { type: 'Official Travel', title: parts[0], location: parts[1] || '', dates, fileUrl, attachments }
                    }

                    if (cleanStr.startsWith('On Leave — ')) {
                      const content = cleanStr.replace('On Leave — ', '')
                      const dateMatch = content.match(/\((.*?)\)$/)
                      const dates = dateMatch ? dateMatch[1] : ''
                      const rest = content.replace(/\s*\(.*?\)$/, '')
                      const parts = rest.split(': ')
                      return { type: 'On Leave', title: parts[0], reason: parts[1] || '', dates, fileUrl, attachments }
                    }

                    return { type: 'Away', title: cleanStr, fileUrl, attachments }
                  })()

                  if (!statusData) return null

                  const statusTheme = statusData.type === 'Official Travel'
                    ? {
                        bg: 'bg-blue-50/15 border-blue-200/50',
                        iconBg: 'bg-white border-blue-200/60 text-blue-600',
                        iconClass: 'bi-airplane',
                        buttonClass: 'bg-blue-600 hover:bg-blue-700 shadow-blue-100/50',
                        labelClass: 'text-blue-500'
                      }
                    : statusData.type === 'On Leave'
                    ? {
                        bg: 'bg-rose-50/15 border-rose-200/50',
                        iconBg: 'bg-white border-rose-200/60 text-rose-600',
                        iconClass: 'bi-calendar4-event',
                        buttonClass: 'bg-rose-600 hover:bg-rose-700 shadow-rose-100/50',
                        labelClass: 'text-rose-500'
                      }
                    : {
                        bg: 'bg-slate-50 border-slate-200/60',
                        iconBg: 'bg-white border-slate-200/80 text-slate-600',
                        iconClass: 'bi-info-circle',
                        buttonClass: 'bg-slate-900 hover:bg-slate-800 shadow-slate-100/50',
                        labelClass: 'text-slate-500'
                      }

                  return (
                    <div className={`border rounded-xl p-5 flex flex-col gap-4 transition-all hover:opacity-95 ${statusTheme.bg}`}>
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 shadow-sm ${statusTheme.iconBg}`}>
                          <i className={`bi text-xl ${statusTheme.iconClass}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-[9px] font-bold uppercase tracking-wider block mb-2 ${statusTheme.labelClass}`}>Current Status Detail</span>

                          <div className="space-y-4">
                            <div>
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Subject</span>
                              <span className="text-sm 800 font-bold leading-tight mt-1 block">{statusData.title}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              {statusData.type === 'Official Travel' ? (
                                <div>
                                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Location</span>
                                  <span className="text-xs text-slate-700 font-bold mt-1 block">{statusData.location || '—'}</span>
                                </div>
                              ) : (
                                <div>
                                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Reason</span>
                                  <span className="text-xs text-slate-700 font-bold mt-1 block">{statusData.reason || '—'}</span>
                                </div>
                              )}

                              <div>
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Effective</span>
                                <span className="text-xs text-slate-700 font-bold mt-1 block">{statusData.dates || '—'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Display attached documents with signed links */}
                      {statusData.attachments && (
                        <div className="pt-4 border-t border-slate-200/60">
                          <span className={`text-[9px] font-bold uppercase tracking-wider block mb-2 ${statusTheme.labelClass}`}>Attached Files / Travel Orders</span>
                          <div className="flex flex-wrap gap-1.5">
                            {statusData.attachments.split('|').map((path, idx) => (
                              <SignedAttachmentLink key={idx} path={path} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Edit Details & Attachments Button */}
                      <div className="pt-3 border-t border-slate-200/60">
                        <button
                          type="button"
                          onClick={() => handleEditActivePresenceClick(statusData)}
                          className={`w-full flex items-center justify-center gap-2 py-2.5 active:scale-[0.98] text-white text-xs font-semibold rounded-xl transition-all shadow-sm ${statusTheme.buttonClass}`}
                        >
                          <i className="bi bi-pencil-square" />
                          Edit Details & Attached Files
                        </button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Account Actions Section */}
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b 100/40 bg-slate-50/40">
                <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                  <i className="bi bi-sliders text-emerald-605" />
                  System Controls
                </h3>
              </div>

              <div className="p-4 space-y-2">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="w-full flex items-center gap-4 px-4 py-3 bg-white border border-slate-200/60 rounded-xl hover:bg-slate-50 hover:300 transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 group-hover:text-emerald-700 transition-colors">
                    <i className="bi bi-gear text-base" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700 flex-1 text-left">Settings</span>
                  <i className="bi bi-chevron-right text-slate-300 group-hover:text-slate-500 transition-colors text-xs" />
                </button>

                <button
                  onClick={logout}
                  className="w-full flex items-center gap-4 px-4 py-3 bg-red-50/60 hover:bg-red-50 border border-red-200/60 rounded-xl transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center text-red-600 group-hover:bg-red-500/20 transition-colors">
                    <i className="bi bi-box-arrow-right text-base" />
                  </div>
                  <span className="text-sm font-semibold text-red-700 flex-1 text-left">Sign Out Account</span>
                  <i className="bi bi-arrow-right text-red-400 group-hover:text-red-600 transition-colors text-sm" />
                </button>
              </div>
            </div>

          </div>

          {/* Right Column: Personal Details */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-6 order-1 lg:order-2">
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b 100/40 bg-slate-50/40 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                    <i className="bi bi-person-badge text-emerald-600" />
                    Personal Details
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 font-medium">Update your profile parameters and security credentials</p>
                </div>
                <div className="hidden sm:block">
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase rounded-lg border border-emerald-100">
                    Profile Settings
                  </span>
                </div>
              </div>

              <div className="p-6 md:p-8">
                {error && (
                  <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-100 600 text-xs rounded-xl px-4 py-3.5">
                    <i className="bi bi-exclamation-circle-fill flex-shrink-0 text-red-500" />
                    <span className="font-semibold">{error}</span>
                  </div>
                )}
                {success && (
                  <div className="mb-6 flex items-center gap-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs rounded-xl px-4 py-3.5">
                    <i className="bi bi-check-circle-fill flex-shrink-0 text-emerald-605" />
                    <span className="font-semibold">Profile details updated successfully.</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">Full Name</span>
                      <input
                        className="w-full bg-slate-50/30 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none transition-all shadow-sm placeholder:300 text-slate-800 font-medium"
                        placeholder="e.g. Juan Dela Cruz"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">Email Address</span>
                      <input
                        type="email"
                        className="w-full bg-slate-50/30 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none transition-all shadow-sm placeholder:300 text-slate-800 font-medium"
                        placeholder="user@philfida.gov.ph"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">Unit / Office</span>
                      <div className="relative">
                        <select
                           className="w-full bg-slate-50/30 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none transition-all shadow-sm text-slate-800 font-medium appearance-none disabled:opacity-60 disabled:bg-slate-100/50"
                          value={unit}
                          onChange={e => setUnit(e.target.value)}
                          disabled={session?.Role !== 'Director'}
                        >
                          <option value="">-- Select Unit/Office --</option>
                          {(session?.Role === 'Director' || session?.Role === 'Records' ? OFFICES : UNITS).map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <i className="bi bi-chevron-down text-sm" />
                        </div>
                      </div>
                      {session?.Role !== 'Director' && (
                        <p className="text-[10px] text-slate-400 mt-1.5 font-medium italic">Unit/Office assignments are managed strictly by the Director.</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">Designation / Position</span>
                      <input
                        className="w-full bg-slate-50/30 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none transition-all shadow-sm placeholder:300 text-slate-800 font-medium"
                        placeholder="e.g. Project Assistant II"
                        value={designation}
                        onChange={e => setDesignation(e.target.value)}
                      />
                    </div>
                  </div>

                  {!isGoogleUser ? (
                    <div className="pt-8 border-t border-slate-100">
                      <div className="mb-6">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Security Credentials</h4>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">Leave blank to keep your current password</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="label">New Password</label>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              placeholder="Min. 8 characters"
                              className="input pr-10"
                              value={password}
                              onChange={e => setPassword(e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(prev => !prev)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              <i className={`bi bi-${showPassword ? 'eye-slash' : 'eye'}`} />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="label">Confirm Password</label>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              placeholder="Re-type new password"
                              className="input pr-10"
                              value={confirmPassword}
                              onChange={e => setConfirmPassword(e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(prev => !prev)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              <i className={`bi bi-${showPassword ? 'eye-slash' : 'eye'}`} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-4">
                      <div className="flex items-center gap-3 text-xs text-slate-500 bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-3.5">
                        <i className="bi bi-google text-blue-500" />
                        <p className="font-medium italic">Google-managed account. Password changes are disabled.</p>
                      </div>
                    </div>
                  )}

                  <div className="pt-6 flex justify-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-3 rounded-xl font-bold text-xs text-white uppercase tracking-widest shadow-md hover:shadow-lg transition-all w-full sm:w-auto min-w-[160px] bg-emerald-600 hover:bg-emerald-700 active:scale-95 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <i className="bi bi-save2" />
                          <span>Update Profile</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Director's Availability Section */}
            {session?.Role !== 'Director' && director && (
              <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden mt-6">
                <div className="px-6 py-5 border-b 100/40 bg-gradient-to-r from-emerald-50 to-emerald-100/50">
                  <h3 className="font-extrabold text-emerald-900 text-xs uppercase tracking-wider flex items-center gap-2">
                    <i className="bi bi-shield-shaded text-emerald-600" aria-hidden="true" />
                    Director's Availability
                  </h3>
                </div>

                <div className="p-6">
                  {/* Director Status Card */}
                  <div className="mb-6 p-5 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl border border-slate-200/60 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-extrabold text-slate-800 text-sm leading-tight uppercase tracking-tight">{director.Name}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span 
                            className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm
                              ${normalizeStatus(director.Status) === 'Available' 
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-emerald-100/50' 
                                : normalizeStatus(director.Status) === 'Official Travel' 
                                  ? 'bg-blue-100 text-blue-700 border border-blue-200 shadow-blue-100/50' 
                                  : 'bg-rose-100 text-rose-700 border border-rose-200 shadow-rose-100/50'
                              }`}
                            aria-label={`Director status: ${normalizeStatus(director.Status)}`}
                          >
                            {normalizeStatus(director.Status)}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md
                          ${normalizeStatus(director.Status) === 'Available' 
                            ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-emerald-500/30' 
                            : normalizeStatus(director.Status) === 'Official Travel' 
                              ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/30' 
                              : 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-rose-500/30'
                          }`}
                          aria-hidden="true"
                        >
                          <i className={`bi text-xl
                            ${normalizeStatus(director.Status) === 'Available' 
                              ? 'bi-check-circle' 
                              : normalizeStatus(director.Status) === 'Official Travel' 
                                ? 'bi-airplane' 
                                : 'bi-calendar-x'
                            }`} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {director.Status && director.Status !== 'Available' ? (() => {
                    const statusData = (() => {
                      const fileMatch = director.Status.match(/\[TO:(.*?)\]/)
                      const fileUrl = fileMatch ? fileMatch[1] : null
                      const cleanStr = director.Status.replace(/\[TO:.*?\]/, '').trim()

                      if (cleanStr.startsWith('Official Travel — ')) {
                        const content = cleanStr.replace('Official Travel — ', '')
                        const dateMatch = content.match(/\((.*?)\)$/)
                        const dates = dateMatch ? dateMatch[1] : ''
                        const rest = content.replace(/\s*\(.*?\)$/, '')
                        const parts = rest.split(' at ')
                        return { type: 'Official Travel', title: parts[0], location: parts[1] || '', dates, fileUrl }
                      }

                      if (cleanStr.startsWith('On Leave — ')) {
                        const content = cleanStr.replace('On Leave — ', '')
                        const dateMatch = content.match(/\((.*?)\)$/)
                        const dates = dateMatch ? dateMatch[1] : ''
                        const rest = content.replace(/\s*\(.*?\)$/, '')
                        const parts = rest.split(': ')
                        return { type: 'On Leave', title: parts[0], reason: parts[1] || '', dates, fileUrl }
                      }

                      return { type: 'Away', title: cleanStr, fileUrl }
                    })()

                    const dirTheme = statusData.type === 'Official Travel'
                      ? {
                          blockBg: 'bg-blue-50/30 border-blue-200/60',
                          iconBg: 'bg-blue-100 text-blue-600 border-blue-200',
                          iconClass: 'bi-airplane',
                          labelColor: 'text-blue-600',
                          headerBg: 'from-blue-500 to-blue-600'
                        }
                      : statusData.type === 'On Leave'
                      ? {
                          blockBg: 'bg-rose-50/30 border-rose-200/60',
                          iconBg: 'bg-rose-100 text-rose-600 border-rose-200',
                          iconClass: 'bi-calendar4-event',
                          labelColor: 'text-rose-600',
                          headerBg: 'from-rose-500 to-rose-600'
                        }
                      : {
                          blockBg: 'bg-slate-50/50 border-slate-200/60',
                          iconBg: 'bg-slate-100 text-slate-600 border-slate-200',
                          iconClass: 'bi-info-circle',
                          labelColor: 'text-slate-500',
                          headerBg: 'from-slate-500 to-slate-600'
                        }

                    return (
                      <div className="space-y-4" role="region" aria-label={`Director ${statusData.type} details`}>
                        <div className={`p-5 rounded-2xl border ${dirTheme.blockBg} bg-gradient-to-br ${dirTheme.blockBg}`}>
                          <div className="flex items-start gap-4 mb-4">
                            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 shadow-sm ${dirTheme.iconBg}`}>
                              <i className={`bi text-lg ${dirTheme.iconClass}`} aria-hidden="true" />
                            </div>
                            <div className="flex-1">
                              <span className={`text-[10px] font-bold uppercase tracking-wider block mb-2 ${dirTheme.labelColor}`}>
                                {statusData.type} Details
                              </span>
                              <p className="text-sm text-slate-800 font-bold leading-tight">{statusData.title}</p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-200/50">
                            <div>
                              <span className={`text-[9px] font-bold uppercase tracking-wider block mb-1 ${dirTheme.labelColor}`}>
                                {statusData.type === 'Official Travel' ? 'Location' : 'Reason'}
                              </span>
                              <p className="text-sm text-slate-700 font-medium leading-tight">{statusData.location || statusData.reason || '—'}</p>
                            </div>
                            <div>
                              <span className={`text-[9px] font-bold uppercase tracking-wider block mb-1 ${dirTheme.labelColor}`}>
                                Duration
                              </span>
                              <p className="text-sm text-slate-700 font-medium leading-tight">{statusData.dates || '—'}</p>
                            </div>
                          </div>
                        </div>

                        {statusData.fileUrl && (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => dirSignedUrl && window.open(dirSignedUrl, '_blank')}
                              disabled={!dirSignedUrl}
                              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 border text-xs font-semibold rounded-xl transition-all shadow-sm
                                ${dirSignedUrl 
                                  ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98]' 
                                  : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                                }`}
                              aria-label={loadingDirUrl ? 'Loading travel order' : 'View travel order document'}
                            >
                              {loadingDirUrl ? (
                                <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" aria-hidden="true" />
                              ) : (
                                <>
                                  <i className="bi bi-file-earmark-text text-slate-500" aria-hidden="true" />
                                  View Travel Order
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })() : (
                    <div 
                      className="py-10 text-center bg-gradient-to-br from-emerald-50/50 to-emerald-100/30 rounded-2xl border border-dashed border-emerald-200/60"
                      role="status"
                      aria-label="Director is currently available with no scheduled events"
                    >
                      <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-emerald-100 flex items-center justify-center">
                        <i className="bi bi-check-circle text-emerald-500 text-2xl" aria-hidden="true" />
                      </div>
                      <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Director Available</p>
                      <p className="text-[10px] text-emerald-600/70 font-medium">No scheduled events at this time</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} session={session} />}

      {/* ── Edit Presence Modal ── */}
      {editingReminder && (() => {
        const isTravel = editingReminder.type === 'travel'
        
        // Setup context-aware color themes
        const headerGradient = isTravel 
          ? 'from-blue-600 to-indigo-600' 
          : 'from-red-600 to-rose-600'
        
        const subtitleText = isTravel ? 'text-blue-100' : 'text-red-100'
        const borderFocus = isTravel 
          ? 'focus:border-blue-400 focus:ring-blue-400/20' 
          : 'focus:border-red-400 focus:ring-red-400/20'
          
        const uploadHover = isTravel 
          ? 'hover:border-blue-400 hover:bg-blue-50/20 hover:text-blue-800' 
          : 'hover:border-red-400 hover:bg-red-50/20 hover:text-red-800'

        const saveButtonBg = isTravel 
          ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100' 
          : 'bg-red-600 hover:bg-red-700 shadow-red-100'

        const fileIconColor = isTravel ? 'text-blue-600' : 'text-red-600'

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white border border-slate-100 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in-up">
              
              {/* Modal Header */}
              <div className={`bg-gradient-to-r ${headerGradient} px-6 py-4 flex items-center justify-between text-white`}>
                <div>
                  <h3 className="text-sm sm:text-base font-black leading-tight uppercase tracking-wide">
                    Edit Availability Presence
                  </h3>
                  <p className={`text-[10px] ${subtitleText} font-black mt-1 uppercase flex items-center gap-1.5`}>
                    {isTravel ? (
                      <>
                        <i className="bi bi-airplane-fill" /> Official Travel
                      </>
                    ) : (
                      <>
                        <i className="bi bi-calendar-event-fill" /> On Leave
                      </>
                    )}
                  </p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setEditingReminder(null)}
                  className="text-white/85 hover:text-white text-2xl font-bold p-1 leading-none select-none transition-colors"
                >
                  &times;
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                
                {/* Form Fields */}
                {isTravel ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Travel Purpose / Activity</label>
                      <input
                        type="text"
                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold ${borderFocus} outline-none`}
                        placeholder="e.g. Regional Inspection, Conference"
                        value={editingFields.travelActivity}
                        onChange={e => setEditingFields(prev => ({ ...prev, travelActivity: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Travel Location</label>
                      <input
                        type="text"
                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold ${borderFocus} outline-none`}
                        placeholder="e.g. Region I Office, Quezon City"
                        value={editingFields.travelLocation}
                        onChange={e => setEditingFields(prev => ({ ...prev, travelLocation: e.target.value }))}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Leave Type</label>
                      <select
                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold ${borderFocus} outline-none appearance-none`}
                        value={editingFields.leaveType}
                        onChange={e => setEditingFields(prev => ({ ...prev, leaveType: e.target.value }))}
                      >
                        <option value="Sick Leave">Sick Leave</option>
                        <option value="Vacation Leave">Vacation Leave</option>
                        <option value="Maternity/Paternity Leave">Maternity/Paternity Leave</option>
                        <option value="Special Privilege Leave">Special Privilege Leave</option>
                        <option value="Forced Leave">Forced Leave</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Leave Reason / Description</label>
                      <input
                        type="text"
                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold ${borderFocus} outline-none`}
                        placeholder="e.g. Medical Checkup, Family Event"
                        value={editingFields.leaveReason}
                        onChange={e => setEditingFields(prev => ({ ...prev, leaveReason: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Time</label>
                    <input
                      type="time"
                      className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold ${borderFocus} outline-none`}
                      value={editingFields.time}
                      onChange={e => setEditingFields(prev => ({ ...prev, time: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Return Date</label>
                    <input
                      type="date"
                      className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold ${borderFocus} outline-none`}
                      value={editingFields.returnDate}
                      onChange={e => setEditingFields(prev => ({ ...prev, returnDate: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Attachments Section */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Attached Files / Travel Orders</label>
                  
                  {/* Upload Button */}
                  <div className="flex items-center gap-3">
                    <label className={`flex-1 flex flex-col items-center justify-center border border-dashed border-slate-200 ${uploadHover} bg-slate-50/50 rounded-xl p-3.5 cursor-pointer transition-colors group`}>
                      <i className="bi bi-cloud-arrow-up text-lg text-slate-400 group-hover:text-inherit mb-1" />
                      <span className="text-[10px] font-bold text-slate-500 group-hover:text-inherit uppercase tracking-wide">
                        {uploadingFiles ? 'Uploading...' : 'Choose File(s)'}
                      </span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleEditFileChange}
                        disabled={uploadingFiles}
                      />
                    </label>
                  </div>

                  {/* List of attachments */}
                  {editingFields.attachments && (
                    <div className="space-y-1.5 mt-2.5">
                      {editingFields.attachments.split('|').map((path, idx) => {
                        const name = path.split('/').pop().replace(/^\d+_[a-z0-9]+_/i, '')
                        return (
                          <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2 group/file">
                            <span className="text-[10px] font-bold text-slate-600 truncate max-w-[200px] flex items-center gap-1.5">
                              <i className={`bi bi-file-earmark-fill ${fileIconColor}`} />
                              {name}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveEditAttachment(path)}
                              className="text-slate-400 hover:text-red-600 text-xs p-1 select-none font-bold font-mono"
                            >
                              &times;
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingReminder(null)}
                  className="px-4 py-2 bg-slate-200 hover:200 text-slate-700 text-xs font-black uppercase rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePresence}
                  className={`px-4 py-2 ${saveButtonBg} text-white text-xs font-black uppercase rounded-xl shadow-md transition-all flex items-center gap-1.5 active:scale-95`}
                >
                  <i className="bi bi-check-circle" /> Save Changes
                </button>
              </div>

            </div>
          </div>
        )
      })()}

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
      } catch (e) {
        if (active) setLoading(false)
      }
    }
    fetchUrl()
    return () => { active = false }
  }, [path])

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[9px] font-black text-slate-400 uppercase select-none">
        <span className="w-2.5 h-2.5 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
        Loading...
      </span>
    )
  }
  if (!url) {
    return (
      <span className="inline-flex items-center gap-1 bg-red-50 border 100 rounded-lg px-2.5 py-1 text-[9px] font-black 600 uppercase select-none">
        <i className="bi bi-exclamation-triangle-fill text-red-600" />
        Broken link
      </span>
    )
  }

  const filename = path.split('/').pop().replace(/^\d+_[a-z0-9]+_/i, '')
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 bg-green-50/60 hover:bg-green-50 border 100 rounded-lg px-2.5 py-1 text-[9px] font-black text-green-800 uppercase transition-all hover:border-green-300 active:scale-95"
    >
      <i className="bi bi-file-earmark-arrow-down text-green-700 text-xs" />
      <span className="truncate max-w-[120px]">{filename}</span>
    </a>
  )
}

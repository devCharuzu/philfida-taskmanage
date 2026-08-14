import { useState, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '../store/useStore'
import {
  canSendAnnouncements, createAnnouncement, getMyAnnouncements, getSentAnnouncements,
  setAnnouncementState, archiveAnnouncement, getSignedFileUrl, UNITS, OFFICES,
} from '../lib/api'

const fmtDate = (iso) => iso
  ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  : '—'

/** Attachment chip that resolves its signed URL on demand (private bucket). */
function Attachment({ path }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true
    getSignedFileUrl(path).then(u => { if (alive) setUrl(u) }).catch(() => {})
    return () => { alive = false }
  }, [path])
  const name = path.split('/').pop().replace(/^\d+_[a-z0-9]+_/i, '')
  return (
    <a href={url || undefined} target="_blank" rel="noopener noreferrer"
      className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors
        ${url ? 'border-green-100 bg-green-50/60 text-green-800 hover:bg-green-100/60' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
      <i className="bi bi-paperclip flex-shrink-0" aria-hidden="true" />
      <span className="truncate">{name}</span>
    </a>
  )
}

/** Full announcement — what "Read more" opens. */
function AnnouncementDetail({ item, onBack, onArchive, canArchive }) {
  const files = (item.FileLink || '').split('|').filter(Boolean)
  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-5">
      <div className="mx-auto max-w-3xl">
        <button onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800">
          <i className="bi bi-arrow-left" aria-hidden="true" /> Back to announcements
        </button>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 px-6 py-5 sm:px-8">
            <p className="mb-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Announcement</p>
            <h1 className="mb-0 mt-1 text-xl font-bold leading-snug tracking-tight text-slate-900 sm:text-2xl">
              {item.Title}
            </h1>
            <p className="mb-0 mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-500">
              <span className="font-semibold text-slate-700">{item.SenderName}</span>
              <span aria-hidden="true">·</span><span>{item.SenderRole}</span>
              <span aria-hidden="true">·</span><span>{fmtDate(item.CreatedAt)}</span>
              {item.ExpiresAt && (<><span aria-hidden="true">·</span>
                <span className="text-amber-700">Until {fmtDate(item.ExpiresAt)}</span></>)}
            </p>
          </header>

          <div className="px-6 py-6 sm:px-8">
            {/* Preserve the author's line breaks; they wrote it as prose. */}
            <div className="whitespace-pre-wrap text-[14px] leading-[1.75] text-slate-700">
              {item.Body || <span className="italic text-slate-400">No further details were provided.</span>}
            </div>

            {files.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Attachments</p>
                <div className="flex flex-wrap gap-2">
                  {files.map((p, i) => <Attachment key={i} path={p} />)}
                </div>
              </div>
            )}
          </div>

          {canArchive && (
            <footer className="flex justify-end border-t border-slate-100 bg-slate-50 px-6 py-4 sm:px-8">
              <button onClick={() => onArchive(item)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800">
                Archive this announcement
              </button>
            </footer>
          )}
        </article>
      </div>
    </div>
  )
}

/** Compose form — senders only. */
function Compose({ session, users, onDone, onCancel }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState([])
  const [expiresAt, setExpiresAt] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Group by unit/office so a whole unit can be selected at a glance.
  const groups = useMemo(() => {
    const out = new Map()
    users
      .filter(u => u.AccountStatus === 'Active' && String(u.ID) !== String(session?.ID))
      .forEach(u => {
        const key = u.Unit || u.Office || 'Unassigned'
        if (!out.has(key)) out.set(key, [])
        out.get(key).push(u)
      })
    return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [users, session?.ID])

  const allIds = useMemo(() => groups.flatMap(([, list]) => list.map(u => String(u.ID))), [groups])
  const allSelected = allIds.length > 0 && allIds.every(id => picked.has(id))

  const toggle = (id) => setPicked(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleGroup = (list) => setPicked(prev => {
    const n = new Set(prev)
    const ids = list.map(u => String(u.ID))
    ids.every(i => n.has(i)) ? ids.forEach(i => n.delete(i)) : ids.forEach(i => n.add(i))
    return n
  })
  const toggleAll = () => setPicked(allSelected ? new Set() : new Set(allIds))

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!title.trim()) return setError('A title is required.')
    if (picked.size === 0) return setError('Select at least one recipient.')
    setBusy(true)
    try {
      await createAnnouncement({
        senderId: session.ID,
        title: title.trim(),
        body,
        files,
        // A date alone means "up to and including that day".
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
        recipientIds: [...picked],
      })
      onDone()
    } catch (err) {
      console.error('createAnnouncement failed:', err)
      setError(err.message || 'Could not post the announcement.')
    } finally {
      setBusy(false)
    }
  }

  const LBL = 'block text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1'
  const FIELD = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-500/20'

  return (
    <form onSubmit={submit} className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="space-y-1">
          <label htmlFor="ann-title" className={LBL}>Title</label>
          <input id="ann-title" className={FIELD} value={title} maxLength={140}
            onChange={e => { setTitle(e.target.value); setError('') }}
            placeholder="e.g. Office closure on Friday" autoFocus />
        </div>

        <div className="space-y-1">
          <label htmlFor="ann-body" className={LBL}>Announcement</label>
          <textarea id="ann-body" rows={8} className={`${FIELD} resize-y leading-relaxed`}
            value={body} onChange={e => setBody(e.target.value)}
            placeholder="Write the full announcement here." />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="ann-exp" className={LBL}>Show until <span className="normal-case text-slate-400">(optional)</span></label>
            <input id="ann-exp" type="date" className={FIELD} value={expiresAt}
              min={new Date().toLocaleDateString('en-CA')}
              onChange={e => setExpiresAt(e.target.value)} />
            <p className="mb-0 ml-1 mt-1 text-[11px] text-slate-400">
              It disappears by itself after this date. Leave blank to keep it indefinitely.
            </p>
          </div>
          <div className="space-y-1">
            <label className={LBL}>Attachments <span className="normal-case text-slate-400">(optional)</span></label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2.5 text-[12px] font-semibold text-slate-500 transition-colors hover:border-green-400 hover:text-green-700">
              <i className="bi bi-paperclip" aria-hidden="true" />
              {files.length ? `${files.length} file${files.length > 1 ? 's' : ''} attached` : 'Choose files'}
              <input type="file" multiple className="hidden"
                onChange={e => setFiles([...e.target.files])} />
            </label>
            {files.length > 0 && (
              <button type="button" onClick={() => setFiles([])}
                className="ml-1 mt-1 text-[11px] font-semibold text-slate-400 hover:text-red-600">
                Remove all
              </button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
            <p className="mb-0 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Recipients <span className="ml-1 font-semibold text-slate-400">{picked.size} selected</span>
            </p>
            <button type="button" onClick={toggleAll}
              className="text-[11px] font-semibold text-green-700 transition-colors hover:text-green-900">
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {groups.length === 0 && (
              <p className="mb-0 px-2 py-6 text-center text-[13px] text-slate-400">No other active accounts.</p>
            )}
            {groups.map(([unit, list]) => {
              const ids = list.map(u => String(u.ID))
              const groupAll = ids.every(i => picked.has(i))
              return (
                <div key={unit} className="mb-1.5 last:mb-0">
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50/70 px-2.5 py-1.5">
                    <p className="mb-0 truncate text-[11px] font-bold uppercase tracking-wider text-slate-500">{unit}</p>
                    <button type="button" onClick={() => toggleGroup(list)}
                      className="flex-shrink-0 text-[10px] font-semibold text-slate-400 transition-colors hover:text-green-700">
                      {groupAll ? 'Clear unit' : 'Select unit'}
                    </button>
                  </div>
                  {list.map(u => (
                    <label key={u.ID}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-slate-50">
                      <input type="checkbox" className="h-4 w-4 flex-shrink-0 accent-green-600"
                        checked={picked.has(String(u.ID))} onChange={() => toggle(String(u.ID))} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700">{u.Name}</span>
                      <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {u.Role === 'Employee' ? 'Unit Personnel' : u.Role}
                      </span>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        {error && (
          <p className="mb-0 flex items-center gap-1.5 text-[12px] font-semibold text-red-600">
            <i className="bi bi-exclamation-circle-fill" aria-hidden="true" />{error}
          </p>
        )}

        <div className="flex justify-end gap-2 pb-2">
          <button type="button" onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-900 disabled:opacity-60">
            {busy
              ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Posting…</>
              : 'Post announcement'}
          </button>
        </div>
      </div>
    </form>
  )
}

export default function AnnouncementsTab() {
  const session = useStore(s => s.session)
  const users = useStore(s => s.globalData.users)
  const isSender = canSendAnnouncements(session?.Role)

  const [view, setView] = useState('inbox')       // inbox | sent | compose | detail
  const [showArchived, setShowArchived] = useState(false)
  const [inbox, setInbox] = useState([])
  const [sent, setSent] = useState([])
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!session?.ID) return
    setLoading(true)
    const [mine, mySent] = await Promise.all([
      getMyAnnouncements(session.ID),
      isSender ? getSentAnnouncements(session.ID) : Promise.resolve([]),
    ])
    setInbox(mine); setSent(mySent); setLoading(false)
  }, [session?.ID, isSender])

  useEffect(() => { refresh() }, [refresh])

  // "Read more" in the sign-in popup asks for one specific announcement.
  useEffect(() => {
    if (loading || !inbox.length) return
    let want = null
    try { want = sessionStorage.getItem('philfida_open_announcement') } catch { /* ignore */ }
    if (!want) return
    try { sessionStorage.removeItem('philfida_open_announcement') } catch { /* ignore */ }
    const target = inbox.find(a => String(a.ID) === String(want))
    if (target) open(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, inbox])

  // Opening an announcement marks it read for this person only.
  async function open(item) {
    setDetail(item); setView('detail')
    if (!item.isRead) {
      try {
        await setAnnouncementState(item.ID, session.ID, { isRead: true })
        setInbox(list => list.map(a => a.ID === item.ID ? { ...a, isRead: true } : a))
      } catch (e) { console.warn('mark read failed', e) }
    }
  }

  async function archiveMine(item) {
    try {
      await setAnnouncementState(item.ID, session.ID, { archived: !item.archived })
      setView('inbox'); setDetail(null); refresh()
    } catch (e) { window.alert(e.message || 'Could not archive that announcement.') }
  }

  async function archiveSent(item) {
    try {
      await archiveAnnouncement(item.ID, session.ID, !item.archived)
      refresh()
    } catch (e) { window.alert(e.message || 'Could not archive that announcement.') }
  }

  const visibleInbox = inbox.filter(a => a.archived === showArchived)
  const visibleSent  = sent.filter(a => a.archived === showArchived)
  const unreadCount  = inbox.filter(a => !a.isRead && !a.archived).length

  if (view === 'detail' && detail) {
    return (
      <div className="flex h-full flex-col bg-slate-50/50">
        <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-4 md:px-6 lg:px-8">
          <h1 className="mb-0 text-lg font-bold leading-snug tracking-tight text-slate-900 sm:text-xl">Announcement</h1>
        </div>
        <AnnouncementDetail item={detail} canArchive={view === 'detail' && !!detail.recipientRowId}
          onBack={() => { setView('inbox'); setDetail(null) }} onArchive={archiveMine} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="mb-0 text-lg font-bold leading-snug tracking-tight text-slate-900 sm:text-xl">Announcements</h1>
          {unreadCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 ring-1 ring-red-200">
              {unreadCount} new
            </span>
          )}
        </div>
        {isSender && view !== 'compose' && (
          <button onClick={() => setView('compose')}
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-900">
            <i className="bi bi-megaphone-fill text-[13px]" aria-hidden="true" /> New announcement
          </button>
        )}
      </div>

      {view === 'compose' ? (
        <Compose session={session} users={users}
          onCancel={() => setView('inbox')}
          onDone={() => { setView('sent'); refresh() }} />
      ) : (
        <>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-2.5 md:px-6 lg:px-8">
            {['inbox', ...(isSender ? ['sent'] : [])].map(t => (
              <button key={t} onClick={() => setView(t)}
                className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors
                  ${view === t ? 'bg-green-50 text-green-800' : 'text-slate-500 hover:bg-slate-50'}`}>
                {t === 'inbox' ? 'Received' : 'Sent'}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />
            <button onClick={() => setShowArchived(v => !v)}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors
                ${showArchived ? 'bg-slate-200 text-slate-700' : 'text-slate-500 hover:bg-slate-50'}`}>
              {showArchived ? 'Viewing archived' : 'Archived'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6 lg:px-8">
            {loading ? (
              <p className="py-16 text-center text-sm text-slate-400">Loading…</p>
            ) : view === 'sent' ? (
              visibleSent.length === 0
                ? <p className="py-16 text-center text-sm text-slate-400">
                    {showArchived ? 'Nothing archived.' : 'You have not posted any announcements yet.'}
                  </p>
                : <div className="mx-auto grid max-w-4xl gap-3">
                    {visibleSent.map(a => (
                      <article key={a.ID} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="mb-0 truncate text-[15px] font-semibold text-slate-900">{a.Title}</h2>
                            <p className="mb-0 mt-1 text-[11px] text-slate-500">
                              {fmtDate(a.CreatedAt)} · {a.readCount}/{a.recipientCount} read
                              {a.ExpiresAt && <> · until {fmtDate(a.ExpiresAt)}</>}
                            </p>
                          </div>
                          <button onClick={() => archiveSent(a)}
                            className="flex-shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800">
                            {a.archived ? 'Restore' : 'Archive'}
                          </button>
                        </div>
                        {a.Body && <p className="mb-0 mt-2 line-clamp-2 text-[13px] text-slate-600">{a.Body}</p>}
                      </article>
                    ))}
                  </div>
            ) : visibleInbox.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-400">
                {showArchived ? 'Nothing archived.' : 'No announcements right now.'}
              </p>
            ) : (
              <div className="mx-auto grid max-w-4xl gap-3">
                {visibleInbox.map(a => (
                  <article key={a.ID}
                    className={`cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md
                      ${a.isRead ? 'border-slate-200' : 'border-l-4 border-l-green-600 border-slate-200'}`}
                    onClick={() => open(a)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className={`mb-0 truncate text-[15px] ${a.isRead ? 'font-semibold text-slate-800' : 'font-bold text-slate-900'}`}>
                          {a.Title}
                        </h2>
                        <p className="mb-0 mt-1 text-[11px] text-slate-500">
                          {a.SenderName} · {a.SenderRole} · {fmtDate(a.CreatedAt)}
                        </p>
                      </div>
                      {!a.isRead && (
                        <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-green-600" aria-label="Unread" />
                      )}
                    </div>
                    {a.Body && <p className="mb-0 mt-2 line-clamp-2 text-[13px] text-slate-600">{a.Body}</p>}
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import { normalizeStatus } from './PresenceToggle'
import { stripStatusMarkers } from '../lib/api'

/**
 * AvailabilityWelcomeModal — shown once per login (per session) to every
 * personnel when anyone in their region has filed travel or leave.
 * Lists who is away and on which dates, with a "Do not remind me again"
 * opt-out persisted per user in localStorage.
 *
 * Mounted once at App level (like AnnouncementPopup) so it appears on
 * whichever dashboard the person lands on after signing in.
 */

const HIDE_KEY_PREFIX = 'philfida_avail_welcome_hide_'

function hideKey(userId) {
  return `${HIDE_KEY_PREFIX}${userId}`
}

function isHidden(userId) {
  try {
    return localStorage.getItem(hideKey(userId)) === '1'
  } catch {
    return false
  }
}

function setHidden(userId) {
  try {
    localStorage.setItem(hideKey(userId), '1')
  } catch {
    /* ignore */
  }
}

/** Parse "Official Travel — event at location (dateRange)" into parts. */
function parseTravel(status) {
  const clean = stripStatusMarkers(status || '')
  const detail = clean.split(' — ')?.[1] || ''
  const parenMatch = detail.match(/^(.*?)\s+\(([^)]+)\)\s*$/)
  const beforeParen = parenMatch ? parenMatch[1] : detail
  const dateRange = parenMatch ? parenMatch[2] : ''
  const atIdx = beforeParen.lastIndexOf(' at ')
  const eventName = atIdx > -1 ? beforeParen.slice(0, atIdx).trim() : beforeParen.trim()
  const location = atIdx > -1 ? beforeParen.slice(atIdx + 4).trim() : ''
  return { eventName, location, dateRange }
}

/** Parse "On Leave — reason (dateRange)" into parts. */
function parseLeave(status) {
  const clean = stripStatusMarkers(status || '')
  const detail = clean.split(' — ')?.[1] || ''
  const parenMatch = detail.match(/^(.*?)\s+\(([^)]+)\)\s*$/)
  const reason = parenMatch ? parenMatch[1].trim() : detail.trim()
  const dateRange = parenMatch ? parenMatch[2] : ''
  return { reason, dateRange }
}

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w.charAt(0).toUpperCase())
    .join('')
}

export default function AvailabilityWelcomeModal() {
  const session = useStore(s => s.session)
  const [awayList, setAwayList] = useState(null) // null = loading, [] = none
  const [dontRemind, setDontRemind] = useState(false)
  const shownForRef = useRef(null)

  const userId = session?.ID
  const region = session?.Region

  useEffect(() => {
    if (!userId) return
    // Show at most once per login session
    if (shownForRef.current === userId) return
    if (isHidden(userId)) return

    let alive = true
    ;(async () => {
      try {
        let query = supabase
          .from('Users')
          .select('ID, Name, Role, Unit, Office, Status, Region')
          .neq('AccountStatus', 'Deactivated')
        if (region) query = query.eq('Region', region)
        const { data, error } = await query
        if (error || !alive) return

        const away = (data || [])
          .filter(u => {
            const s = normalizeStatus(u.Status)
            return s === 'Official Travel' || s === 'On Leave'
          })
          .map(u => {
            const kind = normalizeStatus(u.Status)
            const parsed = kind === 'Official Travel' ? parseTravel(u.Status) : parseLeave(u.Status)
            return { ...u, kind, ...parsed }
          })

        if (!alive) return
        if (away.length === 0) {
          setAwayList([])
          return
        }
        shownForRef.current = userId
        setAwayList(away)
      } catch {
        if (alive) setAwayList([])
      }
    })()

    return () => { alive = false }
  }, [userId, region])

  // Reset per-session guard when the user changes (login / logout)
  useEffect(() => {
    if (!userId) shownForRef.current = null
  }, [userId])

  const close = () => {
    if (dontRemind && userId) setHidden(userId)
    setAwayList([])
  }

  if (!awayList || awayList.length === 0) return null

  const travelCount = awayList.filter(p => p.kind === 'Official Travel').length
  const leaveCount = awayList.filter(p => p.kind === 'On Leave').length

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-[2px] animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Team availability notice"
      onClick={close}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-slate-950/20 overflow-hidden animate-pop-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <i className="bi bi-calendar2-x text-amber-600 text-xl" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
              Team Availability
            </h2>
            <p className="text-[13px] text-slate-500 mt-0.5 leading-snug">
              {travelCount > 0 && leaveCount > 0
                ? `${travelCount} on travel · ${leaveCount} on leave`
                : travelCount > 0
                  ? `${travelCount} on official travel`
                  : `${leaveCount} on leave`}
              {' '}— plan accordingly
            </p>
          </div>
        </div>

        {/* Away list */}
        <div className="px-6 pb-2 max-h-[46vh] overflow-y-auto">
          <ul className="divide-y divide-slate-100">
            {awayList.map(person => (
              <li key={person.ID} className="py-3 flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-extrabold ${
                    person.kind === 'Official Travel'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                  aria-hidden="true"
                >
                  {initials(person.Name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-900 truncate">{person.Name}</p>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        person.kind === 'Official Travel'
                          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                          : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                      }`}
                    >
                      {person.kind === 'Official Travel' ? 'Travel' : 'Leave'}
                    </span>
                  </div>
                  {(person.Unit || person.Office) && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {person.Unit || person.Office}
                    </p>
                  )}
                  {person.kind === 'Official Travel' ? (
                    <p className="text-[13px] text-slate-600 mt-1 leading-snug">
                      {person.eventName}
                      {person.location ? ` · ${person.location}` : ''}
                      {person.dateRange ? (
                        <span className="block text-slate-500 font-medium">{person.dateRange}</span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-[13px] text-slate-600 mt-1 leading-snug">
                      {person.reason || 'On leave'}
                      {person.dateRange ? (
                        <span className="block text-slate-500 font-medium">{person.dateRange}</span>
                      ) : null}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-6 pt-3 pb-5 bg-slate-50/80 border-t border-slate-100">
          <label className="flex items-center gap-2.5 cursor-pointer select-none py-1">
            <input
              type="checkbox"
              checked={dontRemind}
              onChange={e => setDontRemind(e.target.checked)}
              className="w-4 h-4 rounded accent-green-700 cursor-pointer"
            />
            <span className="text-[13px] font-medium text-slate-600">Do not remind me again</span>
          </label>
          <p className="text-xs text-slate-400 leading-relaxed mt-1.5">
            See the full availability list anytime in{' '}
            <span className="font-semibold text-slate-500">My Assignment → Personnel</span>.
          </p>
          <button
            onClick={close}
            className="mt-3.5 w-full py-2.5 rounded-xl bg-green-800 hover:bg-green-900 active:bg-green-950 text-white text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getSignedFileUrl, stripStatusMarkers} from '../lib/api'

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

export default function UserStatusPopover({
  name,
  status,
  title,
  chipClassName,
  dotClassName,
  popoverMinW = 200,
  popoverMaxW = 260,
}) {
  const anchorRef = useRef(null)
  const popoverRef = useRef(null)

  const isSpecial = useMemo(() => {
    return !!status && (status.startsWith('Official Travel') || status.startsWith('On Leave'))
  }, [status])

  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = isSpecial && (hovered || pinned)

  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return

    function recompute() {
      const anchorEl = anchorRef.current
      const popEl = popoverRef.current
      if (!anchorEl || !popEl) return

      const rect = anchorEl.getBoundingClientRect()
      const popRect = popEl.getBoundingClientRect()

      const gap = 6
      const minMargin = 8

      // Prefer above the chip, but fall back below if it would clip off-screen.
      let top = rect.top - popRect.height - gap
      if (top < minMargin) {
        top = rect.bottom + gap
      }

      const left = clamp(
        rect.left,
        minMargin,
        window.innerWidth - popRect.width - minMargin
      )

      top = clamp(top, minMargin, window.innerHeight - popRect.height - minMargin)

      setPos({ top, left })
    }

    // Wait for the popover to actually render before measuring.
    requestAnimationFrame(recompute)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return

    function onResizeOrScroll() {
      const anchorEl = anchorRef.current
      const popEl = popoverRef.current
      if (!anchorEl || !popEl) return

      const rect = anchorEl.getBoundingClientRect()
      const popRect = popEl.getBoundingClientRect()

      const gap = 6
      const minMargin = 8

      let top = rect.top - popRect.height - gap
      if (top < minMargin) top = rect.bottom + gap

      const left = clamp(
        rect.left,
        minMargin,
        window.innerWidth - popRect.width - minMargin
      )

      top = clamp(top, minMargin, window.innerHeight - popRect.height - minMargin)
      setPos({ top, left })
    }

    window.addEventListener('resize', onResizeOrScroll, { passive: true })
    window.addEventListener('scroll', onResizeOrScroll, { passive: true })
    return () => {
      window.removeEventListener('resize', onResizeOrScroll)
      window.removeEventListener('scroll', onResizeOrScroll)
    }
  }, [open])

  useEffect(() => {
    if (!pinned) return
    function onDocMouseDown(e) {
      const anchorEl = anchorRef.current
      const popEl = popoverRef.current
      const t = e.target
      if (anchorEl?.contains(t) || popEl?.contains(t)) return
      setPinned(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [pinned])

  if (!isSpecial) {
    return (
      <div ref={anchorRef} title={title} className={chipClassName}>
        {name}
      </div>
    )
  }

  const heading =
    status.startsWith('Official Travel') ? '✈ Official Travel' : '📅 On Leave'
  
  // Detect attached file pattern [TO:path]
  const fileMatch = status.match(/\[TO:(.*?)\]/)
  const rawFileUrl = fileMatch ? fileMatch[1] : null
  const cleanStatus = stripStatusMarkers(status)
  const detail = cleanStatus.split(' — ')?.[1] || cleanStatus

  const [signedUrl, setSignedUrl] = useState('')
  const [loadingUrl, setLoadingUrl] = useState(false)

  useEffect(() => {
    if (open && rawFileUrl && !signedUrl && !loadingUrl) {
      setLoadingUrl(true)
      getSignedFileUrl(rawFileUrl)
        .then(url => { setSignedUrl(url); setLoadingUrl(false) })
        .catch(() => setLoadingUrl(false))
    }
  }, [open, rawFileUrl, signedUrl, loadingUrl])

  return (
    <>
      <div
        ref={anchorRef}
        title={title}
        className={chipClassName}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false)
          if (!pinned) setPinned(false)
        }}
        onClick={() => setPinned(v => !v)}
      >
        {name}
      </div>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 99999,
              minWidth: popoverMinW,
              maxWidth: popoverMaxW,
              pointerEvents: pinned ? 'auto' : 'none', // Interactive when pinned
            }}
            className="rounded-xl shadow-xl border text-xs p-3 bg-white text-slate-700 border-slate-200"
          >
            <p className="font-bold text-slate-800 mb-3 pb-1 border-b border-slate-100 flex items-center gap-2">
              {heading}
            </p>
            
            {(() => {
              const cleanStr = stripStatusMarkers(status)
              let structured = null

              if (cleanStr.startsWith('Official Travel — ')) {
                const content = cleanStr.replace('Official Travel — ', '')
                const dateMatch = content.match(/\((.*?)\)$/)
                const dates = dateMatch ? dateMatch[1] : ''
                const rest = content.replace(/\s*\(.*?\)$/, '')
                const parts = rest.split(' at ')
                structured = { title: parts[0], subtitleLabel: 'Location', subtitle: parts[1] || '', dates }
              } else if (cleanStr.startsWith('On Leave — ')) {
                const content = cleanStr.replace('On Leave — ', '')
                const dateMatch = content.match(/\((.*?)\)$/)
                const dates = dateMatch ? dateMatch[1] : ''
                const rest = content.replace(/\s*\(.*?\)$/, '')
                const parts = rest.split(': ')
                structured = { title: parts[0], subtitleLabel: 'Reason', subtitle: parts[1] || '', dates }
              }

              if (!structured) return <p className="leading-relaxed text-slate-500">{detail}</p>

              return (
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">Subject / Purpose</p>
                    <p className="font-bold text-slate-700 leading-tight">{structured.title}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">{structured.subtitleLabel}</p>
                    <p className="font-medium text-slate-600">{structured.subtitle}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">Effective Dates</p>
                    <p className="font-medium text-slate-600">{structured.dates}</p>
                  </div>
                </div>
              )
            })()}

            {rawFileUrl && (
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <a 
                  href={signedUrl || '#'} 
                  target={signedUrl ? "_blank" : "_self"}
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center flex-1 gap-1.5 px-2 py-1.5 rounded-lg transition-colors font-bold no-underline pointer-events-auto
                    ${signedUrl ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-slate-50 text-slate-400 cursor-wait'}`}
                >
                  {loadingUrl ? <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" /> : <i className="bi bi-eye-fill" />}
                  View
                </a>
                <a 
                  href={signedUrl || '#'} 
                  download
                  className={`flex items-center justify-center flex-1 gap-1.5 px-2 py-1.5 rounded-lg transition-colors font-bold no-underline pointer-events-auto
                    ${signedUrl ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-slate-50 text-slate-400 cursor-wait'}`}
                >
                  <i className="bi bi-download" />
                  Download
                </a>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  )
}


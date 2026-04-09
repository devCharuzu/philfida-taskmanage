import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-green-700 flex-shrink-0">
          {name?.charAt(0) || '?'}
        </div>
        {name}
      </div>
    )
  }

  const heading =
    status.startsWith('Official Travel') ? '✈ Official Travel' : '📅 On Leave'
  const detail = status.split(' — ')?.[1] || status

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
        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-green-700 flex-shrink-0">
          {name?.charAt(0) || '?'}
        </div>
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
              pointerEvents: 'none',
            }}
            className="rounded-xl shadow-xl border text-xs p-3 bg-white text-slate-700 border-slate-200"
          >
            <p className="font-bold text-slate-800 mb-1">{heading}</p>
            <p className="leading-relaxed text-slate-500">{detail}</p>
          </div>,
          document.body
        )}
    </>
  )
}


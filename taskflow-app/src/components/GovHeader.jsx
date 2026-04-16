import { useState, useRef, useEffect } from 'react'

export default function GovHeader({ name, office, onLogout, children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef()

  useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <header className="bg-gradient-to-r from-green-900 to-green-800 border-b border-green-700 sticky top-0 z-40 backdrop-blur-sm print:hidden flex-shrink-0">
      <div className="h-1 bg-green-500 -mt-px" />
      <div className="px-3 sm:px-5 py-3 flex items-center justify-between gap-2 min-w-0">

        {/* Left: logo + title */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden hover-lift">
            <img src="/philfida-logo.png" alt="PhilFIDA" className="w-7 h-7 object-contain"
              onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
            <span className="text-green-900 font-bold text-[10px] hidden">PF</span>
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-xs leading-none truncate">PhilFIDA</p>
            {office && <p className="text-green-300 text-[11px] mt-0.5 truncate max-w-[140px] sm:max-w-xs">{office}</p>}
          </div>
        </div>

        {/* Right: children (bell, etc) + user menu */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {children}

          {name && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1.5 bg-green-800 hover:bg-green-700 border border-green-700 rounded-lg px-2.5 py-1.5 transition-all duration-200 hover-lift focus-ring"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0 hover-lift">
                  <span className="text-white text-[10px] font-bold">{name.charAt(0).toUpperCase()}</span>
                </div>
                <span className="text-white text-xs font-semibold max-w-[100px] truncate">{name}</span>
                <i className={`bi bi-chevron-${menuOpen ? 'up' : 'down'} text-green-300 text-[10px]`} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-50 card-enhanced">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                    <p className="font-bold text-slate-800 text-sm truncate">{name}</p>
                    {office && <p className="text-slate-400 text-xs mt-0.5 truncate">{office}</p>}
                  </div>
                  <button
                    onClick={() => { setMenuOpen(false); onLogout?.() }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors text-left hover-lift focus-ring"
                  >
                    <i className="bi bi-box-arrow-left text-base" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
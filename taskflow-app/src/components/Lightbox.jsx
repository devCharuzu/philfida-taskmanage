import { useEffect } from 'react'

const ICON_MAP = { pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', ppt:'📑', pptx:'📑', zip:'🗜️', txt:'📃', mp4:'🎬', mp3:'🎵', mov:'🎬', avi:'🎬', csv:'📊' }

export default function Lightbox({ file, onClose }) {
  if (!file) return null
  const { url, name } = file
  const isImage = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(url)
  const ext = url.split('?')[0].split('.').pop().toLowerCase()

  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleDownload() {
    try {
      const res = await fetch(url, { mode: 'cors' })
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = name
      document.body.appendChild(a); a.click()
      document.body.removeChild(a); URL.revokeObjectURL(a.href)
    } catch { window.open(url, '_blank') }
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-[9999] flex flex-col items-center justify-center p-4 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <button onClick={onClose} className="absolute top-4 right-5 text-white/70 hover:text-white text-3xl leading-none font-light">&times;</button>

      {isImage
        ? <img src={url} alt={name} className="max-w-[88vw] max-h-[68vh] rounded-lg shadow-2xl object-contain" />
        : <div className="text-6xl mb-2">{ICON_MAP[ext] || '📎'}</div>
      }

      <p className="text-slate-400 text-xs mt-3 text-center max-w-xs break-all">{name}</p>

      <div className="flex gap-3 mt-4">
        <button onClick={() => window.open(url, '_blank')} className="btn-primary flex items-center gap-2 text-sm">
          <i className="bi bi-eye-fill" /> View
        </button>
        <button onClick={handleDownload} className="btn-success flex items-center gap-2 text-sm">
          <i className="bi bi-download" /> Download
        </button>
      </div>
    </div>
  )
}

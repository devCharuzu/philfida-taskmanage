import { useState, useEffect } from 'react'
import { getSignedFileUrl } from '../lib/api'

const ICON_MAP = { pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', ppt:'📑', pptx:'📑', zip:'🗜️', txt:'📃', mp4:'🎬', mp3:'🎵', mov:'🎬', avi:'🎬', csv:'📊' }

export default function FileThumb({ fileLink, onOpen }) {
  const [signedUrls, setSignedUrls] = useState([])

  useEffect(() => {
    async function resolveUrls() {
      if (!fileLink) {
        setSignedUrls([])
        return
      }
      const paths = fileLink.split('|').filter(Boolean)
      const resolved = await Promise.all(paths.map(async path => {
        if (path.startsWith('http')) return { path, url: path }
        const url = await getSignedFileUrl(path)
        return { path, url }
      }))
      setSignedUrls(resolved)
    }
    resolveUrls()
  }, [fileLink])

  if (!fileLink || signedUrls.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {signedUrls.map(({ path, url }, i) => {
        const name = decodeURIComponent(path.split('?')[0].split('/').pop()) || 'attachment'
        const isImage = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(path)
        const ext = path.split('?')[0].split('.').pop().toLowerCase()

        return (
          <div key={i} onClick={() => onOpen(path, name)}
            className="flex flex-col items-center cursor-pointer group w-16">
            <div className="w-14 h-14 rounded-lg border-2 border-slate-200 group-hover:border-navy-400 bg-slate-50 flex items-center justify-center overflow-hidden transition-colors">
              {isImage && url
                ? <img src={url} alt={name} className="w-full h-full object-cover rounded-md" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
                : null
              }
              <span className={`text-2xl ${isImage && url ? 'hidden' : 'flex'}`}>{ICON_MAP[ext] || '📎'}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 truncate w-14 text-center">{name}</p>
          </div>
        )
      })}
    </div>
  )
}

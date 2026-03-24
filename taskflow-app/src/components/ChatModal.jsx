import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { addComment, markChatRead, parseMsg } from '../lib/api'
import Lightbox from './Lightbox'

const ICON_MAP = { pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', ppt:'📑', pptx:'📑', zip:'🗜️', txt:'📃', mp4:'🎬', mp3:'🎵', mov:'🎬', avi:'🎬', csv:'📊' }
const ACCEPT   = '.jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.mp4,.mp3,.mov,.avi,.csv'

export default function ChatModal({ taskId, taskTitle, onClose, onSync }) {
  const session  = useStore(s => s.session)
  const comments = useStore(s => s.globalData.comments.filter(c => String(c.TaskID) === String(taskId)))

  const [text,        setText]       = useState('')
  const [files,       setFiles]      = useState([])
  const [sending,     setSending]    = useState(false)
  const [lightboxFile,setLightbox]   = useState(null)
  const scrollRef = useRef()
  const fileRef   = useRef()

  // ── Mark all messages as read when modal opens ────────────────
  useEffect(() => {
    markChatRead(taskId, session.Name).then(() => onSync())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Scroll to bottom on new message ──────────────────────────
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [comments])

  async function handleSend() {
    if (!text.trim() && files.length === 0) return
    setSending(true)
    try {
      await addComment({ taskId, sender: session.Name, message: text, files })
      await onSync()
      setText(''); setFiles([])
    } finally { setSending(false) }
  }

  function handleFileSelect(e) { setFiles(prev => [...prev, ...Array.from(e.target.files)]); e.target.value = '' }
  function removeFile(i)        { setFiles(f => f.filter((_, idx) => idx !== i)) }

  return (
    <>
      <style>{`
        .chat-wrap {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          z-index: 9000; display: flex; align-items: flex-end;
          justify-content: center;
        }
        .chat-box {
          background: #fff; width: 100%; max-width: 520px;
          display: flex; flex-direction: column; overflow: hidden;
          height: 100dvh;
        }
        @media (min-width: 640px) {
          .chat-wrap { align-items: center; padding: 40px 24px; }
          .chat-box  {
            height: min(540px, calc(100dvh - 120px));
            border-radius: 16px;
            box-shadow: 0 25px 60px rgba(0,0,0,0.25);
          }
        }
      `}</style>

      <div className="chat-wrap" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="chat-box">

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#0a2e0a,#155414)' }}>
            <button onClick={onClose} className="text-green-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
              <i className="bi bi-arrow-left text-base" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold text-sm leading-none truncate">{taskTitle}</p>
              <p className="text-green-300 text-xs mt-0.5">Task Chat</p>
            </div>
            <button onClick={onClose} className="text-green-300 hover:text-white text-2xl leading-none w-7 h-7 items-center justify-center rounded-lg hover:bg-white/10 hidden sm:flex">
              &times;
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2" style={{ background: '#f8faf8' }}>
            {comments.length === 0 ? (
              <p className="text-center text-slate-400 text-sm m-auto">No messages yet. Start the conversation.</p>
            ) : comments.map((c, i) => {
              const isOwn  = c.SenderName === session.Name
              const parsed = parseMsg(c.Message)
              const time   = c.TimeStamp ? new Date(c.TimeStamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
              const urls   = parsed.files ? parsed.files.split('|').filter(Boolean) : []
              return (
                <div key={i} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                  {!isOwn && <p className="text-xs text-slate-400 font-semibold mb-1 px-1">{c.SenderName}</p>}
                  <div className={isOwn ? 'bubble-own' : 'bubble-theirs'}>
                    {parsed.text && <p className="leading-snug">{parsed.text}</p>}
                    {urls.map((url, j) => {
                      const name    = decodeURIComponent(url.split('?')[0].split('/').pop()) || 'file'
                      const isImage = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(url)
                      const ext     = url.split('?')[0].split('.').pop().toLowerCase()
                      return isImage
                        ? <img key={j} src={url} alt={name} onClick={() => setLightbox({ url, name })}
                            className="mt-2 max-w-[180px] rounded-lg cursor-pointer hover:opacity-90 border border-white/20" />
                        : <div key={j} onClick={() => setLightbox({ url, name })}
                            className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer text-xs transition-colors
                              ${isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-slate-100 hover:bg-slate-200 border border-slate-200'}`}>
                            <span className="text-base">{ICON_MAP[ext] || '📎'}</span>
                            <span className="max-w-[140px] truncate font-medium">{name}</span>
                            <i className="bi bi-download opacity-60 ml-auto flex-shrink-0" />
                          </div>
                    })}
                    <p className={`text-[10px] mt-1 opacity-60 ${isOwn ? 'text-right' : 'text-left'}`}>{time}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Staged files */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 py-2 bg-white border-t border-slate-100">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1 text-xs text-slate-600 max-w-[140px]">
                  <i className="bi bi-paperclip text-slate-400 flex-shrink-0" />
                  <span className="truncate">{f.name}</span>
                  <button onClick={() => removeFile(i)} className="text-red-400 hover:text-red-600 flex-shrink-0 ml-1 font-bold">×</button>
                </div>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div className="flex items-center gap-2 px-3 py-3 bg-white border-t border-slate-200 flex-shrink-0"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            <button onClick={() => fileRef.current?.click()} title="Attach file"
              className="p-2 text-slate-400 hover:text-green-800 transition-colors flex-shrink-0">
              <i className="bi bi-paperclip text-lg" />
            </button>
            <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={handleFileSelect} />
            <input
              className="input flex-1 text-sm"
              placeholder="Type a message..."
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            />
            <button onClick={handleSend} disabled={sending || (!text.trim() && files.length === 0)}
              className="btn-primary px-4 py-2 flex-shrink-0 disabled:opacity-50">
              {sending
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                : <i className="bi bi-send-fill" />
              }
            </button>
          </div>

        </div>
      </div>

      {lightboxFile && <Lightbox file={lightboxFile} onClose={() => setLightbox(null)} />}
    </>
  )
}
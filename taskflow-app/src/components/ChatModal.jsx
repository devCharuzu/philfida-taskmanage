import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { addComment, markChatRead, markChatNotificationsRead, parseMsg, unsendComment } from '../lib/api'
import Lightbox from './Lightbox'

const ICON_MAP = {
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
  ppt: '📑', pptx: '📑', zip: '🗜️', txt: '📃', mp4: '🎬',
  mp3: '🎵', mov: '🎬', avi: '🎬', csv: '📊', jpg: '🖼️',
  jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🎨'
}
const ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.mp4,.mp3,.mov,.avi,.csv'

// Format date for message grouping
function formatMessageDate(date) {
  if (!date) return ''
  const d = new Date(date)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatTime(date) {
  if (!date) return ''
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChatModal({ taskId, taskTitle, onClose, onSync }) {
  const session = useStore(s => s.session)
  const comments = useStore(s => s.globalData.comments.filter(c => String(c.TaskID) === String(taskId)))

  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)
  const [lightboxFile, setLightbox] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [menuFor, setMenuFor] = useState(null)   // comment ID whose ⋮ menu is open
  const [unsending, setUnsending] = useState(null)
  const scrollRef = useRef(null)
  const fileRef   = useRef(null)
  const inputRef  = useRef(null)
  // L5 FIX: use a ref on the container so drag-and-drop doesn't rely on
  // document.querySelector('.chat-wrap') which found nothing.
  const wrapRef   = useRef(null)

  // Mark messages as read on open — optimistic local update first so the
  // unread badge on the task card clears the instant the chat opens, instead
  // of waiting on the network round trip to the DB.
  useEffect(() => {
    const currentData = useStore.getState().globalData
    useStore.getState().setGlobalData({
      ...currentData,
      comments: currentData.comments.map(c =>
        String(c.TaskID) === String(taskId) &&
        c.SenderName !== session.Name &&
        !String(c.HiddenBy || '').includes(session.Name)
          ? { ...c, HiddenBy: c.HiddenBy ? `${c.HiddenBy},${session.Name}` : session.Name }
          : c
      ),
    })
    markChatRead(taskId, session.Name).then(() => {
      markChatNotificationsRead(taskId, session.ID).then(() => onSync())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Dismiss the message menu on an outside click or Escape.
  useEffect(() => {
    if (menuFor == null) return
    const close = () => setMenuFor(null)
    const onKey = (e) => { if (e.key === 'Escape') setMenuFor(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuFor])

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [comments, scrollToBottom])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // L5 FIX: attach drag handlers to the wrapRef element directly
  useEffect(() => {
    const handleDrag = (e) => { e.preventDefault(); e.stopPropagation() }
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false) }
    const handleDrop = (e) => {
      e.preventDefault(); e.stopPropagation(); setIsDragging(false)
      const droppedFiles = Array.from(e.dataTransfer.files)
      if (droppedFiles.length > 0) setFiles(prev => [...prev, ...droppedFiles])
    }
    const wrap = wrapRef.current
    if (wrap) {
      wrap.addEventListener('dragenter', handleDrag)
      wrap.addEventListener('dragleave', handleDragLeave)
      wrap.addEventListener('dragover', handleDragOver)
      wrap.addEventListener('drop', handleDrop)
      return () => {
        wrap.removeEventListener('dragenter', handleDrag)
        wrap.removeEventListener('dragleave', handleDragLeave)
        wrap.removeEventListener('dragover', handleDragOver)
        wrap.removeEventListener('drop', handleDrop)
      }
    }
  }, [])

  async function handleSend() {
    if (!text.trim() && files.length === 0) return
    setSending(true)
    try {
      await addComment({ taskId, sender: session.Name, message: text, files })
      await onSync()
      setText('')
      setFiles([])
    } finally {
      setSending(false)
    }
  }

  function handleFileSelect(e) {
    const selected = Array.from(e.target.files)
    if (selected.length > 0) {
      setFiles(prev => [...prev, ...selected])
    }
    e.target.value = ''
  }

  function removeFile(i) {
    setFiles(f => f.filter((_, idx) => idx !== i))
  }

  // Unsend removes the message for everyone, so confirm first — there's no undo.
  // The server re-checks ownership; this only decides whether to offer the action.
  async function handleUnsend(c) {
    setMenuFor(null)
    if (!window.confirm('Unsend this message? It will be removed for everyone in this chat.')) return
    setUnsending(c.ID)
    try {
      await unsendComment(c.ID, session?.ID, session?.Name)
      const current = useStore.getState().globalData
      useStore.getState().setGlobalData({
        ...current,
        comments: current.comments.map(x =>
          String(x.ID) === String(c.ID) ? { ...x, Unsent: true, Message: '' } : x
        ),
      })
      onSync?.()
    } catch (e) {
      console.error('Unsend failed:', e)
      window.alert('Could not unsend that message. Please try again.')
    } finally {
      setUnsending(null)
    }
  }

  // Group messages by date and sender. Two messages belong to the same run when the
  // same person sent them within the same minute *of the same day* — the day check
  // matters, or 9:14 AM Monday and 9:14 AM Tuesday collapse into one run.
  const sameRun = (a, b) => {
    if (!a || !b || a.SenderName !== b.SenderName) return false
    const da = new Date(a.TimeStamp)
    const db = new Date(b.TimeStamp)
    return da.toDateString() === db.toDateString() &&
      da.getHours() === db.getHours() &&
      da.getMinutes() === db.getMinutes()
  }

  const groupedMessages = comments.reduce((acc, msg, idx) => {
    const date = formatMessageDate(msg.TimeStamp)
    const isGrouped = sameRun(comments[idx - 1], msg)

    if (!acc[date]) acc[date] = []
    acc[date].push({
      ...msg,
      showSender: !isGrouped,
      isGrouped,
      // Only the last message of a run carries the time — the others repeated it verbatim.
      showTime: !sameRun(msg, comments[idx + 1]),
    })
    return acc
  }, {})

  return (
    <>
      <style>{`
        .chat-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          z-index: 9000;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          animation: backdropIn 0.2s ease-out;
        }
        @keyframes backdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .chat-container {
          background: #ffffff;
          width: 100%;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          height: 100dvh;
          animation: slideUp 0.3s ease-out;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0.8; }
          to { transform: translateY(0); opacity: 1; }
        }
        @media (min-width: 640px) {
          .chat-backdrop {
            align-items: center;
            padding: 24px;
          }
          .chat-container {
            height: min(650px, calc(100dvh - 48px));
            border-radius: 24px;
            box-shadow: 0 32px 80px rgba(0, 0, 0, 0.35);
          }
        }
        .message-bubble {
          max-width: 78%;
          padding: 9px 13px;
          border-radius: 16px;
          font-size: 13.5px;
          line-height: 1.45;
          word-wrap: break-word;
          animation: messageIn 0.18s ease-out;
        }
        @keyframes messageIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .bubble-own {
          background: #0e5c14;
          color: white;
          border-bottom-right-radius: 5px;
        }
        .bubble-theirs {
          background: #ffffff;
          color: #1a1a1a;
          border: 1px solid #e6eae6;
          border-bottom-left-radius: 5px;
        }
        .input-area {
          transition: all 0.2s ease;
        }
        .input-area:focus-within {
          box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
        }
        .drag-overlay {
          position: absolute;
          inset: 0;
          background: rgba(10, 92, 10, 0.9);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          border-radius: inherit;
          animation: fadeIn 0.2s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .file-chip {
          transition: all 0.2s ease;
        }
        .file-chip:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
      `}</style>

      <div className="chat-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="chat-container relative" ref={wrapRef}>
          {/* Drag Overlay */}
          {isDragging && (
            <div className="drag-overlay">
              <div className="text-center text-white">
                <i className="bi bi-cloud-upload text-5xl mb-3 block" />
                <p className="text-lg font-semibold">Drop files here</p>
                <p className="text-sm opacity-80 mt-1">Release to attach</p>
              </div>
            </div>
          )}

          {/* Header — one close control per breakpoint (back on mobile, X on desktop),
              title and doc number on a single line instead of a stacked badge. */}
          <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 flex-shrink-0 bg-[#0e5c14]">
            <button
              onClick={onClose}
              aria-label="Close chat"
              className="sm:hidden flex items-center justify-center w-9 h-9 -ml-1.5 text-green-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors duration-200 flex-shrink-0"
            >
              <i className="bi bi-arrow-left text-lg" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="mb-0 text-white font-semibold text-sm leading-snug truncate">
                {taskTitle.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || taskTitle}
              </p>
              {/^\[\s*[^\]]+\s*\]/.test(taskTitle) && (
                <p className="mb-0 mt-0.5 text-[11px] font-medium text-green-200/90 truncate">
                  #{taskTitle.match(/^\[\s*([^\]]+)\s*\]/)?.[1] || '—'}
                </p>
              )}
            </div>

            <button
              onClick={onClose}
              aria-label="Close chat"
              className="hidden sm:flex items-center justify-center w-9 h-9 -mr-1.5 text-green-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors duration-200 flex-shrink-0"
            >
              <i className="bi bi-x-lg" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 sm:px-5 py-3"
            style={{ background: '#f6f8f6' }}
          >
            {comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                  <i className="bi bi-chat-square-text text-xl text-green-600" />
                </div>
                <p className="mb-1 text-sm font-semibold text-slate-700">No messages yet</p>
                <p className="mb-0 text-[13px] text-slate-500">Start the conversation below</p>
              </div>
            ) : (
              Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date}>
                  {/* Date Divider */}
                  <div className="flex items-center justify-center py-2.5">
                    <span className="bg-slate-200/70 px-2.5 py-0.5 rounded-full text-[11px] font-medium text-slate-500">
                      {date}
                    </span>
                  </div>

                  {msgs.map((c) => {
                    // H4 FIX: use c.ID as key, not array index — prevents stale renders
                    // when messages are inserted or the list is reordered.
                    const isOwn = c.SenderName === session.Name
                    const parsed = parseMsg(c.Message)
                    const urls = parsed.files ? parsed.files.split('|').filter(Boolean) : []

                    if (c.Unsent) {
                      return (
                        <div
                          key={c.ID ?? c.TimeStamp}
                          className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${c.isGrouped ? 'mt-1' : 'mt-4'}`}
                        >
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] italic text-slate-400">
                            <i className="bi bi-slash-circle text-[10px]" aria-hidden="true" />
                            {isOwn ? 'You unsent a message' : `${c.SenderName} unsent a message`}
                          </span>
                        </div>
                      )
                    }

                    return (
                      <div
                        key={c.ID ?? c.TimeStamp}
                        className={`group/msg flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${c.isGrouped ? 'mt-1' : 'mt-4'}`}
                      >
                        {/* Sender Name */}
                        {c.showSender && !isOwn && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px] font-bold text-white">
                                {c.SenderName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-[11px] font-semibold text-slate-500">{c.SenderName}</span>
                          </div>
                        )}

                        {/* Message row — ⋮ sits outside the bubble, own messages only */}
                        <div className={`flex w-full items-center gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        {isOwn && (
                          <div className="relative flex-shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === c.ID ? null : c.ID) }}
                              aria-label="Message options"
                              aria-expanded={menuFor === c.ID}
                              className={`flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-all hover:bg-slate-200/70 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600
                                ${menuFor === c.ID ? 'opacity-100' : 'opacity-0 focus:opacity-100 group-hover/msg:opacity-100'}`}
                            >
                              <i className="bi bi-three-dots-vertical text-xs" />
                            </button>
                            {menuFor === c.ID && (
                              <div onMouseDown={(e) => e.stopPropagation()} className="absolute right-0 top-7 z-20 min-w-[140px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                                <button
                                  onClick={() => handleUnsend(c)}
                                  disabled={unsending === c.ID}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                  <i className="bi bi-arrow-counterclockwise text-[11px]" />
                                  {unsending === c.ID ? 'Unsending…' : 'Unsend'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        <div className={`message-bubble ${isOwn ? 'bubble-own' : 'bubble-theirs'}`}>
                          {/* Text Content */}
                          {parsed.text && (
                            <p className={`mb-0 leading-relaxed whitespace-pre-wrap ${isOwn ? 'text-white' : 'text-slate-800'}`}>{parsed.text}</p>
                          )}

                          {/* File Attachments */}
                          {urls.length > 0 && (
                            <div className={`space-y-2 ${parsed.text ? 'mt-2' : ''}`}>
                              {urls.map((url, j) => {
                                const name = decodeURIComponent(url.split('?')[0].split('/').pop()) || 'file'
                                const isImage = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(url)
                                const ext = url.split('?')[0].split('.').pop().toLowerCase()

                                if (isImage) {
                                  return (
                                    <img
                                      key={j}
                                      src={url}
                                      alt={name}
                                      onClick={() => setLightbox({ url, name })}
                                      className="max-w-[200px] sm:max-w-[240px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity border border-black/10"
                                    />
                                  )
                                }

                                return (
                                  <div
                                    key={j}
                                    onClick={() => setLightbox({ url, name })}
                                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-200 file-chip
                                      ${isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-white hover:bg-slate-50 border border-slate-200'}`}
                                  >
                                    <span className="text-lg flex-shrink-0">{ICON_MAP[ext] || '📎'}</span>
                                    <p className="mb-0 min-w-0 flex-1 text-xs font-medium truncate">{name}</p>
                                    <i className="bi bi-download opacity-60 flex-shrink-0 text-sm" />
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                        </div>

                        {/* Timestamp */}
                        {c.showTime && (
                          <p className={`mb-0 mt-1 text-[10px] text-slate-400 ${isOwn ? 'text-right' : 'text-left'}`}>
                            {formatTime(c.TimeStamp)}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {/* Staged Files Preview */}
          {files.length > 0 && (
            <div className="px-3 sm:px-5 py-3 bg-white border-t border-slate-100">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {files.map((f, i) => {
                  const ext = f.name.split('.').pop().toLowerCase()
                  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)

                  return (
                    <div
                      key={i}
                      className="flex-shrink-0 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 file-chip"
                    >
                      {isImage ? (
                        <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center">
                          <i className="bi bi-image text-slate-400 text-sm" />
                        </div>
                      ) : (
                        <span className="text-lg">{ICON_MAP[ext] || '📎'}</span>
                      )}
                      <div className="max-w-[120px]">
                        <p className="text-xs font-medium text-slate-700 truncate">{f.name}</p>
                        <p className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button
                        onClick={() => removeFile(i)}
                        className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-200 hover:bg-red-100 text-slate-500 hover:text-red-500 transition-colors"
                      >
                        <i className="bi bi-x-sm text-xs" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="input-area flex items-end gap-2 px-3 sm:px-4 pt-3 bg-white border-t border-slate-200 flex-shrink-0"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            {/* Attach Button */}
            <button
              onClick={() => fileRef.current?.click()}
              title="Attach file"
              className="flex-shrink-0 h-10 w-10 flex items-center justify-center text-slate-400 hover:text-green-700 hover:bg-green-50 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            >
              <i className="bi bi-paperclip text-base" />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Text Input */}
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                className="block w-full min-h-[40px] max-h-[120px] px-3.5 py-2.5 bg-slate-100 border-0 rounded-2xl text-sm leading-5 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:bg-white transition-all duration-200"
                placeholder="Type a message..."
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                rows={1}
                style={{ height: '40px' }}
                onInput={e => {
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(Math.max(e.target.scrollHeight, 40), 120) + 'px'
                }}
              />
            </div>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={sending || (!text.trim() && files.length === 0)}
              className={`flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1
                ${sending || (!text.trim() && files.length === 0)
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-[#0e5c14] text-white hover:bg-[#0a4a10] active:scale-95'
                }`}
            >
              {sending ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <i className="bi bi-send-fill text-base" />
              )}
            </button>
          </div>
        </div>
      </div>

      {lightboxFile && <Lightbox file={lightboxFile} onClose={() => setLightbox(null)} />}
    </>
  )
}
import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { addComment, markChatRead, parseMsg } from '../lib/api'
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
  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  const inputRef = useRef(null)

  // Mark messages as read on open
  useEffect(() => {
    markChatRead(taskId, session.Name).then(() => onSync())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Handle drag and drop
  useEffect(() => {
    const handleDrag = (e) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const handleDragOver = (e) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
    }
    const handleDragLeave = (e) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
    }
    const handleDrop = (e) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      const droppedFiles = Array.from(e.dataTransfer.files)
      if (droppedFiles.length > 0) {
        setFiles(prev => [...prev, ...droppedFiles])
      }
    }

    const wrap = document.querySelector('.chat-wrap')
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

  // Group messages by date and sender
  const groupedMessages = comments.reduce((acc, msg, idx) => {
    const date = formatMessageDate(msg.TimeStamp)
    const prevMsg = comments[idx - 1]
    const isSameSender = prevMsg && prevMsg.SenderName === msg.SenderName
    const isSameMinute = prevMsg &&
      new Date(prevMsg.TimeStamp).getMinutes() === new Date(msg.TimeStamp).getMinutes() &&
      new Date(prevMsg.TimeStamp).getHours() === new Date(msg.TimeStamp).getHours()

    if (!acc[date]) acc[date] = []
    acc[date].push({ ...msg, showSender: !isSameSender || !isSameMinute, isGrouped: isSameSender && isSameMinute })
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
          max-width: 85%;
          padding: 12px 16px;
          border-radius: 18px;
          font-size: 14px;
          line-height: 1.5;
          word-wrap: break-word;
          animation: messageIn 0.2s ease-out;
        }
        @keyframes messageIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .bubble-own {
          background: linear-gradient(135deg, #0a5c0a 0%, #147a14 100%);
          color: white;
          border-bottom-right-radius: 6px;
        }
        .bubble-theirs {
          background: #f0f2f5;
          color: #1a1a1a;
          border-bottom-left-radius: 6px;
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
        <div className="chat-container relative">
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

          {/* Header */}
          <div className="flex items-start gap-3 px-4 sm:px-5 py-4 flex-shrink-0 bg-gradient-to-r from-[#0a4a0a] to-[#147a14]">
            <button
              onClick={onClose}
              className="flex items-center justify-center w-9 h-9 text-green-200 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200 flex-shrink-0 mt-0.5"
            >
              <i className="bi bi-arrow-left text-lg" />
            </button>

            <div className="min-w-0 flex-1">
              {/* Document Number Badge */}
              {/^\[\s*[^\]]+\s*\]/.test(taskTitle) && (
                <div className="mb-1.5">
                  <span className="inline-flex items-center bg-white/20 text-white/90 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide backdrop-blur-sm">
                    {taskTitle.match(/^\[\s*([^\]]+)\s*\]/)?.[1] || '—'}
                  </span>
                </div>
              )}

              {/* Clean Title - Document Number Extracted */}
              <p className="text-white font-semibold text-sm leading-tight truncate">
                {taskTitle.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || taskTitle}
              </p>
            </div>

            <button
              onClick={onClose}
              className="hidden sm:flex items-center justify-center w-8 h-8 text-green-200 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200 flex-shrink-0 mt-0.5"
            >
              <i className="bi bi-x-lg" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-1"
            style={{ background: 'linear-gradient(180deg, #f8faf8 0%, #f0f4f0 100%)' }}
          >
            {comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <i className="bi bi-chat-square-text text-3xl text-green-600" />
                </div>
                <p className="text-slate-700 font-medium text-base mb-1">No messages yet</p>
                <p className="text-slate-500 text-sm">Start the conversation by typing a message below</p>
              </div>
            ) : (
              Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date} className="space-y-1">
                  {/* Date Divider */}
                  <div className="flex items-center justify-center py-3">
                    <div className="bg-slate-200/70 px-3 py-1 rounded-full">
                      <span className="text-xs font-medium text-slate-500">{date}</span>
                    </div>
                  </div>

                  {msgs.map((c, i) => {
                    const isOwn = c.SenderName === session.Name
                    const parsed = parseMsg(c.Message)
                    const urls = parsed.files ? parsed.files.split('|').filter(Boolean) : []

                    return (
                      <div
                        key={i}
                        className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${c.isGrouped ? 'mt-0.5' : 'mt-3'}`}
                      >
                        {/* Sender Name */}
                        {c.showSender && !isOwn && (
                          <div className="flex items-center gap-2 mb-1 ml-1">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-white">
                                {c.SenderName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-slate-500">{c.SenderName}</span>
                          </div>
                        )}

                        {/* Message Bubble */}
                        <div className={`message-bubble ${isOwn ? 'bubble-own' : 'bubble-theirs'}`}>
                          {/* Text Content */}
                          {parsed.text && (
                            <p className={`leading-relaxed whitespace-pre-wrap ${isOwn ? 'text-white' : 'text-green-700'}`}>{parsed.text}</p>
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
                                    <span className="text-xl flex-shrink-0">{ICON_MAP[ext] || '📎'}</span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium truncate">{name}</p>
                                      <p className="text-[10px] opacity-70">Click to view</p>
                                    </div>
                                    <i className="bi bi-download opacity-60 flex-shrink-0 text-sm" />
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        {/* Timestamp */}
                        <p className={`text-[11px] mt-1 opacity-60 ${isOwn ? 'text-right' : 'text-left'}`}>
                          {formatTime(c.TimeStamp)}
                        </p>
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
          <div className="input-area flex items-center gap-2 px-3 sm:px-5 py-3 sm:py-4 bg-white border-t border-slate-200 flex-shrink-0"
            style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            {/* Attach Button */}
            <button
              onClick={() => fileRef.current?.click()}
              title="Attach file"
              className="flex-shrink-0 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-green-700 hover:bg-green-50 rounded-xl transition-all duration-200"
            >
              <i className="bi bi-paperclip text-xl" />
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
                className="w-full min-h-[44px] max-h-[120px] px-4 py-3 bg-slate-100 border-0 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:bg-white transition-all duration-200"
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
                style={{ height: '44px' }}
                onInput={e => {
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(Math.max(e.target.scrollHeight, 44), 120) + 'px'
                }}
              />
            </div>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={sending || (!text.trim() && files.length === 0)}
              className={`flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-200
                ${sending || (!text.trim() && files.length === 0)
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#0a5c0a] to-[#147a14] text-white hover:shadow-lg hover:scale-105 active:scale-95'
                }`}
            >
              {sending ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <i className="bi bi-send-fill" />
              )}
            </button>
          </div>
        </div>
      </div>

      {lightboxFile && <Lightbox file={lightboxFile} onClose={() => setLightbox(null)} />}
    </>
  )
}
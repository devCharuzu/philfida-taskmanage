import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { editTask, logHistory } from '../lib/api'

const ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.mp4,.mp3,.mov,.avi,.csv'

export default function EditTaskModal({ task, onClose, onSync }) {
  const session = useStore(s => s.session)
  const [title, setTitle] = useState(task.Title || '')
  const [instructions, setInstructions] = useState(task.Instructions || '')
  const [category, setCategory] = useState(task.Category || 'General')
  const [priority, setPriority] = useState(task.Priority || 'Normal')
  const [deadline, setDeadline] = useState(task.Deadline ? task.Deadline.slice(0, 16) : '')
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await editTask({ taskId: task.TaskID, title, instructions, priority, category, deadline, files })
      await logHistory(task.TaskID, 'Edited', session?.Name || 'Unknown')
      await onSync()
      onClose()
    } catch { setError('Failed to update task.') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">

        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0a2e0a,#155414)' }}>
          <p className="text-white font-bold text-sm">Edit Assignment</p>
          <button onClick={onClose} className="text-green-300 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3 overflow-y-auto"
          style={{ maxHeight: 'min(75vh, calc(100dvh - 120px))' }}>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-2">{error}</div>}

          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="label">Instructions</label>
            <textarea className="input resize-none" rows={3} value={instructions} onChange={e => setInstructions(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
                {['General','Report','Document','Project','Meeting','Others'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="Normal">Normal</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Deadline</label>
            <input className="input" type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </div>
          <div>
            <label className="label">Replace Attachments (Optional)</label>
            <input className="input text-xs" type="file" multiple accept={ACCEPT} onChange={e => setFiles(Array.from(e.target.files))} />
          </div>
          <button className="btn-primary w-full py-2.5" disabled={loading}>
            {loading
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Saving...</>
              : <><i className="bi bi-check-lg" /> Save Changes</>
            }
          </button>
        </form>
      </div>
    </div>
  )
}
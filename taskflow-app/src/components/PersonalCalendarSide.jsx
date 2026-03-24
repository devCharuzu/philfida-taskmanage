import React from 'react'
import { useStore } from '../store/useStore'

export default function PersonalCalendarSide({ compact = false }) {
  const session = useStore(s => s.session)
  const globalData = useStore(s => s.globalData)

  const myTasks = (globalData?.tasks || [])
    .filter(t => String(t.EmployeeID) === String(session?.ID) && String(t.Archived).toUpperCase() !== 'TRUE')
    .slice().reverse()

  const upcoming = myTasks
    .filter(t => t.Deadline)
    .map(t => ({ ...t, when: new Date(t.Deadline) }))
    .sort((a,b) => a.when - b.when)
    .slice(0,5)

  return (
    <div className={`p-3 border-t border-slate-100 ${compact ? 'hidden md:block' : ''}`}>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-2">My Calendar</p>
      {upcoming.length === 0 ? (
        <div className="text-xs text-slate-400">No scheduled deadlines.</div>
      ) : (
        <ul className="space-y-2">
          {upcoming.map(t => (
            <li key={t.TaskID} className="flex items-start gap-2">
              <div className="w-2.5 h-2.5 rounded-full mt-1.5 bg-red-400 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-green-900 truncate">{t.Title}</div>
                <div className="text-[11px] text-slate-400">{new Date(t.Deadline).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 text-xs">
        <span className="font-semibold text-slate-700">Total:</span>
        <span className="ml-2 text-green-700 font-bold">{myTasks.length}</span>
      </div>
    </div>
  )
}

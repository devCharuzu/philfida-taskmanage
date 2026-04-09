import React from 'react'

export default function DeadlineProgress({ task }) {
  if (!task.Deadline || task.Status === 'Completed') return null

  const now = new Date()
  const deadline = new Date(task.Deadline)
  const createdAt = new Date(task.CreatedAt)

  // If deadline is passed, show full red bar
  if (now >= deadline) {
    return (
      <div className="mb-2">
        <div className="flex items-center justify-between text-xs text-red-600 font-semibold mb-1">
          <span>Progress</span>
          <span>Overdue</span>
        </div>
        <div className="w-full bg-red-100 rounded-full h-2 overflow-hidden">
          <div className="h-full bg-red-500 rounded-full transition-all duration-300" style={{ width: '100%' }} />
        </div>
      </div>
    )
  }

  // Calculate progress based on time elapsed
  const totalTime = deadline - createdAt
  const elapsed = now - createdAt
  const progress = Math.min(100, Math.max(0, (elapsed / totalTime) * 100))

  // Determine color based on progress and time remaining
  let bgColor = 'bg-green-100'
  let fillColor = 'bg-green-500'
  let textColor = 'text-green-600'
  
  const daysRemaining = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24))
  
  if (daysRemaining <= 1) {
    bgColor = 'bg-red-100'
    fillColor = 'bg-red-500'
    textColor = 'text-red-600'
  } else if (daysRemaining <= 3) {
    bgColor = 'bg-amber-100'
    fillColor = 'bg-amber-500'
    textColor = 'text-amber-600'
  } else if (daysRemaining <= 7) {
    bgColor = 'bg-blue-100'
    fillColor = 'bg-blue-500'
    textColor = 'text-blue-600'
  }

  return (
    <div className="mb-2">
      <div className={`flex items-center justify-between text-xs ${textColor} font-semibold mb-1`}>
        <span>Progress</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className={`w-full ${bgColor} rounded-full h-2 overflow-hidden`}>
        <div 
          className={`h-full ${fillColor} rounded-full transition-all duration-300 ease-out`} 
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

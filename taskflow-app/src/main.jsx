import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { unlockAudio } from './lib/notifSound'

// Mobile error boundary component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Mobile app error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      // Try to get stored error information
      let storedError = null
      let storedRejection = null
      
      try {
        storedError = sessionStorage.getItem('lastError')
        storedRejection = sessionStorage.getItem('lastRejection')
      } catch (e) {
        console.warn('Could not read from sessionStorage:', e)
      }

      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0a2e0a 0%, #155414 50%, #1a6e1a 100%)' }}>
          <div className="text-center max-w-md">
            <h1 className="text-white text-xl font-bold mb-4">TaskFlow Error</h1>
            <p className="text-green-200 text-sm mb-4">Something went wrong. Please refresh the page.</p>
            
            {isMobile && (
              <div className="bg-yellow-500/20 border border-yellow-400/50 rounded-lg p-3 mb-4">
                <p className="text-yellow-200 text-xs">
                  <strong>Mobile Device Detected</strong><br/>
                  This error might be mobile-specific. Please check your browser console for details.
                </p>
              </div>
            )}
            
            <div className="space-y-2 mb-6">
              <button 
                onClick={() => window.location.reload()} 
                className="w-full px-6 py-3 bg-white text-green-800 rounded-lg font-medium"
              >
                Refresh Page
              </button>
              <button 
                onClick={() => {
                  // Clear stored errors and retry
                  try {
                    sessionStorage.removeItem('lastError')
                    sessionStorage.removeItem('lastRejection')
                    localStorage.clear()
                  } catch (e) {}
                  window.location.reload()
                }} 
                className="w-full px-6 py-2 bg-green-700 text-white rounded-lg text-sm"
              >
                Clear Cache & Refresh
              </button>
            </div>
            
            <details className="text-left bg-black/20 rounded-lg p-3">
              <summary className="text-green-300 text-xs cursor-pointer mb-2">Debug Information</summary>
              <div className="text-xs space-y-2">
                <div>
                  <strong className="text-green-300">Current Error:</strong>
                  <pre className="text-red-300 mt-1 whitespace-pre-wrap">
                    {this.state.error?.toString()}
                  </pre>
                </div>
                
                {storedError && (
                  <div>
                    <strong className="text-green-300">Last Global Error:</strong>
                    <pre className="text-red-300 mt-1 whitespace-pre-wrap">
                      {JSON.stringify(JSON.parse(storedError), null, 2)}
                    </pre>
                  </div>
                )}
                
                {storedRejection && (
                  <div>
                    <strong className="text-green-300">Last Promise Rejection:</strong>
                    <pre className="text-red-300 mt-1 whitespace-pre-wrap">
                      {JSON.stringify(JSON.parse(storedRejection), null, 2)}
                    </pre>
                  </div>
                )}
                
                <div>
                  <strong className="text-green-300">Device Info:</strong>
                  <p className="text-green-200 mt-1">
                    Mobile: {isMobile ? 'Yes' : 'No'}<br/>
                    User Agent: {navigator.userAgent?.substring(0, 100)}...
                  </p>
                </div>
              </div>
            </details>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Unlock AudioContext on first user gesture (required by browsers)
function handleFirstInteraction() {
  unlockAudio()
  document.removeEventListener('click', handleFirstInteraction)
  document.removeEventListener('keydown', handleFirstInteraction)
  document.removeEventListener('touchstart', handleFirstInteraction)
}
document.addEventListener('click',      handleFirstInteraction)
document.addEventListener('keydown',    handleFirstInteraction)
document.addEventListener('touchstart', handleFirstInteraction)

// Add mobile-specific error handling with detailed logging
window.addEventListener('error', (event) => {
  const errorInfo = {
    message: event.error?.message || event.message,
    stack: event.error?.stack,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    userAgent: navigator.userAgent,
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    timestamp: new Date().toISOString()
  }
  
  console.error('Global error details:', errorInfo)
  
  // Store error for debugging
  try {
    sessionStorage.setItem('lastError', JSON.stringify(errorInfo))
  } catch (e) {
    console.warn('Could not store error in sessionStorage:', e)
  }
})

window.addEventListener('unhandledrejection', (event) => {
  const rejectionInfo = {
    reason: event.reason?.message || event.reason,
    stack: event.reason?.stack,
    userAgent: navigator.userAgent,
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    timestamp: new Date().toISOString()
  }
  
  console.error('Unhandled promise rejection details:', rejectionInfo)
  
  // Store rejection for debugging
  try {
    sessionStorage.setItem('lastRejection', JSON.stringify(rejectionInfo))
  } catch (e) {
    console.warn('Could not store rejection in sessionStorage:', e)
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
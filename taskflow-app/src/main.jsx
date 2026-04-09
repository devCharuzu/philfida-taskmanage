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
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0a2e0a 0%, #155414 50%, #1a6e1a 100%)' }}>
          <div className="text-center">
            <h1 className="text-white text-xl font-bold mb-4">TaskFlow Error</h1>
            <p className="text-green-200 text-sm mb-6">Something went wrong. Please refresh the page.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="px-6 py-3 bg-white text-green-800 rounded-lg font-medium"
            >
              Refresh Page
            </button>
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-4 text-left">
                <summary className="text-green-300 text-xs cursor-pointer">Error Details</summary>
                <pre className="text-red-300 text-xs mt-2 whitespace-pre-wrap">
                  {this.state.error?.toString()}
                </pre>
              </details>
            )}
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

// Add mobile-specific error handling
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
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
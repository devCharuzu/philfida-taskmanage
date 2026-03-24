import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { unlockAudio } from './lib/notifSound'

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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
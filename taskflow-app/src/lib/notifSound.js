let _ctx = null

function getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

export function unlockAudio() {
  try { getCtx() } catch (e) {}
}

// ── Preference (localStorage, default ON) ─────────────────────
const KEY = 'philfida_sound_enabled'
export function isSoundEnabled()       { const v = localStorage.getItem(KEY); return v === null ? true : v === 'true' }
export function setSoundEnabled(val)   { localStorage.setItem(KEY, String(val)) }

// ── Chime ──────────────────────────────────────────────────────
export function playNotifSound() {
  if (!isSoundEnabled()) return
  try {
    const ctx   = getCtx()
    const notes = [587.33, 739.99, 880.00]
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      const t = ctx.currentTime + i * 0.13
      osc.frequency.setValueAtTime(freq, t)
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.28, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
      osc.start(t)
      osc.stop(t + 0.25)
    })
  } catch (e) { console.warn('Audio blocked:', e) }
}
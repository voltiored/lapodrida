import type { SoundEvent, SoundKind } from './soundEvents'

// Sonidos de cartas sintetizados con Web Audio (sin archivos): ruido filtrado + un pequeño golpe grave.
let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null
const KEY = 'podrida.sound'
const listeners = new Set<() => void>()
let enabled = (() => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } })()

export const isSoundEnabled = () => enabled
export function setSoundEnabled(v: boolean) {
  enabled = v
  try { localStorage.setItem(KEY, v ? 'on' : 'off') } catch { /* modo privado */ }
  listeners.forEach(l => l())
  if (v) { unlockAudio(); play('tick') }
}
export function subscribeSound(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb) } }

/** Los navegadores solo dejan sonar tras un gesto del usuario: se llama en el primer toque. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
  } catch { /* sin audio */ }
}

function noiseBuffer(c: AudioContext) {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noise
}

function burst(c: AudioContext, at: number, o: { type: BiquadFilterType; freq: number; q?: number; dur: number; gain: number; attack?: number }) {
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c)
  src.playbackRate.value = 0.85 + Math.random() * 0.3
  const f = c.createBiquadFilter(); f.type = o.type; f.frequency.value = o.freq * (0.92 + Math.random() * 0.16); f.Q.value = o.q ?? 0.9
  const g = c.createGain(); const a = o.attack ?? 0.002
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(o.gain, at + a)
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur)
  src.connect(f).connect(g).connect(c.destination)
  src.start(at, Math.random() * 0.5, o.dur + 0.05)
}
function thump(c: AudioContext, at: number, f0: number, dur: number, gain: number) {
  const osc = c.createOscillator(); osc.type = 'sine'
  osc.frequency.setValueAtTime(f0, at); osc.frequency.exponentialRampToValueAtTime(f0 * 0.5, at + dur)
  const g = c.createGain(); g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(g).connect(c.destination); osc.start(at); osc.stop(at + dur + 0.02)
}
function tone(c: AudioContext, at: number, freq: number, dur: number, gain: number) {
  const osc = c.createOscillator(); osc.type = 'triangle'; osc.frequency.value = freq
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(g).connect(c.destination); osc.start(at); osc.stop(at + dur + 0.02)
}

const SOUNDS: Record<SoundKind, (c: AudioContext, t: number) => void> = {
  place: (c, t) => { burst(c, t, { type: 'bandpass', freq: 2200, q: 0.9, dur: 0.07, gain: 0.55 }); thump(c, t, 150, 0.09, 0.3) },
  deal: (c, t) => burst(c, t, { type: 'highpass', freq: 3200, q: 0.7, dur: 0.04, gain: 0.32 }),
  sweep: (c, t) => { burst(c, t, { type: 'bandpass', freq: 1400, q: 0.6, dur: 0.22, gain: 0.34, attack: 0.05 }); thump(c, t + 0.03, 110, 0.12, 0.16) },
  tick: (c, t) => burst(c, t, { type: 'bandpass', freq: 3500, q: 1.2, dur: 0.025, gain: 0.2 }),
  turn: (c, t) => { tone(c, t, 660, 0.14, 0.12); tone(c, t + 0.11, 880, 0.2, 0.12) },
  win: (c, t) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.12, f, 0.28, 0.14)) },
}

function play(kind: SoundKind, delayMs = 0) {
  if (!enabled || !ctx) return
  const c = ctx
  if (c.state === 'suspended') void c.resume()
  SOUNDS[kind](c, c.currentTime + delayMs / 1000)
}
export function playEvents(events: SoundEvent[]) { for (const e of events) play(e.kind, e.delayMs) }
export const playSound = (kind: SoundKind) => play(kind)

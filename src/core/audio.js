import { settings } from './settings.js'

// Shared graph: world categories pause together; UI remains available in menus.
let context = null, master = null, world = null
let paused = false, focused = true
const buses = new Map(), pauseListeners = new Set()
const clamp = v => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5
function applyVolume() {
  if (!master) return
  master.gain.value = settings.get('mute') || !focused ? 0 : clamp(settings.get('masterVolume'))
  for (const [name, bus] of buses) bus.gain.value = clamp(settings.get(name === 'ui' ? 'sfxVolume' : name + 'Volume'))
}
export function initAudio() {
  if (context) return context
  const AudioCtx = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext
  if (!AudioCtx) return null
  try {
    context = new AudioCtx()
    master = context.createGain(); master.connect(context.destination)
    applyVolume()
    return context
  } catch (error) {
    context = null
    console.warn('[audio] unavailable; continuing silently', error)
    return null
  }
}
export const getContext = () => context
export const getMasterGain = () => master
export function getAudioBus(name = 'sfx') {
  if (!context || !master) return null
  if (!buses.has(name)) {
    if (!world) { world = context.createGain(); world.gain.value = paused ? 0 : 1; world.connect(master) }
    const bus = context.createGain()
    bus.connect(name === 'ui' ? master : world)
    buses.set(name, bus); applyVolume()
  }
  return buses.get(name)
}
export const isWorldAudioPaused = () => paused || !focused
export const onAudioPause = listener => { pauseListeners.add(listener); return () => pauseListeners.delete(listener) }
export function setAudioPaused(value) {
  value = Boolean(value)
  if (paused === value) return
  paused = value
  if (world) world.gain.value = value ? 0 : 1
  for (const listener of pauseListeners) listener(isWorldAudioPaused())
}
export function setAudioFocused(value) {
  value = Boolean(value)
  if (focused === value) return
  focused = value; applyVolume()
  for (const listener of pauseListeners) listener(isWorldAudioPaused())
  if (!focused) context?.suspend?.()?.catch?.(() => {})
}
export function setMasterVolume(v) { settings.set('masterVolume', clamp(v)) }
const unsubscribeSettings = settings.subscribe((_v, changed) => {
  if (changed === undefined || changed === 'mute' || changed === 'all' || changed === 'options' || changed.endsWith('Volume')) applyVolume()
})
export function resumeAudio() {
  if (!context || !focused) return Promise.resolve()
  try { return Promise.resolve(context.resume()).catch(() => {}) } catch { return Promise.resolve() }
}
export function disposeAudio() {
  for (const listener of pauseListeners) listener(true)
  for (const bus of buses.values()) bus.disconnect()
  buses.clear(); world?.disconnect(); master?.disconnect()
  context?.close?.()?.catch?.(() => {})
  context = master = world = null
}
if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribeSettings(); disposeAudio() })

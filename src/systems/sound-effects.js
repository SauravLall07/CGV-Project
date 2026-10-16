import { getContext, getAudioBus, isWorldAudioPaused, onAudioPause } from '../core/audio.js'
import { settings } from '../core/settings.js'
import { SOUND_FILES } from './sound-catalog.js'

// BufferSources are single-use by Web Audio design; buffers are cached and
// only a source/gain pair is allocated per accepted event. Never queue late
// sounds after a fetch, pause, teleport, or level change.
export function createSoundPlayer({
  context = getContext, output = getAudioBus, paused = isWorldAudioPaused,
  fetchAsset = (...args) => fetch(...args), files = SOUND_FILES, maxVoices = 20
} = {}) {
  const buffers = new Map(), pending = new Map(), controllers = new Map(), voices = new Set(), last = new Map()
  let disposed = false, generation = 0
  function load(name) {
    if (disposed || !files[name] || !context()) return Promise.resolve(null)
    if (buffers.has(name)) return Promise.resolve(buffers.get(name))
    if (pending.has(name)) return pending.get(name)
    const ctx = context(), token = generation
    const controller = new AbortController()
    controllers.set(name, controller)
    const promise = (async () => {
      try {
        const response = await fetchAsset(files[name], { signal: controller.signal })
        if (!response.ok) throw new Error('HTTP ' + response.status)
        const data = await response.arrayBuffer()
        const buffer = await new Promise((resolve, reject) => {
          const decoded = ctx.decodeAudioData(data, resolve, reject)
          decoded?.then?.(resolve, reject)
        })
        if (!disposed && token === generation) buffers.set(name, buffer)
        return buffer
      } catch (error) {
        if (!controller.signal.aborted) console.warn('[sfx] could not load ' + name, error)
        return null
      } finally { pending.delete(name); controllers.delete(name) }
    })()
    pending.set(name, promise)
    return promise
  }
  function stopAll(includeUI = false) {
    for (const voice of voices) if (includeUI || voice.category !== 'ui') voice.stop()
    last.clear()
  }
  function play(name, { volume = 0.55, rate = 1, category = name.startsWith('ui-') ? 'ui' : 'sfx',
    cooldown = 0.09, key = name, maxInstances = 2, loop = false, priority = 1 } = {}) {
    const ctx = context()
    if (disposed || !ctx || ctx.state !== 'running' || (category !== 'ui' && paused()) ||
      settings.get('mute') || settings.get('masterVolume') === 0) return null
    const buffer = buffers.get(name)
    if (!buffer) return null
    if (settings.get(category === 'ui' ? 'sfxVolume' : category + 'Volume') === 0) return null
    const now = ctx.currentTime
    if (now - (last.get(key) ?? -Infinity) < cooldown) return null
    let instances = 0
    for (const voice of voices) if (voice.key === key) instances++
    if (instances >= maxInstances) return null
    if (voices.size >= maxVoices) {
      const victim = [...voices].find(v => !v.loop && v.priority < priority)
      if (!victim) return null
      victim.stop()
    }
    const destination = output(category)
    if (!destination) return null
    const source = ctx.createBufferSource(), gain = ctx.createGain()
    source.buffer = buffer; source.loop = loop
    source.playbackRate.value = Math.max(0.5, Math.min(2, rate))
    gain.gain.value = Math.max(0, Math.min(1, volume))
    source.connect(gain); gain.connect(destination)
    let stopped = false
    const cleanup = () => {
      source.onended = null
      source.disconnect(); gain.disconnect(); voices.delete(voice)
    }
    const voice = { key, category, priority, loop,
      stop() { if (stopped) return; stopped = true; try { source.stop() } catch { /* ended */ } cleanup() },
      setVolume(v) { if (!stopped) gain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.08) }
    }
    source.onended = cleanup
    voices.add(voice)
    try { source.start() } catch { voice.stop(); return null }
    last.set(key, now)
    if (last.size > 128) last.delete(last.keys().next().value)
    return voice
  }
  return {
    load, preload: (names = Object.keys(files)) => Promise.all(names.map(load)), play, stopAll,
    info: () => ({ buffers: buffers.size, pending: pending.size, voices: voices.size,
      pcmBytes: [...buffers.values()].reduce((sum, b) => sum + b.length * b.numberOfChannels * 4, 0) }),
    dispose() {
      disposed = true; generation++; stopAll(true); buffers.clear()
      for (const controller of controllers.values()) controller.abort()
      controllers.clear(); pending.clear()
    }
  }
}

export const sound = createSoundPlayer()
export const playSfx = (name, options) => sound.play(name, options)
export const preloadSfx = () => sound.preload()
const unsubscribe = onAudioPause(value => { if (value) sound.stopAll() })
if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribe(); sound.dispose() })

// Lightweight local state tracking for mechanical transitions. The first
// observation seeds state silently; distance never causes an action to fire.
export function createAudioTransitions() {
  const states = new Map()
  return {
    edge(key, value, name, options) {
      const before = states.get(key)
      states.set(key, value)
      if (before !== undefined && before !== value && name) playSfx(name, { key, ...options })
    },
    motion(key, value, distance, { opening = 'door-open', closing = 'door-close', ...options } = {}) {
      const before = states.get(key)
      const previousDirection = before?.direction
      const direction = before === undefined || Math.abs(value - before.value) < 0.0001 ? 0 : Math.sign(value - before.value)
      // Preserve direction through a dwell/Freeze or tiny easing increments:
      // resuming the same motion must not replay its start cue every frame.
      if (before) { before.value = value; if (direction) before.direction = direction }
      else states.set(key, { value, direction })
      if (before && direction && direction !== previousDirection && distance < 12) {
        playSfx(direction > 0 ? opening : closing, { key, volume: 0.4 * (1 - distance / 12), cooldown: 0.3, ...options })
      }
    },
    reset() { states.clear() }
  }
}

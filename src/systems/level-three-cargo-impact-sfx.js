import { getContext, getSfxGain } from '../core/audio.js'

// Only the actual motion events request audio; no warning countdown effects.
const paths = {
  rock: new URL('../assets/audio/sfx/level3/rock-fall.mp3', import.meta.url),
  wood: new URL('../assets/audio/sfx/level3/wood-impact.mp3', import.meta.url),
  metal: new URL('../assets/audio/sfx/level2/metal-slam.mp3', import.meta.url),
  whoosh: new URL('../assets/audio/sfx/level3/lethal-debris-whoosh.mp3', import.meta.url)
}
const buffers = new Map()
const loading = new Map()
async function load(name) {
  if (buffers.has(name)) return buffers.get(name)
  if (loading.has(name)) return loading.get(name)
  const ctx = getContext()
  if (!ctx) return null
  const pending = fetch(paths[name]).then(response => {
    if (!response.ok) throw Error(`cargo ${name}: ${response.status}`)
    return response.arrayBuffer()
  }).then(data => ctx.decodeAudioData(data)).then(buffer => {
    buffers.set(name, buffer)
    return buffer
  }).catch(error => { console.warn('[cargo impact]', error); return null })
    .finally(() => loading.delete(name))
  loading.set(name, pending)
  return pending
}
export function createCargoImpactAudio() {
  let paused = false
  const last = new Map()
  function play(name, position, listener, volume, radius, cooldown = 0.25, carriage = null) {
    if (paused) return false
    // Restrict cargo rocks to their carriage even when another carriage is nearby.
    if (carriage && (!listener || listener.z < carriage.minZ || listener.z > carriage.maxZ)) return false
    const ctx = getContext(), bus = getSfxGain()
    if (!ctx || !bus) return false
    const distance = position && listener ? position.distanceTo(listener) : 0
    if (distance >= radius) return false
    const now = ctx.currentTime
    if (now - (last.get(name) ?? -Infinity) < cooldown) return false
    last.set(name, now)
    void load(name).then(buffer => {
      if (!buffer || paused || ctx.state !== 'running') return
      if (carriage && (!listener || listener.z < carriage.minZ || listener.z > carriage.maxZ)) return
      const source = ctx.createBufferSource(), gain = ctx.createGain()
      source.buffer = buffer
      gain.gain.value = volume * Math.pow(Math.max(0, 1 - distance / radius), 1.4)
      source.connect(gain).connect(bus)
      source.onended = () => { source.disconnect(); gain.disconnect() }
      source.start()
    })
    return true
  }
  return {
    preload() { return Promise.all(Object.keys(paths).map(load)) },
    rock(position, listener, carriage) { return play('rock', position, listener, 0.64, 7, 0.4, carriage) },
    wood(position, listener) { play('wood', position, listener, 0.55, 14, 0.6) },
    metal(position, listener) { play('metal', position, listener, 0.48, 18, 0.5) },
    floor(position, listener) { play('whoosh', position, listener, 0.95, 18, 0.75) },
    swing(position, listener) { play('whoosh', position, listener, 1.65, 17, 0.48) },
    setPaused(value) { paused = !!value },
    reset() { last.clear() },
    dispose() { paused = true; last.clear() }
  }
}

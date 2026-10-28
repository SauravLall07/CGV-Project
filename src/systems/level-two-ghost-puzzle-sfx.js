import { getContext, getSfxGain } from '../core/audio.js'

// Reuse the exact Level 1 puzzle recordings; playback belongs exclusively to
// the Level 2 Relay/Ghost carriage and respects the global SFX bus.
const sources = {
  plate: new URL('../assets/audio/sfx/security/pressure-switch.mp3', import.meta.url),
  dial: new URL('../assets/audio/sfx/security/dial-switch.mp3', import.meta.url),
  slide: new URL('../assets/audio/sfx/security/door-slide.mp3', import.meta.url),
  whoosh: new URL('../assets/audio/sfx/security/door-whoosh.mp3', import.meta.url)
}
const buffers = new Map()
const loads = new Map()
function load(name) {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name))
  if (loads.has(name)) return loads.get(name)
  const ctx = getContext()
  if (!ctx) return Promise.resolve(null)
  const request = fetch(sources[name]).then(r => {
    if (!r.ok) throw new Error(`Ghost puzzle SFX ${name}: HTTP ${r.status}`)
    return r.arrayBuffer()
  }).then(data => ctx.decodeAudioData(data)).then(buffer => {
    buffers.set(name, buffer)
    return buffer
  }).catch(error => { console.warn('[ghost-puzzle-sfx]', error); return null })
    .finally(() => loads.delete(name))
  loads.set(name, request)
  return request
}

export function createGhostCarriagePuzzleAudio(player, carriage) {
  let disposed = false
  const active = new Set()
  function preload() {
    if (disposed || !getContext()) return
    Object.keys(sources).forEach(name => { void load(name) })
  }
  preload()
  function attenuation(position) {
    const p = player?.mesh?.position
    if (!p || !position || p.z < carriage.minZ || p.z > carriage.maxZ) return 0
    if (position.z < carriage.minZ || position.z > carriage.maxZ) return 0
    const d = Math.hypot(p.x - position.x, p.z - position.z)
    if (d >= 12) return 0
    return d <= 2 ? 1 : ((12 - d) / 10) ** 2
  }
  function play(name, position, volume, offset = 0, duration) {
    if (disposed) return
    const ctx = getContext(), bus = getSfxGain()
    const factor = attenuation(position)
    if (!ctx || !bus || ctx.state !== 'running' || factor <= 0) return
    const start = buffer => {
      if (!buffer || disposed) return
      // Re-evaluate location in case the player left the carriage while loading.
      const fade = attenuation(position)
      if (fade <= 0 || ctx.state !== 'running') return
      const source = ctx.createBufferSource()
      const gain = ctx.createGain()
      source.buffer = buffer
      gain.gain.value = volume * fade
      source.connect(gain).connect(bus)
      active.add(source)
      source.onended = () => { active.delete(source); source.disconnect(); gain.disconnect() }
      source.start(0, offset, duration)
    }
    const buffer = buffers.get(name)
    if (buffer) start(buffer)
    else void load(name).then(start)
  }
  return {
    preload,
    playPlate: pos => play('plate', pos, 0.32),
    playDial: pos => play('dial', pos, 0.28),
    playDoor: pos => { play('slide', pos, 0.48); play('whoosh', pos, 0.12, 0.60, 1.35) },
    dispose() {
      disposed = true
      for (const source of active) { try { source.stop() } catch { /* already stopped */ } }
      active.clear()
    }
  }
}

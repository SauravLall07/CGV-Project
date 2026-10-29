import { getContext, getSfxGain } from '../core/audio.js'

// One heavy moving-floor sound for the entire Security Freeze crossing.
// Measured tile displacement, not animation-phase guesses, determines loudness.
const slideUrl = new URL('../assets/audio/sfx/level2/slide.mp3', import.meta.url)
const slamUrl = new URL('../assets/audio/sfx/level2/metal-slam.mp3', import.meta.url)
let preloadPromise = null
const buffers = {}

export function createFreezeFloorAudio(group, span) {
  const tiles = group.children.filter(child => child.name.startsWith('security-freeze-tile-'))
  const previous = tiles.map(tile => tile.position.clone())
  const centre = { x: 0, y: 0.25, z: span.center }
  let paused = false
  let disposed = false
  let loop = null
  let lockedLastFrame = false
  const shots = new Set()

  function preload() {
    if (!preloadPromise) {
      preloadPromise = Promise.all([['slide', slideUrl], ['slam', slamUrl]].map(async ([name,url]) => {
        try {
          const context = getContext()
          if (!context) return
          const response = await fetch(url)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          buffers[name] = await context.decodeAudioData(await response.arrayBuffer())
        } catch (error) {
          console.warn('[freeze floor audio]', name, error)
        }
      }))
    }
    return preloadPromise
  }

  function falloff(listener) {
    // Mute outside the Security carriage, even if physically near a tile.
    if (!listener || listener.z < span.minZ || listener.z > span.maxZ) return 0
    const distance = Math.hypot(listener.x - centre.x, listener.z - centre.z)
    return Math.pow(Math.max(0, 1 - distance / 15), 1.2)
  }

  function playLock(listener) {
    const ctx = getContext(), bus = getSfxGain(), buffer = buffers.slam
    const proximity = falloff(listener)
    if (disposed || paused || !ctx || ctx.state !== 'running' || !bus || !buffer || proximity <= 0) return
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
    source.buffer = buffer
    source.playbackRate.value = 0.75 // Lower, weightier metal thud.
    filter.type = 'lowpass'; filter.frequency.value = 1050
    gain.gain.value = 0.12 * proximity // Deliberately soft compared with Chalk Slide.
    source.connect(filter).connect(gain).connect(bus)
    shots.add(source)
    source.onended = () => { shots.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect() }
    source.start()
  }

  function update(delta, listener, settle) {
    if (disposed) return
    let moved = 0
    for (let i = 0; i < tiles.length; i++) {
      moved += tiles[i].position.distanceTo(previous[i])
      previous[i].copy(tiles[i].position)
    }
    const speed = moved / Math.max(delta, 0.001) / Math.max(1, tiles.length)
    const proximity = falloff(listener)
    const ctx = getContext(), bus = getSfxGain()
    const volume = paused || !ctx || ctx.state !== 'running' || !bus || !buffers.slide || speed < 0.015
      ? 0 : 0.9 * proximity * Math.min(1, speed / 0.85)
    if (!loop && volume > 0) {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
      source.buffer = buffers.slide
      source.loop = true
      source.playbackRate.value = 0.67 // Low-pitched Chalk Slide, much heavier than luggage.
      filter.type = 'lowpass'; filter.frequency.value = 1600
      gain.gain.value = 0
      source.connect(filter).connect(gain).connect(bus)
      source.start()
      loop = { source, filter, gain }
    }
    if (loop && ctx) loop.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.035)

    const locked = settle >= 0.995
    if (locked && !lockedLastFrame) playLock(listener)
    lockedLastFrame = locked
  }

  function reset() {
    tiles.forEach((tile, index) => previous[index].copy(tile.position))
    lockedLastFrame = false
    if (loop) loop.gain.gain.value = 0
  }
  function setPaused(value) {
    paused = Boolean(value)
    if (paused && loop) loop.gain.gain.value = 0
  }
  function dispose() {
    disposed = true
    if (loop) {
      try { loop.source.stop() } catch {}
      loop.source.disconnect(); loop.filter.disconnect(); loop.gain.disconnect()
      loop = null
    }
    for (const source of shots) {
      try { source.stop() } catch {}
      source.disconnect()
    }
    shots.clear()
  }
  return { preload, update, reset, setPaused, dispose }
}

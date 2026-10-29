import { getContext, getSfxGain } from '../core/audio.js'

// Passenger carriage: one deep slide across all stepping-stones, and a
// wooden/heavy impact for the falling luggage rack (not the metal-door slam).
const urls = {
  slide: new URL('../assets/audio/sfx/level2/slide.mp3', import.meta.url),
  lock: new URL('../assets/audio/sfx/level2/metal-slam.mp3', import.meta.url),
  impact: new URL('../assets/audio/sfx/level3/wood-impact.mp3', import.meta.url)
}
const decoded = new Map()
let loading = null

export function createPassengerHazardAudio({ rack, pieces, span, floorCentreZ }) {
  let paused = false, disposed = false, loop = null
  const prior = pieces.map(piece => piece.position.clone())
  let rackY = rack?.position.y ?? 2.65
  let rackArmed = true, wasLocked = false
  const shots = new Set()

  function preload() {
    if (!loading) loading = Promise.all(Object.entries(urls).map(async ([key, url]) => {
      try {
        const ctx = getContext()
        if (!ctx) return
        const result = await fetch(url)
        if (!result.ok) throw new Error(`${key}: ${result.status}`)
        decoded.set(key, await ctx.decodeAudioData(await result.arrayBuffer()))
      } catch (error) { console.warn('[passenger hazard audio]', error) }
    }))
    return loading
  }
  const inCar = listener => listener && listener.z >= span.minZ && listener.z <= span.maxZ
  function attenuate(listener, z, radius) {
    if (!inCar(listener)) return 0
    const d = Math.hypot(listener.x, listener.z - z)
    return Math.pow(Math.max(0, 1 - d / radius), 1.4)
  }
  function oneShot(key, listener, z, volume, pitch, radius) {
    const ctx = getContext(), bus = getSfxGain(), buffer = decoded.get(key)
    const proximity = attenuate(listener, z, radius)
    if (disposed || paused || !ctx || ctx.state !== 'running' || !bus || !buffer || proximity <= 0) return
    const source = ctx.createBufferSource(), lowpass = ctx.createBiquadFilter(), gain = ctx.createGain()
    source.buffer = buffer; source.playbackRate.value = pitch
    lowpass.type = 'lowpass'; lowpass.frequency.value = 1100
    gain.gain.value = volume * proximity
    source.connect(lowpass).connect(gain).connect(bus)
    shots.add(source)
    source.onended = () => { shots.delete(source); source.disconnect(); lowpass.disconnect(); gain.disconnect() }
    source.start()
  }
  function update(delta, listener, { collapseLive, collapseSettle }) {
    if (disposed) return
    if (rack) {
      const current = rack.position.y
      // Re-arm after the object has risen again (checkpoint / time reversal).
      if (current > 1.25) rackArmed = true
      if (rackArmed && rackY > 0.17 && current <= 0.17 && current < rackY) {
        rackArmed = false
        oneShot('impact', listener, rack.position.z, 0.8, 0.78, 13)
      }
      rackY = current
    }
    let distance = 0
    pieces.forEach((piece, i) => {
      distance += piece.position.distanceTo(prior[i])
      prior[i].copy(piece.position)
    })
    const speed = distance / Math.max(0.001, delta) / Math.max(1, pieces.length)
    const ctx = getContext(), bus = getSfxGain()
    const volume = collapseLive && !paused && ctx?.state === 'running' && bus && decoded.has('slide') && speed >= 0.015
      ? 0.9 * attenuate(listener, floorCentreZ, 15) * Math.min(1, speed / 0.85) : 0
    if (!loop && volume > 0) {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
      source.buffer = decoded.get('slide'); source.loop = true; source.playbackRate.value = 0.67
      filter.type = 'lowpass'; filter.frequency.value = 1600
      gain.gain.value = 0
      source.connect(filter).connect(gain).connect(bus); source.start()
      loop = { source, filter, gain }
    }
    if (loop && ctx) loop.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.035)
    const locked = collapseLive && collapseSettle >= 0.995
    if (locked && !wasLocked) oneShot('lock', listener, floorCentreZ, 0.12, 0.75, 15)
    wasLocked = locked
  }
  function reset() {
    pieces.forEach((piece, i) => prior[i].copy(piece.position))
    rackY = rack?.position.y ?? 2.65
    rackArmed = rackY > 1.25
    wasLocked = false
    if (loop) loop.gain.gain.value = 0
  }
  function setPaused(value) { paused = Boolean(value); if (paused && loop) loop.gain.gain.value = 0 }
  function dispose() {
    disposed = true
    if (loop) { try { loop.source.stop() } catch {} loop.source.disconnect(); loop.filter.disconnect(); loop.gain.disconnect() }
    shots.forEach(source => { try { source.stop() } catch {} source.disconnect() }); shots.clear()
  }
  return { preload, update, reset, setPaused, dispose }
}

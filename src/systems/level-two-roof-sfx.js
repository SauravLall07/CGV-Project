import { getContext, getSfxGain } from '../core/audio.js'
import { startTrainDoorEffortSfx, stopTrainDoorEffortSfx } from './level-one-guard-train-sfx.js'

// The roof sounds are independent of the carriage ambience, but share the SFX bus.
const assets = {
  wind: new URL('../assets/audio/sfx/level2/roof-wind.mp3', import.meta.url),
  zip: new URL('../assets/audio/sfx/level2/roof-zip.mp3', import.meta.url),
  slide: new URL('../assets/audio/sfx/level2/slide.mp3', import.meta.url),
  steam: new URL('../assets/audio/sfx/level2/steam.mp3', import.meta.url),
  slam: new URL('../assets/audio/sfx/level2/metal-slam.mp3', import.meta.url),
  plate: new URL('../assets/audio/sfx/security/pressure-switch.mp3', import.meta.url)
}
const buffers = new Map(), inflight = new Map()
function load(name) {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name))
  if (inflight.has(name)) return inflight.get(name)
  const ctx = getContext()
  if (!ctx) return Promise.resolve(null)
  const req = fetch(assets[name]).then(r => { if (!r.ok) throw Error(`${name}: ${r.status}`); return r.arrayBuffer() })
    .then(data => ctx.decodeAudioData(data)).then(b => { buffers.set(name, b); return b })
    .catch(err => { console.warn('[roof-sfx]', err); return null }).finally(() => inflight.delete(name))
  inflight.set(name, req)
  return req
}
export function createRoofSfx(player, limits) {
  let disposed = false, onRoof = false, steamPosition = null, hatch = false
  const active = new Set(), watchers = []
  const loops = new Map()
  const near = (position, radius = 11) => {
    const p = player?.mesh?.position
    if (!onRoof || !p || p.z < limits.start || p.z > limits.end) return 0
    if (!position) return 1
    const dist = Math.hypot(p.x - position.x, p.z - position.z)
    return Math.pow(Math.max(0, 1 - Math.max(0, dist - 1.2) / (radius - 1.2)), 2)
  }
  const play = (name, volume, position, rate = 1) => {
    if (disposed || near(position) <= 0) return
    const ctx = getContext(), bus = getSfxGain()
    if (!ctx || ctx.state !== 'running' || !bus) return
    const start = buffer => {
      if (!buffer || disposed || !near(position) || ctx.state !== 'running') return
      const source = ctx.createBufferSource(), gain = ctx.createGain()
      source.buffer = buffer; source.playbackRate.value = rate
      gain.gain.value = volume * near(position)
      source.connect(gain).connect(bus); active.add(source)
      source.onended = () => { active.delete(source); source.disconnect(); gain.disconnect() }
      source.start()
    }
    if (buffers.has(name)) start(buffers.get(name))
    else void load(name).then(start)
  }
  function stopLoop(name) {
    const track = loops.get(name)
    if (!track) return
    try { track.source.stop() } catch {}
    loops.delete(name)
  }
  function setLoop(name, vol, position, rate = 1) {
    const ctx = getContext(), bus = getSfxGain()
    if (!ctx || !bus || ctx.state !== 'running' || disposed) return
    const target = Math.max(0, vol * near(position, name === 'wind' ? 1000 : 11))
    let track = loops.get(name)
    // The player can reach the roof before decoding finishes. Start the wind
    // as soon as its buffer is ready, without needing another transition.
    if (!track && target > 0.001 && !buffers.has(name)) {
      void load(name).then(buffer => {
        if (!buffer || disposed || !onRoof) return
        if (name === 'wind') setLoop('wind', 0.12, null, 1)
      })
    }
    if (!track && target > 0.001 && buffers.has(name)) {
      const source = ctx.createBufferSource(), gain = ctx.createGain()
      source.buffer = buffers.get(name); source.loop = true; gain.gain.value = 0
      source.connect(gain).connect(bus); source.start()
      track = { source, gain }; loops.set(name, track)
      source.onended = () => { source.disconnect(); gain.disconnect(); if (loops.get(name) === track) loops.delete(name) }
    }
    if (track) {
      track.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.075)
      track.source.playbackRate.setTargetAtTime(Math.max(0.3, rate), ctx.currentTime, 0.06)
      if (!onRoof && target === 0) stopLoop(name)
    }
  }
  for (const name of Object.keys(assets)) void load(name)
  return {
    setSteamSource: position => { steamPosition = position },
    playPlate: pos => play('plate', 0.29, pos),
    playZipline: pos => play('zip', 0.36, pos),
    watchFalling: (object, sample, volume = 0.2) => watchers.push({ kind: 'fall', object, sample, volume, previous: sample(), restHeight: sample(), armed: true }),
    watchSlidingRotation: (object, sample, volume = 0.18) => watchers.push({ kind: 'rotate', object, sample, volume, previous: null, moving: false }),
    startHatchHold() {
      hatch = true
      // Reuse the same proven non-positional forcing sound as Level 1.
      startTrainDoorEffortSfx()
    },
    stopHatchHold() { hatch = false; stopTrainDoorEffortSfx() },
    update(delta, state) {
      onRoof = Boolean(state.onRoof)
      if (disposed) return
      const slow = state.mode === 'SLOW' ? 0.48 : state.mode === 'FREEZE' ? 0 : 1
      setLoop('wind', onRoof ? 0.12 : 0, null, 1)
      setLoop('steam', onRoof ? 0.24 * state.steam * slow : 0, steamPosition, Math.max(0.35, slow))
      for (const w of watchers) {
        const now = w.sample()
        if (!Number.isFinite(now)) continue
        if (w.previous === null || delta <= 0 || delta > 0.15) { w.previous = now; continue }
        const velocity = (now - w.previous) / delta
        w.previous = now
        if (w.kind === 'fall') {
          // A single impact when the bridge finishes falling, not on every frame.
          // Sample is a world-space height, not displacement. The original
          // fixed -3.9 threshold could never be reached on this roof.
          // The bridge drops 4.2 world units; fire when it reaches the bottom,
          // including when the final update jumps across the contact threshold.
          const drop = w.restHeight - now
          if (drop < 0.35) w.armed = true
          if (onRoof && w.armed && drop >= 4.2 * 0.96 && velocity < 0.01) {
            w.armed = false
            play('slam', w.volume, w.object.position)
          }
        } else {
          const moving = Math.abs(velocity) > 0.025
          // For the drawbridge, the slide is an actual continuous layer, not many clicks.
          if (moving && onRoof) setLoop('slide', w.volume * Math.min(1, Math.abs(velocity)), w.object.position, Math.max(0.4, Math.min(1.2, Math.abs(velocity) / 1.5)))
          else setLoop('slide', 0, w.object.position)
          w.moving = moving
        }
      }
      // Load after audio context unlock, if the level was initialized while suspended.
      for (const name of Object.keys(assets)) if (!buffers.has(name) && !inflight.has(name)) void load(name)
    },
    dispose() {
      disposed = true
      if (hatch) stopTrainDoorEffortSfx()
      hatch = false
      for (const key of [...loops.keys()]) stopLoop(key)
      for (const source of active) try { source.stop() } catch {}
      active.clear()
    }
  }
}

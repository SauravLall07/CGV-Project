import * as THREE from 'three'
import { getContext, getSfxGain } from '../core/audio.js'

// Movement is measured from the actual scene objects (including Rewind restores),
// not from separately running timers. Every emitter belongs to one carriage.
const files = {
  slide: new URL('../assets/audio/sfx/level2/slide.mp3', import.meta.url),
  open: new URL('../assets/audio/sfx/level2/metal-door-open.mp3', import.meta.url),
  close: new URL('../assets/audio/sfx/level2/metal-door-close.mp3', import.meta.url),
  slam: new URL('../assets/audio/sfx/level2/metal-slam.mp3', import.meta.url)
}
const buffers = new Map()
const pending = new Map()
function load(name) {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name))
  if (pending.has(name)) return pending.get(name)
  const ctx = getContext()
  if (!ctx) return Promise.resolve(null)
  const task = fetch(files[name]).then(r => {
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
    return r.arrayBuffer()
  }).then(b => ctx.decodeAudioData(b)).then(b => { buffers.set(name, b); return b })
    .catch(e => { console.warn('[moving-hazard-sfx]', e); return null })
    .finally(() => pending.delete(name))
  pending.set(name, task)
  return task
}

export function createMovingHazardSfx(player, spans) {
  const sources = []
  // One emitter per moving assembly, not one per child mesh (for example,
  // a luggage dolly plus every suitcase and strap stacked on top).
  const registeredSlides = new WeakMap()
  let disposed = false
  const inCar = (car, z) => {
    const area = car === 'roof' ? { minZ: spans.convergence.maxZ, maxZ: spans.vault.minZ } : spans[car]
    return Boolean(area && z >= area.minZ && z <= area.maxZ)
  }
  function create(kind, object, car, { axis = 'x', radius = 9, volume = 0.13, openingSign = 1, referenceSpeed = 1.25, baseRate = 0.9 } = {}) {
    const entry = { kind, object, car, axis, radius, volume, openingSign, previous: null,
      velocity: 0, playing: null, direction: 0, armed: false, cooldown: 0, referenceSpeed, baseRate }
    sources.push(entry)
    return entry
  }
  const registerSlide = (object, car = 'cargo', options) => {
    // A stack's entire scene group moves together. Reusing its single emitter
    // prevents multiple synchronized slide loops from sounding like several
    // separate luggage pieces scraping at once.
    if (registeredSlides.has(object)) return registeredSlides.get(object)
    const entry = create('slide', object, car, options)
    registeredSlides.set(object, entry)
    return entry
  }
  const registerDoor = (object, car = 'mechanical', options) => create('door', object, car, options)
  // Hinged panels rotate in place: position-based motion detection cannot hear them.
  // Register one emitter for the entire paired assembly and sample its hinge angle.
  const registerSwingDoor = (anchor, getAngle, car = 'cargo', options = {}) => {
    const entry = create('door', anchor, car, { radius: 12, volume: 0.48, openingSign: -1, ...options })
    entry.sample = getAngle
    entry.angular = true
    entry.openOnly = true
    return entry
  }
  const registerSlam = (object, car = 'cargo', options) => create('slam', object, car, { axis: 'y', ...options })
  // For two doors meeting, use their actual clearance, not one leaf's velocity.
  // The latch rearms only after they open again, avoiding frame-by-frame slams.
  const registerClosingThud = (anchor, getGap, car = 'mechanical', options = {}) => {
    const entry = create('closure', anchor, car, options)
    entry.sample = getGap
    entry.armed = false
    return entry
  }
  function stop(e) {
    if (!e.playing) return
    const { src, gain } = e.playing
    if (e.kind === 'door' && e.playing.ctx.state === 'running') {
      const t = e.playing.ctx.currentTime
      gain.gain.cancelScheduledValues(t)
      gain.gain.setTargetAtTime(0, t, 0.10)
      try { src.stop(t + 0.24) } catch {}
    } else {
      try { src.stop() } catch {}
    }
    e.playing = null
  }
  function begin(e, name, speed, audible) {
    const ctx = getContext(), bus = getSfxGain(), buffer = buffers.get(name)
    if (!ctx || ctx.state !== 'running' || !bus || !buffer || disposed) return
    const src = ctx.createBufferSource(), gain = ctx.createGain()
    src.buffer = buffer
    src.loop = e.kind === 'slide'
    src.playbackRate.value = Math.max(0.3, Math.min(4.5, speed))
    gain.gain.value = 0
    src.connect(gain).connect(bus)
    src.start()
    e.playing = { src, gain, ctx, name }
    gain.gain.setTargetAtTime(audible, ctx.currentTime, 0.015)
    src.onended = () => {
      if (e.playing?.src === src) e.playing = null
      src.disconnect(); gain.disconnect()
    }
  }
  function update(delta) {
    if (disposed) return
    const ctx = getContext(), p = player?.mesh?.position
    if (!ctx || !p) return
    if (!sources.length) return
    for (const name of Object.keys(files)) if (!buffers.has(name) && !pending.has(name)) void load(name)
    for (const e of sources) {
      // Local position is authoritative for objects animated by the time system.
      const pos = e.sample ? e.sample() : e.object.position[e.axis]
      if (!Number.isFinite(pos)) continue
      if (e.previous === null || delta <= 0 || delta > 0.15) {
        e.previous = pos; e.velocity = 0; e.armed = true; continue
      }
      const velocity = (pos - e.previous) / delta
      e.previous = pos
      const moving = Math.abs(velocity) > (e.angular ? 0.012 : 0.025)
      const direction = moving ? Math.sign(velocity) : 0
      const z = e.object.getWorldPosition(_world).z
      const d = Math.hypot(p.x - _world.x, p.z - z)
      const falloff = Math.pow(Math.max(0, 1 - Math.max(0, d - 1.25) / (e.radius - 1.25)), 2)
      const audible = inCar(e.car, p.z) ? falloff * e.volume * (e.kind === 'door' ? 2.8 : 1) : 0
      e.cooldown = Math.max(0, e.cooldown - delta)
      if (e.kind === 'closure') {
        // Only a closing edge contact makes a thud. Silence and rearm on opening.
        if (pos > 0.22) e.armed = true
        if (e.armed && velocity < -0.02 && pos <= 0.10) {
          if (audible > 0) begin(e, 'slam', 1, audible)
          e.armed = false
        }
      } else if (e.kind === 'slam') {
        // Impact only when a descending/upward-sliding gate lands at its lower stop.
        // No repeating slam while the gate is travelling or standing still.
        if (e.velocity < -0.08 && velocity >= -0.025 && audible > 0 && e.cooldown === 0) {
          stop(e); begin(e, 'slam', 1, audible); e.cooldown = 0.20
        }
      } else if (e.kind === 'door') {
        if (!moving) { stop(e); e.direction = 0 }
        else {
          // Swinging barrier doors have an opening cue only; closing is silent.
          if (e.openOnly && direction !== e.openingSign) {
            stop(e)
            e.direction = direction
            continue
          }
          const name = direction === e.openingSign ? 'open' : 'close'
          const rate = e.angular
            ? Math.max(0.85, Math.min(1.55, Math.abs(velocity) * 0.8))
            : Math.max(0.85, Math.min(1.8, Math.abs(velocity) * 0.75))
          if (e.direction !== direction || e.playing?.name !== name) {
            stop(e)
            begin(e, name, rate, audible)
          }
          e.direction = direction
          if (e.playing) {
            e.playing.src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.025)
            e.playing.gain.gain.setTargetAtTime(audible, ctx.currentTime, 0.035)
          }
        }
      } else {
        if (!moving) { stop(e); continue }
        // Chalk Slide is accelerated to match the movement, and slows down
        // automatically with Slow/Freeze/Rewind because measured speed changes.
        if (!e.playing) begin(e, 'slide', e.baseRate, audible)
        if (e.playing) {
          // Normalize against THIS assembly's physical speed, not one global rate.
          // Slow and Rewind scale the measured displacement; overspeed is capped
          // to avoid the squeaky fast-scrape effect on shorter travel cycles.
          const ratio = Math.abs(velocity) / Math.max(0.01, e.referenceSpeed)
          const speed = Math.max(0.35, Math.min(1.4, e.baseRate * ratio))
          e.playing.src.playbackRate.setTargetAtTime(speed, ctx.currentTime, 0.025)
          e.playing.gain.gain.setTargetAtTime(audible * Math.min(1, Math.abs(velocity) / Math.max(0.25, e.referenceSpeed * 0.45)), ctx.currentTime, 0.03)
        }
      }
      e.velocity = velocity
    }
  }
  const _world = new THREE.Vector3()
  return { registerSlide, registerDoor, registerSwingDoor, registerSlam, registerClosingThud, update,
    dispose() { disposed = true; for (const e of sources) stop(e); sources.length = 0 } }
}

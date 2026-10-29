import { getContext, getSfxGain } from '../core/audio.js'

const sounds = {
  roll: new URL('../assets/audio/sfx/level3/rolling-luggage.mp3', import.meta.url),
  charge: new URL('../assets/audio/sfx/level3/electric-charge.mp3', import.meta.url),
  slam: new URL('../assets/audio/sfx/level2/metal-slam.mp3', import.meta.url),
  plate: new URL('../assets/audio/sfx/security/pressure-switch.mp3', import.meta.url),
  shock: new URL('../assets/audio/sfx/level3/electric-death.mp3', import.meta.url)
}
const buffers = new Map()
// Electric death is a transition sound, not a carriage ambience source.
// It must survive the carriage controller being paused/disposed by respawn.
let shockBufferPromise = null
function loadShock() {
  if (!shockBufferPromise) {
    shockBufferPromise = (async () => {
      const ctx = getContext()
      if (!ctx) return null
      const response = await fetch(sounds.shock)
      if (!response.ok) throw new Error(`electric death: HTTP ${response.status}`)
      return ctx.decodeAudioData(await response.arrayBuffer())
    })().catch(error => {
      console.warn('[level3 electric death]', error)
      shockBufferPromise = null
      return null
    })
  }
  return shockBufferPromise
}

export function preloadElectricDeathSfx() { return loadShock() }
export function playElectricDeathSfx() {
  // Request before respawn so the impact is never rejected by the level's
  // pause/dispose logic. If still decoding, play as soon as it is ready.
  void loadShock().then(buffer => {
    const ctx = getContext(), output = getSfxGain()
    if (!buffer || !ctx || !output) return
    const source = ctx.createBufferSource(), gain = ctx.createGain()
    source.buffer = buffer
    gain.gain.value = 0.9
    source.connect(gain).connect(output)
    source.onended = () => { source.disconnect(); gain.disconnect() }
    if (ctx.state === 'suspended') void ctx.resume().then(() => source.start()).catch(() => {})
    else if (ctx.state === 'running') source.start()
  })
}
let loading
export function createSecondCarriageAudio() {
  let disposed = false, paused = false
  const active = new Map()
  const positions = new WeakMap()
  const shots = new Set()
  function preload() {
    if (!loading) loading = Promise.all(Object.entries(sounds).map(async ([key,url]) => {
      try {
        const ctx = getContext()
        if (!ctx) return
        const response = await fetch(url)
        if (!response.ok) throw Error(`${key}: HTTP ${response.status}`)
        buffers.set(key, await ctx.decodeAudioData(await response.arrayBuffer()))
      } catch (e) { console.warn('[level3 carriage sfx]',e) }
    }))
    return loading
  }
  function shot(key, volume, position, listener, radius = 14) {
    const ctx = getContext(), bus = getSfxGain(), buffer = buffers.get(key)
    if (disposed || paused || !ctx || !bus || ctx.state !== 'running' || !buffer) return false
    const distance = position && listener ? position.distanceTo(listener) : 0
    if (distance >= radius) return false
    const src = ctx.createBufferSource(), gain = ctx.createGain()
    src.buffer = buffer
    gain.gain.value = volume * Math.pow(Math.max(0,1-distance/radius),1.3)
    src.connect(gain).connect(bus)
    shots.add(src)
    src.onended = () => { shots.delete(src); src.disconnect(); gain.disconnect() }
    src.start()
    return true
  }
  function rolling(key, object, delta, listener, allowed = true) {
    if (!object) return
    const ctx = getContext(), bus = getSfxGain(), buffer = buffers.get('roll')
    const world = object.getWorldPosition(new object.position.constructor())
    const prev = positions.get(object)
    positions.set(object, world.clone())
    if (!prev || !ctx || !bus || !buffer || ctx.state !== 'running' || disposed) return
    const speed = world.distanceTo(prev) / Math.max(0.001,delta)
    const dist = listener.distanceTo(world)
    const volume = paused || !allowed || speed < 0.10 || speed > 30 || dist > 11 ? 0 : 0.62 * Math.pow(1-dist/11,1.8) * Math.min(1, speed/2.0)
    let v = active.get(key)
    if (!v && volume > 0) {
      const source = ctx.createBufferSource(), gain = ctx.createGain()
      source.buffer = buffer; source.loop = true; gain.gain.value = 0
      source.connect(gain).connect(bus); source.start()
      v = {source,gain}; active.set(key,v)
    }
    if (v) {
      v.gain.gain.setTargetAtTime(volume,ctx.currentTime,0.045)
      v.source.playbackRate.setTargetAtTime(Math.max(0.65,Math.min(1.3,speed/3)),ctx.currentTime,0.08)
    }
  }
  return {
    preload,
    rolling,
    charge(position,listener) { return shot('charge',0.26,position,listener,13) },
    slam(position,listener) { shot('slam',0.85,position,listener,18) },
    connectorOpen(position,listener) { return shot('plate',0.42,position,listener,13) },
    electricDeath() { shot('shock',0.62,null,null) },
    reset() { positions.clear?.(); for(const v of active.values()) v.gain.gain.value=0 },
    setPaused(value) { paused=!!value; if(paused) for(const v of active.values()) v.gain.gain.value=0 },
    dispose() { disposed=true; for (const v of active.values()) {try{v.source.stop()}catch{} v.source.disconnect();v.gain.disconnect()} active.clear(); for(const src of shots) {try{src.stop()}catch{}} shots.clear() }
  }
}

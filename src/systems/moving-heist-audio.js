import { getContext, getSfxGain } from '../core/audio.js'

const files = {
  step1: new URL('../assets/audio/sfx/player/footstep-1.mp3', import.meta.url),
  step2: new URL('../assets/audio/sfx/player/footstep-2.mp3', import.meta.url),
  step3: new URL('../assets/audio/sfx/player/footstep-3.mp3', import.meta.url),
  step4: new URL('../assets/audio/sfx/player/footstep-4.mp3', import.meta.url),
  jump: new URL('../assets/audio/sfx/player/jump.mp3', import.meta.url),
  land: new URL('../assets/audio/sfx/player/land.mp3', import.meta.url),
  impact: new URL('../assets/audio/sfx/player/metal-impact.mp3', import.meta.url),
  door: new URL('../assets/audio/sfx/security/door-slide.mp3', import.meta.url),
  switch: new URL('../assets/audio/sfx/security/pressure-switch.mp3', import.meta.url),
  dial: new URL('../assets/audio/sfx/security/dial-switch.mp3', import.meta.url)
}

export function createMovingHeistAudio(player) {
  const buffers = new Map()
  const pending = new Map()
  const lastPlayed = new Map()
  const motions = new Map()
  let previous = player.mesh.position.clone()
  let wasAirborne = player.isAirborne()
  let stepDistance = 0
  let stepIndex = 0
  let disposed = false

  function load(name) {
    if (buffers.has(name)) return Promise.resolve(buffers.get(name))
    if (pending.has(name)) return pending.get(name)
    const ctx = getContext()
    if (!ctx) return Promise.resolve(null)
    const promise = fetch(files[name]).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.arrayBuffer()
    }).then(data => ctx.decodeAudioData(data)).then(buffer => {
      buffers.set(name, buffer)
      return buffer
    }).catch(error => {
      console.warn(`[moving-heist-audio] ${name} unavailable`, error)
      return null
    }).finally(() => pending.delete(name))
    pending.set(name, promise)
    return promise
  }

  function play(name, volume = 0.2, cooldown = 0.08, rate = 1) {
    if (disposed) return
    const ctx = getContext(), bus = getSfxGain(), buffer = buffers.get(name)
    if (!ctx || !bus || !buffer || ctx.state !== 'running') return
    const now = ctx.currentTime
    if (now - (lastPlayed.get(name) ?? -Infinity) < cooldown) return
    lastPlayed.set(name, now)
    const source = ctx.createBufferSource(), gain = ctx.createGain()
    source.buffer = buffer
    source.playbackRate.value = rate
    gain.gain.value = volume
    source.connect(gain).connect(bus)
    source.onended = () => { source.disconnect(); gain.disconnect() }
    source.start()
  }

  function mechanism() {
    const ctx = getContext()
    if (!ctx || ctx.currentTime - (lastPlayed.get('mechanism') ?? -Infinity) < 0.4) return
    if (!buffers.has('door') || ctx.state !== 'running') return
    lastPlayed.set('mechanism', ctx.currentTime)
    play('door', 0.2, 0)
  }

  for (const name of Object.keys(files)) void load(name)

  return {
    play,
    switch() { play('switch', 0.25) },
    pickup() { play('dial', 0.32, 0.25, 1.25) },
    mechanism() { mechanism() },
    impact() { play('impact', 0.25, 0.25) },
    trackMotion(key, object) {
      motions.set(key, { object, position: object.position.clone(), rotation: object.rotation.clone(), moving: false })
    },
    update(_delta, surface = 'wood') {
      if (disposed) return
      const p = player.mesh.position
      const dx = p.x - previous.x, dz = p.z - previous.z
      previous.copy(p)
      const airborne = player.isAirborne()
      const distance = Math.hypot(dx, dz)
      if (!wasAirborne && airborne) {
        play('jump', 0.35)
        stepDistance = 0
      } else if (wasAirborne && !airborne) {
        play('land', 0.45)
        stepDistance = 0
      }
      if (!airborne && distance > 0.003 && distance < 0.8 && player.isMoving()) {
        stepDistance += distance
        const stride = player.isCrouching() ? 0.82 : player.isRunning() ? 1.55 : 1.2
        if (stepDistance >= stride) {
          stepDistance %= stride
          const name = `step${++stepIndex % 4 + 1}`
          const surfaceGain = surface === 'metal' ? 1.1 : 1
          play(name, (player.isCrouching() ? 0.14 : player.isRunning() ? 0.32 : 0.24) * surfaceGain, 0.12,
            0.94 + Math.random() * 0.12)
        }
      } else if (distance >= 0.8 || airborne) stepDistance = 0
      wasAirborne = airborne

      const playerPosition = p
      for (const motion of motions.values()) {
        const { object } = motion
        const moved = object.position.distanceTo(motion.position) > 0.002 ||
          Math.abs(object.rotation.x - motion.rotation.x) +
          Math.abs(object.rotation.y - motion.rotation.y) +
          Math.abs(object.rotation.z - motion.rotation.z) > 0.002
        if (moved && !motion.moving && object.position.distanceTo(playerPosition) < 12) mechanism()
        motion.moving = moved
        motion.position.copy(object.position)
        motion.rotation.copy(object.rotation)
      }
    },
    dispose() { disposed = true; motions.clear() }
  }
}

// Deterministic workload counts and state parity, not browser FPS/GC profiling.
// Run with: node --import ./scripts/register-test-assets.mjs scripts/measure-phase-c-work.mjs
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { createTimeSystem } from '../src/systems/time-system.js'
import { createRelayFeedback } from '../src/levels/timewreck-relay-feedback.js'
import { disposeObject } from '../src/core/dispose.js'

function temporalTrace(schedule) {
  const scene = new THREE.Scene(), player = { mesh: new THREE.Group() }
  const time = createTimeSystem({ scene, player })
  const object = new THREE.Group()
  let customValue = 0, frame = 0, elapsed = 0
  time.register(object, { onUpdate(dt) { object.position.x += dt; object.rotation.y += dt * 0.2 } })
  time.register(null, { onUpdate(dt) { customValue += dt },
    getSnapshot: () => ({ value: customValue }), restoreSnapshot: snapshot => { customValue = snapshot.value } })
  const hash = createHash('sha256')
  const run = seconds => {
    let left = seconds
    while (left > 1e-9) {
      const dt = Math.min(left, schedule[frame++ % schedule.length])
      elapsed += dt
      left -= dt
      player.mesh.position.set(Math.sin(elapsed), 0, elapsed)
      time.update(dt)
      hash.update(JSON.stringify({ mode: time.getMode(), energy: time.getEnergy(),
        availability: time.getAbilityAvailability(), objectX: object.position.x,
        yaw: object.rotation.y, customValue, ghost: time.getGhost().getPosition().toArray(),
        ghostPlaying: time.getGhost().isPlaying(), ghostRemaining: time.getGhost().getRemainingSeconds() }))
    }
  }
  run(12) // Exceed the ten-second snapshot horizon before reverse playback.
  time.triggerRewind(); run(0.35)
  time.setMode('NORMAL'); run(2)
  time.getGhost().startReplay([0, 2].map(t => ({ time: t, position: new THREE.Vector3(t, 0, t), rotationY: t * 0.1 })))
  run(0.5)
  time.triggerFreeze(); run(0.25)
  time.setMode('NORMAL'); run(0.5)
  time.setAbilityAvailability({ SLOW: false, GHOST: false })
  run(0.1)
  const checkpoint = time.captureCheckpointState()
  time.resetForCheckpoint(checkpoint); run(0.1)
  time.resetForLevel(); run(0.1)
  time.dispose()
  return { frames: frame, stateSha256: hash.digest('hex') }
}

function availabilityReads() {
  const time = createTimeSystem({ scene: new THREE.Scene(), player: { mesh: new THREE.Group() } })
  const views = new Set()
  for (let i = 0; i < 1000; i++) views.add(time.getAbilityAvailability())
  time.dispose()
  return { reads: 1000, distinctReturnedObjects: views.size }
}

function relayWork() {
  const doors = new THREE.Group(), linkage = new THREE.Group()
  const brass = new THREE.MeshStandardMaterial()
  doors.add(linkage)
  const feedback = createRelayFeedback({ doors, linkage, doorZ: 10, catchZ: 5, brass })
  const bars = doors.getObjectByName('relay-echo-hold-bars')
  const catchLink = doors.getObjectByName('relay-catch-linkage')
  let matrixWrites = 0, colorWrites = 0
  const setMatrixAt = bars.setMatrixAt.bind(bars)
  bars.setMatrixAt = (...args) => { matrixWrites++; return setMatrixAt(...args) }
  const setHex = bars.material.emissive.setHex.bind(bars.material.emissive)
  bars.material.emissive.setHex = (...args) => { colorWrites++; return setHex(...args) }
  const initialVersion = bars.instanceMatrix.version
  for (let i = 0; i < 1200; i++) feedback.update(false, 0, false)
  const idle = { updates: 1200, matrixWrites, colorWrites,
    bufferVersionIncrements: bars.instanceMatrix.version - initialVersion }
  const hash = createHash('sha256')
  const sample = (held, seconds, latched) => {
    feedback.update(held, seconds, latched)
    hash.update(Buffer.from(bars.instanceMatrix.array.buffer))
    hash.update(JSON.stringify([bars.material.emissive.toArray(), linkage.position.y, catchLink.position.y]))
  }
  sample(false, 0, false)
  sample(true, 0, false)
  for (let i = 0; i < 480; i++) sample(true, 8 - i / 60, false)
  sample(true, 0, true)
  sample(false, 6, true)
  sample(false, 6, false)
  sample(false, 0, false)
  disposeObject(doors)
  return { idle, presentationSha256: hash.digest('hex') }
}

console.log(JSON.stringify({ scope: 'Node workload counts and exact state hashes; no renderer, browser heap/GC, GPU uploads or FPS measured.',
  availability: availabilityReads(), relay: relayWork(),
  temporal: [10, 30, 60, 144].map(fps => ({ schedule: `${fps} Hz`, ...temporalTrace([1 / fps]) }))
    .concat({ schedule: 'irregular', ...temporalTrace([0.1, 1 / 144, 0.013, 1 / 30]) })
}, null, 2))

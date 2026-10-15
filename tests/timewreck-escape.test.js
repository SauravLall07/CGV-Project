import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createTimeSystem } from '../src/systems/time-system.js'
import { createPlayer } from '../src/entities/player.js'
import { createTimewreckLevel } from '../src/levels/timewreck.js'
import { createLevelManager } from '../src/core/level-manager.js'
import { createKeyboardState } from '../src/input/keyboard-state.js'
import { settings } from '../src/core/settings.js'
import { resolveInputState } from '../src/core/input-state.js'
import { createRespawnSystem } from '../src/systems/respawn.js'

import { securityCrossingLayout } from '../src/levels/timewreck-security.js'
import { WRECK_VIGNETTES } from '../src/levels/timewreck-feedback.js'

function levelHarness(start = 'mechanical', fps = 60) {
  globalThis.window = { devicePixelRatio: 1, innerWidth: 1280 }
  let advanced = 0
  const scene = new THREE.Scene()
  const player = createPlayer()
  const messages = []
  let skipFinale = null
  let objective = ''
  const hud = new Proxy({ setObjective: value => { objective = value }, getObjective: () => objective, showToast: (message) => messages.push(message), showCinematicSkip: cb => { skipFinale = cb }, hideCinematicSkip: () => { skipFinale = null } }, {
    get: (target, key) => target[key] ?? (() => {})
  })
  const time = createTimeSystem({ scene, player, hud })
  const respawn = createRespawnSystem({ player, hud, timeSystem: time, camera: { snap() {} } })
  const interactions = new Map()
  const level = createTimewreckLevel({ scene, player, hud, timeSystem: time, respawn,
    interaction: { register: (object, options) => { interactions.set(object.name, options); return () => interactions.delete(object.name) }, registerBlocker: () => () => {}, flashPrompt() {} },
    camera: { snap() {} }, advance() { advanced++ }, startCarriage: start
  })
  player.setPose(level.checkpoint.position, Math.PI)
  respawn.setCheckpoint(level.checkpoint.position, Math.PI, level.checkpoint)
  const span = level.getCarriageVolumes().find((v) => v.key === (start ?? 'vault'))
  const center = (span.minZ + span.maxZ) / 2
  const layout = securityCrossingLayout(center)
  let duckWasDown = false
  let frame = 0
  let elapsed = 0
  let probe = null
  const tick = (seconds, keys = {}) => {
    for (let t = 0; t < seconds - 1e-9;) {
      const dt = Math.min(Array.isArray(fps) ? fps[frame++ % fps.length] : 1 / fps, seconds - t)
      t += dt
      elapsed += dt
      time.update(dt)
      level.update(dt)
      player.update(dt, { keyboard: keys, cameraYaw: Math.PI, bounds: level.bounds,
        obstacles: level.obstacles, supports: level.supports, voids: level.voids, crouchPressed: Boolean(keys.duck) && !duckWasDown })
      duckWasDown = Boolean(keys.duck)
      probe?.()
    }
  }
  const dispose = () => { respawn.dispose(); level.dispose(); time.dispose() }
  return { hud, setProbe(fn) { probe = fn }, get elapsed() { return elapsed }, get skipFinale() { return skipFinale }, get advanced() { return advanced }, scene, player, time, respawn, level, center, layout, interactions, tick, dispose, messages }
}

test('N7: live approach/depleted repair, three falls/retries, Mechanical checkpoint and steam remain safe', () => {
  for (const fps of [30, 60, 144, [1/144, 1/30, 0.1, 1/60]]) {
    const h = levelHarness('convergence', fps)
    const b = h.level.getCarriageVolumes().find(v => v.key === 'convergence').minZ
    const hinge = h.scene.getObjectByName('connector-approach-hinge')
    try {
      pose(h, 0, b + 3.2); h.tick(0.1, { forward: true }); h.tick(0.05)
      for (let attempt = 0; attempt < 3; attempt++) {
        h.tick(3)
        assert.ok(Math.abs(hinge.rotation.x) > 1)
        h.tick(1.15, { forward: true })
        assert.equal(h.respawn.isFailing(), true)
        h.respawn.cancel(); h.respawn.respawn()
        assert.equal(h.player.mesh.position.z, b + 3)
        assert.equal(h.player.mesh.position.y, 0)
        assert.equal(Math.abs(hinge.rotation.x), 0, 'restore geometry before shared history reset')
        assert.ok(h.level.supports.some(s => s.y === 0.04 && s.maxX > s.minX))
      }
      h.time.triggerFreeze() // deplete safely on the permanent approach
      while (h.time.getMode() === 'FREEZE') h.tick(0.02)
      assert.ok(h.time.getEnergy() < 1)
      assert.equal(h.respawn.isFailing(), false)
      h.tick(26)
      h.time.triggerRewind()
      for (let i = 0; Math.abs(hinge.rotation.x) > 0.01; i++) { assert.ok(i < 150); h.tick(0.02) }
      h.time.triggerFreeze(); h.tick(1.4, { forward: true }); h.tick(0.05)
      assert.ok(h.player.mesh.position.z < b - 2.5)
      assert.equal(h.player.mesh.position.y, 0)
      h.time.setMode('NORMAL'); h.tick(7)
      for (let i = 0; Math.abs(h.scene.getObjectByName('steam-clearance-signal').rotation.z) > 0.01; i++) {
        assert.ok(i < 600); h.tick(0.02)
      }
      h.time.triggerFreeze(); h.tick(0.75, { forward: true })
      assert.ok(h.player.mesh.position.z < b - 5.5, 'crosses steam after recovery on real floor')
      assert.equal(h.respawn.isFailing(), false)
      h.respawn.fail('downstream retry'); h.respawn.cancel(); h.respawn.respawn()
      assert.equal(h.player.mesh.position.z, b - 2.5)
      assert.equal(h.player.mesh.position.y, 0)
      assert.equal(Math.abs(hinge.rotation.x), 0)
      assert.ok(h.time.getEnergy() >= 50)
    } finally { h.dispose() }
    const dev = levelHarness('mechanical', fps)
    try { assert.equal(dev.player.mesh.position.z, b - 2.5); dev.tick(0.2); assert.equal(dev.respawn.isFailing(), false) }
    finally { dev.dispose() }
  }
})

// One live level, normal Vault spawn, no per-room starts or pose changes.
// This catches clocks/checkpoints/energy carried between the isolated puzzles.
test('Integration: continuous Vault-to-brake routes preserve both forks and solvable checkpoints across all carriages', () => {
  for (const route of ['direct', 'maintenance']) for (const fps of [30, 60, 144]) {
    const h = levelHarness(null, fps)
    let stage = 'vault'
    const center = key => {
      const span = h.level.getCarriageVolumes().find(v => v.key === key)
      return (span.minZ + span.maxZ) / 2
    }
    const check = () => assert.equal(h.respawn.isFailing(), false,
      JSON.stringify({fps, route, stage, pos:h.player.mesh.position, energy:h.time.getEnergy(), messages:h.messages.slice(-3)}))
    const move = (axis, target, extra = {}) => {
      for (let i = 0; Math.abs(h.player.mesh.position[axis] - target) > 0.06; i++) {
        assert.ok(i < fps * 25, `blocked ${stage}/${axis}: ${JSON.stringify(h.player.mesh.position)} -> ${target}`)
        const positive = h.player.mesh.position[axis] < target
        h.tick(Math.min(1 / fps, Math.abs(h.player.mesh.position[axis] - target) / (extra.duck ? 1.68 : extra.run ? 6.8 : 4)),
          {...extra, [axis === 'x' ? positive ? 'right' : 'left' : positive ? 'back' : 'forward']:true})
        check()
      }
    }
    const waitUntil = condition => {
      for (let i = 0; !condition(); i++) {
        assert.ok(i < fps * 12, `no window: ${stage}`)
        h.tick(1 / fps); check()
      }
    }
    const recharge = () => { h.time.setMode('NORMAL'); h.tick(7); check() }
    try {
      const gates = []
      move('x', -0.5) // visible left lane around the broken containment arm
      h.scene.traverse(n => {if(n.name === 'vault-security-gate') gates.push(n)})
      gates.sort((a,b) => b.position.z - a.position.z)
      for (const gate of gates) {
        move('z', gate.position.z + 1.4)
        waitUntil(() => gate.getObjectByName('vault-clearance-signal').material.color.getHex() === 0x42dfad)
        h.time.triggerFreeze(); move('z', gate.position.z - 1.3)
        recharge()
      }
      stage = 'convergence'
      move('z', center(stage) + 15.1)
      h.tick(0.75, { forward: true, jump: true })
      check()
      move('x', 0.65) // open end of the diagonal trolley
      move('z', center(stage) + 10)
      if (route === 'direct') {
        move('x', -0.6)
        move('z', center(stage) + 6.2)
        const surge = h.scene.getObjectByName('convergence-electrical-surge')
        assert.ok(surge)
        waitUntil(() => surge.children[0].material.emissiveIntensity < 0.5)
        h.time.triggerFreeze(); move('z', center(stage) + 2)
        h.time.setMode('NORMAL')
      } else {
        move('x', 1.75); move('z', center(stage) + 9)
        move('z', center(stage) + 6.5, { duck: true })
        recharge(); repair(h, 'convergence-rewind-shutter')
        move('z', center(stage) + 3.4, { duck: true })
        h.time.setMode('NORMAL')
        move('z', center(stage) - 1.3, { duck: true })
        move('x', -0.6)
      }
      // Open-floor carts past the fork — Freeze holds every direction of roll.
      h.time.triggerFreeze()
      move('z', center(stage) - 12)
      h.time.setMode('NORMAL')
      stage = 'mechanical'
      move('z', center(stage) + 12.8)
      waitUntil(() => Math.abs(h.scene.getObjectByName('steam-clearance-signal').rotation.z) < 0.01)
      h.time.triggerFreeze(); move('z', center(stage) + 9.5)
      h.time.setMode('NORMAL')
      move('x', 1.5)
      const trunks = h.scene.getObjectByName('runaway-pistons').children.filter(n => n.name === 'mech-luggage-trunk')
      assert.equal(trunks.length, 3)
      waitUntil(() => trunks[0].position.x < -1)
      h.time.triggerFreeze(); move('z', center(stage) + 4.6)
      h.time.setMode('NORMAL'); move('z', center(stage) + 2.7)
      repair(h, 'mechanical-rewind-shutter')
      move('z', center(stage) - 2)
      recharge(); move('x', 0)
      waitUntil(() => Math.abs(trunks[1].position.x) > 1)
      h.time.triggerFreeze(); move('z', center(stage) - 7.5)
      recharge()
      waitUntil(() => Math.abs(trunks[2].position.x) > 1)
      h.time.triggerFreeze(); move('z', center(stage) - 11.5)
      h.time.setMode('NORMAL')
      stage = 'cargo'
      move('z', center(stage) + 12)
      recharge()
      h.time.triggerRewind(); h.tick(0.55); h.time.triggerFreeze()
      move('z', center(stage) + 3.15, {run:true})
      recharge()
      waitUntil(() => h.scene.getObjectByName('cargo-loop-door').position.y > 3.49)
      h.time.triggerFreeze(); move('z', center(stage) - 3, {run:true})
      h.time.setMode('NORMAL')
      move('z', center(stage) - 5)
      recharge()
      waitUntil(() => Math.abs(h.scene.getObjectByName('freight-pendulum').rotation.z) > 0.8)
      h.time.triggerFreeze(); move('z', center(stage) - 9)
      h.time.setMode('NORMAL')
      stage = 'relay'
      move('z', center(stage) + 2)
      recharge(); h.time.triggerGhost(); h.tick(0.05)
      move('x', 0.7)
      move('z', center(stage) - 1.95)
      move('x', 0)
      move('z', center(stage) - 4.4)
      assert.ok(h.interactions.get('relay-manual-catch').isEligible())
      h.interactions.get('relay-manual-catch').onInteract()
      h.time.resetGhost()
      stage = 'security'
      move('z', center(stage) + 7.15)
      move('x', -0.9); recharge()
      h.time.triggerFreeze(); h.tick(0.23)
      h.tick(0.62, {forward:true}); h.tick(0.5, {forward:true,right:true}); h.tick(0.7,{forward:true}); h.tick(0.05)
      check(); recharge()
      // Retry on the island in the same run: no stale Relay echo or old powers.
      h.respawn.fail('integration retry'); h.respawn.cancel(); h.respawn.respawn()
      assert.equal(h.player.mesh.position.z, center(stage))
      assert.equal(h.time.getGhost().isPlaying(), false)
      move('x', 0.52); move('z', center(stage) + 0.46); recharge()
      h.time.triggerFreeze(); h.tick(0.23)
      h.tick(0.81,{forward:true}); h.tick(0.75,{forward:true,run:true,jump:true}); h.tick(0.6,{forward:true}); h.tick(0.05)
      check(); h.time.setMode('NORMAL'); move('x', 0)
      stage = 'passenger'
      move('z', center(stage) + 8.4)
      h.tick(0.7,{forward:true,run:true,right:true}); h.tick(0.2,{forward:true,run:true})
      h.time.triggerFreeze(); h.tick(0.3); h.tick(0.37,{left:true,run:true}); h.tick(1.6,{forward:true,run:true})
      check(); h.time.setMode('NORMAL')
      move('z', h.scene.getObjectByName('emergency-brake').position.z + 1.5, {run:true})
      h.interactions.get('emergency-brake').onInteract()
      assert.equal(h.level.isCinematic,true)
      h.tick(4.9)
      assert.equal(h.advanced,1)
    } finally { h.dispose() }
  }
})
function pose(h, x, z, y = 0) { h.player.setPose(new THREE.Vector3(x, y, z), Math.PI) }

test('N8/N9: each live event pauses, holds Freeze without taking control, and releases callbacks on restart/quit', () => {
  const oldRAF = globalThis.requestAnimationFrame
  try {
    for (const spec of WRECK_VIGNETTES) for (const action of ['restart', 'quit']) {
      const frames = []; globalThis.requestAnimationFrame = cb => frames.push(cb)
      const h = levelHarness(spec.key)
      let manager
      try {
        pose(h, 0, h.center + spec.triggerNear - 0.1); h.tick(0.2)
        const event = h.scene.getObjectByName(`${spec.key}-background-vignette`)
        const beforePause = event.position.clone()
        h.level.setPresentationPaused(true); h.tick(0.2)
        assert.ok(event.position.equals(beforePause))
        h.level.setPresentationPaused(false); h.tick(0.1)
        assert.ok(!event.position.equals(beforePause))
        h.time.triggerFreeze()
        const held = event.position.clone(), x = h.player.mesh.position.x
        h.tick(0.1, { right: true })
        assert.ok(event.position.equals(held))
        assert.ok(h.player.mesh.position.x > x + 0.3, 'player keeps real movement in stasis')
        manager = createLevelManager({ scene: h.scene, player: h.player, hud: h.hud, timeSystem: h.time,
          respawn: h.respawn, camera: { snap() {} }, loadingScreen: { show() {}, hide() {} },
          interaction: { register: () => () => {}, registerBlocker: () => () => {}, setEnabled() {} },
          levels: [{ state: 'Timewreck', create: ctx => createTimewreckLevel({ ...ctx, startCarriage: spec.key }) }] })
        manager.adopt('Timewreck', h.level)
        if (action === 'restart') {
          manager.restart()
          for (let n = 0; frames.length; n++) { assert.ok(n < 10); frames.shift()() }
          const fresh = h.scene.getObjectByName(`${spec.key}-background-vignette`)
          assert.notEqual(fresh, event)
          assert.equal(fresh.position.x, spec.x)
        } else manager.unload()
        h.time.update(0.2); manager.update(0.2)
        assert.ok(event.position.equals(held), 'disposed registration cannot animate stale nodes')
        assert.equal(h.respawn.isFailing(), false)
      } finally { manager?.dispose(); if (!manager) h.level.dispose(); h.respawn.dispose(); h.time.dispose() }
    }
  } finally { globalThis.requestAnimationFrame = oldRAF }
})

test('N9: caught recovery and game-over restart during every vignette restore progress and reject stale callbacks', () => {
  const oldRAF = globalThis.requestAnimationFrame, oldTimeout = globalThis.setTimeout, oldClear = globalThis.clearTimeout
  try {
    for (const spec of WRECK_VIGNETTES) {
      const frames = [], timers = new Map(); let id = 0, gameOvers = 0
      globalThis.requestAnimationFrame = cb => frames.push(cb)
      globalThis.setTimeout = cb => { timers.set(++id, cb); return id }
      globalThis.clearTimeout = key => timers.delete(key)
      const h = levelHarness(spec.key)
      let manager
      try {
        pose(h, 0, h.center + spec.triggerNear - 0.1); h.tick(0.3)
        const event = h.scene.getObjectByName(`${spec.key}-background-vignette`)
        h.respawn.fail('caught during vignette')
        const staleCaught = [...timers.values()].at(-1)
        h.respawn.setPaused(true); staleCaught()
        assert.equal(h.respawn.isFailing(), true, 'pause invalidates the old caught callback')
        h.respawn.setPaused(false); [...timers.values()].at(-1)()
        assert.equal(h.respawn.isFailing(), false)
        assert.equal(event.position.x, spec.x, 'actual checkpoint restores the saved initial event phase')
        h.time.triggerFreeze(); const restored = event.position.clone(); h.tick(0.1)
        assert.ok(event.position.equals(restored), 'history reset must not replace checkpoint geometry')
        manager = createLevelManager({ scene: h.scene, player: h.player, hud: h.hud, timeSystem: h.time,
          respawn: h.respawn, camera: { snap() {} }, loadingScreen: { show() {}, hide() {} },
          interaction: { register: () => () => {}, registerBlocker: () => () => {}, setEnabled() {} },
          levels: [{ state: 'Timewreck', create: ctx => createTimewreckLevel({ ...ctx, startCarriage: spec.key }) }] })
        manager.adopt('Timewreck', h.level)
        h.respawn.resetLives(1)
        h.respawn.setGameOverHandler(() => { gameOvers++; manager.restart() })
        pose(h, 0, h.center + spec.triggerNear - 0.1)
        h.time.setMode('NORMAL'); h.tick(0.2)
        h.respawn.fail('final life during vignette')
        const staleGameOver = [...timers.values()].at(-1)
        staleGameOver()
        for (let n = 0; frames.length; n++) { assert.ok(n < 10); frames.shift()() }
        staleGameOver(); staleCaught()
        assert.equal(gameOvers, 1)
        const fresh = h.scene.getObjectByName(`${spec.key}-background-vignette`)
        assert.notEqual(fresh, event)
        assert.equal(fresh.position.x, spec.x)
        assert.equal(h.respawn.isFailing(), false)
      } finally { manager?.dispose(); if (!manager) h.level.dispose(); h.respawn.dispose(); h.time.dispose() }
    }
  } finally {
    globalThis.requestAnimationFrame = oldRAF; globalThis.setTimeout = oldTimeout; globalThis.clearTimeout = oldClear
  }
})

test('N4: threshold blocks walking, permits a modest jump and leaves both fork entrances reachable', () => {
  for (const fps of [30, 60, 144, [1/144, 1/30, 0.1, 1/60]]) {
    const h = levelHarness('convergence', fps)
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        h.respawn.cancel(); h.respawn.respawn()
        pose(h, 0.65, h.center + 15.2)
        h.tick(0.5, { forward: true })
        assert.ok(h.player.mesh.position.z >= h.center + 14.3, 'cannot auto-step the threshold')
        h.tick(0.75, { forward: true, jump: true })
        h.tick(0.4, { forward: true })
        assert.ok(h.player.mesh.position.z < h.center + 11, 'open end passes trolley components')
        assert.equal(h.player.mesh.position.y, 0, 'returns to real floor after top')
        h.tick(0.1)
        // At +10.5 the direct (-X) and maintenance (+X) entrances are both open.
        const z = h.player.mesh.position.z
        h.tick(0.3, { left: true })
        assert.ok(h.player.mesh.position.x < -0.5)
        h.tick(0.6, { right: true })
        assert.ok(h.player.mesh.position.x > 1.7)
        assert.ok(Math.abs(h.player.mesh.position.z - z) < 0.03)
        assert.equal(h.respawn.isFailing(), false)
      }
    } finally { h.dispose() }
  }
})

test('N4: maintenance beam retains crouch on release and jump-to-stand for hold and toggle settings', () => {
  for (const mode of ['hold', 'toggle']) {
    settings.set('crouchMode', mode)
    const h = levelHarness('convergence')
    try {
      pose(h, 1.75, h.center + 8.7)
      h.tick(0.3, { forward: true, jump: true })
      h.tick(0.8)
      assert.ok(h.player.mesh.position.z > h.center + 8, 'jump does not bypass low entrance')
      h.tick(1, { forward: true, duck: true })
      assert.ok(h.player.mesh.position.z < h.center + 7.5)
      h.tick(0.1)
      h.tick(0.2, { jump: true })
      assert.equal(h.player.isCrouching(), true)
      assert.equal(h.player.mesh.position.y, 0)
    } finally { h.dispose(); settings.resetAll() }
  }
})

test('R1 visibility: actual L3 panels cull only ray-occluded bounds, restore each pass and release hooks on unload', () => {
  let totalHidden = 0
  for (const start of [null, 'convergence', 'mechanical', 'cargo', 'relay', 'security', 'passenger']) {
    const h = levelHarness(start)
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 200)
    const ray = new THREE.Raycaster()
    const box = new THREE.Box3()
    const corner = new THREE.Vector3()
    const eye = new THREE.Vector3()
    const direction = new THREE.Vector3()
    const panels = [], meshes = []
    h.scene.traverse(n => { if (n.userData.wreckOccluder) panels.push(n); if (n.isMesh) meshes.push(n) })
    try {
      assert.ok(panels.length >= 40, 'real solid panels are explicitly marked')
      for (const mode of ['NORMAL', 'FREEZE', 'REWIND']) {
        h.time.setMode(mode); h.tick(0.12)
        for (const x of [-1.5, 0, 1.5]) {
          camera.position.set(x, 1.65, h.player.mesh.position.z)
          camera.lookAt(x, 1.65, camera.position.z - 5)
          camera.updateMatrixWorld()
          const original = new Map(meshes.map(n => [n, n.visible]))
          h.scene.onBeforeRender({}, h.scene, camera)
          const hidden = meshes.filter(n => original.get(n) && !n.visible)
          totalHidden += hidden.length
          for (const n of hidden) {
            assert.equal(n.castShadow, false)
            box.copy(n.geometry.boundingBox).applyMatrix4(n.matrixWorld).expandByScalar(0.03)
            eye.copy(camera.position)
            for (let i = 0; i < 8; i++) {
              corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
              direction.copy(corner).sub(eye)
              ray.set(eye, direction.clone().normalize())
              assert.ok(ray.intersectObjects(panels).some(hit => hit.distance < direction.length()),
                `${start}/${mode}/${n.name}: each culled bound corner is blocked by real geometry`)
            }
          }
          h.scene.onAfterRender({}, h.scene, camera)
          for (const n of meshes) assert.equal(n.visible, original.get(n), 'render restores exact visibility')
          h.scene.onBeforeRender({}, h.scene, new THREE.OrthographicCamera())
          assert.equal(h.level.getVisibilityStats().hidden, 0)
          h.scene.onAfterRender({}, h.scene, new THREE.OrthographicCamera())
        }
      }
      const before = h.scene.onBeforeRender
      h.level.dispose()
      assert.notEqual(h.scene.onBeforeRender, before, 'level removes its render hook')
      assert.equal(h.interactions.size, 0)
    } finally { h.respawn.dispose(); h.time.dispose() }
  }
  assert.ok(totalHidden > 0, 'actual level exercises culling rather than a no-op')
})

function repair(h, name) {
  const shutter = h.scene.getObjectByName(name).children[0]
  h.tick(1.4)
  assert.ok(shutter.position.y < 1.4, 'shutter visibly failed')
  h.tick(14)
  h.time.triggerRewind(); h.tick(0.55)
  assert.ok(shutter.position.y > 3.5, 'idle retains intact history')
  h.time.triggerFreeze()
  return shutter
}

test('Mechanical: Slow first bank, safe switching recess, Rewind/Freeze shutter and second bank at 30/60/144 FPS', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness('mechanical', fps)
    try {
      pose(h, 1.5, h.center + 9)
      h.time.triggerSlow(); h.tick(1.1, { forward: true })
      assert.equal(h.respawn.isFailing(), false, JSON.stringify({fps, pos:h.player.mesh.position, messages:h.messages}))
      assert.ok(h.player.mesh.position.z < h.center + 5)
      h.time.setMode('NORMAL'); h.tick(0.6, { forward: true })
      const shutter = repair(h, 'mechanical-rewind-shutter')
      h.tick(1.25, { forward: true })
      assert.ok(h.player.mesh.position.z < h.center - 1.5)
      assert.ok(shutter.position.y > 3.5)
      assert.ok(h.time.getEnergy() > 35)
      h.time.setMode('NORMAL'); h.tick(0.375, {left: true}); h.tick(4)
      h.time.triggerSlow(); h.tick(2.4, { forward: true })
      assert.equal(h.respawn.isFailing(), false, JSON.stringify({fps, pos:h.player.mesh.position, messages:h.messages}))
      assert.ok(h.player.mesh.position.z < h.center - 11)
    } finally { h.dispose() }
  }
})

test('Convergence: direct timed aisle and crouched maintenance fork both rejoin at 30/60/144 FPS', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness('convergence', fps)
    try {
      pose(h, -0.6, h.center + 6.2)
      h.tick(2.15) // surge safe window starts at 2.05s
      h.time.triggerSlow(); h.tick(1.2, { forward: true })
      assert.ok(h.player.mesh.position.z < h.center + 2)
      assert.equal(h.respawn.isFailing(), false, JSON.stringify({fps, pos:h.player.mesh.position, messages:h.messages}))
      h.time.setMode('NORMAL')
      pose(h, 1.75, h.center + 9)
      h.tick(0.65, { forward: true })
      assert.ok(h.player.mesh.position.z > h.center + 8, JSON.stringify(h.player.mesh.position))
      // Player settings default to hold; the real crouch input is duck.
      h.tick(1.6, { forward: true, duck: true })
      const shutter = repair(h, 'convergence-rewind-shutter')
      h.tick(1.4, { forward: true, duck: true })
      assert.ok(h.player.mesh.position.z < h.center + 3.5, JSON.stringify({pos:h.player.mesh.position,center:h.center,mode:h.time.getMode(), energy:h.time.getEnergy()}))
      assert.ok(shutter.position.y > 3.5)
      h.time.setMode('NORMAL')
      h.tick(2.9, { forward: true, duck: true })
      assert.ok(h.player.mesh.position.z < h.center - 1)
      assert.equal(h.respawn.isFailing(), false, JSON.stringify({fps, pos:h.player.mesh.position, messages:h.messages}))
    } finally { h.dispose() }
  }
})

test('Convergence: four open-floor runaway carts move in all directions and Slow stretches them', () => {
  const h = levelHarness('convergence')
  try {
    const carts = [1, 2, 3, 4].map((n) => h.scene.getObjectByName(
      n === 1 ? 'convergence-runaway-cart' : `convergence-runaway-cart-${n}`
    ))
    assert.ok(carts.every(Boolean), 'four runaway carts should exist')
    // Well past the surge (~center+4) in the open shared floor.
    for (const cart of carts) {
      assert.ok(cart.position.z < h.center - 3.5, 'carts must sit in open floor past the fork')
      assert.ok(cart.position.z > h.center - 12, 'carts must stay inside Convergence')
    }
    assert.ok(h.scene.getObjectByName('runaway-cart-warn-lamp'))
    assert.ok(h.scene.getObjectByName('runaway-cart-warn-lamp-4'))
    const cart = carts[0]
    const cart2 = carts[1]
    const cart3 = carts[2]
    const cart4 = carts[3]
    // Parked at walls at cycle start (all offsets begin in idle).
    assert.ok(cart.position.x < -1.8)
    assert.ok(cart2.position.x > 1.8)
    assert.ok(cart3.position.x < -1.8)
    assert.ok(cart4.position.x > 1.8)
    // First cart offset is WARN+MOVE+0.2 — advance into its warn+move.
    const firstMoveAt = 5.0 - (0.65 + 0.48 + 0.2) + 0.65 + 0.25 // into first cart move
    h.tick(firstMoveAt)
    assert.ok(cart.position.x > -1.5, 'cart must leave its park during the move phase')
    // Compare Slow vs Normal over the same real duration on a fresh cycle.
    h.respawn.cancel()
    h.respawn.respawn()
    h.tick(firstMoveAt - 0.1)
    const before = cart.position.x
    h.time.triggerSlow()
    h.tick(0.3)
    const afterSlow = cart.position.x
    h.time.setMode('NORMAL')
    const slowDelta = afterSlow - before
    h.respawn.cancel()
    h.respawn.respawn()
    h.tick(firstMoveAt - 0.1)
    const beforeNormal = cart.position.x
    h.tick(0.3)
    const normalDelta = cart.position.x - beforeNormal
    assert.ok(slowDelta >= -0.01, 'Slow must not fling the cart backward')
    assert.ok(slowDelta < normalDelta * 0.45, 'Slow must stretch the dash vs Normal speed')
    // Opposite-direction / diagonal carts are phase-staggered.
    h.respawn.cancel()
    h.respawn.respawn()
    h.tick(firstMoveAt)
    assert.ok(cart2.position.x > 1.5, '−X cart should still be near its right-wall park while +X rolls')
    // Diagonal cart rolls in both X and Z.
    h.respawn.cancel()
    h.respawn.respawn()
    const diagMoveAt = 5.0 - (0.65 + 0.48 + 0.2 + 2 * 1.15) + 0.65 + 0.25
    h.tick(diagMoveAt)
    assert.ok(cart3.position.x > -1.5, 'diagonal cart must leave the left wall')
    assert.ok(cart3.position.z < h.center - 5.0, 'diagonal cart must also travel toward cab')
    // Standing in the first cart's path during its roll fails.
    h.respawn.cancel()
    h.respawn.respawn()
    pose(h, 0, h.center - 5.0)
    h.tick(firstMoveAt)
    assert.equal(h.respawn.isFailing(), true, 'standing in an open-floor roll must fail')
    h.respawn.cancel()
    h.respawn.respawn()
    pose(h, 0, h.center - 2.8)
    h.tick(0.05)
    const cartHint = h.messages.find(m => /runaway service cart/i.test(m))
    assert.ok(cartHint, 'cart hint should teach the dodge')
    assert.ok(/slow|sidestep|every direction/i.test(cartHint))
  } finally { h.dispose() }
})

test('Passenger: warned rack, real separating floor, Freeze chase and controllable sprint reach brake', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness('passenger', fps)
    try {
      h.tick(0.1, { forward: true, run: true })
      h.tick(0.7, { forward: true, run: true, right: true })
      assert.ok(h.messages.some(m => m.includes('Rack bolts')))
      h.tick(0.2, { forward: true, run: true })
      const wave = h.scene.getObjectByName('time-wave')
      const waveZ = wave.position.z
      h.time.triggerFreeze(); h.tick(0.3)
      assert.equal(wave.position.z, waveZ)
      h.tick(0.37, { left: true, run: true })
      h.tick(1.6, { forward: true, run: true })
      assert.ok(h.player.mesh.position.z < h.center - 3)
      assert.ok(h.player.mesh.position.y >= -0.1)
      assert.equal(h.respawn.isFailing(), false, JSON.stringify({fps, pos:h.player.mesh.position, messages:h.messages}))
      h.time.setMode('NORMAL')
      h.tick(1.1, { forward: true, run: true })
      const brake = h.scene.getObjectByName('emergency-brake')
      // Continue real movement to interaction range, then pull the actual callback.
      while (h.player.mesh.position.z > brake.position.z + 1.5 && !h.respawn.isFailing()) h.tick(0.1, { forward: true, run: true })
      assert.equal(h.respawn.isFailing(), false, JSON.stringify({fps, pos:h.player.mesh.position, messages:h.messages}))
      assert.equal(h.level.isCinematic, false, 'player owns the entire sprint')
      h.interactions.get('emergency-brake').onInteract()
      assert.equal(h.level.isCinematic, true)
      h.tick(2.7)
      const scenery = h.scene.getObjectByName('trackside-infrastructure')
      const stopped = scenery.position.z
      h.tick(0.8)
      assert.equal(scenery.position.z, stopped, 'main scenery actually stops')
      assert.ok(h.scene.getObjectByName('broken-bridge-ahead'))
      h.tick(1.5)
      assert.equal(h.advanced, 1)
    } finally { h.dispose() }
  }
})

test('New checkpoints: repeated local retries restore warnings, shutters, wave lead, energy and power availability', () => {
  for (const start of ['mechanical', 'convergence', 'passenger']) {
    const h = levelHarness(start)
    try {
      const checkpoint = h.level.checkpoint.position.clone()
      for (let i = 0; i < 3; i++) {
        h.tick(0.2, { forward: true })
        h.time.triggerFreeze(); h.tick(2)
        h.respawn.cancel(); h.respawn.respawn()
        assert.ok(h.player.mesh.position.distanceTo(checkpoint) < (start === 'passenger' ? 0.31 : 0.001), JSON.stringify({start, checkpoint, pos:h.player.mesh.position}))
        assert.equal(h.time.getMode(), 'NORMAL')
        assert.ok(h.time.getEnergy() >= 50)
        assert.equal(h.level.isCinematic, false)
        assert.equal(h.player.mesh.userData.wreckLowCeiling, false)
        const rack = h.scene.getObjectByName('passenger-falling-rack').children[0]
        assert.equal(rack.position.y, 2.65)
      }
    } finally { h.dispose() }
  }
})


test('Vault: both clearance windows can be observed, held and crossed with real body collision', () => {
  for (const fps of [30, 60, 144]) {
    const h = levelHarness('vault', fps)
    try {
      const gates = []
      h.scene.traverse(n => { if (n.name === 'vault-security-gate') gates.push(n) })
      gates.sort((a, b) => b.position.z - a.position.z)
      for (const gate of gates) {
        pose(h, -0.5, gate.position.z + 1.4)
        let wait = 0
        while (gate.getObjectByName('vault-clearance-signal').material.color.getHex() !== 0x42dfad && wait < 8) {
          h.tick(1 / fps); wait += 1 / fps
        }
        assert.ok(wait < 8)
        const signal = gate.getObjectByName('vault-clearance-signal')
        assert.ok(signal.scale.x > signal.scale.y, 'clearance is also a horizontal shape')
        h.time.triggerFreeze(); h.tick(0.5, { forward: true, run: true })
        assert.ok(h.player.mesh.position.z < gate.position.z - 1)
        assert.equal(h.respawn.isFailing(), false)
        h.time.setMode('NORMAL'); h.tick(1.1)
      }
    } finally { h.dispose() }
  }
})

test('R4: fork instructions arrive before entry and switching prompts use rebound powers', () => {
  const saved = structuredClone(settings.getBindings())
  let h
  try {
    for (const [action, code] of [['duck', 'KeyU'], ['rewind', 'KeyO'], ['freeze', 'KeyP']]) {
      settings.setBinding(action, 0, code); settings.setBinding(action, 1, null)
    }
    h = levelHarness('convergence')
    pose(h, 0, h.center + 11.4)
    h.tick(1 / 60)
    assert.ok(h.player.mesh.position.z > h.center + 9, 'still before the partition')
    const forkHint = h.messages.find(m => m.includes('Choose before the split'))
    assert.ok(forkHint)
    for (const token of ['fast', 'exposed', 'sheltered', 'slower', 'U', 'O', 'P']) assert.ok(forkHint.includes(token), token)
    for (const name of ['fork-direct-sign', 'fork-maintenance-sign']) {
      const sign = h.scene.getObjectByName(name)
      assert.ok(sign)
      assert.equal(sign.userData.noCameraCollision, true)
    }
    h.dispose(); h = levelHarness('mechanical')
    pose(h, 1.75, h.center + 2.7)
    h.tick(1 / 60)
    const recessHint = h.messages.find(m => m.startsWith('Safe switching recess:'))
    assert.ok(recessHint?.includes('O restores') && recessHint.includes('P while it is open'))
    const count = h.messages.filter(m => m.startsWith('Safe switching recess:')).length
    h.tick(0.5)
    assert.equal(h.messages.filter(m => m.startsWith('Safe switching recess:')).length, count, 'prompt does not repeat each frame')
    assert.equal(h.respawn.isFailing(), false)
  } finally {
    h?.dispose()
    for (const [action, codes] of Object.entries(saved)) codes.forEach((code, slot) => settings.setBinding(action, slot, code))
  }
})

test('Vault: Freeze preserves a dangerous rack pose and its upright warning', () => {
  const h = levelHarness('vault')
  try {
    const gates = []
    h.scene.traverse(n => { if (n.name === 'vault-security-gate') gates.push(n) })
    const gate = gates.sort((a, b) => b.position.z - a.position.z)[0]
    pose(h, -0.5, gate.position.z + 1.4)
    h.tick(1 / 60)
    const signal = gate.getObjectByName('vault-clearance-signal')
    assert.equal(signal.material.color.getHex(), 0xe49a30)
    assert.ok(signal.scale.y > signal.scale.x)
    h.time.triggerFreeze()
    h.tick(0.1)
    assert.ok(signal.scale.y > signal.scale.x)
    pose(h, 0, gate.position.z)
    h.tick(1 / 60)
    assert.equal(h.respawn.isFailing(), true, 'holding time must not make an intersecting beam safe')
  } finally { h.dispose() }
})

test('Passenger: unheld and wall-side floors fall; depleted retries reset wave, rack and energy three times', () => {
  const h = levelHarness('passenger')
  try {
    h.tick(0.1, { forward: true, run: true })
    for (const x of [0, 2.3, -2.3]) {
      pose(h, x, h.center + 1)
      h.tick(0.6)
      assert.equal(h.respawn.isFailing(), true)
      h.respawn.cancel(); h.respawn.respawn()
      assert.ok(h.player.mesh.position.z > h.center + 8)
      assert.equal(h.time.getAbilityAvailability().REWIND, false)
      assert.ok(h.time.getEnergy() >= 50)
      assert.ok(h.scene.getObjectByName('time-wave').position.z - h.player.mesh.position.z >= 11.9)
      assert.equal(h.scene.getObjectByName('passenger-falling-rack').children[0].position.y, 2.65)
    }
  } finally { h.dispose() }
})

test('Passenger: minimum-energy carried entry and repeated checkpoint retries can still reach the brake', () => {
  for (const fps of [30,60,144,[1/144,1/30,0.1,1/60]]) {
    const h = levelHarness('passenger',fps)
    try {
      // Model arriving from Security with little energy, rather than the dev
      // shortcut's full bar. This is an input state, not a traversal shortcut.
      h.time.resetForCheckpoint({...h.time.captureCheckpointState(),energy:0})
      assert.equal(h.time.getEnergy(),50)
      h.tick(0.1,{forward:true,run:true})
      for(let attempt=0;attempt<3;attempt++) {
        h.respawn.fail('retry'); h.respawn.cancel(); h.respawn.respawn()
        assert.ok(h.time.getEnergy()<=54)
        const started = h.elapsed
        let minGap = Infinity, minEnergy = Infinity
        h.setProbe(() => {
          minGap = Math.min(minGap, h.scene.getObjectByName('time-wave').position.z - h.player.mesh.position.z)
          minEnergy = Math.min(minEnergy, h.time.getEnergy())
        })
        if (attempt === 2) h.tick(0.05, { right: true, run: true }) // recover a small entry misalignment
        h.tick(0.1,{forward:true,run:true})
        h.tick(0.7,{forward:true,run:true,right:true})
        h.tick(0.2,{forward:true,run:true})
        h.time.triggerFreeze(); h.tick(0.3)
        h.tick(0.37,{left:true,run:true}); h.tick(1.6,{forward:true,run:true})
        assert.equal(h.respawn.isFailing(),false,JSON.stringify({fps,attempt,pos:h.player.mesh.position,energy:h.time.getEnergy(),messages:h.messages.slice(-3)}))
        assert.ok(h.player.mesh.position.z<h.center-3)
        assert.ok(h.player.mesh.position.y>=-0.1)
        h.time.setMode('NORMAL')
        const brake=h.scene.getObjectByName('emergency-brake')
        for(let steps=0;h.player.mesh.position.z>brake.position.z+1.5;steps++) {
          assert.ok(steps<100)
          h.tick(0.1,{forward:true,run:true})
          assert.equal(h.respawn.isFailing(),false)
        }
        h.setProbe(null)
        assert.equal(h.scene.getObjectByName('buckling-inter-car-connector').visible, false,
          'inaccessible connector retires before Mechanical detachment')
        console.log('N6 chase evidence', JSON.stringify({ fps, attempt, seconds: +(h.elapsed-started).toFixed(3),
          minEnergy: +minEnergy.toFixed(3), brakeEnergy: +h.time.getEnergy().toFixed(3), minWaveGap: +minGap.toFixed(3) }))
        assert.ok(minGap > 0.35)
      }
    } finally {h.dispose()}
  }
})

test('N6: rebound movement/Freeze controls navigate both seats and reach the brake from minimum energy', () => {
  const h = levelHarness('passenger')
  const target = new EventTarget(); globalThis.window = target
  const codes = { forward: 'KeyI', right: 'KeyL', left: 'KeyJ', run: 'KeyO', freeze: 'KeyP' }
  for (const [action, code] of Object.entries(codes)) { settings.setBinding(action, 0, code); settings.setBinding(action, 1, null) }
  const keyboard = createKeyboardState()
  const key = (type, code) => { const e = new Event(type); Object.assign(e, { code, repeat: false }); target.dispatchEvent(e) }
  keyboard.onAction('freeze', () => h.time.triggerFreeze())
  const walk = (seconds, actions = []) => {
    for (const action of ['forward', 'right', 'left', 'run']) {
      const down = actions.includes(action)
      if (down !== Boolean(keyboard.state[action])) key(down ? 'keydown' : 'keyup', codes[action])
    }
    h.tick(seconds, keyboard.state)
    assert.equal(h.respawn.isFailing(), false)
  }
  try {
    h.time.resetForCheckpoint({ ...h.time.captureCheckpointState(), energy: 0 })
    walk(0.1, ['forward', 'run'])
    walk(0.7, ['forward', 'right', 'run']); walk(0.2, ['forward', 'run'])
    key('keydown', 'KeyF'); assert.equal(h.time.getMode(), 'NORMAL')
    key('keydown', codes.freeze); assert.equal(h.time.getMode(), 'FREEZE')
    walk(0.3); walk(0.37, ['left', 'run']); walk(1.6, ['forward', 'run'])
    assert.ok(h.player.mesh.position.z < h.center - 3)
    h.time.setMode('NORMAL')
    const brake = h.scene.getObjectByName('emergency-brake')
    for (let n = 0; h.player.mesh.position.z > brake.position.z + 1.5; n++) {
      assert.ok(n < 100); walk(0.1, ['forward', 'run'])
    }
    h.interactions.get('emergency-brake').onInteract()
    assert.equal(h.level.isCinematic, true)
  } finally { keyboard.dispose(); settings.resetAll(); h.dispose() }
})

test('Batches 4/5: full rebuild disposes routes and restores fresh ability and obstacle state', () => {
  const h = levelHarness('passenger')
  try {
    h.tick(0.2, { forward: true, run: true })
    const fork = h.scene.getObjectByName('convergence-route-fork')
    let disposed = false
    fork.children[0].geometry.addEventListener('dispose', () => { disposed = true })
    h.level.dispose()
    assert.equal(disposed, true)
    assert.equal(fork.parent.parent, null)
    assert.equal(h.interactions.has('emergency-brake'), false)
    h.time.resetForLevel()
    const fresh = createTimewreckLevel({ scene: h.scene, player: h.player, hud: new Proxy({}, {get:()=>()=>{}}), timeSystem: h.time,
      respawn: h.respawn, camera: {snap(){}}, advance(){}, startCarriage: 'passenger',
      interaction: {register:()=>()=>{}, registerBlocker:()=>()=>{}} })
    try {
      assert.equal(h.time.getAbilityAvailability().REWIND, true)
      assert.equal(h.time.getEnergy(), 100)
      const forks = []; h.scene.traverse(n=>{if(n.name==='convergence-route-fork') forks.push(n)})
      assert.equal(forks.length, 1)
      assert.equal(h.scene.getObjectByName('passenger-falling-rack').children[0].position.y, 2.65)
    } finally { fresh.dispose() }
  } finally { h.respawn.dispose(); h.time.dispose() }
})

test('Shutter: failed panel blocks standing, crouching and jumping approaches without opening itself', () => {
  const h = levelHarness('mechanical')
  try {
    pose(h, 0, h.center + 3)
    h.tick(2)
    for (const keys of [{forward:true}, {forward:true, duck:true}, {forward:true, jump:true}]) {
      pose(h, 0, h.center + 1.2)
      h.tick(0.6, keys)
      assert.ok(h.player.mesh.position.z > h.center + 0.25)
      assert.ok(h.scene.getObjectByName('mechanical-rewind-shutter').children[0].position.y < 1.4)
    }
  } finally { h.dispose() }
})

test('Passenger: rendered full-width hole and flat caps match exact support surfaces', () => {
  const h = levelHarness('passenger')
  try {
    pose(h, 0, h.center + 2.8)
    h.tick(0.1); h.time.triggerFreeze(); h.tick(0.25)
    const floor = h.scene.getObjectByName('floor-passenger')
    const footprint = h.scene.getObjectByName('passenger-rack-fall-footprint')
    footprint.geometry.computeBoundingBox()
    assert.ok(Math.abs(footprint.geometry.boundingBox.min.x + 1.5) < 1e-6)
    assert.ok(Math.abs(footprint.geometry.boundingBox.max.x - 1.5) < 1e-6)
    assert.ok(Math.abs(footprint.geometry.boundingBox.min.z + 0.55) < 1e-6)
    assert.ok(Math.abs(footprint.geometry.boundingBox.max.z - 0.55) < 1e-6)
    const directions = h.scene.getObjectByName('passenger-right-then-centre-guidance')
    const vertices = directions.geometry.attributes.position
    for (let i = 0; i < vertices.count; i++) {
      assert.ok(vertices.getZ(i) > h.center + 1.4, 'floor directions stop before the hole')
    }
    assert.ok(h.scene.getObjectByName('emergency-brake-sign'))
    assert.ok(h.scene.getObjectByName('cab-broken-track-warning'))
    const root = floor.parent.parent
    h.scene.updateMatrixWorld(true)
    for (const x of [-2.4, 0, 2.4]) {
      const local = new THREE.Vector3(x, 2, h.center - 0.8)
      const origin = root.localToWorld(local)
      const direction = new THREE.Vector3(0,-1,0).transformDirection(root.matrixWorld)
      assert.equal(new THREE.Raycaster(origin,direction).intersectObject(floor).length,0)
    }
    const caps = []; h.scene.traverse(n=>{if(n.name==='passenger-support-top')caps.push(n)})
    for (const cap of caps) {
      const piece = cap.parent
      const support = h.level.supports.find(s=>Math.abs((s.minZ+s.maxZ)/2-piece.position.z)<0.01 && s.y>0.2)
      assert.ok(support)
      assert.ok(Math.abs(support.y-(piece.position.y+0.18))<0.0001)
      assert.ok(Math.abs(support.maxX-support.minX-cap.geometry.parameters.width)<0.0001)
      assert.ok(Math.abs(support.maxZ-support.minZ-cap.geometry.parameters.depth)<0.0001)
    }
  } finally { h.dispose() }
})

function startFinale(h) {
  h.tick(0.1, { forward: true, run: true })
  const brake = h.scene.getObjectByName('emergency-brake')
  pose(h, 0, brake.position.z + 1)
  h.interactions.get('emergency-brake').onInteract()
  assert.equal(h.level.isCinematic, true)
  assert.equal(typeof h.skipFinale, 'function')
}

test('Finale: native skip completes once; natural completion and checkpoint recovery clear stale callbacks', () => {
  for (const finish of ['skip', 'automatic', 'checkpoint']) {
    const h = levelHarness('passenger')
    try {
      startFinale(h)
      const skip = h.skipFinale
      if (finish === 'skip') skip()
      else if (finish === 'automatic') h.tick(4.9)
      else { h.respawn.cancel(); h.respawn.respawn() }
      assert.equal(h.skipFinale, null)
      assert.equal(h.level.isCinematic, false)
      skip(); skip()
      assert.equal(h.advanced, finish === 'checkpoint' ? 0 : 1)
      h.interactions.get('emergency-brake').onInteract()
      assert.equal(h.advanced, finish === 'checkpoint' ? 0 : 1)
      if (finish !== 'checkpoint') {
        const valuables = h.scene.getObjectByName('vault-suspended-valuables')
        const held = Array.from(valuables.instanceMatrix.array)
        h.time.update(0.1)
        assert.deepEqual(Array.from(valuables.instanceMatrix.array), held, 'skip/natural completion stop the new feedback owner')
      }
    } finally { h.dispose() }
  }
})

test('Finale: real level manager restart/quit cancels reveal and stale completion, including pending transitions', () => {
  for (const action of ['restart', 'quit', 'restart-then-quit', 'complete-then-quit']) {
    const h = levelHarness('passenger')
    const oldRAF = globalThis.requestAnimationFrame
    const frames = []
    globalThis.requestAnimationFrame = callback => frames.push(callback)
    let completeEntries = 0
    const manager = createLevelManager({ scene: h.scene, player: h.player, hud: h.hud,
      timeSystem: h.time, respawn: h.respawn, camera: {snap(){}},
      loadingScreen: {show(){},hide(){}}, interaction: {
        register: (o, opts) => { h.interactions.set(o.name, opts); return () => h.interactions.delete(o.name) },
        registerBlocker: () => () => {}, setEnabled(){}, flashPrompt(){}
      },
      levels: [
        {state:'Timewreck',create: ctx => createTimewreckLevel({...ctx,startCarriage:'passenger'})},
        {state:'Complete',keepPrevious:true,create: () => {completeEntries++; return {dispose(){}}}}
      ]
    })
    function flush() {
      let count = 0
      while (frames.length) { assert.ok(++count < 12); frames.shift()() }
    }
    try {
      manager.adopt('Timewreck', h.level)
      const pausedPresentation = []
      const setPresentationPaused = h.level.setPresentationPaused
      h.level.setPresentationPaused = value => { pausedPresentation.push(value); setPresentationPaused(value) }
      manager.setPresentationPaused(true); manager.setPresentationPaused(false)
      assert.deepEqual(pausedPresentation, [true, false], 'manager forwards presentation pause without advancing simulation')
      // Adopt the real level to test teardown while the reveal owns input.
      startFinale(h)
      const staleSkip = h.skipFinale
      if (action === 'restart') { manager.restart(); flush() }
      else if (action === 'quit') manager.unload()
      else if (action === 'restart-then-quit') { manager.restart(); manager.unload(); flush() }
      else { manager.advance(); manager.unload(); flush() }
      staleSkip()
      manager.update(10)
      assert.equal(completeEntries, action === 'complete-then-quit' ? 1 : 0)
      assert.equal(manager.isCinematic(), false)
      assert.equal(h.skipFinale, null)
      if (action === 'restart') {
        assert.equal(manager.getState(), 'Timewreck')
        assert.ok(h.player.mesh.position.z > h.center + 8)
        assert.equal(h.time.getEnergy(), 100)
        assert.equal(h.time.getAbilityAvailability().REWIND, true)
        assert.ok(h.scene.getObjectByName('convergence-route-fork'))
      } else {
        assert.equal(manager.getState(), null)
        assert.equal(h.scene.getObjectByName('convergence-route-fork'), undefined)
        assert.equal(h.interactions.has('emergency-brake'), false)
      }
    } finally {
      manager.dispose(); h.respawn.dispose(); h.time.dispose()
      globalThis.requestAnimationFrame = oldRAF
    }
  }
})

test('Rebound keys: real keyboard map drives Freeze/movement, rejects old bindings and clears held keys across menus', () => {
  const h = levelHarness('passenger')
  const target = new EventTarget()
  globalThis.window = target
  const keyboard = createKeyboardState()
  let viewChanges = 0, interacts = 0
  const key = (type, code, extra = {}) => {
    const event = new Event(type, {cancelable:true})
    Object.assign(event, {code,repeat:false,...extra}); target.dispatchEvent(event)
  }
  keyboard.onAction('freeze', () => h.time.triggerFreeze())
  keyboard.onAction('toggleView', () => viewChanges++)
  keyboard.onAction('interact', () => interacts++)
  try {
    for (const [action,code] of [['freeze','KeyP'],['forward','KeyI'],['run','KeyO'],['duck','KeyU'],['jump','KeyJ'],['interact','KeyK'],['toggleView','KeyL']]) {
      settings.setBinding(action,0,code); settings.setBinding(action,1,null)
    }
    key('keydown','KeyF'); assert.equal(h.time.getMode(),'NORMAL')
    key('keydown','KeyP'); assert.equal(h.time.getMode(),'FREEZE')
    key('keydown','KeyI'); key('keydown','KeyO'); key('keydown','KeyU'); key('keydown','KeyJ')
    assert.equal(keyboard.state.forward,true); assert.equal(keyboard.state.run,true)
    assert.equal(keyboard.state.duck,true); assert.equal(keyboard.state.jump,true)
    assert.equal(keyboard.consumePress('jump'),true); assert.equal(keyboard.consumePress('jump'),false)
    key('keydown','KeyL'); key('keydown','KeyK')
    assert.equal(viewChanges,1); assert.equal(interacts,1)
    keyboard.setEnabled(false)
    for (const action of ['forward','run','duck','jump']) assert.equal(keyboard.state[action],false)
    key('keydown','KeyK'); assert.equal(interacts,1)
    keyboard.setEnabled(true)
    key('keydown','KeyI'); settings.setBinding('forward',0,'KeyY')
    assert.equal(keyboard.state.forward,false)
    key('keydown','KeyI'); assert.equal(keyboard.state.forward,false)
    key('keydown','KeyY'); assert.equal(keyboard.state.forward,true)
    target.dispatchEvent(new Event('blur')); assert.equal(keyboard.state.forward,false)
    key('keydown','KeyR',{ctrlKey:true}); assert.equal(keyboard.consumePress('restart'),false)
  } finally { keyboard.dispose(); settings.resetAll(); h.dispose() }
})

test('Finale: pause has priority over cinematic input; resuming retains cinematic ownership', () => {
  const state = {gameStarted:true,cinematic:true}
  assert.equal(resolveInputState(state),'CINEMATIC')
  assert.equal(resolveInputState({...state,paused:true}),'PAUSED')
  assert.equal(resolveInputState({...state,transitioning:true}),'TRANSITION')
  assert.equal(resolveInputState({...state,gameStarted:false}),'TITLE')
})

test('Finale objective uses the rebound sprint key on entry and checkpoint recovery', () => {
  settings.setBinding('run',0,'KeyO'); settings.setBinding('run',1,null)
  const h = levelHarness('passenger')
  try {
    h.tick(0.1,{forward:true,run:true})
    assert.match(h.hud.getObjective(),/\(O\)/)
    assert.doesNotMatch(h.hud.getObjective(),/Shift/)
    h.respawn.cancel(); h.respawn.respawn()
    assert.match(h.hud.getObjective(),/\(O\)/)
  } finally { h.dispose(); settings.resetAll() }
})

test('Lifecycle: repeated L3 checkpoint starts release scene resources and interactions on every unload', () => {
  for (let cycle=0;cycle<3;cycle++) {
    for (const start of [null,'convergence','mechanical','cargo','relay','security','passenger']) {
      const h=levelHarness(start)
      const resources=new Set(), disposed=new Set(), owners=new Map()
      const ghost=h.time.getGhost().mesh
      const roots=h.scene.children.filter(root=>root!==ghost)
      for (const root of roots) root.traverse(node=>{
        if(node.geometry) {resources.add(node.geometry);owners.set(node.geometry,`${node.name}/${node.type}/geometry`)}
        for(const mat of Array.isArray(node.material)?node.material:[node.material]) if(mat) {resources.add(mat);owners.set(mat,`${node.name}/${node.type}/material`)}
      })
      for(const resource of resources) resource.addEventListener('dispose',()=>disposed.add(resource))
      try {
        h.tick(0.2)
        h.time.triggerFreeze(); h.tick(0.2)
        h.respawn.cancel(); h.respawn.respawn()
        h.level.dispose()
        assert.equal(h.interactions.size,0)
        assert.deepEqual(h.scene.children,[ghost])
        assert.equal(disposed.size,resources.size,`${start}/${cycle}: unreleased ${[...resources].filter(r=>!disposed.has(r)).map(r=>owners.get(r)).join(', ')}`)
        assert.equal(h.player.mesh.userData.tightCrouchCamera,false)
        assert.equal(h.time.getGhost().isPlaying(),false)
      } finally {h.respawn.dispose();h.time.dispose()}
    }
  }
})

test('Restart: real level manager rebuilds every L3 start and quit cancels a pending restart', () => {
  const oldRAF=globalThis.requestAnimationFrame
  const frames=[]
  globalThis.requestAnimationFrame=callback=>frames.push(callback)
  const flush=()=>{for(let i=0;frames.length;i++){assert.ok(i<12);frames.shift()()}}
  try {
    for(const start of [null,'convergence','mechanical','cargo','relay','security','passenger']) {
      const h=levelHarness(start)
      const spawn=h.level.checkpoint.position.clone()
      h.level.dispose()
      const manager=createLevelManager({scene:h.scene,player:h.player,hud:h.hud,timeSystem:h.time,respawn:h.respawn,
        camera:{snap(){}},loadingScreen:{show(){},hide(){}},interaction:{
          register:(object,options)=>{h.interactions.set(object.name,options);return()=>h.interactions.delete(object.name)},
          registerBlocker:()=>()=>{},setEnabled(){},flashPrompt(){}
        },levels:[
          {state:'Timewreck',create:ctx=>createTimewreckLevel({...ctx,startCarriage:start})},
          {state:'Complete',create:()=>({dispose(){}})}
        ]})
      try {
        manager.enter('Timewreck');flush()
        for(let attempt=0;attempt<3;attempt++) {
          h.time.triggerFreeze();h.time.update(1)
          h.respawn.fail('restart while caught')
          manager.restart();flush()
          assert.equal(manager.getState(),'Timewreck')
          assert.equal(manager.isTransitioning(),false)
          assert.equal(manager.isCinematic(),false)
          assert.equal(h.respawn.isFailing(),false)
          assert.equal(h.time.getMode(),'NORMAL')
          assert.equal(h.time.getEnergy(),100)
          assert.equal(h.time.getAbilityAvailability().REWIND,true)
          assert.ok(h.player.mesh.position.distanceTo(spawn)<0.001)
          const forks=[];h.scene.traverse(n=>{if(n.name==='convergence-route-fork')forks.push(n)})
          assert.equal(forks.length,1)
          assert.equal(h.scene.getObjectByName('relay-blast-leaf-right').position.x,0.75)
        }
        manager.restart();manager.unload();flush()
        assert.equal(manager.getState(),null)
        assert.equal(h.respawn.respawn(),false,'quit discards the outgoing checkpoint')
        assert.equal(h.interactions.size,0)
        assert.deepEqual(h.scene.children,[h.time.getGhost().mesh])
      } finally {manager.dispose();h.respawn.dispose();h.time.dispose()}
    }
  } finally {globalThis.requestAnimationFrame=oldRAF}
})

test('Alternate solution: intercept Mechanical shutter with early Freeze and cross without a repair', () => {
  for (const fps of [30,60,144]) {
    const h = levelHarness('mechanical',fps)
    try {
      pose(h,0,h.center+3)
      h.time.triggerFreeze(); h.tick(1.05,{forward:true,run:true})
      assert.ok(h.player.mesh.position.z<h.center-2)
      assert.equal(h.respawn.isFailing(),false)
      assert.ok(h.time.getEnergy()>65)
    } finally { h.dispose() }
  }
})

test('Vault alternate: Slow holds each observed clear window long enough for a sprint crossing', () => {
  for (const fps of [30,60,144]) {
    const h=levelHarness('vault',fps)
    try {
      const gates=[]
      h.scene.traverse(n=>{if(n.name==='vault-security-gate')gates.push(n)})
      gates.sort((a,b)=>b.position.z-a.position.z)
      for(const gate of gates) {
        pose(h,-0.5,gate.position.z+1.4)
        let waited=0
        while(gate.getObjectByName('vault-clearance-signal').material.color.getHex()!==0x42dfad && waited<8) {
          h.tick(1/fps); waited+=1/fps
        }
        assert.ok(waited<8)
        h.time.triggerSlow();h.tick(0.5,{forward:true,run:true})
        assert.ok(h.player.mesh.position.z<gate.position.z-1)
        assert.equal(h.respawn.isFailing(),false)
        h.time.setMode('NORMAL');h.tick(1)
      }
    } finally {h.dispose()}
  }
})

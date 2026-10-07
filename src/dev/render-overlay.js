// Temporary DEV-only readout, measurement toggles and teleports. Not shipped.
// Digit0–9 are taken in the capture phase so they do not also fire the
// number-row time abilities. Letter bindings (Q/F/C/G) are unchanged.

import * as THREE from 'three'
import { bounds as stationBounds } from '../environment/station-blockout.js'
import { ONBOARDING_PASSAGE_SPAWN } from '../environment/passageways/passage-onboarding.js'
import { createGpuTimer } from './gpu-timer.js'

const TIMING_WINDOW = 60
const TRAIN_YAW = Math.PI / 2
const SPAWN_YAW = Math.PI / 2
const SPAWN_PITCH = -0.08
const UNLIT_FALLBACK = new THREE.Color(0x6a6f78)

export function mountRenderOverlay(renderer, { player: gamePlayer, playerView, post } = {}) {
  const gpu = createGpuTimer(renderer.getContext())
  post?.setGpuTimer(gpu)

  // Shadow drawing happens inside renderer.render, before the colour pass.
  // The scene query stays open until that render() returns. Post passes use
  // an orthographic camera, so they are not counted as the main view.
  const shadowRender = renderer.shadowMap.render.bind(renderer.shadowMap)
  renderer.shadowMap.render = function timedShadow(shadows, scene, camera) {
    const started = Boolean(camera?.isPerspectiveCamera) && gpu.begin('shadow')
    shadowRender(shadows, scene, camera)
    if (!started) return
    gpu.end()
    gpu.begin('scene')
  }
  // The minimap renders its own icon scene with an orthographic camera after
  // the main view. That pass replaces renderer.info, and it used to replace
  // the scene the light and scenery toggles walk — the icon scene has neither
  // the station lights nor `outdoor-environment`, so both toggles reported 0.
  const render = renderer.render.bind(renderer)
  let mainPass = null
  let minimapPass = { calls: 0, triangles: 0 }
  let worldScene = null
  let minimapOff = false

  // One sample per animation frame that actually draws the main view.
  // `frame` is the gap since the previous such frame. `logic` is from the
  // callback start until the main renderer.render() begins (the loop's
  // update callbacks, then the viewport/clear just before that call).
  const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window)
  const frameTimes = new Float64Array(TIMING_WINDOW)
  const logicTimes = new Float64Array(TIMING_WINDOW)
  const mainTimes = new Float64Array(TIMING_WINDOW)
  const minimapTimes = new Float64Array(TIMING_WINDOW)
  let timingCount = 0
  let previousFrameStart = 0
  let activeFrame = null

  function recordFrame(sample) {
    const slot = timingCount % TIMING_WINDOW
    frameTimes[slot] = sample.frame
    logicTimes[slot] = sample.logic
    mainTimes[slot] = sample.main
    minimapTimes[slot] = sample.minimap
    timingCount += 1
  }

  function average(samples) {
    const n = Math.min(timingCount, TIMING_WINDOW)
    if (!n) return 0
    let sum = 0
    for (let i = 0; i < n; i++) sum += samples[i]
    return sum / n
  }

  window.requestAnimationFrame = function devOverlayFrame(callback) {
    return nativeRequestAnimationFrame(function (timestamp) {
      const start = performance.now()
      const sample = {
        frame: previousFrameStart ? start - previousFrameStart : 0,
        logic: 0,
        main: 0,
        minimap: 0,
        start,
        sawMain: false
      }
      activeFrame = sample
      try {
        return callback(timestamp)
      } finally {
        if (sample.sawMain && previousFrameStart) recordFrame(sample)
        if (sample.sawMain) previousFrameStart = start
        if (activeFrame === sample) activeFrame = null
      }
    })
  }

  renderer.render = function (scene, camera) {
    const perspective = Boolean(camera && camera.isPerspectiveCamera)
    // Only the inset map is optional. Bloom and the grade draw with
    // orthographic quads; skipping every non-perspective camera kills them.
    if (!perspective && minimapOff && camera?.name === 'minimap') {
      if (activeFrame) activeFrame.minimap = 0
      minimapPass = { calls: 0, triangles: 0 }
      return
    }

    if (perspective && activeFrame && !activeFrame.sawMain) {
      activeFrame.logic = performance.now() - activeFrame.start
    }

    const started = performance.now()
    render(scene, camera)
    if (perspective) gpu.endIf('scene')
    const elapsed = performance.now() - started

    if (perspective) {
      worldScene = scene
      if (activeFrame) {
        activeFrame.main = elapsed
        activeFrame.sawMain = true
      }
      mainPass = {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures
      }
      return
    }

    if (activeFrame) activeFrame.minimap = elapsed
    minimapPass = {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles
    }
  }

  const panel = document.createElement('div')
  panel.id = 'dev-render-overlay'
  Object.assign(panel.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    zIndex: '100000',
    padding: '8px 10px',
    background: 'rgba(6, 8, 14, 0.82)',
    border: '1px solid rgba(255, 255, 255, 0.16)',
    borderRadius: '4px',
    color: '#d6deea',
    font: '12px/1.45 ui-monospace, Consolas, monospace',
    whiteSpace: 'pre',
    pointerEvents: 'none'
  })
  panel.textContent = 'FPS …'
  document.body.appendChild(panel)

  let accum = 0
  let frames = 0
  let fps = 0

  // Key 1. `savedPixelRatio` is whatever was active at the moment the
  // override turned on, so a later toggle restores that value exactly.
  let pixelRatioForced = false
  let savedPixelRatio = renderer.getPixelRatio()

  // Key 2. Forces the shadow map off, then restores whatever enabled
  // state was in effect when the override turned on. Materials recompile.
  let shadowsOff = false
  let savedShadowEnabled = renderer.shadowMap.enabled

  // Key 3. Original `visible` for every point/spot light we have touched,
  // so turning the limit off puts the light pool's hidden sources back.
  const lightOriginal = new Map()
  let lightsLimited = false
  let limitedLightCount = 0
  let totalLocalLights = 0
  const playerPos = new THREE.Vector3()
  const lightPos = new THREE.Vector3()

  // Key 4. Trees, bushes, and rocks are the instanced meshes parented
  // directly under `outdoor-environment`. Poles are the cylinder instances
  // under `trackside-infrastructure` (crossarms and fences are boxes).
  const sceneryOriginal = new Map()
  let sceneryHidden = false
  let hiddenSceneryCount = 0

  // Key 9. Every additive mesh: the painted light pools, wall and floor
  // glows, laser glows. Original `visible` is restored on the way out.
  const glowOriginal = new Map()
  let glowsHidden = false
  let hiddenGlowCount = 0

  // Key 0. Every mesh material swapped for a flat MeshBasicMaterial of the
  // same colour, so the difference in gpu scene time is the lighting cost
  // (lights, shadows, environment map, normal maps, custom shaders).
  const unlitOriginal = new Map()
  const unlitCache = new Map()
  const unlitMaterials = new Set()
  let unlit = false

  function resizeToPixelRatio(ratio) {
    if (Math.abs(renderer.getPixelRatio() - ratio) < 1e-4) return
    renderer.setPixelRatio(ratio)
    renderer.setSize(window.innerWidth, window.innerHeight)
  }

  function invalidateMaterials(scene) {
    if (!scene) return
    scene.traverse((node) => {
      const material = node.material
      if (!material) return
      for (const entry of Array.isArray(material) ? material : [material]) entry.needsUpdate = true
    })
  }

  function applyPixelRatio() {
    resizeToPixelRatio(pixelRatioForced ? 1 : savedPixelRatio)
  }

  function applyShadows() {
    const enabled = shadowsOff ? false : savedShadowEnabled
    if (renderer.shadowMap.enabled === enabled) return
    renderer.shadowMap.enabled = enabled
    renderer.shadowMap.needsUpdate = true
    invalidateMaterials(worldScene)
  }

  function syncLights() {
    if (!lightsLimited) {
      if (lightOriginal.size > 0) {
        for (const [light, visible] of lightOriginal) light.visible = visible
        lightOriginal.clear()
      }
      limitedLightCount = 0
      totalLocalLights = 0
      return
    }
    if (!worldScene) return

    const player = worldScene.getObjectByName('player')
    if (player) player.getWorldPosition(playerPos)
    else playerPos.set(0, 0, 0)

    const found = []
    worldScene.traverse((obj) => {
      if (!obj.isPointLight && !obj.isSpotLight) return
      if (!lightOriginal.has(obj)) lightOriginal.set(obj, obj.visible)
      obj.getWorldPosition(lightPos)
      const dx = lightPos.x - playerPos.x
      const dy = lightPos.y - playerPos.y
      const dz = lightPos.z - playerPos.z
      found.push({
        obj,
        distance: dx * dx + dy * dy + dz * dz,
        // Level 2 parks a hidden source on top of each pooled light. Prefer
        // the originally visible one so a tie does not spend a slot on a
        // light the pool has already switched off.
        hidden: lightOriginal.get(obj) ? 0 : 1
      })
    })

    const live = new Set(found.map((entry) => entry.obj))
    for (const light of lightOriginal.keys()) {
      if (!live.has(light)) lightOriginal.delete(light)
    }

    found.sort((a, b) => a.distance - b.distance || a.hidden - b.hidden)
    totalLocalLights = found.length
    limitedLightCount = Math.min(8, found.length)
    for (let i = 0; i < found.length; i++) {
      const light = found[i].obj
      light.visible = i < 8 ? lightOriginal.get(light) : false
    }
  }

  function sceneryMeshes(scene) {
    const meshes = []
    if (!scene) return meshes
    scene.traverse((obj) => {
      if (obj.name !== 'outdoor-environment') return
      for (const child of obj.children) {
        if (child.isInstancedMesh) meshes.push(child)
      }
      const trackside = obj.getObjectByName('trackside-infrastructure')
      if (!trackside) return
      trackside.traverse((node) => {
        if (node.isInstancedMesh && node.geometry?.type === 'CylinderGeometry') meshes.push(node)
      })
    })
    return meshes
  }

  function syncScenery() {
    if (!sceneryHidden) {
      if (sceneryOriginal.size > 0) {
        for (const [mesh, visible] of sceneryOriginal) mesh.visible = visible
        sceneryOriginal.clear()
      }
      hiddenSceneryCount = 0
      return
    }
    const meshes = sceneryMeshes(worldScene)
    const live = new Set(meshes)
    for (const mesh of sceneryOriginal.keys()) {
      if (!live.has(mesh)) sceneryOriginal.delete(mesh)
    }
    for (const mesh of meshes) {
      if (!sceneryOriginal.has(mesh)) sceneryOriginal.set(mesh, mesh.visible)
      mesh.visible = false
    }
    hiddenSceneryCount = meshes.length
  }

  function materialList(material) {
    return Array.isArray(material) ? material : [material]
  }

  function isAdditive(material) {
    return materialList(material).some((entry) => entry?.blending === THREE.AdditiveBlending)
  }

  function syncGlows() {
    if (!glowsHidden) {
      for (const [node, visible] of glowOriginal) node.visible = visible
      glowOriginal.clear()
      hiddenGlowCount = 0
      return
    }
    if (!worldScene) return
    const live = new Set()
    worldScene.traverse((node) => {
      if (!node.material || !isAdditive(node.material)) return
      live.add(node)
      if (!glowOriginal.has(node)) glowOriginal.set(node, node.visible)
      node.visible = false
    })
    for (const node of glowOriginal.keys()) {
      if (!live.has(node)) glowOriginal.delete(node)
    }
    hiddenGlowCount = live.size
  }

  // Shader materials have no `color`; their first colour uniform stands in.
  function materialColour(material) {
    if (material.color?.isColor) return material.color
    for (const uniform of Object.values(material.uniforms ?? {})) {
      if (uniform?.value?.isColor) return uniform.value
    }
    return UNLIT_FALLBACK
  }

  function unlitFor(material) {
    let basic = unlitCache.get(material)
    if (basic) return basic
    basic = new THREE.MeshBasicMaterial({
      name: `${material.name || material.type}:unlit`,
      color: materialColour(material),
      side: material.side,
      transparent: material.transparent,
      opacity: material.opacity,
      blending: material.blending,
      depthTest: material.depthTest,
      depthWrite: material.depthWrite,
      vertexColors: material.vertexColors,
      polygonOffset: material.polygonOffset,
      polygonOffsetFactor: material.polygonOffsetFactor,
      polygonOffsetUnits: material.polygonOffsetUnits,
      fog: material.fog !== false
    })
    unlitCache.set(material, basic)
    unlitMaterials.add(basic)
    return basic
  }

  function syncUnlit() {
    if (!unlit) {
      for (const [node, { original, swapped }] of unlitOriginal) {
        if (node.material === swapped) node.material = original
      }
      unlitOriginal.clear()
      for (const basic of unlitMaterials) basic.dispose()
      unlitMaterials.clear()
      unlitCache.clear()
      return
    }
    if (!worldScene) return
    worldScene.traverse((node) => {
      if (!node.isMesh || !node.material) return
      if (unlitOriginal.get(node)?.swapped === node.material) return
      const original = node.material
      const swapped = Array.isArray(original) ? original.map(unlitFor) : unlitFor(original)
      unlitOriginal.set(node, { original, swapped })
      node.material = swapped
    })
  }

  function ms(samples) {
    return `${average(samples).toFixed(1)} ms`
  }

  function gpuMs(label) {
    if (!gpu.supported) return 'n/a'
    const value = gpu.average(label)
    return value == null ? '…' : `${value.toFixed(1)} ms`
  }

  function paint() {
    const pass = mainPass ?? {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures
    }
    const ratio = renderer.getPixelRatio()
    const active = []
    if (pixelRatioForced) active.push(`1  pixel ratio ${ratio.toFixed(2)} (saved ${savedPixelRatio.toFixed(2)})`)
    if (shadowsOff) active.push('2  shadows off')
    if (lightsLimited) active.push(`3  point/spot lights ${limitedLightCount}/${totalLocalLights} nearest`)
    if (sceneryHidden) active.push(`4  outdoor scenery hidden (${hiddenSceneryCount})`)
    if (minimapOff) active.push('5  minimap off')
    if (post && !post.isEnabled()) active.push('8  post off')
    if (glowsHidden) active.push(`9  additive glows hidden (${hiddenGlowCount})`)
    if (unlit) active.push(`0  unlit MeshBasicMaterial (${unlitOriginal.size} meshes)`)
    panel.textContent = [
      `${fps} FPS`,
      `frame    ${ms(frameTimes)}`,
      `update   ${ms(logicTimes)}`,
      `render   ${ms(mainTimes)}`,
      `minimap  ${ms(minimapTimes)}`,
      `gpu shadow  ${gpuMs('shadow')}`,
      `gpu scene   ${gpuMs('scene')}`,
      `gpu bloom   ${gpuMs('bloom')}`,
      `gpu final   ${gpuMs('final')}`,
      `draw calls  ${pass.calls}`,
      `triangles   ${pass.triangles}`,
      `geometries  ${pass.geometries}`,
      `textures    ${pass.textures}`,
      `minimap draws  ${minimapPass.calls}`,
      `minimap tris   ${minimapPass.triangles}`,
      active.length ? active.join('\n') : 'toggles off  (1 px · 2 shadows · 3 lights · 4 scenery · 5 minimap · 6 train · 7 spawn · 8 post · 9 glows · 0 unlit)'
    ].join('\n')
  }

  // Pointer lock retargets keys at the canvas, and keyboard lock can deliver
  // the number row with `key` set and `code` left Unidentified. The same
  // event also reaches window (capture, then bubble). One handled event
  // must not flip the toggle again from the second listener.
  const handledKeys = new WeakSet()
  const keyTargets = [window, document, renderer.domElement].filter(Boolean)

  function measurementKey(event) {
    switch (event.code) {
      case 'Digit1':
      case 'Numpad1':
        return 1
      case 'Digit2':
      case 'Numpad2':
        return 2
      case 'Digit3':
      case 'Numpad3':
        return 3
      case 'Digit4':
      case 'Numpad4':
        return 4
      case 'Digit5':
      case 'Numpad5':
        return 5
      case 'Digit6':
      case 'Numpad6':
        return 6
      case 'Digit7':
      case 'Numpad7':
        return 7
      case 'Digit8':
      case 'Numpad8':
        return 8
      case 'Digit9':
      case 'Numpad9':
        return 9
      case 'Digit0':
      case 'Numpad0':
        return 10
      default:
        break
    }
    switch (event.key) {
      case '1': return 1
      case '2': return 2
      case '3': return 3
      case '4': return 4
      case '5': return 5
      case '6': return 6
      case '7': return 7
      case '8': return 8
      case '9': return 9
      case '0': return 10
      default:
        break
    }
    // Last resort when lock/pointer-lock leaves both key and code blank.
    const which = event.keyCode || event.which || 0
    if (which === 49 || which === 97) return 1
    if (which === 50 || which === 98) return 2
    if (which === 51 || which === 99) return 3
    if (which === 52 || which === 100) return 4
    if (which === 53 || which === 101) return 5
    if (which === 54 || which === 102) return 6
    if (which === 55 || which === 103) return 7
    if (which === 56 || which === 104) return 8
    if (which === 57 || which === 105) return 9
    if (which === 48 || which === 96) return 10
    return 0
  }

  // Only a visible text field should swallow the measurement keys. Hidden
  // settings sliders and workshop inputs are still <input> elements; treating
  // every input as typing made Digit1–4 fall through to Slow/Freeze/Rewind/Ghost.
  function isVisibleTextEntry(target) {
    if (!target || target.nodeType !== 1) return false
    const tag = target.tagName
    if (tag === 'INPUT') {
      const type = (target.type || 'text').toLowerCase()
      if (type === 'range' || type === 'checkbox' || type === 'radio' || type === 'button' || type === 'color' || type === 'file') {
        return false
      }
    } else if (tag !== 'TEXTAREA' && tag !== 'SELECT' && !target.isContentEditable) {
      return false
    }
    for (let node = target; node && node.nodeType === 1; node = node.parentElement) {
      const style = window.getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  }

  function onKeyDown(event) {
    if (handledKeys.has(event) || event.repeat) return
    const index = measurementKey(event)
    if (!index) return
    handledKeys.add(event)
    if (isVisibleTextEntry(event.target)) return

    if (index === 1) {
      pixelRatioForced = !pixelRatioForced
      if (pixelRatioForced) savedPixelRatio = renderer.getPixelRatio()
      applyPixelRatio()
      console.log(`[dev overlay] toggle 1 (pixel ratio 1.0): ${pixelRatioForced ? 'ON' : 'OFF'}`)
    } else if (index === 2) {
      if (!shadowsOff) savedShadowEnabled = renderer.shadowMap.enabled
      shadowsOff = !shadowsOff
      applyShadows()
      console.log(`[dev overlay] toggle 2 (shadows off): ${shadowsOff ? 'ON' : 'OFF'}`)
    } else if (index === 3) {
      lightsLimited = !lightsLimited
      syncLights()
      console.log(`[dev overlay] toggle 3 (8 nearest lights): ${lightsLimited ? 'ON' : 'OFF'}`)
    } else if (index === 4) {
      sceneryHidden = !sceneryHidden
      syncScenery()
      console.log(`[dev overlay] toggle 4 (hide outdoor scenery): ${sceneryHidden ? 'ON' : 'OFF'}`)
    } else if (index === 5) {
      minimapOff = !minimapOff
      console.log(`[dev overlay] toggle 5 (minimap off): ${minimapOff ? 'ON' : 'OFF'}`)
    } else if (index === 6) {
      devTeleport('train')
    } else if (index === 7) {
      devTeleport('spawn')
    } else if (index === 8) {
      if (post) {
        post.setEnabled(!post.isEnabled())
        console.log(`[dev overlay] toggle 8 (post off): ${post.isEnabled() ? 'OFF' : 'ON'}`)
      }
    } else if (index === 9) {
      glowsHidden = !glowsHidden
      syncGlows()
      console.log(`[dev overlay] toggle 9 (hide additive glows): ${glowsHidden ? 'ON' : 'OFF'}`)
    } else if (index === 10) {
      unlit = !unlit
      syncUnlit()
      console.log(`[dev overlay] toggle 0 (unlit materials): ${unlit ? 'ON' : 'OFF'}`)
    }

    event.preventDefault()
    event.stopImmediatePropagation()
    paint()
  }

  const locoBox = new THREE.Box3()

  function placePlayer(position, yaw, pitch) {
    if (!gamePlayer) {
      console.warn('[dev overlay] teleport: player is not wired')
      return
    }
    gamePlayer.setPose(position, yaw)
    playerView?.setYaw(yaw)
    playerView?.setPitch(pitch)
    playerView?.snap()
  }

  // Platform side of the locomotive nose, on the concourse, facing the train.
  // The playable station clamps X/Z, so a nose that has already rolled past
  // the platform end still drops the player on the platform beside it.
  function teleportBesideLocomotive() {
    const loco = worldScene?.getObjectByName('locomotive')
    const mesh = loco?.getObjectByProperty?.('isMesh', true) ?? null
    let x = stationBounds.maxX - 0.35
    let z = stationBounds.maxZ - 0.4
    if (mesh) {
      locoBox.setFromObject(mesh)
      x = Math.min(stationBounds.maxX - 0.35, locoBox.min.x - 1.2)
      z = THREE.MathUtils.clamp(locoBox.max.z, stationBounds.minZ + 0.4, stationBounds.maxZ - 0.4)
    } else {
      console.warn('[dev overlay] teleport train: locomotive not in the scene yet')
    }
    x = THREE.MathUtils.clamp(x, stationBounds.minX + 0.4, stationBounds.maxX - 0.35)
    placePlayer(new THREE.Vector3(x, 0, z), TRAIN_YAW, 0.12)
    console.log(`[dev overlay] teleport train (${x.toFixed(1)}, 0, ${z.toFixed(1)})`)
  }

  function teleportToSpawn() {
    placePlayer(ONBOARDING_PASSAGE_SPAWN.clone(), SPAWN_YAW, SPAWN_PITCH)
    const spawn = ONBOARDING_PASSAGE_SPAWN
    console.log(`[dev overlay] teleport spawn (${spawn.x.toFixed(1)}, ${spawn.y.toFixed(1)}, ${spawn.z.toFixed(1)})`)
  }

  function devTeleport(which) {
    if (which === 'train') teleportBesideLocomotive()
    else if (which === 'spawn') teleportToSpawn()
    else console.warn(`[dev overlay] devTeleport: expected 'train' or 'spawn', got ${which}`)
  }

  window.devTeleport = devTeleport

  for (const target of keyTargets) target.addEventListener('keydown', onKeyDown, true)

  function update(delta) {
    // Settings and the window resize listener write the pixel ratio and the
    // shadow flag back. Re-apply only when one of those has drifted.
    if (pixelRatioForced) applyPixelRatio()
    if (shadowsOff) applyShadows()
    if (lightsLimited) syncLights()
    if (sceneryHidden) syncScenery()
    if (glowsHidden) syncGlows()
    if (unlit) syncUnlit()

    gpu.poll()
    accum += delta
    frames += 1
    if (accum < 0.5) return
    fps = Math.round(frames / accum)
    accum = 0
    frames = 0
    paint()
  }

  return {
    update,
    dispose() {
      for (const target of keyTargets) target.removeEventListener('keydown', onKeyDown, true)
      if (window.devTeleport === devTeleport) delete window.devTeleport
      window.requestAnimationFrame = nativeRequestAnimationFrame
      const restoreRatio = pixelRatioForced
      const restoreShadows = shadowsOff
      pixelRatioForced = false
      shadowsOff = false
      lightsLimited = false
      sceneryHidden = false
      minimapOff = false
      glowsHidden = false
      unlit = false
      if (restoreRatio) applyPixelRatio()
      if (restoreShadows) applyShadows()
      syncLights()
      syncScenery()
      syncGlows()
      syncUnlit()
      renderer.render = render
      panel.remove()
    }
  }
}

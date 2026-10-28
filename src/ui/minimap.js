import * as THREE from 'three'
import { createMinimapIcons, MINIMAP_LAYER } from './minimap-icons.js'
import { carriageVolumeAt, listCarriageWallBoxes, listCarriageInteriorBoxes } from '../environment/carriage-bounds.js'

// Overlay minimap: a second orthographic camera rendered into a scissored
// corner viewport (Three.js multi-view). The camera sees ONLY the unlit
// icon layer (see minimap-icons.js) — not the lit world mesh — because
// station lighting is built for first-person, not a top-down frustum.
//
// A local, player-following view with uniform world scale in every level.

const DEFAULT_RANGE = 16
const HEIGHT = 48
const CARRIAGE_LEVELS = new Set(['MovingHeist', 'Timewreck'])

// Simplified footprints from real floors, not a rectangle painted over the map.
export function collectMinimapFloors(root) {
  const floors = []
  if (!root) return floors
  root.updateWorldMatrix(true, true)
  const normal = new THREE.Vector3()
  const normalMatrix = new THREE.Matrix3()
  root.traverse(node => {
    if (!node.isMesh || node.isInstancedMesh || node.material?.transparent) return
    const normals = node.geometry?.attributes.normal
    if (!normals) return
    if (!node.userData.minimapFloor) {
      normalMatrix.getNormalMatrix(node.matrixWorld)
      for (let i = 0; i < normals.count; i++) {
        normal.fromBufferAttribute(normals, i).applyNormalMatrix(normalMatrix)
        if (normal.y < 0.995) return
      }
    }
    const box = new THREE.Box3().setFromObject(node)
    if (!box.isEmpty()) floors.push({
      minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z,
      y: box.max.y, source: node
    })
  })
  return floors
}

function visibleInWorld(node) {
  for (; node; node = node.parent) if (!node.visible) return false
  return true
}

// Work from the collision/support contract, never decorative horizontal faces.
export function wreckMinimapFloors(volumes, voids = [], supports = []) {
  let floors = volumes.map(v => ({...v}))
  for (const hole of voids) {
    if (hole.enabled === false) continue
    floors = floors.flatMap(v => {
      const a = Math.max(v.minX,hole.minX), b = Math.min(v.maxX,hole.maxX)
      const c = Math.max(v.minZ,hole.minZ), d = Math.min(v.maxZ,hole.maxZ)
      if (a >= b || c >= d) return [v]
      return [{...v,maxX:a},{...v,minX:b},{...v,minX:a,maxX:b,maxZ:c},{...v,minX:a,maxX:b,minZ:d}]
        .filter(v => v.maxX-v.minX > 0.001 && v.maxZ-v.minZ > 0.001)
    })
  }
  return floors.concat(supports.filter(s => s.enabled !== false && s.minX<s.maxX && s.minZ<s.maxZ &&
    volumes.some(v => s.maxZ>v.minZ && s.minZ<v.maxZ && s.maxX>v.minX && s.minX<v.maxX) &&
    voids.some(v => v.enabled !== false && s.maxX>v.minX && s.minX<v.maxX && s.maxZ>v.minZ && s.minZ<v.maxZ)))
}

export function createMinimap({
  scene,
  hudRoot,
  mainCamera,
  player,
  getObstacles,
  getGuards,
  getLevelState,
  getCarriageVolumes,
  getVoids,
  getSupports,
  getRange = () => DEFAULT_RANGE
}) {
  // Main view stays on the default world layer. Icons live on MINIMAP_LAYER
  // so they never appear in the gameplay camera.
  mainCamera.layers.enable(0)
  mainCamera.layers.disable(MINIMAP_LAYER)

  const camera = new THREE.OrthographicCamera(
    -DEFAULT_RANGE / 2, DEFAULT_RANGE / 2,
    DEFAULT_RANGE / 2, -DEFAULT_RANGE / 2,
    1,
    80
  )
  camera.name = 'minimap'
  camera.up.set(0, 0, 1) // world +Z is "up" on the map (yaw 0 faces up)
  camera.layers.set(MINIMAP_LAYER)

  // The icons live in a scene of their own. Rendering the world scene again
  // with this camera would walk and re-matrix every level object for a
  // handful of icons, and — because three.js keeps light state per scene —
  // flip the light count to zero and back each frame, which makes every lit
  // material re-validate its shader program on the next main render.
  const iconScene = new THREE.Scene()
  iconScene.background = new THREE.Color(0x090e19)
  const icons = createMinimapIcons({ scene: iconScene, player, getObstacles, getGuards })

  const frame = document.createElement('div')
  frame.id = 'minimap-frame'
  Object.assign(frame.style, {
    position: 'relative',
    boxSizing: 'border-box',
    display: 'none',
    pointerEvents: 'none',
    border: '2px solid rgba(176, 141, 63, 0.8)',
    borderRadius: '8px',
    boxShadow: '0 8px 28px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0, 0, 0, 0.35)',
    background: 'transparent'
  })
  const heading = document.createElement('div')
  const orientation = document.createElement('div')
  const scale = document.createElement('div')
  for (const label of [heading, orientation, scale]) Object.assign(label.style, {
    position: 'absolute', zIndex: '1', fontSize: '9px', letterSpacing: '1px',
    color: '#cbd5e1', background: 'rgba(9, 14, 25, 0.85)', padding: '3px 5px', borderRadius: '3px'
  })
  Object.assign(heading.style, { top: '8px', left: '8px' })
  Object.assign(orientation.style, { top: '8px', right: '8px', color: '#d0b978' })
  Object.assign(scale.style, { bottom: '8px', left: '12px', padding: '2px 0', borderBottom: '2px solid #94a3b8' })
  scale.textContent = '5 m'
  frame.append(heading, orientation, scale)
  hudRoot.appendChild(frame)
  let visible = false
  let lastTime = null
  let lastState = null
  let stationRoot = null
  let stationFloors = []
  const center = new THREE.Vector2()

  function follow(width, height) {
    const p = player.mesh.position
    const state = getLevelState?.() ?? null
    const carriageMode = CARRIAGE_LEVELS.has(state)
    const volumes = carriageMode ? (getCarriageVolumes?.() ?? null) : null
    const volume = volumes ? carriageVolumeAt(p.z, volumes) : null
    // The wreck escapes toward the locomotive at -Z; the heist runs toward +Z.
    const forward = state === 'Timewreck' ? -1 : 1
    const range = getRange()
    const halfWidth = range / 2
    const halfHeight = halfWidth * height / width

    const now = performance.now()
    const snap = lastTime === null || state !== lastState ||
      Math.hypot(center.x - p.x, center.y - p.z) > Math.min(halfWidth, halfHeight)
    const blend = snap ? 1 : 1 - Math.exp(-Math.min((now - lastTime) / 1000, 0.1) * 10)
    center.x = THREE.MathUtils.lerp(center.x, p.x, blend)
    center.y = THREE.MathUtils.lerp(center.y, p.z + forward * halfHeight * 0.18, blend)
    // Fast movement, respawns and resizing must never leave the marker offscreen.
    center.x = THREE.MathUtils.clamp(center.x, p.x - halfWidth * 0.65, p.x + halfWidth * 0.65)
    center.y = THREE.MathUtils.clamp(center.y, p.z - halfHeight * 0.65, p.z + halfHeight * 0.65)
    camera.left = -halfWidth
    camera.right = halfWidth
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.up.set(0, 0, forward)
    camera.position.set(center.x, p.y + HEIGHT, center.y)
    camera.lookAt(center.x, p.y, center.y)
    camera.updateProjectionMatrix()
    lastTime = now
    lastState = state
    const clip = {
      minX: center.x - halfWidth, maxX: center.x + halfWidth,
      minZ: center.y - halfHeight, maxZ: center.y + halfHeight
    }
    const nearby = volumes?.filter(v => v.maxZ >= clip.minZ && v.minZ <= clip.maxZ) ?? null
    if (!carriageMode) {
      const root = scene.getObjectByName('station') ?? null
      if (root !== stationRoot) {
        stationRoot = root
        stationFloors = collectMinimapFloors(root)
      }
    }
    let floorVolumes = nearby ?? stationFloors.filter(f =>
      Math.abs(f.y - p.y) < 1.5 && visibleInWorld(f.source) &&
      f.maxX >= clip.minX && f.minX <= clip.maxX && f.maxZ >= clip.minZ && f.minZ <= clip.maxZ)
    if (state === 'Timewreck' && nearby) floorVolumes = wreckMinimapFloors(nearby,getVoids?.() ?? [],getSupports?.() ?? [])
    heading.textContent = volume ? volume.key.replaceAll('-', ' ').toUpperCase() : 'STATION'
    orientation.textContent = carriageMode ? 'FRONT ↑' : 'N ↑'
    scale.style.width = `${width * 5 / range}px`
    icons.update({
      clip,
      floorVolumes,
      detailClip: volume,
      unitsPerPixel: halfHeight * 2 / height,
      doors: nearby?.flatMap(v => [
        ...(!v.sealedMin ? [{ x: 0, z: v.minZ }] : []),
        ...(!v.sealedMax ? [{ x: 0, z: v.maxZ }] : [])
      ]),
      extraObstacles: nearby ? [
        ...nearby.flatMap(listCarriageWallBoxes),
        ...listCarriageInteriorBoxes(volume)
      ] : null
    })
  }

  // Called after the main camera render. Scissor keeps the inset from
  // clearing the rest of the canvas; viewport is reset for the next frame
  // at the start of the loop tick.
  function render(renderer) {
    if (!visible || getLevelState?.() === 'Ending') return
    const environment = CARRIAGE_LEVELS.has(getLevelState?.()) ? 'train' : 'station'
    if (frame.dataset.environment !== environment) frame.dataset.environment = environment
    // DOM bounds are the single source for both layout and the GL viewport.
    const rect = frame.getBoundingClientRect()
    const canvas = renderer.domElement.getBoundingClientRect()
    const width = renderer.domElement.clientWidth
    const height = renderer.domElement.clientHeight
    if (!rect.width || !rect.height) return
    const mapWidth = Math.max(1, Math.round(rect.width - 4))
    const mapHeight = Math.max(1, Math.round(rect.height - 4))
    const x = Math.round((rect.left + 2 - canvas.left) * width / canvas.width)
    const y = Math.round((canvas.bottom - rect.bottom + 2) * height / canvas.height)
    follow(mapWidth, mapHeight)

    renderer.setScissorTest(true)
    renderer.setScissor(x, y, mapWidth, mapHeight)
    renderer.setViewport(x, y, mapWidth, mapHeight)
    renderer.clear(true, true, false)
    renderer.render(iconScene, camera)

    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, width, height)
    renderer.setScissor(0, 0, width, height)
  }

  function setVisible(value) {
    if (!value) {
      lastTime = null
      stationRoot = null
      stationFloors.length = 0
    }
    visible = value && getLevelState?.() !== 'Ending'
    frame.style.display = visible ? 'block' : 'none'
  }

  function dispose() {
    icons.dispose()
    frame.remove()
  }

  return { render, setVisible, dispose, camera }
}

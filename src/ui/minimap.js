import * as THREE from 'three'
import { createMinimapIcons, MINIMAP_LAYER } from './minimap-icons.js'
import { carriageVolumeAt, listCarriageWallBoxes, listCarriageInteriorBoxes } from '../environment/carriage-bounds.js'

// Overlay minimap: a second orthographic camera rendered into a scissored
// corner viewport (Three.js multi-view). The camera sees ONLY the unlit
// icon layer (see minimap-icons.js) — not the lit world mesh — because
// station lighting is built for first-person, not a top-down frustum.
//
// Level 1 (Boarding): follow-cam with a fixed square window around the player.
// Levels 2/3 (MovingHeist / Timewreck): frustum snaps to the single carriage
// whose Z-span contains the player. Icon filtering uses the same AABB.

const VIEW_HALF = 14
const HEIGHT = 48
const SIZE_PX = 150
const PAD_RIGHT = 24
const PAD_TOP = 96
const CARRIAGE_FRUSTUM_PAD = 1.2
const CARRIAGE_LEVELS = new Set(['MovingHeist', 'Timewreck'])

export function createMinimap({
  scene,
  hudRoot,
  mainCamera,
  player,
  getObstacles,
  getGuards,
  getLevelState,
  getCarriageVolumes
}) {
  // Main view stays on the default world layer. Icons live on MINIMAP_LAYER
  // so they never appear in the gameplay camera.
  mainCamera.layers.enable(0)
  mainCamera.layers.disable(MINIMAP_LAYER)

  const camera = new THREE.OrthographicCamera(
    -VIEW_HALF, VIEW_HALF,
    VIEW_HALF, -VIEW_HALF,
    1,
    80
  )
  camera.up.set(0, 0, 1) // world +Z is "up" on the map (yaw 0 faces up)
  camera.layers.set(MINIMAP_LAYER)

  const icons = createMinimapIcons({ scene, player, getObstacles, getGuards })

  const frame = document.createElement('div')
  frame.id = 'minimap-frame'
  Object.assign(frame.style, {
    position: 'absolute',
    top: `${PAD_TOP}px`,
    right: `${PAD_RIGHT}px`,
    width: `${SIZE_PX}px`,
    height: `${SIZE_PX}px`,
    boxSizing: 'border-box',
    display: 'none',
    pointerEvents: 'none',
    border: '2px solid rgba(176, 141, 63, 0.8)',
    borderRadius: '8px',
    boxShadow: '0 8px 28px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0, 0, 0, 0.35)',
    background: 'rgba(6, 8, 16, 0.55)'
  })
  hudRoot.appendChild(frame)

  function applyFollowFrustum(p) {
    camera.left = -VIEW_HALF
    camera.right = VIEW_HALF
    camera.top = VIEW_HALF
    camera.bottom = -VIEW_HALF
    camera.updateProjectionMatrix()
    camera.position.set(p.x, p.y + HEIGHT, p.z)
    camera.lookAt(p.x, p.y, p.z)
  }

  // Square ortho window, same as Level 1: uniform X/Z scale from the
  // carriage's longer axis so a long thin car is not stretched to fill the HUD.
  function applyCarriageFrustum(p, volume) {
    const cx = (volume.minX + volume.maxX) * 0.5
    const cz = (volume.minZ + volume.maxZ) * 0.5
    const halfX = (volume.maxX - volume.minX) * 0.5
    const halfZ = (volume.maxZ - volume.minZ) * 0.5
    const half = Math.max(halfX, halfZ) + CARRIAGE_FRUSTUM_PAD
    camera.left = -half
    camera.right = half
    camera.top = half
    camera.bottom = -half
    camera.updateProjectionMatrix()
    camera.position.set(cx, p.y + HEIGHT, cz)
    camera.lookAt(cx, p.y, cz)
  }

  function follow() {
    const p = player.mesh.position
    const state = getLevelState?.() ?? null
    const carriageMode = CARRIAGE_LEVELS.has(state)
    const volumes = carriageMode ? (getCarriageVolumes?.() ?? null) : null
    const volume = volumes ? carriageVolumeAt(p.z, volumes) : null

    if (volume) {
      applyCarriageFrustum(p, volume)
      // Same AABB icon pool as Boarding — perimeter boxes plus any level
      // obstacles (L2 crates). Clip filters that combined list to this car.
      icons.update({
        clip: volume,
        extraObstacles: [
          ...listCarriageWallBoxes(volume),
          ...listCarriageInteriorBoxes(volume)
        ]
      })
      return
    }

    applyFollowFrustum(p)
    icons.update({ clip: null })
  }

  function viewportRect(renderer) {
    const width = renderer.domElement.clientWidth
    const height = renderer.domElement.clientHeight
    const x = width - PAD_RIGHT - SIZE_PX
    const y = height - PAD_TOP - SIZE_PX
    return { x, y, width, height, size: SIZE_PX }
  }

  // Called after the main camera render. Scissor keeps the inset from
  // clearing the rest of the canvas; viewport is reset for the next frame
  // at the start of the loop tick.
  function render(renderer) {
    follow()
    const { x, y, width, height, size } = viewportRect(renderer)

    renderer.setScissorTest(true)
    renderer.setScissor(x, y, size, size)
    renderer.setViewport(x, y, size, size)
    renderer.clear(true, true, false)
    renderer.render(scene, camera)

    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, width, height)
    renderer.setScissor(0, 0, width, height)
  }

  function setVisible(visible) {
    frame.style.display = visible ? 'block' : 'none'
  }

  function dispose() {
    icons.dispose()
    frame.remove()
  }

  return { render, setVisible, dispose, camera }
}

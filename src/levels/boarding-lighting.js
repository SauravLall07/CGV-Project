import * as THREE from 'three'
import { addFloorGlows } from '../environment/landing/light-pools.js'

// Level 1 lighting budget. The light pool hands its 8 real point lights to
// the nearest sources, and a source dropping out of those 8 fades its slot,
// which reads as a lamp popping. So each zone region keeps only a few real
// lights, evenly spread, and every other warm lamp keeps its glowing bulb
// and paints a soft pool on the floor instead. The zones then never show
// more than 8 sources, and nothing is ever reassigned in view.
//
// Coloured accent lights (terminal screens) always stay real; they are
// counted against the region's budget first.

const down = new THREE.Vector3(0, -1, 0)
const box = new THREE.Box3()
const size = new THREE.Vector3()

function isWarm(light) {
  const { r, g, b } = light.color
  return r >= b && g >= r * 0.35 && b <= g
}

// Highest upward-facing large surface under a light, ignoring props.
function floorBelow(light, root, raycaster) {
  const origin = light.getWorldPosition(new THREE.Vector3())
  raycaster.set(origin, down)
  raycaster.far = 14
  for (const hit of raycaster.intersectObject(root, true)) {
    if (!hit.object.isMesh || hit.object.material?.transparent) continue
    if (!hit.face || hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y < 0.6) continue
    box.setFromObject(hit.object).getSize(size)
    if (Math.max(size.x, size.z) < 3) continue
    return { origin, y: hit.point.y }
  }
  return null
}

// regions: [{ root, keep }]. Returns the floor glow mesh (added to `parent`).
export function capRegionLights(regions, parent) {
  const raycaster = new THREE.Raycaster()
  const glows = []
  for (const { root, keep } of regions) {
    root.updateMatrixWorld(true)
    const accents = []
    const warm = []
    root.traverse((node) => {
      if (!node.isPointLight || node.userData.lightPoolSlot) return
      ;(isWarm(node) ? warm : accents).push(node)
    })
    const slots = Math.max(0, keep - accents.length)
    if (warm.length <= slots) continue

    const positions = new Map(warm.map((light) => [light, light.getWorldPosition(new THREE.Vector3())]))
    const xs = warm.map((light) => positions.get(light).x)
    const zs = warm.map((light) => positions.get(light).z)
    const axis = Math.max(...xs) - Math.min(...xs) >= Math.max(...zs) - Math.min(...zs) ? 'x' : 'z'
    warm.sort((a, b) => positions.get(a)[axis] - positions.get(b)[axis])

    const kept = new Set()
    for (let i = 0; i < slots; i += 1) kept.add(warm[Math.floor(((i + 0.5) * warm.length) / slots)])

    for (const light of warm) {
      if (kept.has(light)) continue
      const floor = floorBelow(light, root, raycaster)
      if (floor) {
        const height = Math.max(0.5, floor.origin.y - floor.y)
        glows.push({
          x: floor.origin.x,
          y: floor.y,
          z: floor.origin.z,
          radius: THREE.MathUtils.clamp(height * 0.9 + light.distance * 0.12, 1.4, 3.8),
          strength: THREE.MathUtils.clamp(light.intensity / 70, 0.08, 0.2)
        })
      }
      light.parent.remove(light)
    }
  }
  return addFloorGlows(parent, glows, null, 0xff9e52, 'lamp-floor-glow')
}

import * as THREE from 'three'

// Level 2's interior is a line of closed boxes joined by centred doorways, and
// forward rendering has no idea a bulkhead hides the car behind it: from the
// Passenger car the camera frustum takes in every carriage down the train —
// thousands of draw calls, of which only the nearest car or two can be seen.
//
// Just before the main render this works out which parts of the train the
// camera could possibly see, hides everything else for that one render, and
// restores it straight afterwards. Gameplay, raycasts and the light pool never
// see the hidden state, and nothing about the carriages themselves changes.
//
//  - Camera inside a car: that car is drawn, plus each further car along its
//    chain whose doorway still falls within the screen area left by the
//    doorways before it (portal culling; doors are treated as always open, so
//    it only ever errs towards drawing more). In those further cars, only the
//    meshes whose bounds reach into that screen area are drawn — looking down
//    the aisle, that is a narrow strip of each car. Every car has a solid
//    ceiling, so roof-level objects are not drawn.
//  - Camera outside every car (the roof run): only objects sealed wholly
//    inside a car's hull are skipped. Hulls, the roof and the open freight
//    wagon are still drawn.
//
// Lights are never hidden: taking one out of the render changes the light
// count, and every lit material would then rebuild its shader program.

// Half-thicknesses of the shell pieces built in carriages.js: side walls,
// ceiling slab and bulkhead panels.
const WALL_HALF = 0.06
const CEILING_HALF = 0.05
const BULKHEAD_HALF = 0.07
const EPSILON = 0.01
// Closer than this to a bulkhead, the doorway is nearly edge-on (or the near
// plane may cut through the panel), so the car beyond is drawn outright.
const PORTAL_NEAR = 0.6
// Doorway margin, so rounding never trims a sliver off the view through it.
const PORTAL_MARGIN = 0.05

const _box = new THREE.Box3()
const _inverse = new THREE.Matrix4()
const _camera = new THREE.Vector3()
const _point = new THREE.Vector3()
const _clip = new THREE.Vector4()

export function createCarriageCulling({ root, spans, carriages, chains, wallX, doorW, ceilingY }) {
  // chains: arrays of car keys in Z order; neighbours in a chain share an
  // open doorway. A car's other ends are sealed.
  const hullKeys = chains.flat()
  const chainOf = new Map()
  chains.forEach((chain) => chain.forEach((key, index) => chainOf.set(key, { chain, index })))
  const carriageKey = new Map(Object.entries(carriages).map(([key, group]) => [group, key]))

  // --- Sort the level's objects into zones, once --------------------------
  const zones = new Map() // car key or 'roof' -> top-level objects
  const sealedInside = [] // objects no camera outside the hulls can see
  const addTo = (zone, object) => {
    if (!zones.has(zone)) zones.set(zone, [])
    zones.get(zone).push(object)
  }

  function carriesLight(object) {
    let found = false
    object.traverse((node) => { if (node.isLight && node.visible) found = true })
    return found
  }

  root.updateMatrixWorld(true)
  _inverse.copy(root.matrixWorld).invert()
  function localBox(object) {
    return _box.setFromObject(object).applyMatrix4(_inverse)
  }

  function spanHolding(box) {
    for (const [key, span] of Object.entries(spans)) {
      if (box.min.z >= span.minZ - EPSILON && box.max.z <= span.maxZ + EPSILON) return key
    }
    return null
  }

  function insideHull(box, span) {
    const x = wallX - WALL_HALF - EPSILON
    return box.min.x > -x && box.max.x < x &&
      box.min.y > -EPSILON && box.max.y < ceilingY - CEILING_HALF - EPSILON &&
      box.min.z > span.minZ + BULKHEAD_HALF + EPSILON && box.max.z < span.maxZ - BULKHEAD_HALF - EPSILON
  }

  for (const child of root.children) {
    if (child.isLight || carriesLight(child)) continue

    const key = carriageKey.get(child)
    if (key) {
      addTo(key, child)
      if (!hullKeys.includes(key)) continue
      for (const part of child.children) {
        if (part.isLight || carriesLight(part)) continue
        const box = localBox(part)
        if (!box.isEmpty() && insideHull(box, spans[key])) sealedInside.push(part)
      }
      continue
    }

    const box = localBox(child)
    if (box.isEmpty()) continue
    if (box.min.y >= ceilingY - CEILING_HALF - EPSILON) {
      addTo('roof', child)
      continue
    }
    const span = spanHolding(box)
    if (!span) continue // straddles two cars: always drawn
    addTo(span, child)
    if (hullKeys.includes(span) && insideHull(box, spans[span])) sealedInside.push(child)
  }

  // Every drawable under each car, for the per-mesh doorway test. Only those
  // three.js itself would frustum-cull by bounding sphere qualify: instanced
  // meshes rebuilt every frame opt out with frustumCulled = false, and
  // skinned meshes deform past their bounds.
  const drawables = new Map()
  for (const key of hullKeys) {
    const list = []
    for (const object of zones.get(key) ?? []) {
      object.traverse((node) => {
        if (!(node.isMesh || node.isLine || node.isPoints) || node.isSkinnedMesh || !node.frustumCulled) return
        if (node.isInstancedMesh) {
          if (node.boundingSphere === null) node.computeBoundingSphere()
        } else if (node.geometry.boundingSphere === null) {
          node.geometry.computeBoundingSphere()
        }
        list.push(node)
      })
    }
    drawables.set(key, list)
  }

  // --- Portal walk ---------------------------------------------------------
  const full = () => ({ x0: -1, x1: 1, y0: -1, y1: 1 })
  const polygon = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const clipped = []
  const pool = Array.from({ length: 8 }, () => new THREE.Vector3())

  // Screen rectangle (NDC) covered by the doorway in the bulkhead at local z,
  // or null when none of it is in front of the camera.
  function doorwayRect(z, camera) {
    const hw = doorW / 2 + PORTAL_MARGIN
    polygon[0].set(-hw, -PORTAL_MARGIN, z)
    polygon[1].set(hw, -PORTAL_MARGIN, z)
    polygon[2].set(hw, ceilingY, z)
    polygon[3].set(-hw, ceilingY, z)
    for (const p of polygon) p.applyMatrix4(root.matrixWorld).applyMatrix4(camera.matrixWorldInverse)

    // Clip against the near plane (view space looks down -Z).
    const nearZ = -camera.near
    clipped.length = 0
    for (let i = 0; i < 4; i++) {
      const a = polygon[i]
      const b = polygon[(i + 1) % 4]
      const aIn = a.z <= nearZ
      const bIn = b.z <= nearZ
      if (aIn) clipped.push(pool[clipped.length].copy(a))
      if (aIn !== bIn) {
        const t = (nearZ - a.z) / (b.z - a.z)
        clipped.push(pool[clipped.length].copy(a).lerp(b, t))
      }
    }
    if (clipped.length === 0) return null

    const rect = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }
    for (const p of clipped) {
      _clip.set(p.x, p.y, p.z, 1).applyMatrix4(camera.projectionMatrix)
      const x = _clip.x / _clip.w
      const y = _clip.y / _clip.w
      rect.x0 = Math.min(rect.x0, x)
      rect.x1 = Math.max(rect.x1, x)
      rect.y0 = Math.min(rect.y0, y)
      rect.y1 = Math.max(rect.y1, y)
    }
    return rect
  }

  function narrow(rect, by) {
    if (!by) return null
    const x0 = Math.max(rect.x0, by.x0)
    const x1 = Math.min(rect.x1, by.x1)
    const y0 = Math.max(rect.y0, by.y0)
    const y1 = Math.min(rect.y1, by.y1)
    return x0 < x1 && y0 < y1 ? { x0, x1, y0, y1 } : null
  }

  // Screen area each visible car is seen through; null for the cars the
  // camera is in, which are seen through the whole screen.
  const seenThrough = new Map()
  function see(key, rect) {
    if (!seenThrough.has(key)) {
      seenThrough.set(key, rect)
      return
    }
    const known = seenThrough.get(key)
    if (!known) return
    if (!rect) {
      seenThrough.set(key, null)
      return
    }
    seenThrough.set(key, {
      x0: Math.min(known.x0, rect.x0),
      x1: Math.max(known.x1, rect.x1),
      y0: Math.min(known.y0, rect.y0),
      y1: Math.max(known.y1, rect.y1)
    })
  }

  function walk(chain, index, step, camera) {
    let rect = full()
    for (let i = index; i + step >= 0 && i + step < chain.length; i += step) {
      const span = spans[chain[i]]
      rect = narrow(rect, doorwayRect(step > 0 ? span.maxZ : span.minZ, camera))
      if (!rect) return
      see(chain[i + step], rect)
    }
  }

  // Whether a drawable's bounding sphere lies wholly outside a screen rect.
  // The sphere's projection is bounded conservatively: nearest depth for the
  // outward edge, furthest for the inward one. Anything reaching the near
  // plane is kept.
  const _modelView = new THREE.Matrix4()
  const _centre = new THREE.Vector3()
  const lowest = (a, near, far) => (a >= 0 ? a / far : a / near)
  const highest = (a, near, far) => (a >= 0 ? a / near : a / far)
  function outside(node, rect, camera) {
    const sphere = node.isInstancedMesh ? node.boundingSphere : node.geometry.boundingSphere
    _modelView.multiplyMatrices(camera.matrixWorldInverse, node.matrixWorld)
    _centre.copy(sphere.center).applyMatrix4(_modelView)
    const r = sphere.radius * node.matrixWorld.getMaxScaleOnAxis()
    const depth = -_centre.z
    const near = depth - r
    if (near <= camera.near) return false
    const far = depth + r
    const e = camera.projectionMatrix.elements
    const x0 = e[0] * lowest(_centre.x - r, near, far) - e[8]
    const x1 = e[0] * highest(_centre.x + r, near, far) - e[8]
    const y0 = e[5] * lowest(_centre.y - r, near, far) - e[9]
    const y1 = e[5] * highest(_centre.y + r, near, far) - e[9]
    return x1 < rect.x0 || x0 > rect.x1 || y1 < rect.y0 || y0 > rect.y1
  }

  function carHolding(p) {
    if (p.y <= 0 || p.y >= ceilingY - CEILING_HALF) return null
    if (Math.abs(p.x) >= wallX - WALL_HALF) return null
    for (const key of hullKeys) {
      const span = spans[key]
      if (p.z > span.minZ - BULKHEAD_HALF && p.z < span.maxZ + BULKHEAD_HALF) return key
    }
    return null
  }

  // --- Per render ------------------------------------------------------------
  const hidden = []
  function hide(object) {
    if (!object.visible) return
    object.visible = false
    hidden.push(object)
  }

  function beforeRender(camera) {
    if (!camera?.isPerspectiveCamera) return
    root.worldToLocal(_camera.setFromMatrixPosition(camera.matrixWorld))
    const car = carHolding(_camera)

    if (!car) {
      for (const object of sealedInside) hide(object)
      return
    }

    seenThrough.clear()
    const { chain, index } = chainOf.get(car)
    const starts = [index]
    const span = spans[car]
    if (index > 0 && _camera.z - span.minZ < PORTAL_NEAR) starts.push(index - 1)
    if (index < chain.length - 1 && span.maxZ - _camera.z < PORTAL_NEAR) starts.push(index + 1)
    for (const start of starts) see(chain[start], null)
    for (const start of starts) {
      walk(chain, start, 1, camera)
      walk(chain, start, -1, camera)
    }

    for (const [zone, objects] of zones) {
      if (seenThrough.has(zone)) continue
      for (const object of objects) hide(object)
    }
    for (const [key, rect] of seenThrough) {
      if (!rect) continue
      for (const node of drawables.get(key)) {
        if (node.visible && outside(node, rect, camera)) hide(node)
      }
    }
  }

  function afterRender() {
    for (const object of hidden) object.visible = true
    hidden.length = 0
  }

  return { beforeRender, afterRender }
}

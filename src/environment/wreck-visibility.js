import * as THREE from 'three'

// L3 has open sides: there is no sealed-carriage/doorway visibility chain.
// Only explicitly marked solid box panels can occlude another mesh. Project
// all eight corners of its world AABB onto a panel's camera-facing Z face.
// If every ray crosses strictly inside that rectangle, the entire convex
// bound is behind real geometry. Live matrices handle shake and detachment.
// Shadow casters are never hidden: scene.onBeforeRender precedes shadows.
const MARGIN = 0.03

function ordinaryMesh(mesh) {
  const material = mesh.material
  return mesh.isMesh && !mesh.isSkinnedMesh && !mesh.isInstancedMesh &&
    mesh.children.length === 0 && mesh.frustumCulled &&
    !mesh.morphTargetInfluences?.length && !Array.isArray(material) &&
    (material?.isMeshStandardMaterial || material?.isMeshBasicMaterial ||
      material?.isMeshLambertMaterial || material?.isMeshPhongMaterial) &&
    !material.displacementMap && !material.wireframe && !material.stencilWrite &&
    material.depthTest && material.depthFunc === THREE.LessEqualDepth &&
    material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile
}

function visibleInTree(node, root) {
  for (let p = node; p; p = p.parent) {
    if (!p.visible) return false
    if (p === root) return true
  }
  return false
}

function corners(box, out) {
  for (let i = 0; i < 8; i++) out[i].set(
    i & 1 ? box.max.x : box.min.x,
    i & 2 ? box.max.y : box.min.y,
    i & 4 ? box.max.z : box.min.z)
}

export function createWreckVisibility({ root, carriages, spans, wallX, ceilingY,
  enabled = () => true }) {
  const occluders = []
  const candidates = []
  const hidden = []
  const stats = { candidates: 0, panels: 0, tested: 0, hidden: 0 }
  const eye = new THREE.Vector3()
  const localEye = new THREE.Vector3()
  const point = new THREE.Vector3()
  const cameraLocal = new THREE.Vector3()
  const box = new THREE.Box3()
  const points = Array.from({ length: 8 }, () => new THREE.Vector3())
  const spanEntries = Object.entries(spans)
  let disposed = false

  for (const [key, carriage] of Object.entries(carriages)) {
    carriage.traverse(node => {
      if (!ordinaryMesh(node)) return
      if (node.userData.wreckOccluder && !node.userData.wreckTorn && !node.userData.wreckShell && node.geometry.type === 'BoxGeometry') {
        occluders.push({ node, key, inverse: new THREE.Matrix4(), eye: new THREE.Vector3(),
          face: 0, sign: 1, bounds: new THREE.Box3() })
      } else if (!node.castShadow) candidates.push(node)
    })
  }
  stats.candidates = candidates.length

  function afterRender() {
    for (const node of hidden) node.visible = true
    hidden.length = 0
  }

  function beforeRender(camera, renderer) {
    // Also recover from an interrupted prior render. No simulation runs with
    // our temporary visibility; orthographic/minimap views get the full scene.
    afterRender()
    stats.panels = stats.tested = stats.hidden = 0
    if (disposed || !camera?.isPerspectiveCamera || !enabled() ||
      renderer?.clippingPlanes?.length) return
    root.updateWorldMatrix(true, true)
    camera.updateWorldMatrix(true, false)
    eye.setFromMatrixPosition(camera.matrixWorld)
    cameraLocal.copy(eye); root.worldToLocal(cameraLocal)
    if (cameraLocal.y <= 0.1 || cameraLocal.y >= ceilingY - 0.15 ||
      Math.abs(cameraLocal.x) >= wallX - 0.15) return
    let key = null
    for (const [name, span] of spanEntries) {
      if (cameraLocal.z > span.minZ + 0.25 && cameraLocal.z < span.maxZ - 0.25) {
        key = name; break
      }
    }
    if (!key) return

    // Only the current carriage's real end panels are needed. Open walls,
    // floor holes, door leaves, ceiling strips and effects are never occluders.
    for (const panel of occluders) {
      panel.active = false
      const node = panel.node
      const mat = node.material
      if (panel.key !== key || node.userData.wreckTorn || node.userData.wreckShell || !ordinaryMesh(node) || !visibleInTree(node, root) ||
        !node.layers.test(camera.layers) || mat.transparent || mat.opacity !== 1 ||
        mat.alphaTest || mat.alphaMap || mat.alphaHash || mat.clippingPlanes?.length ||
        !mat.visible || !mat.depthWrite || !mat.depthTest || !mat.colorWrite ||
        node.geometry.drawRange.start !== 0 || node.geometry.drawRange.count !== Infinity ||
        Math.abs(node.matrixWorld.determinant()) < 1e-8) continue
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox()
      panel.bounds.copy(node.geometry.boundingBox)
      corners(panel.bounds, points)
      // Near-plane clipping must not remove the occluding surface.
      let clipped = false
      for (const p of points) {
        if (p.applyMatrix4(node.matrixWorld).applyMatrix4(camera.matrixWorldInverse).z >= -camera.near - MARGIN) {
          clipped = true; break
        }
      }
      if (clipped) continue
      panel.inverse.copy(node.matrixWorld).invert()
      panel.eye.copy(eye).applyMatrix4(panel.inverse)
      panel.sign = panel.eye.z > panel.bounds.max.z + MARGIN ? 1 :
        panel.eye.z < panel.bounds.min.z - MARGIN ? -1 : 0
      if (!panel.sign) continue
      panel.face = panel.sign > 0 ? panel.bounds.max.z : panel.bounds.min.z
      panel.active = true
      stats.panels++
    }
    if (!stats.panels) return

    for (const node of candidates) {
      if (!ordinaryMesh(node) || node.castShadow || !visibleInTree(node, root) ||
        !node.layers.test(camera.layers)) continue
      const geometry = node.geometry
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      box.copy(geometry.boundingBox).applyMatrix4(node.matrixWorld).expandByScalar(MARGIN)
      if (box.isEmpty() || !Number.isFinite(box.min.x + box.max.x + box.min.y + box.max.y + box.min.z + box.max.z)) continue
      corners(box, points)
      stats.tested++
      for (const panel of occluders) {
        if (!panel.active) continue
        localEye.copy(panel.eye)
        const b = panel.bounds
        let covered = true
        for (const corner of points) {
          point.copy(corner).applyMatrix4(panel.inverse)
          // Entire candidate must be beyond the panel's far face.
          if (panel.sign * (point.z - (panel.sign > 0 ? b.min.z : b.max.z)) >= -MARGIN) {
            covered = false; break
          }
          const t = (panel.face - localEye.z) / (point.z - localEye.z)
          const x = localEye.x + t * (point.x - localEye.x)
          const y = localEye.y + t * (point.y - localEye.y)
          if (t <= 0 || t >= 1 || x <= b.min.x + MARGIN || x >= b.max.x - MARGIN ||
            y <= b.min.y + MARGIN || y >= b.max.y - MARGIN) { covered = false; break }
        }
        if (!covered) continue
        node.visible = false
        hidden.push(node)
        stats.hidden++
        break
      }
    }
  }

  return { beforeRender, afterRender, getStats: () => ({ ...stats }),
    dispose() { afterRender(); disposed = true; candidates.length = occluders.length = 0 } }
}

// Chain, rather than replace, existing scene hooks. All temporary visibility is
// restored before the owner's after hook; disposal leaves newer owners intact.
export function installWreckVisibility(scene, visibility) {
  const previousBefore = scene.onBeforeRender
  const previousAfter = scene.onAfterRender
  function before(renderer, world, camera, ...args) {
    previousBefore.call(this, renderer, world, camera, ...args)
    try { visibility.beforeRender(camera, renderer) }
    catch (error) { visibility.afterRender(); throw error }
  }
  function after(...args) {
    visibility.afterRender()
    previousAfter.apply(this, args)
  }
  scene.onBeforeRender = before
  scene.onAfterRender = after
  return () => {
    visibility.dispose()
    if (scene.onBeforeRender === before) scene.onBeforeRender = previousBefore
    if (scene.onAfterRender === after) scene.onAfterRender = previousAfter
  }
}

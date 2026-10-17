import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createMoonlitValley } from './moonlit-valley.js'
import { createSkyDome } from './sky-dome.js'
import { RAIL_OFFSET } from '../entities/train.js'
import { disposeObject } from '../core/dispose.js'
import { createEndingLandmarks, TUNNEL_PORTAL_Z } from './ending-landmarks.js'

export const GORGE_DROP = 45
export const BRIDGE_END = TUNNEL_PORTAL_Z
export const GAP_START = 0
export const GAP_END = -9
export const STUB_END = -40
const BENT_SPACING = 7
const BRACE_HEIGHT = 8
const SLEEPER_SPACING = 0.6
const MOON_DISTANCE = 400
const MOON_SIZE = 28
const ROOF_MOON_DIRECTION = new THREE.Vector3(-0.75, 0.6, -0.28).normalize()

export function createEndingGorge(scene, cameraPosition = new THREE.Vector3(95, 40, -20),
  cameraTarget = new THREE.Vector3(0, -2, 25), fov = 45) {
  const root = new THREE.Group()
  root.name = 'ending-gorge'
  const sky = createSkyDome('moving-heist')
  const shotRotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(cameraPosition, cameraTarget, new THREE.Vector3(0, 1, 0)))
  // A direction through NDC (+.74,+.81), at the reference 16:9 aspect.
  sky.uniforms.uMoonDirection.value.set(0.74 * (16 / 9) * Math.tan(THREE.MathUtils.degToRad(fov / 2)),
    0.81 * Math.tan(THREE.MathUtils.degToRad(fov / 2)), -1).normalize().applyQuaternion(shotRotation)
  const valley = createMoonlitValley({ static: true, speed: 0, rails: false, poles: false,
    centerZ: 45, offsetY: -GORGE_DROP, valleySide: -1, omitHillSide: false,
    fogColor: sky.horizonColor })
  root.add(valley.group)
  // Every material and instance buffer belongs to this valley factory invocation.
  const darkened = new Set()
  const treeMatrix = new THREE.Matrix4(), treePosition = new THREE.Vector3()
  const removed = { trees: 0, bushes: 0 }
  valley.group.updateMatrixWorld(true)
  valley.group.traverse(node => {
    if (node.material && !darkened.has(node.material)) {
      darkened.add(node.material)
      node.material.color?.multiplyScalar(node.name.startsWith('mountain-ring') ? 0.4 : 0.2)
      if (node.material.alphaTest) node.material.alphaTest = 0.65
    }
    const trees = node.name.startsWith('pine-forest')
    if (!node.isInstancedMesh || (!trees && node.name !== 'moonlit-valley-bushes')) return
    for (let i = 0; i < node.count; i++) {
      node.getMatrixAt(i, treeMatrix)
      treePosition.setFromMatrixPosition(treeMatrix).applyMatrix4(node.matrixWorld)
      const inFrontOfCliff = (treePosition.z > TUNNEL_PORTAL_Z - 30 && treePosition.z < TUNNEL_PORTAL_Z + 5)
        || (treePosition.z > -40 && treePosition.z < -8)
      const hash = Math.abs(Math.sin(i * 127.1 + node.parent.position.z * 0.13))
      if (Math.abs(treePosition.x) < 35 || inFrontOfCliff || treePosition.distanceTo(cameraPosition) > 450
        || (Math.abs(treePosition.x) < 140 && hash < 0.55)) {
        treeMatrix.makeScale(0, 0, 0)
        removed[trees ? 'trees' : 'bushes']++
      } else treeMatrix.scale(new THREE.Vector3(1, 0.65 + hash * 0.45, 1))
      node.setMatrixAt(i, treeMatrix)
    }
    node.instanceMatrix.needsUpdate = true
    node.computeBoundingBox(); node.computeBoundingSphere()
  })
  root.userData.removedInstances = removed
  const hiddenGround = []
  for (const chunk of valley.chunks) {
    // The new rock masses replace the entire near basin; retain the distant ring/forest.
    if (chunk.group.position.z >= -320 && chunk.group.position.z <= 320) {
      chunk.ground.visible = false
      hiddenGround.push(chunk.ground.parent.name)
    }
  }
  valley.group.traverse(node => {
    if (!node.isInstancedMesh || node.name.startsWith('mountain-ring')) return
    for (let i = 0; i < node.count; i++) {
      node.getMatrixAt(i, treeMatrix)
      treePosition.setFromMatrixPosition(treeMatrix).applyMatrix4(node.matrixWorld)
      if (treePosition.x > -220 && treePosition.x < 240 && treePosition.z > -180 && treePosition.z < 225) {
        treeMatrix.makeScale(0, 0, 0); node.setMatrixAt(i, treeMatrix)
      }
    }
    node.instanceMatrix.needsUpdate = true; node.computeBoundingBox(); node.computeBoundingSphere()
  })
  root.userData.hiddenGroundChunks = hiddenGround
  sky.uniforms.uCloudAmount.value = 0
  sky.uniforms.uStarDensity.value = 0.008
  sky.uniforms.uStarBrightness.value = 0.7
  function terrainHeightAt(x, z) {
    const chunk = valley.chunks.find(entry => z >= entry.group.position.z && z <= entry.group.position.z + 160)
    return (chunk ? valley.surfaceHeightAt(chunk, x, z) : valley.heightAt(x, z)) + valley.group.position.y
  }
  const instanceMatrix = new THREE.Matrix4()
  const worldMatrix = new THREE.Matrix4()
  const box = new THREE.Box3()
  const corridor = new THREE.Box3(new THREE.Vector3(-12, -10000, -60), new THREE.Vector3(12, 10000, 150))
  const clearance = { minHeight: Infinity, maxHeight: -Infinity, maxPropHeight: -Infinity,
    cameraTerrainMin: Infinity, cameraTerrainMax: -Infinity, nearestPropDistance: Infinity, gorgeDrop: GORGE_DROP }
  function sampleClearance() {
    clearance.minHeight = Infinity; clearance.maxHeight = -Infinity
    clearance.cameraTerrainMin = Infinity; clearance.cameraTerrainMax = -Infinity
    clearance.maxPropHeight = -Infinity; clearance.nearestPropDistance = Infinity
    for (let z = 150; z >= -60; z -= 5) for (const x of [-12, 0, 12]) {
      const height = terrainHeightAt(x, z)
      clearance.minHeight = Math.min(clearance.minHeight, height)
      clearance.maxHeight = Math.max(clearance.maxHeight, height)
    }
    for (const dx of [-8, 0, 8]) for (const dz of [-8, 0, 8]) {
      const height = terrainHeightAt(cameraPosition.x + dx, cameraPosition.z + dz)
      clearance.cameraTerrainMin = Math.min(clearance.cameraTerrainMin, height)
      clearance.cameraTerrainMax = Math.max(clearance.cameraTerrainMax, height)
    }
    root.updateMatrixWorld(true)
    valley.group.traverse(node => {
      if (!node.isInstancedMesh) return
      node.geometry.computeBoundingBox()
      for (let i = 0; i < node.count; i++) {
        node.getMatrixAt(i, instanceMatrix)
        worldMatrix.multiplyMatrices(node.matrixWorld, instanceMatrix)
        box.copy(node.geometry.boundingBox).applyMatrix4(worldMatrix)
        if (box.intersectsBox(corridor)) clearance.maxPropHeight = Math.max(clearance.maxPropHeight, box.max.y)
        clearance.nearestPropDistance = Math.min(clearance.nearestPropDistance, box.distanceToPoint(cameraPosition))
      }
    })
  }
  sampleClearance()
  const extraDrop = Math.max(0, clearance.maxHeight + 7, clearance.maxPropHeight + 7,
    clearance.cameraTerrainMax - cameraPosition.y + 9, clearance.nearestPropDistance < 8 ? 16 : 0)
  if (extraDrop > 0) {
    valley.group.position.y -= extraDrop
    clearance.gorgeDrop += extraDrop
    sampleClearance()
  }
  root.userData.clearance = clearance
  const landmarks = createEndingLandmarks(terrainHeightAt)
  root.add(landmarks.root)
  const heightAt = landmarks.heightAt
  root.userData.heightAt = heightAt

  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.85 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x252c36, roughness: 0.6, metalness: 0.65 })
  const timberParts = []
  const railParts = []
  const guardPosts = []
  const pose = new THREE.Object3D()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), direction = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  function timber(x, y, z, sx, sy, sz, rx = 0, rz = 0) {
    pose.position.set(x, y, z); pose.rotation.set(rx, 0, rz); pose.scale.set(sx, sy, sz)
    pose.updateMatrix(); timberParts.push(pose.matrix.clone())
  }
  function beam(ax, ay, az, bx, by, bz, width = 0.3) {
    a.set(ax, ay, az); b.set(bx, by, bz)
    direction.subVectors(b, a)
    pose.position.copy(a).add(b).multiplyScalar(0.5)
    pose.quaternion.setFromUnitVectors(up, direction.normalize())
    pose.scale.set(width, a.distanceTo(b), width)
    pose.updateMatrix(); timberParts.push(pose.matrix.clone())
  }
  function section(start, end, brokenStart, brokenEnd) {
    for (let z = start + 0.3; z < end; z += SLEEPER_SPACING) {
      const broken = (brokenStart && z < start + 1.5) || (brokenEnd && z > end - 1.5)
      if (broken && Math.floor(Math.abs(z) * 10) % 3 === 0) continue
      timber(broken ? Math.sin(z * 9) * 0.1 : 0, -0.28, z, 3.2, 0.26, 0.25,
        broken ? Math.sin(z * 7) * 0.12 : 0)
    }
    for (const side of [-1, 1]) timber(side * 1.35, -0.62, (start + end) / 2, 0.42, 0.5, end - start)
    let lastZ = null
    for (let z = start + BENT_SPACING / 2; z < end - 1; z += BENT_SPACING) {
      const floor = heightAt(0, z)
      for (const side of [-1, 1]) beam(side * 1.25, -0.85, z, side * 2.1, heightAt(side * 2.1, z), z, 0.42)
      timber(0, -0.94, z, 3.6, 0.5, 0.6)
      for (let y = -2; y > floor + 0.5; y -= BRACE_HEIGHT) {
        const low = Math.max(floor + 0.2, y - BRACE_HEIGHT)
        timber(0, low, z, 4.2, 0.25, 0.3)
        if (lastZ !== null) for (const side of [-1, 1]) {
          beam(side * 1.65, y, lastZ, side * 1.65, low, z, 0.24)
          beam(side * 1.65, low, lastZ, side * 1.65, y, z, 0.24)
        }
      }
      lastZ = z
    }
    for (const x of [-RAIL_OFFSET, RAIL_OFFSET]) {
      const geometry = new THREE.BoxGeometry(0.1, 0.16, end - start)
      geometry.translate(x, -0.08, (start + end) / 2); railParts.push(geometry)
    }
    for (let z = start + 0.3; z < end; z += 0.6) timber(2.15, -0.12, z, 0.9, 0.14, 0.55)
    for (let z = start + 1.2; z < end; z += 2.4) {
      timber(2.15, -0.5, z, 1.7, 0.2, 0.2)
      timber(2.7, 0.55, z, 0.12, 1.1, 0.12)
      guardPosts.push({ x: 2.7, z })
    }
    timber(2.7, 1.1, (start + end) / 2, 0.1, 0.1, end - start)
  }
  section(0, BRIDGE_END, true, false)
  section(STUB_END, GAP_END, false, true)
  function brokenEnd(edge, sign, depth, sleepers) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const t0 = i / 8, t1 = (i + 1) / 8
        a.set(side * (RAIL_OFFSET + t0 * 0.2), -0.08 - depth * t0 * t0, edge + sign * 2.7 * t0)
        b.set(side * (RAIL_OFFSET + t1 * 0.2), -0.08 - depth * t1 * t1, edge + sign * 2.7 * t1)
        direction.subVectors(b, a)
        const rail = new THREE.BoxGeometry(0.1, direction.length(), 0.13)
        pose.position.copy(a).add(b).multiplyScalar(0.5)
        pose.quaternion.setFromUnitVectors(up, direction.normalize()); pose.scale.setScalar(1); pose.updateMatrix()
        rail.applyMatrix4(pose.matrix); railParts.push(rail)
      }
      // Stepped splinters taper to distinct tips while retaining the shared unit-box mesh.
      for (let shard = 0; shard < 4; shard++) for (let step = 0; step < 3; step++) {
        timber(side * 1.35 + (shard - 1.5) * 0.075, -0.6 - step * 0.13,
          edge + sign * (0.12 + step * 0.22 + shard * 0.08), 0.09 - step * 0.02, 0.22 - step * 0.05, 0.35,
          sign * (0.15 + shard * 0.08))
      }
    }
    for (let i = 0; i < sleepers; i++) {
      const t = (i + 1) / (sleepers + 1)
      timber(0, -0.25 - depth * t * t, edge + sign * 2.7 * t, 3.2, 0.2, 0.23, sign * (0.2 + i * 0.19), (i - 1) * 0.16)
    }
  }
  brokenEnd(0, -1, 5.5, 4)
  brokenEnd(-9, 1, 3, 2)
  beam(-1.25, -1, 1.8, -4, -7, 4.6, 0.42)
  beam(1.25, -1, 1.8, 2.7, -4.1, 3.2, 0.42)
  timber(-0.3, -1.3, 1.8, 3.6, 0.45, 0.6, 0, THREE.MathUtils.degToRad(25))
  const rails = new THREE.Mesh(mergeGeometries(railParts), steel)
  railParts.forEach(geometry => geometry.dispose())
  rails.name = 'ending-steel-rails'
  root.add(rails)
  root.userData.guardPosts = guardPosts
  const timberMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wood, timberParts.length)
  timberMesh.name = 'ending-all-timber'
  timberParts.forEach((matrix, i) => timberMesh.setMatrixAt(i, matrix))
  timberMesh.instanceMatrix.needsUpdate = true
  timberMesh.computeBoundingSphere()
  root.add(timberMesh)

  // Preserve the roof sky; replace only its angular moon disc with a screen-facing circle.
  // Off-axis angular discs stretch under perspective. A view-parallel plane does not.
  const moonDirection = sky.uniforms.uMoonDirection.value
  sky.uniforms.uMoonStrength.value = 0
  const moonPixels = new Uint8Array(128 * 128 * 4)
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const radius = Math.hypot((x - 63.5) / 63.5, (y - 63.5) / 63.5)
    const alpha = radius < 0.72 ? 1 : Math.max(0, 1 - (radius - 0.72) / 0.26) * 0.16
    const index = (y * 128 + x) * 4
    moonPixels[index] = 242; moonPixels[index + 1] = 246; moonPixels[index + 2] = 255
    moonPixels[index + 3] = Math.round(alpha * 255)
  }
  const moonMap = new THREE.DataTexture(moonPixels, 128, 128)
  moonMap.colorSpace = THREE.SRGBColorSpace
  moonMap.needsUpdate = true
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(MOON_SIZE, MOON_SIZE),
    new THREE.MeshBasicMaterial({ map: moonMap, color: 0xffffff, transparent: true,
      depthWrite: false, fog: false, toneMapped: false }))
  moon.name = 'ending-round-moon'
  moon.position.copy(cameraPosition).addScaledVector(moonDirection, MOON_DISTANCE)
  moon.onBeforeRender = (_renderer, _scene, camera) => {
    camera.getWorldQuaternion(moon.quaternion)
    moon.updateMatrixWorld(true)
  }
  root.add(sky.mesh, moon)
  const fill = new THREE.HemisphereLight(0x3d5a8a, 0x141a24, 1.1)
  const moonlight = new THREE.DirectionalLight(0xa9bfe6, 2)
  moonlight.target.position.set(0, 0, 22)
  moonlight.position.copy(moonlight.target.position).addScaledVector(ROOF_MOON_DIRECTION, 50)
  root.add(fill, moonlight, moonlight.target)
  scene.add(root)
  scene.background = new THREE.Color(0x1a1a2e)
  scene.fog = new THREE.Fog(sky.horizonColor, 60, 650)
  scene.fog.color = sky.horizonColor
  scene.environment = null
  let disposed = false
  return { root, valley, clearance, heightAt, timberCount: timberParts.length, update: delta => sky.update(delta),
    dispose() {
      if (disposed) return
      disposed = true
      root.removeFromParent()
      valley.group.removeFromParent()
      valley.dispose()
      sky.mesh.removeFromParent()
      sky.dispose()
      disposeObject(root)
    } }
}

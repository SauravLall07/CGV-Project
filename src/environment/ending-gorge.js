import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createMoonlitValley } from './moonlit-valley.js'
import { createSkyDome } from './sky-dome.js'
import { RAIL_OFFSET } from '../entities/train.js'
import { disposeObject } from '../core/dispose.js'
import { createEndingLandmarks, HILLSIDE_START_Z } from './ending-landmarks.js'
import { createEndingRiverMaterial } from '../shaders/ending-river.js'

export const GORGE_DROP = 82.5
export const BRIDGE_END = HILLSIDE_START_Z
export const GAP_START = 0
export const GAP_END = -12
export const STUB_END = -20
const BENT_SPACING = 6
const BRACE_HEIGHT = 12
const SLEEPER_SPACING = 0.6
const MOON_DISTANCE = 400
const MOON_SIZE = 28

export function createEndingGorge(scene, cameraPosition = new THREE.Vector3(95, 40, -20),
  cameraTarget = new THREE.Vector3(0, -2, 25), fov = 45) {
  const root = new THREE.Group()
  root.name = 'ending-gorge'
  const sky = createSkyDome('moving-heist')
  const shotRotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(cameraPosition, cameraTarget, new THREE.Vector3(0, 1, 0)))
  // A direction through the key frame's moon centre, at the reference 16:9 aspect.
  sky.uniforms.uMoonDirection.value.set(0.78 * (16 / 9) * Math.tan(THREE.MathUtils.degToRad(fov / 2)),
    0.88 * Math.tan(THREE.MathUtils.degToRad(fov / 2)), -1).normalize().applyQuaternion(shotRotation)
  const valley = createMoonlitValley({ static: true, speed: 0, rails: false, poles: false,
    centerZ: 45, offsetY: -GORGE_DROP, valleySide: -1, omitHillSide: false,
    fogColor: sky.horizonColor })
  root.add(valley.group)
  // The camera is above the canyon. Place the owned distant ridges below its horizon.
  const ring = valley.group.getObjectByName('moonlit-mountain-ring')
  ring.children.forEach((mesh, i) => {
    mesh.position.y -= i === 0 ? 330 : 520
    const position = mesh.geometry.attributes.position, colors = mesh.geometry.attributes.color
    const snow = new THREE.Color(0x9aacc8), tint = new THREE.Color()
    for (let vertex = 0; vertex < position.count; vertex++) {
      const amount = THREE.MathUtils.smoothstep(position.getY(vertex), i === 0 ? 180 : 290, i === 0 ? 280 : 400)
      tint.fromBufferAttribute(colors, vertex).lerp(snow, amount * 0.45)
      colors.setXYZ(vertex, tint.r, tint.g, tint.b)
    }
    colors.needsUpdate = true
  })
  // Every material and instance buffer belongs to this valley factory invocation.
  const darkened = new Set()
  const treeMatrix = new THREE.Matrix4(), treePosition = new THREE.Vector3()
  const removed = { trees: 0, bushes: 0 }
  valley.group.updateMatrixWorld(true)
  valley.group.traverse(node => {
    if (node.material && !darkened.has(node.material)) {
      darkened.add(node.material)
      node.material.color?.multiplyScalar(node.name.startsWith('mountain-ring') ? 1 : 0.8)
      if (node.material.alphaTest) node.material.alphaTest = 0.65
    }
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
  const landmarks = createEndingLandmarks(terrainHeightAt, cameraPosition)
  root.add(landmarks.root)
  const heightAt = landmarks.heightAt
  root.userData.heightAt = heightAt
  const retained = { trees: 0, bushes: 0 }
  valley.group.traverse(node => {
    const trees = node.name.startsWith('pine-forest'), bushes = node.name === 'moonlit-valley-bushes'
    if (!node.isInstancedMesh || (!trees && !bushes)) return
    for (let i = 0; i < node.count; i++) {
      node.getMatrixAt(i, treeMatrix)
      treePosition.setFromMatrixPosition(treeMatrix).applyMatrix4(node.matrixWorld)
      const distance = treePosition.distanceTo(cameraPosition)
      const track = Math.abs(treePosition.x) < 8 && treePosition.z > -25 && treePosition.z < 260
      if (distance < 120 || distance > 850 || track) {
        treeMatrix.makeScale(0, 0, 0); removed[trees ? 'trees' : 'bushes']++
      } else {
        if (treePosition.x >= -280 && treePosition.x <= 90 && treePosition.z >= -110 && treePosition.z <= 260) {
          treeMatrix.elements[13] += heightAt(treePosition.x, treePosition.z) - treePosition.y
        }
        retained[trees ? 'trees' : 'bushes']++
      }
      node.setMatrixAt(i, treeMatrix)
    }
    node.instanceMatrix.needsUpdate = true; node.computeBoundingBox(); node.computeBoundingSphere()
  })
  root.userData.retainedValleyFoliage = retained
  landmarks.river.material.dispose()
  landmarks.river.material = createEndingRiverMaterial()
  const riverUniforms = landmarks.river.material.uniforms

  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 })
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
  function beam(ax, ay, az, bx, by, bz, width = 0.35, depth = width) {
    a.set(ax, ay, az); b.set(bx, by, bz)
    direction.subVectors(b, a)
    pose.position.copy(a).add(b).multiplyScalar(0.5)
    pose.quaternion.setFromUnitVectors(up, direction.normalize())
    pose.scale.set(width, a.distanceTo(b), depth)
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
      if (start < 0) continue
      for (const side of [-1, 1]) beam(side * 1.25, -0.85, z, side * 2.1, heightAt(side * 2.1, z), z, 0.6)
      timber(0, -0.94, z, 3.6, 0.5, 0.6)
      for (let y = -2; y > floor + 0.5; y -= BRACE_HEIGHT) {
        const low = Math.max(floor + 0.2, y - BRACE_HEIGHT)
        timber(0, low, z, 4.2, 0.3, 0.35)
        if (lastZ !== null) for (const side of [-1, 1]) {
          const mid = (y + low) / 2
          for (const range of [[y, mid], [mid, low]]) {
            beam(side * 1.65, range[0], lastZ, side * 1.65, range[1], z, 0.35, 0.25)
            beam(side * 1.65, range[1], lastZ, side * 1.65, range[0], z, 0.35, 0.25)
          }
        }
      }
      lastZ = z
    }
    for (const x of [-RAIL_OFFSET, RAIL_OFFSET]) {
      const geometry = new THREE.BoxGeometry(0.1, 0.16, end - start)
      geometry.translate(x, -0.08, (start + end) / 2); railParts.push(geometry)
    }
    for (const side of [-1, 1]) timber(side * 1.75, 0.05, (start + end) / 2, 0.22, 0.3, end - start)
    if (start >= 0) return
    for (let z = start + 1.2; z < end; z += 2.4) {
      timber(1.75, 0.55, z, 0.18, 1.1, 0.18)
      guardPosts.push({ x: 1.75, z })
    }
    timber(1.75, 1.1, (start + end) / 2, 0.16, 0.16, end - start)
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
  brokenEnd(-12, 1, 3, 1)
  beam(-1.25, -1, 1.8, -4, -7, 4.6, 0.42)
  beam(1.25, -1, 1.8, 2.7, -4.1, 3.2, 0.42)
  timber(-0.3, -1.3, 1.8, 3.6, 0.45, 0.6, 0, THREE.MathUtils.degToRad(25))
  const rails = new THREE.Mesh(mergeGeometries(railParts), steel)
  railParts.forEach(geometry => geometry.dispose())
  rails.name = 'ending-steel-rails'
  root.add(rails)
  root.userData.guardPosts = guardPosts
  root.userData.bentCount = Math.ceil((BRIDGE_END - BENT_SPACING / 2) / BENT_SPACING)
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
  const fill = new THREE.HemisphereLight(0x34467a, 0x0e1118, 1)
  const moonlight = new THREE.DirectionalLight(0xc4d2ff, 1.8)
  moonlight.target.position.set(0, 0, 22)
  moonlight.position.copy(moonlight.target.position).addScaledVector(moonDirection, 50)
  root.add(fill, moonlight, moonlight.target)
  scene.add(root)
  scene.background = new THREE.Color(0x1a1a2e)
  scene.fog = new THREE.Fog(0x1b2340, 90, 900)
  scene.environment = null
  let disposed = false
  return { root, valley, clearance, heightAt, timberCount: timberParts.length, update(delta) {
    sky.update(delta)
    riverUniforms.uTime.value += Math.max(0, delta) * riverUniforms.uFlowScale.value
  },
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

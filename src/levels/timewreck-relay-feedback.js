import * as THREE from 'three'

// Render-only adapter to the real release/echo/catch state. Own no puzzle clock,
// occupancy, collisions or lights; all resources live under the level's root.
export function createRelayFeedback({ doors, linkage, doorZ, catchZ, brass }) {
  const material = new THREE.MeshStandardMaterial({
    color: 0x27454b, emissive: 0x38bdf8, emissiveIntensity: 0.55, roughness: 0.65
  })
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.12, 0.035), material, 8)
  bars.name = 'relay-echo-hold-bars'
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  bars.frustumCulled = false // Tiny fixed display; no stale instance bounds after a reset.
  doors.add(bars)
  const catchLink = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, doorZ - catchZ), brass)
  catchLink.name = 'relay-catch-linkage'
  catchLink.position.set(0.69, 0.04, (doorZ + catchZ) / 2)
  doors.add(catchLink)
  linkage.name = 'relay-release-linkage'
  linkage.userData.noCameraCollision = true
  const pose = new THREE.Object3D()
  bars.userData.noCameraCollision = catchLink.userData.noCameraCollision = true
  let previousFill = null
  let previousColor = null
  function update(held, echoSeconds, latched) {
    // Eight bars drain with actual echo lifetime. A physical occupant keeps
    // the row full; an unheld release collapses it to eight short tick marks.
    const fill = latched || (held && echoSeconds === 0) ? 8 : held ? Math.min(8, echoSeconds) : 0
    if (fill !== previousFill) {
      for (let i = 0; i < 8; i++) {
        pose.position.set((i - 3.5) * 0.15, 2.78, doorZ + 0.3)
        pose.scale.set(1, 0.12 + 0.88 * THREE.MathUtils.clamp(fill - i, 0, 1), 1)
        pose.updateMatrix()
        bars.setMatrixAt(i, pose.matrix)
      }
      bars.instanceMatrix.needsUpdate = true
      previousFill = fill
    }
    const color = latched ? 0x55ff99 : held ? 0x38bdf8 : 0xffb060
    if (color !== previousColor) {
      material.emissive.setHex(color)
      previousColor = color
    }
    const releaseY = held ? 0.025 : 0.04
    const catchY = latched ? 0.025 : 0.04
    if (linkage.position.y !== releaseY) linkage.position.y = releaseY
    if (catchLink.position.y !== catchY) catchLink.position.y = catchY
  }
  update(false, 0, false)
  return { update }
}

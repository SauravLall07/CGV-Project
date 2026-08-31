import * as THREE from 'three'

// Greyboxed slice of Level 1 (the boarding station): a platform, a handful
// of structural placeholders, and static (non-functional) guard/camera
// placeholders that signal "stealth happens here" without any detection
// logic existing yet. Primitive geometry only — no modelled/textured
// station assets belong here.

export const PLATFORM_WIDTH = 10
export const PLATFORM_LENGTH = 40

// Axis-aligned bounds the player is clamped to, inset from the platform
// edges by roughly the player's radius so it reads as "blocked by the wall
// / can't walk off the edge" rather than a hard geometric wall.
const BOUNDS_MARGIN = 0.6
export const bounds = {
  minX: -PLATFORM_WIDTH / 2 + BOUNDS_MARGIN,
  maxX: PLATFORM_WIDTH / 2 - BOUNDS_MARGIN,
  minZ: -PLATFORM_LENGTH / 2 + BOUNDS_MARGIN,
  maxZ: PLATFORM_LENGTH / 2 - BOUNDS_MARGIN
}

function createFloor() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(PLATFORM_WIDTH, PLATFORM_LENGTH),
    new THREE.MeshStandardMaterial({ color: 0x9c8267 })
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  return floor
}

function createWall() {
  // Runs the length of the platform on the side away from the train, just
  // enough to establish "you are inside a station," not a modelled facade.
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 5, PLATFORM_LENGTH),
    new THREE.MeshStandardMaterial({ color: 0x6b6259 })
  )
  wall.position.set(-PLATFORM_WIDTH / 2 - 0.25, 2.5, 0)
  wall.castShadow = true
  wall.receiveShadow = true
  return wall
}

function createPillars() {
  const pillarGeometry = new THREE.CylinderGeometry(0.3, 0.3, 4, 12)
  const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x5c5c5c })
  const positions = [-14, 0, 14]

  return positions.map((z) => {
    const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial)
    pillar.position.set(PLATFORM_WIDTH / 2 - 1, 2, z)
    pillar.castShadow = true
    pillar.receiveShadow = true
    return pillar
  })
}

function createPlatformEdge() {
  // Marks the far end of the platform, standing in for the drop to track
  // level.
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM_WIDTH, 0.3, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xd9c48f })
  )
  edge.position.set(0, 0.15, PLATFORM_LENGTH / 2 - 0.2)
  edge.receiveShadow = true
  return edge
}

function createGuardPlaceholder() {
  // Static box standing in for a guard near a doorway. Non-functional — no
  // patrol/detection logic exists yet.
  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 1.8, 0.6),
    new THREE.MeshStandardMaterial({ color: 0xb33636 })
  )
  guard.name = 'guard-placeholder'
  guard.position.set(2.5, 0.9, 8)
  guard.castShadow = true
  return guard
}

function createCameraPlaceholder() {
  // Small box (housing) + cylinder (lens) mounted on the wall, standing in
  // for a security camera. Non-functional — no detection cone exists yet.
  const placeholder = new THREE.Group()
  placeholder.name = 'camera-placeholder'

  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.3, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x2b2b2b })
  )
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  )
  lens.rotation.z = Math.PI / 2
  lens.position.x = 0.3

  placeholder.add(housing, lens)
  placeholder.position.set(-PLATFORM_WIDTH / 2 + 0.4, 3.5, -8)
  placeholder.castShadow = true
  return placeholder
}

export function createStationBlockout() {
  const group = new THREE.Group()
  group.name = 'station-blockout'

  group.add(createFloor())
  group.add(createWall())
  group.add(createPlatformEdge())
  for (const pillar of createPillars()) group.add(pillar)
  group.add(createGuardPlaceholder())
  group.add(createCameraPlaceholder())

  return { group, bounds }
}

// Warm, station-appropriate lighting for Level 1's visual identity — replaces
// the setup plan's flat ambient+directional test lighting. Kept to a handful
// of lights; this is about establishing mood, not final lighting design.
export function createStationLighting() {
  const sunlight = new THREE.DirectionalLight(0xffb066, 1.6)
  sunlight.position.set(6, 10, 4)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(1024, 1024)
  sunlight.shadow.camera.left = -20
  sunlight.shadow.camera.right = 20
  sunlight.shadow.camera.top = 20
  sunlight.shadow.camera.bottom = -20
  sunlight.shadow.camera.far = 40

  const lampA = new THREE.PointLight(0xffa552, 1.3, 16)
  lampA.position.set(-3, 3.2, -8)

  const lampB = new THREE.PointLight(0xffa552, 1.3, 16)
  lampB.position.set(-3, 3.2, 8)

  const coolAmbient = new THREE.AmbientLight(0x6b7a99, 0.55)

  return [sunlight, lampA, lampB, coolAmbient]
}

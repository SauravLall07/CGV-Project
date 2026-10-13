import * as THREE from 'three'

// Image-based lighting shared by every level. With no scene.environment, a
// metallic MeshStandardMaterial has nothing to reflect except the few point
// lights near it, so brass rails, iron cabinets and the locomotive's fittings
// render as flat dark shapes wherever a lamp is not directly glancing off them.
//
// three's stock RoomEnvironment is a bright white studio, which would wash
// the night station out. This builds a small room in the game's own palette
// instead: dim panelled walls, a ring of warm lamp globes overhead, two
// sconce strips at rail height and one cool window. It is prefiltered with
// PMREM once at boot and never rebuilt, and nothing in it depends on a level.
//
// The room is dark apart from its lamps, so matte surfaces gain only a faint
// fill while polished metal picks up warm highlights. Radiance values are
// linear and may exceed 1 — PMREM renders into a half-float target.

// Under AgX this lifts an unlit plaster wall to about 8% grey while a wall
// beside a lamp sits near 18%, so lamps still read as pools of light.
export const ENVIRONMENT_INTENSITY = 0.7

const ROOM_SIZE = 24
const ROOM_HEIGHT = 9

function linear(r, g, b, scale = 1) {
  return new THREE.Color().setRGB(r * scale, g * scale, b * scale, THREE.LinearSRGBColorSpace)
}

function emissive(color) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false })
}

// The unfiltered room, kept separate from the PMREM step so its radiance can
// be checked without a GPU.
export function createEnvironmentRoom() {
  const room = new THREE.Scene()

  // BoxGeometry material order: +X, -X, +Y (ceiling), -Y (floor), +Z, -Z.
  const wall = linear(0.035, 0.026, 0.018)
  const shellMaterials = [
    wall,
    wall,
    linear(0.012, 0.010, 0.010),
    linear(0.022, 0.017, 0.012),
    wall,
    wall
  ].map((color) => new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }))
  const shell = new THREE.Mesh(new THREE.BoxGeometry(ROOM_SIZE, ROOM_HEIGHT, ROOM_SIZE), shellMaterials)
  shell.position.y = ROOM_HEIGHT / 2 - 2
  room.add(shell)

  // Pendant globes: the warm highlights that make brass read as brass.
  const lampMaterial = emissive(linear(1, 0.66, 0.36, 9))
  const lampGeometry = new THREE.SphereGeometry(0.45, 16, 12)
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    const lamp = new THREE.Mesh(lampGeometry, lampMaterial)
    lamp.position.set(Math.cos(angle) * 6.5, 3.2, Math.sin(angle) * 6.5)
    room.add(lamp)
  }

  // Sconce strips at rail height on the side walls; vertical posts and rails
  // catch these as the long streaks a lit corridor puts on polished metal.
  const stripMaterial = emissive(linear(1, 0.7, 0.42, 1.6))
  const stripGeometry = new THREE.BoxGeometry(0.1, 0.18, 10)
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(stripGeometry, stripMaterial)
    strip.position.set(side * (ROOM_SIZE / 2 - 0.2), 1.8, 0)
    room.add(strip)
  }

  // One cool window, matching the dusk hemisphere light outside.
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), emissive(linear(0.3, 0.38, 0.55)))
  pane.position.set(0, 2.5, -ROOM_SIZE / 2 + 0.2)
  room.add(pane)

  return room
}

export function createEnvironmentMap(renderer) {
  const room = createEnvironmentRoom()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromScene(room, 0.035)
  pmrem.dispose()

  room.traverse((node) => {
    node.geometry?.dispose()
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    for (const material of materials) material?.dispose()
  })

  return target.texture
}

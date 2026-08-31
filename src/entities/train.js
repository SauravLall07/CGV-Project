import * as THREE from 'three'

// The train's parent-child hierarchy: a `train` Group containing named
// `carriage-N` Groups, each wrapping a single box mesh ("carriage
// silhouette"). Nothing here is a modelled asset yet — this exists to prove
// out the hierarchy, not the visuals: moving/rotating `train` moves every
// carriage with it, and each carriage can be moved/rotated independently
// without affecting its siblings.
//
// Carriage progression follows the concept doc's Passenger -> Security ->
// Cargo -> Mechanical -> Vault order. Dimensions are intentionally
// near-identical for now (they're distinct named children, not yet
// distinct designs) — colour varies only so the progression reads visually
// in a blockout with no textures.
const CARRIAGE_TYPES = [
  { type: 'passenger', color: 0xc9a66b },
  { type: 'security', color: 0x7f8c8d },
  { type: 'cargo', color: 0x8d6e63 },
  { type: 'mechanical', color: 0x546e7a },
  { type: 'vault', color: 0x4a4a4a }
]

const CARRIAGE_WIDTH = 3.4
const CARRIAGE_HEIGHT = 3
const CARRIAGE_LENGTH = 6
const COUPLING_GAP = 0.6
const CARRIAGE_SPACING = CARRIAGE_LENGTH + COUPLING_GAP

function createCarriage(index, { type, color }) {
  const carriage = new THREE.Group()
  carriage.name = `carriage-${index}`
  carriage.userData.type = type

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(CARRIAGE_WIDTH, CARRIAGE_HEIGHT, CARRIAGE_LENGTH),
    new THREE.MeshStandardMaterial({ color })
  )
  mesh.position.y = CARRIAGE_HEIGHT / 2
  mesh.castShadow = true
  mesh.receiveShadow = true
  carriage.add(mesh)

  // Centered on the group's local origin so the train as a whole can be
  // positioned/rotated by moving just `train`, not each carriage.
  const middleIndex = (CARRIAGE_TYPES.length - 1) / 2
  carriage.position.z = (index - middleIndex) * CARRIAGE_SPACING
  return carriage
}

export function createTrain() {
  const train = new THREE.Group()
  train.name = 'train'

  CARRIAGE_TYPES.forEach((carriageType, index) => {
    train.add(createCarriage(index, carriageType))
  })

  // Stationary alongside the platform for this milestone — the train
  // doesn't move until Level 2 behaviour exists.
  train.position.set(7, 0, 0)

  return { train }
}

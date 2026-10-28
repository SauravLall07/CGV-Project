import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { WRECK_DAMAGE, roofMissingAt } from './wreck-damage.js'
import { metalMaterial } from './textures.js'

const WALL = 2.6, ROOF = 3.5

// Closed extrusion: lining, outer skin and cut faces all have real thickness.
// The notch continues from the side into the roof with an irregular inner edge.
export function tornRoofGeometry(key, length, thickness = 0.1) {
  const cut = WRECK_DAMAGE[key], half = length / 2
  const { minZ: a, maxZ: b, roofInner: inner, side } = cut
  const outline = [[-WALL, -half], [WALL, -half], [WALL, a],
    [WALL - 0.45, a + 0.12], [inner + 0.25, a - 0.12], [inner, a + 0.35],
    [inner - 0.1, a + (b - a) * 0.27], [inner + 0.12, a + (b - a) * 0.42],
    [inner - 0.08, a + (b - a) * 0.67], [inner + 0.16, b - 0.45],
    [inner + 0.4, b + 0.1], [WALL - 0.32, b - 0.08], [WALL, b],
    [WALL, half], [-WALL, half]]
  const shape = new THREE.Shape()
  outline.forEach(([x,z], i) => i ? shape.lineTo(x * side, -z) : shape.moveTo(x * side, -z))
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false })
  geometry.rotateX(-Math.PI / 2)
  // Metre-scaled UVs: segment size never stretches the grain across a car.
  const uv = geometry.attributes.uv
  for (let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i) * 0.4, uv.getY(i) * 0.4)
  return geometry
}

export function addTornStructure(group, key, half, shared) {
  const cut = WRECK_DAMAGE[key]
  const batches = new Map()
  const paint = metalMaterial({ repeat: [1,1], base: 0x315a50, roughness: 0.8,
    metalness: 0.5, seed: 181, wear: 0.15 })
  const substrate = new THREE.MeshStandardMaterial({ color: 0x817869, roughness: 0.88, metalness: 0.42 })
  const rim = new THREE.MeshStandardMaterial({ color: 0x395458, emissive: 0x5ab8ff,
    emissiveIntensity: 0.18, roughness: 0.65, metalness: 0.4 })
  const add = (material, geometry) => {
    if (!batches.has(material)) batches.set(material, [])
    if (geometry.index) {
      const unindexed = geometry.toNonIndexed(); geometry.dispose(); geometry = unindexed
    }
    batches.get(material).push(geometry)
  }
  const box = (mat,w,h,d,x,y,z) => add(mat,new THREE.BoxGeometry(w,h,d).translate(x,y,z))
  const side = cut.side, a = cut.minZ, b = cut.maxZ, sill = cut.sill

  const outer = tornRoofGeometry(key, half * 2, 0.035)
  outer.translate(0, ROOF + 0.1, 0); add(paint, outer)
  // Guarded chassis edges stay outside the player's ±2.3 m movement envelope.
  // No new top or cross-member extends into a puzzle's floor opening.
  for (const s of [-1, 1]) {
    box(shared.darkSteel,0.16,0.28,half*2,s*(WALL+0.04),-0.2,0)
  }
  box(paint,0.1,sill, b-a,side*(WALL+0.02),sill/2,(a+b)/2)
  box(substrate,0.14,0.055,b-a,side*WALL,sill+0.0275,(a+b)/2)
  // A guard attached to the surviving sill makes the movement boundary visible.
  if (sill < 1.1) {
    box(shared.darkSteel,0.075,0.075,b-a,side*(WALL+0.02),1.08,(a+b)/2)
    for (const z of [a+0.15,(a+b)/2,b-0.15])
      box(shared.darkSteel,0.075,1.08-sill,0.075,side*(WALL+0.02),(1.08+sill)/2,z)
  }
  for (const [z, direction] of [[a,-1],[b,1]]) {
    // Intact tear shoulders: the wall and roof terminate on the same frame.
    box(shared.darkSteel,0.14,ROOF-sill,0.13,side*(WALL+0.015),(ROOF+sill)/2,z+direction*0.09)
    box(substrate,0.14,0.06,0.18,side*WALL,sill+0.04,z)
    // Attached broad sheet folds, bent away from the traversable/camera volume.
    const shape = new THREE.Shape()
    shape.moveTo(0,0); shape.lineTo(0,1.2); shape.lineTo(0.43,1.08)
    shape.lineTo(0.3,0.76); shape.lineTo(0.58,0.52); shape.lineTo(0.38,0.18); shape.closePath()
    const flap = new THREE.ExtrudeGeometry(shape,{depth:0.035,bevelEnabled:false})
    flap.rotateY(side * Math.PI/2 - (direction > 0 ? 0.55 : 0.45))
    flap.translate(side*(WALL+0.05),sill+0.25,z)
    add(paint,flap)
    // Local bare-metal caps, sparse temporal highlights; no whole-opening outline.
    box(substrate,0.15,ROOF-sill,0.025,side*WALL,(ROOF+sill)/2,z)
    box(rim,0.016,0.48,0.035,side*(WALL-0.075),ROOF-0.42,z)
    const roofFold = new THREE.BoxGeometry(0.6,0.035,0.68)
    roofFold.rotateZ(side*0.48)
    roofFold.translate(side*(cut.roofInner-0.15),ROOF+0.18,z+direction*0.35)
    add(paint,roofFold)
  }
  // Cargo's folded rack stays attached at the surviving shoulder.
  if (key === 'cargo') {
    box(shared.darkSteel,0.12,0.4,0.18,-2.58,3.25,8.35)
    // Retained door hoist. Its parked leaf rises above the missing roof.
    for (const x of [-2.66,2.66]) box(shared.darkSteel,0.16,4.85,0.22,x,2.425,2)
    box(shared.darkSteel,5.48,0.18,0.28,0,4.85,2)
    for (const x of [-2.57,2.57]) box(substrate,0.07,4.7,0.1,x,2.35,2)
    // The phase indicator remains at its original approach/ray position.
    box(paint,0.16,1.25,0.7,-2.63,1.5,3.4)
    box(shared.darkSteel,0.12,0.88,0.12,-2.63,0.44,3.4)
    // Surviving load rail and attachment points for the falling loop trunk.
    box(shared.darkSteel,5.38,0.12,0.2,0,3.3,-2)
    box(shared.darkSteel,0.12,3.25,0.16,-2.66,1.625,-2)
  }
  // Sparse surviving roots for the existing spatial ribs and machine rails.
  // Their world-owned visuals keep their original positions/snapshots.
  if (key === 'security' || key === 'passenger') {
    const z = key === 'security' ? 0.6 : -4.3
    box(shared.darkSteel,0.12,ROOF-sill,0.16,side*(WALL+0.04),(ROOF+sill)/2,z)
    box(shared.darkSteel,0.82,0.09,0.18,side*2.28,3.18,z)
    if(key==='security') box(shared.darkSteel,0.1,0.38,0.18,-2.4,3.3,z)
  }
  if (key === 'convergence') {
    box(shared.darkSteel,0.12,2.55,0.16,-2.66,2.17,9)
    box(shared.darkSteel,3.55,0.12,0.22,-0.83,3.38,9)
    box(shared.darkSteel,0.12,0.12,1.2,-2.6,3.38,9.6)
  }
  if (key === 'mechanical') box(shared.darkSteel,0.14,0.14,0.6,-2.6,3.15,-6.05)
  for (const [material,pieces] of batches) {
    const mesh = new THREE.Mesh(mergeGeometries(pieces,false), material)
    pieces.forEach(piece => piece.dispose())
    mesh.name = `${key}-torn-${material === paint ? 'skin' : material === rim ? 'rim' : material === substrate ? 'cut-edges' : 'frame'}`
    mesh.userData.wreckTorn = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
}

// Remove fixture instances whose attachment was lost. Keep retired resources
// under their carriage for deduplicated disposal; they cannot render or raycast.
export function removeUnsupportedFixtures(group, key) {
  const cut = WRECK_DAMAGE[key], retired = new THREE.Group()
  retired.name = `${key}-retired-fixtures`; retired.visible = false
  const box = new THREE.Box3(), local = new THREE.Matrix4(), instance = new THREE.Matrix4()
  group.updateWorldMatrix(true,true)
  const inverse = group.matrixWorld.clone().invert(), leaves = []
  group.traverse(node => { if (node.isMesh || node.isPointLight) leaves.push(node) })
  function unsupported(bounds) {
    if (bounds.max.z <= cut.minZ - 0.25 || bounds.min.z >= cut.maxZ + 0.25) return false
    const sideX = cut.side > 0 ? bounds.max.x : -bounds.min.x
    return (bounds.min.y > 1.0 && sideX > WALL - 0.65) ||
      (bounds.min.y > 3.22 && sideX > cut.roofInner - 0.25)
  }
  function retire(node) {
    retired.attach(node)
    node.traverse(child => { child.raycast = () => {}; child.userData.noCameraCollision = true })
    node.userData.lightPoolOff = true
  }
  group.add(retired)
  for (const node of leaves) {
    if (node.userData.wreckTorn || node.userData.wreckShell ||
      node.userData.wreckLandmark || node.name.startsWith('floor-')) continue
    if (node.isPointLight) {
      // Move surviving ambient practical fills onto the sheltered roof line.
      if (roofMissingAt(key,node.position.x,node.position.z,0.25) && node.position.y > 2.8)
        node.position.x = -cut.side * 1.5
      continue
    }
    local.multiplyMatrices(inverse,node.matrixWorld)
    node.geometry.computeBoundingBox()
    if (node.isInstancedMesh) {
      let kept = 0
      for (let i=0;i<node.count;i++) {
        node.getMatrixAt(i,instance)
        box.copy(node.geometry.boundingBox).applyMatrix4(instance).applyMatrix4(local)
        if (key === 'cargo' && box.min.y < 0.7 && box.max.y < 1.1 && box.max.z > 3.8 && box.min.z < 8.6) continue
        // Exterior floating litter is superseded by attached shell damage.
        if (box.min.x > WALL+0.2 || box.max.x < -WALL-0.2 || unsupported(box)) continue
        node.setMatrixAt(kept,instance)
        if (node.instanceColor) { const color = new THREE.Color(); node.getColorAt(i,color); node.setColorAt(kept,color) }
        kept++
      }
      node.count = kept; node.instanceMatrix.needsUpdate = true
      if (kept) { node.computeBoundingBox(); node.computeBoundingSphere() }
      else retire(node)
    } else {
      box.copy(node.geometry.boundingBox).applyMatrix4(local)
      if (unsupported(box) || /storm-veil/.test(node.name) ||
        box.min.x > WALL+0.2 || box.max.x < -WALL-0.2) retire(node)
    }
  }
  return retired
}

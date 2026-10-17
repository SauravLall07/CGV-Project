import * as THREE from 'three'
import { createEndingRocks, createEndingPines, endingRandom } from './ending-rocks.js'

export const HILLSIDE_START_Z = 30
export const FAR_ABUTMENT_Z = -20
export const TRAIN_START_NOSE_Z = 125

export function createEndingLandmarks(_valleyHeight, cameraPosition = new THREE.Vector3(44, 23, -17)) {
  const root = new THREE.Group()
  root.name = 'ending-landmarks'
  const smooth = (a, b, v) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
  const riverCenter = x => 4 + 7 * Math.sin(x * 0.024) + 3 * Math.sin(x * 0.051)
  function surface(x, z) {
    const channelZ = riverCenter(x)
    const nearLip = 30 + Math.max(0, -x - 8) * 0.16
    const farLip = -20 - Math.max(0, -x - 8) * 0.16
    const shelf = -0.6 + 40 * smooth(3, 40, -x) - 22 * smooth(3, 38, x)
    const near = smooth(nearLip - 9, nearLip, z) * (85 + shelf)
    const far = smooth(farLip + 10, farLip, z) * (84 + 9 * smooth(8, 60, -z - 20))
    const floor = -85 + Math.sin(x * 0.029) * 2
    const ridge = Math.max(near, far)
    const noise = (Math.sin(x * 0.47 + z * 0.31) + Math.sin(x * 0.19 - z * 0.61)) * 1.1
    const gravel = Math.abs(x) < 2.1 && z >= 30
    return gravel ? -0.25 : floor + ridge + noise * Math.min(1, ridge / 30)
  }
  // 2.5 m cells, split into individual triangles: no smoothed giant faces.
  const x0 = -280, z0 = -110, step = 2.5, nx = 148, nz = 148
  const positions = [], indices = [], colors = [], tint = new THREE.Color()
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * step, z = z0 + j * step
    positions.push(x, surface(x, z), z)
    tint.set(0x4b5361).multiplyScalar(0.9 + 0.1 * (1 + Math.sin(x * 0.53 + z * 0.73)))
    tint.toArray(colors, colors.length)
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + nx + 1
    indices.push(a, b, a + 1, a + 1, b, b + 1)
  }
  const indexed = new THREE.BufferGeometry()
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  indexed.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); indexed.setIndex(indices)
  const flat = indexed.toNonIndexed(); indexed.dispose()
  const facets = [], facetColors = []
  const flatPositions = flat.attributes.position, flatColors = flat.attributes.color
  const lengthSq = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  function facet(a, b, c) {
    const ab = lengthSq(a, b), bc = lengthSq(b, c), ca = lengthSq(c, a)
    if (Math.max(ab, bc, ca) > 16) {
      const mid = (p, q) => p.map((value, i) => (value + q[i]) / 2)
      if (ab >= bc && ab >= ca) { const m = mid(a, b); facet(a, m, c); facet(m, b, c) }
      else if (bc >= ca) { const m = mid(b, c); facet(b, m, a); facet(m, c, a) }
      else { const m = mid(c, a); facet(c, m, b); facet(m, a, b) }
      return
    }
    const shade = 0.9 + 0.2 * (0.5 + 0.5 * Math.sin((a[0] + b[0] + c[0]) * 12.7 + (a[2] + b[2] + c[2]) * 31.1))
    for (const vertex of [a, b, c]) {
      facets.push(vertex[0], vertex[1], vertex[2])
      facetColors.push(vertex[3] * shade, vertex[4] * shade, vertex[5] * shade)
    }
  }
  for (let i = 0; i < flatPositions.count; i += 3) {
    const vertex = j => [flatPositions.getX(j), flatPositions.getY(j), flatPositions.getZ(j),
      flatColors.getX(j), flatColors.getY(j), flatColors.getZ(j)]
    facet(vertex(i), vertex(i + 1), vertex(i + 2))
  }
  flat.dispose()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(facets, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(facetColors, 3)); geometry.computeVertexNormals()
  const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff,
    vertexColors: true, flatShading: true, roughness: 1 }))
  terrain.name = 'ending-canyon-terrain'; root.add(terrain)
  function heightAt(x, z) {
    const gx = THREE.MathUtils.clamp((x - x0) / step, 0, nx - 0.00001)
    const gz = THREE.MathUtils.clamp((z - z0) / step, 0, nz - 0.00001)
    const i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j
    const a = (j * (nx + 1) + i) * 3 + 1, b = a + (nx + 1) * 3
    return u + v <= 1 ? positions[a] * (1 - u - v) + positions[a + 3] * u + positions[b] * v
      : positions[b + 3] * (u + v - 1) + positions[a + 3] * (1 - v) + positions[b] * (1 - u)
  }
  const bed = new THREE.Mesh(new THREE.BoxGeometry(4, 0.25, 220),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 1 }))
  bed.name = 'ending-gravel-track-bed'; bed.position.set(0, -0.25, 140); root.add(bed)
  const masonry = [], pose = new THREE.Object3D(), random = endingRandom(1930), color = new THREE.Color()
  function pier(z, rows) {
    for (let row = 0; row < rows; row++) for (let col = 0; col < 5; col++) {
      masonry.push({ x: (col - 2) * 1.2 + (row % 2) * 0.08, y: -0.7 - row * 0.6, z })
    }
  }
  pier(30, 26); pier(-20, 26)
  const stone = new THREE.InstancedMesh(new THREE.BoxGeometry(1.16, 0.57, 4),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), masonry.length)
  stone.name = 'ending-stone-piers'
  masonry.forEach((site, i) => {
    pose.position.set(site.x, site.y, site.z); pose.updateMatrix(); stone.setMatrixAt(i, pose.matrix)
    color.set(i % 130 >= 120 ? 0x3e4f2c : 0x6a6a70).multiplyScalar(0.94 + random() * 0.12)
    stone.setColorAt(i, color)
  })
  stone.computeBoundingBox(); stone.computeBoundingSphere(); root.add(stone)
  const riverPositions = [], riverIndices = []
  for (let x = -270, i = 0; x <= 55; x += 2.5, i++) {
    const center = riverCenter(x), width = 10 + 2 * Math.sin(x * 0.038)
    for (const z of [center - width / 2, center + width / 2]) riverPositions.push(x, heightAt(x, z) + 0.22, z)
    if (i) { const a = (i - 1) * 2; riverIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  }
  const riverGeometry = new THREE.BufferGeometry()
  riverGeometry.setAttribute('position', new THREE.Float32BufferAttribute(riverPositions, 3))
  riverGeometry.setIndex(riverIndices); riverGeometry.computeVertexNormals()
  const river = new THREE.Mesh(riverGeometry,
    new THREE.MeshStandardMaterial({ color: 0x1e3a66, roughness: 0.2, side: THREE.DoubleSide }))
  river.name = 'ending-gorge-river'; root.add(river)
  root.userData.riverCenter = riverCenter
  root.userData.heightAt = heightAt
  const rocks = [], pines = [], counts = {}
  const site = new THREE.Vector3(), nearest = new THREE.Vector3()
  const sight = new THREE.Line3(cameraPosition, new THREE.Vector3(0, 2.5, 15))
  function clear(x, y, z, radius) {
    site.set(x, y, z)
    if (site.distanceTo(cameraPosition) < radius + 12) return false
    sight.closestPointToPoint(site, true, nearest)
    return site.distanceTo(nearest) > radius + 5
  }
  function dress(area, rockCount, pineCount, sample) {
    counts[area] = { rocks: 0, pines: 0 }
    for (let i = 0, attempts = 0; i < rockCount && attempts < rockCount * 20; attempts++) {
      const [x, z] = sample(), size = area === 'foreground' ? 8 + random() * 6 : 2 + random() * 10
      const y = heightAt(x, z) + size * 0.15
      if ((Math.abs(x) < size + 3 && z > 28) || !clear(x, y, z, size * 1.5)) continue
      rocks.push({ x, y, z, size }); counts[area].rocks++; i++
    }
    for (let i = 0, attempts = 0; i < pineCount && attempts < pineCount * 20; attempts++) {
      const [x, z] = sample(), y = heightAt(x, z), height = 6 + random() * 12
      if ((Math.abs(x) < 5 && z > 28) || !clear(x, y + height / 2, z, height * 0.6)) continue
      pines.push({ x, y, z, height }); counts[area].pines++; i++
    }
  }
  dress('foreground', 44, 65, () => [15 + random() * 55, 35 + random() * 75])
  dress('nearHillside', 190, 200, () => [-80 + random() * 140, 32 + random() * 218])
  dress('canyonWalls', 220, 240, () => {
    const x = -250 + random() * 300, center = riverCenter(x)
    return [x, center + (random() < 0.5 ? -1 : 1) * (12 + random() * 14)]
  })
  dress('farCliff', 100, 125, () => [-180 + random() * 240, -27 - random() * 70])
  root.add(createEndingRocks(rocks), createEndingPines(pines))
  root.userData.sceneryCounts = counts
  return { root, heightAt, river }
}

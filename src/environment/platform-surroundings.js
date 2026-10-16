import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import pineAUrl from '../assets/textures/backdrop/pine-card-a.png'
import pineBUrl from '../assets/textures/backdrop/pine-card-b.png'
import bushUrl from '../assets/textures/backdrop/broadleaf-card.png'

// World coordinates. Everything is beyond the platform edge or its end walls.
// Ten main-pass submissions, no lights, shadows, colliders or frame uploads.
export function createPlatformSurroundings(valley, timeUniform) {
  const group = new THREE.Group()
  group.name = 'platform-surroundings'
  const textures = []
  const transform = new THREE.Object3D()
  const ownedGeometries = new Set(), ownedMaterials = new Set()
  let seed = 0x1934
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const smooth = t => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t) }
  // Sample rendered triangles, including the static backdrop's (7, .8) offset.
  const backdropY = (x, z) => {
    const chunk = valley.chunks.find(c => z >= c.index * 160 && z <= (c.index + 1) * 160)
    return valley.surfaceHeightAt(chunk, x - 7, z) + 0.8
  }
  const rightY = (x, z) => x >= 13 ? backdropY(x, z)
    : THREE.MathUtils.lerp(-1.75, backdropY(13, z), smooth((x - 9.8) / 3.2))
  const leftY = (x, z) => -1.75 + 3.4 * smooth((4.5 - x) / 32)
    + 0.25 * Math.sin(z * 0.045) * smooth((4.5 - x) / 20)
  function add(object) {
    object.castShadow = object.receiveShadow = false
    object.raycast = () => {}
    object.userData.noCameraCollision = true
    object.userData.noInteractionBlocker = true
    if (object.geometry) ownedGeometries.add(object.geometry)
    if (object.material) ownedMaterials.add(object.material)
    group.add(object)
    return object
  }

  // One vertex-colour batch: warm gravel, smooth shoulder and both end cuttings.
  // At x=13 the edge is exactly the existing terrain edge, without overlap.
  const positions = [], colors = [], indices = []
  const gravel = new THREE.Color(0x302d28), grass = new THREE.Color(0x293326)
  function strip(xs, z0, z1, height, ballast = false) {
    const rows = Math.ceil((z1 - z0) / 4), start = positions.length / 3
    for (let row = 0; row <= rows; row++) {
      const z = THREE.MathUtils.lerp(z0, z1, row / rows)
      for (const x of xs) {
        positions.push(x, height(x, z), z)
        const tint = grass.clone().lerp(gravel, ballast ? 1 : 1 - smooth((x - 9.8) / 3.2))
        if (!ballast && x < 4.5) tint.copy(grass)
        tint.multiplyScalar(0.9 + 0.1 * Math.sin(z * 1.7 + x * 3.1))
        colors.push(tint.r, tint.g, tint.b)
      }
    }
    for (let row = 0; row < rows; row++) for (let col = 0; col < xs.length - 1; col++) {
      const a = start + row * xs.length + col, b = a + xs.length
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  strip([4.5, 7, 9.8], -120, 180, () => -1.75, true)
  strip([9.8, 10.2, 10.8, 11.4, 12, 12.6, 13], -120, 180, rightY)
  strip([-45, -35, -25, -15, -5, 2, 4.5], -120, -29, leftY)
  strip([-45, -35, -25, -15, -5, 2, 4.5], 63, 180, leftY)
  const terrain = new THREE.BufferGeometry()
  terrain.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  terrain.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  terrain.setIndex(indices)
  terrain.computeBoundingSphere()
  add(new THREE.Mesh(terrain, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })))

  // The valley uses two crossed cards. Share that instancing approach and the
  // exact same three existing texture assets; no generated/downloaded assets.
  const cards = new THREE.BufferGeometry()
  cards.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, 0, 0, .5, 0, 0, .5, 1, 0, -.5, 1, 0,
    0, 0, -.5, 0, 0, .5, 0, 1, .5, 0, 1, -.5
  ], 3))
  cards.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1
  ], 2))
  cards.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  const plants = [[], [], []]
  const plant = (variant, x, z, h, width = h * 0.5) => {
    plants[variant].push({ x, y: (x >= 9.8 ? rightY(x, z) : leftY(x, z)) - .08,
      z, h, width, angle: random() * Math.PI * 2 })
  }
  // Stratified jitter guarantees coverage: each 4 m interval has a bush and
  // young fir, plus a second row; taller trees bridge to the existing forest.
  for (let i = 0; i < 75; i++) {
    const z = -118 + i * 4 + (random() - .5) * 1.5
    plant(2, 11.6 + random() * 1.2, z, 1.2 + random() * .8)
    plant(i % 2, 15 + random() * 4, z, 3.5 + random() * 2.5)
    plant((i + 1) % 2, 21 + random() * 3, z + 1, 5 + random() * 3)
    if (i % 2 === 0) plant(i % 3 === 0 ? 0 : 1, 27 + random() * 16, z, 9 + random() * 5)
  }
  for (const [z0, z1] of [[-118, -36], [70, 178]]) {
    for (let z = z0; z <= z1; z += 4) {
      const jitterZ = z + (random() - .5)
      plant(2, 1.5 - random() * 2, jitterZ, 1.4 + random())
      plant(Math.floor(random() * 2), -2 - random() * 4, jitterZ, 5 + random() * 3)
      plant(Math.floor(random() * 2), -12 - random() * 12, jitterZ + 1, 9 + random() * 5)
      plant(Math.floor(random() * 2), -30 - random() * 10, jitterZ, 12 + random() * 4)
    }
  }
  const loader = new THREE.TextureLoader()
  ;[pineAUrl, pineBUrl, bushUrl].forEach((url, variant) => {
    const map = loader.load(url); map.colorSpace = THREE.SRGBColorSpace; textures.push(map)
    const material = new THREE.MeshBasicMaterial({ map, color: variant === 2 ? 0x465447 : 0x61756b,
      alphaTest: .5, side: THREE.DoubleSide, fog: true })
    const mesh = new THREE.InstancedMesh(cards, material, plants[variant].length)
    mesh.name = `platform-vegetation-${variant}`
    plants[variant].forEach((p, i) => {
      transform.position.set(p.x, p.y, p.z); transform.rotation.set(0, p.angle, 0)
      transform.scale.set(p.width, p.h, p.width); transform.updateMatrix()
      mesh.setMatrixAt(i, transform.matrix)
    })
    mesh.computeBoundingSphere(); add(mesh)
  })

  // Four instanced box batches share fence, telegraph poles, sleepers, signal
  // box and signal. Dark iron also extends the two existing rails at the ends.
  const batches = [[], [], [], []]
  const box = (batch, x, y, z, w, h, d, angle = 0) => batches[batch].push({ x, y, z, w, h, d, angle })
  for (let z = -120; z <= 180; z += 5) {
    const y = rightY(10.5, z)
    box(0, 10.5, y + .6, z, .13, 1.2, .13)
    if (z < 180) for (const h of [.45, .95])
      box(0, 10.5, y + h, z + 2.5, .09, .1, 5)
  }
  const wirePoints = []
  for (let z = -120; z <= 180; z += 30) {
    const y = rightY(11.5, z)
    box(0, 11.5, y + 3.25, z, .25, 6.5, .25)
    box(0, 11.5, y + 6.05, z, 1.8, .1, .12)
    for (const x of [10.75, 12.25]) {
      box(2, x, y + 6.19, z, .1, .18, .1)
      if (z === 180) continue
      const nextY = rightY(11.5, z + 30)
      for (let segment = 0; segment < 12; segment++) {
        const point = t => new THREE.Vector3(x,
          THREE.MathUtils.lerp(y, nextY, t) + 6.3 - .85 * 4 * t * (1 - t), z + 30 * t)
        wirePoints.push(point(segment / 12), point((segment + 1) / 12))
      }
    }
  }
  // Existing rails span z=-107.5..112.5. Butt joins have no overlapping faces.
  for (const [a, b] of [[-120, -107.5], [112.5, 180]]) {
    for (const x of [6.25, 7.75]) box(2, x, -1.09, (a + b) / 2, .12, .18, b - a)
    for (let z = a + .4; z < b; z += .8) box(0, 7, -1.25, z, 2.8, .14, .28)
  }
  const sy = leftY(-3, 90)
  box(1, -3, sy + .7, 90, 3.8, 1.4, 4.8)
  box(0, -3, sy + 2.15, 90, 3.8, 1.5, 4.8)
  for (const side of [-1, 1]) {
    box(2, -3 + side * 1.04, sy + 3.1, 90, 2.25, .16, 5.2, -side * .32)
  }
  for (const z of [88.8, 90, 91.2]) {
    box(3, -1.085, sy + 2.2, z, .025, .7, .8)
    box(0, -1.06, sy + 2.2, z, .05, .76, .045)
  }
  box(0, -3, sy + .12, 93, 3.9, .24, 1)
  const signalY = rightY(10.1, 98)
  box(2, 10.1, signalY + 2.6, 98, .17, 5.2, .17)
  box(2, 10.1, signalY + 4.6, 97.85, .5, .9, .3)
  box(3, 10.1, signalY + 4.7, 97.68, .22, .22, .025)
  const materials = [
    new THREE.MeshBasicMaterial({ color: 0x3d3023, fog: true }),
    new THREE.MeshBasicMaterial({ color: 0x49382e, fog: true }),
    new THREE.MeshBasicMaterial({ color: 0x252a28, fog: true }),
    new THREE.MeshStandardMaterial({ color: 0x4d3020, emissive: 0xffbd72,
      emissiveIntensity: .8, roughness: 1, fog: true })
  ]
  const unitBox = new THREE.BoxGeometry(1, 1, 1)
  batches.forEach((items, batch) => {
    const mesh = new THREE.InstancedMesh(unitBox, materials[batch], items.length)
    mesh.name = `platform-railway-details-${batch}`
    items.forEach((p, i) => {
      transform.position.set(p.x, p.y, p.z); transform.rotation.set(0, 0, p.angle)
      transform.scale.set(p.w, p.h, p.d); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix)
    })
    mesh.computeBoundingSphere(); add(mesh)
  })
  add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wirePoints),
    new THREE.LineBasicMaterial({ color: 0x151916, fog: true })))

  // Soft, layered steam beyond both ends; merged to one transparent draw.
  const sheets = []
  for (const z of [-116, -108, -100, 128, 144, 164]) {
    const sheet = new THREE.PlaneGeometry(52, 15)
    sheet.translate(7, 3, z); sheets.push(sheet)
  }
  const mistGeometry = mergeGeometries(sheets)
  sheets.forEach(g => g.dispose())
  const mistMaterial = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: timeUniform },
    vertexShader: `varying vec2 vUv;
      #include <common>
      #include <fog_pars_vertex>
      void main() { vUv = uv;
        #include <begin_vertex>
        #include <project_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec2 edge = smoothstep(vec2(0.), vec2(.25), vUv)
          * smoothstep(vec2(0.), vec2(.25), 1. - vUv);
        float cloud = .7 + .3 * sin(vUv.x * 28. + sin(vUv.y * 17.) + uTime * .08);
        gl_FragColor = vec4(vec3(.19, .24, .25), .32 * edge.x * edge.y * cloud);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: true
  })
  add(new THREE.Mesh(mistGeometry, mistMaterial))
  const stats = { drawCalls: 0, triangles: 0, wireSegments: wirePoints.length / 2 }
  group.traverse(node => {
    if (!node.geometry) return
    stats.drawCalls++
    if (node.isMesh) stats.triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count)
      / 3 * (node.isInstancedMesh ? node.count : 1)
  })
  group.userData.drawCalls = stats.drawCalls
  group.userData.triangles = stats.triangles
  if (import.meta.env?.DEV) {
    console.info('[platform surroundings]', stats)
    console.assert(stats.drawCalls <= 12, 'Platform surroundings draw budget exceeded')
  }
  return { group, stats, dispose() {
    group.traverse(node => { if (node.isInstancedMesh) node.dispose() })
    ownedGeometries.forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose())
    textures.forEach(t => t.dispose())
  } }
}

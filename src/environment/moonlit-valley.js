import * as THREE from 'three'
import pineCardAUrl from '../assets/textures/backdrop/pine-card-a.png'
import pineCardBUrl from '../assets/textures/backdrop/pine-card-b.png'
import broadleafCardUrl from '../assets/textures/backdrop/broadleaf-card.png'

const TREE_TINT = 0x86a8a0
const FOREST_ROWS = [[16, 24, 8], [28, 36, 11], [42, 50, 14], [58, 70, 17]]
const UPHILL_ROWS = [[80, 110, 50], [130, 180, 50], [210, 300, 50]]
const SHOULDER_ROWS = [[14, 40, 40]]
const DOWNSLOPE_ROWS = [[40, 66, 40], [66, 94, 40], [94, 120, 40]]
const VALLEY_ROWS = [[120, 210, 60]]
const TREES_PER_CHUNK = 930
const MOON_DIRECTION = new THREE.Vector3(0.478, 0.292, -0.828).normalize()

// Fog alone leaves opaque silhouettes. Fade them out before chunk recycling,
// including the shorter rear coverage, so they cannot mask the mountain ring.
function addSceneryFade(material, viewerZ) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSceneryViewerZ = viewerZ
    shader.vertexShader = 'varying vec3 vSceneryWorld;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      #include <project_vertex>
      vec4 sceneryPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        sceneryPosition = instanceMatrix * sceneryPosition;
      #endif
      vSceneryWorld = (modelMatrix * sceneryPosition).xyz;
    `)
    shader.fragmentShader = 'uniform float uSceneryViewerZ;\nvarying vec3 vSceneryWorld;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `
      #include <fog_fragment>
      float rearFade = smoothstep(180.0, 300.0, vSceneryWorld.z - uSceneryViewerZ);
      float farFade = smoothstep(850.0, 900.0, distance(vSceneryWorld, vec3(0.0, 5.0, uSceneryViewerZ)));
      float sceneryFade = max(rearFade, farFade);
      #ifdef USE_FOG
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, sceneryFade);
      #endif
      float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      if (sceneryFade > grain) discard;
    `)
  }
  material.customProgramCacheKey = () => 'moonlit-valley-scenery-fade-v1'
}

function createForest(chunks, onChunkRecycle, viewerZ) {
  const loader = new THREE.TextureLoader()
  const textures = [loader.load(pineCardAUrl), loader.load(pineCardBUrl)]
  const materials = textures.map((map) => {
    map.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.MeshLambertMaterial({
      map, color: TREE_TINT, alphaTest: 0.5, side: THREE.DoubleSide, fog: true
    })
    addSceneryFade(material, viewerZ)
    return material
  })
  // Two crossed, bottom-anchored cards. Scaling preserves the source's 1:2 ratio.
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0,
    0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5
  ], 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1
  ], 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  geometry.computeVertexNormals()
  const transform = new THREE.Object3D()
  const tint = new THREE.Color()
  let seed = 0
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (const chunk of chunks) {
    const meshes = materials.map((material, i) => {
      const mesh = new THREE.InstancedMesh(geometry, material, TREES_PER_CHUNK / 2)
      mesh.name = `pine-forest-${i}`
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      // Allocate instance colours and bounds once, before any recycling.
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TREES_PER_CHUNK / 2 * 3), 3)
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
      mesh.boundingBox = new THREE.Box3()
      mesh.boundingSphere = new THREE.Sphere()
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.raycast = () => {}
      mesh.userData.noCameraCollision = true
      chunk.group.add(mesh)
      return mesh
    })
    let ordinal = 0
    function placeTree(x, localZ, height, belowRoof = false, shoulder = false) {
      const worldZ = chunk.index * CHUNK_LENGTH + localZ
      const base = surfaceHeightAt(chunk, x, worldZ) - 0.3
      if (belowRoof) height = Math.min(height, 3.8 - base)
      if (shoulder) {
        // Bound the closest card edge, for every Z during scrolling, not just
        // the tree's initial angle to the viewer. Roof eye height is about 5 m.
        const slope = Math.tan(10 * Math.PI / 180)
        height = Math.min(height, (5 - base + Math.abs(x) * slope) / (1 + slope * 0.25))
      }
      const width = height * 0.5
      x = Math.sign(x) * Math.max(Math.abs(x), 8 + width * 0.5)
      transform.position.set(x, surfaceHeightAt(chunk, x, worldZ) - 0.3, localZ)
      transform.rotation.set(0, random() * Math.PI * 2, 0)
      transform.scale.set(width, height, width)
      transform.updateMatrix()
      const mesh = meshes[ordinal % 2]
      const instance = Math.floor(ordinal / 2)
      mesh.setMatrixAt(instance, transform.matrix)
      const shade = 0.88 + random() * 0.12
      tint.setRGB(shade, shade, shade)
      mesh.setColorAt(instance, tint)
      ordinal += 1
    }
    function rows(layout, side, minHeight, heightRange, belowRoof = false, shoulder = false) {
      for (const row of layout) {
        for (let i = 0; i < row[2]; i += 1) {
          const height = minHeight + random() * heightRange
          const x = side * (row[0] + random() * (row[1] - row[0]))
          const localZ = ((i + 0.1 + random() * 0.8) / row[2]) * CHUNK_LENGTH
          placeTree(x, localZ, height, belowRoof, shoulder)
        }
      }
    }
    const rebuildForest = () => {
      seed = (Math.imul(chunk.index, 374761393) ^ 0x4d6f6f) >>> 0
      ordinal = 0
      rows(FOREST_ROWS, -1, 20, 12)
      rows(UPHILL_ROWS, -1, 16, 10)
      rows(SHOULDER_ROWS, 1, 10, 8, false, true)
      rows(DOWNSLOPE_ROWS, 1, 16, 10)
      rows(VALLEY_ROWS, 1, 16, 8)
      for (let i = 0; i < 450; i += 1) {
        // Pick the steeper of two random sites to favour slopes without rows.
        let x = 220 + random() * 530
        let localZ = random() * CHUNK_LENGTH
        const candidateX = 220 + random() * 530
        const candidateZ = random() * CHUNK_LENGTH
        const worldZ = chunk.index * CHUNK_LENGTH
        const slope = Math.abs(valleyHeightAt(x + 1, worldZ + localZ) - valleyHeightAt(x - 1, worldZ + localZ))
        const candidateSlope = Math.abs(valleyHeightAt(candidateX + 1, worldZ + candidateZ) - valleyHeightAt(candidateX - 1, worldZ + candidateZ))
        if (candidateSlope > slope) { x = candidateX; localZ = candidateZ }
        placeTree(x, localZ, 14 + random() * 10)
      }
      for (let i = 0; i < 60; i += 1) placeTree(-(10 + random() * 70), random() * CHUNK_LENGTH, 16 + random() * 10)
      for (const mesh of meshes) {
        mesh.count = Math.floor(ordinal / 2) + (mesh === meshes[0] ? ordinal % 2 : 0)
        mesh.instanceMatrix.needsUpdate = true
        mesh.instanceColor.needsUpdate = true
        mesh.computeBoundingBox()
        mesh.computeBoundingSphere()
      }
    }
    onChunkRecycle(chunk, rebuildForest)
    rebuildForest()
  }
  return { textures, geometry, materials }
}

const CHUNK_LENGTH = 160
const CHUNK_COUNT = 9
const AHEAD_CHUNKS = 6
const HALF_WIDTH = 450
const RIGHT_WIDTH = 900
const X_SEGMENTS = 160
const Z_SEGMENTS = 20
const NORMAL_STEP = 0.25

// Fixed seed produces stable phases without consuming global Math.random().
const SEED = 0x4d6f6f
function phase(key) {
  const value = Math.sin(SEED + key * 127.1) * 43758.5453
  return (value - Math.floor(value)) * Math.PI * 2
}
const PHASE_A = phase(1)
const PHASE_B = phase(2)
const PHASE_C = phase(3)
function smooth(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// One continuous world-space surface for ALL chunks and future attached props.
// No Boarding footprint/depression is included. The moving train is at x=0.
export function valleyHeightAt(x, worldZ) {
  if (x > 0) {
    const shoulder = -2.5 - 3.5 * smooth(10, 40, x)
    const floor = shoulder - 39 * smooth(40, 120, x)
    const wave = 0.5 * Math.sin(worldZ / 170 + x / 105 + PHASE_A) +
      0.3 * Math.cos(worldZ / 93 - x / 67 + PHASE_B) +
      0.2 * Math.sin(worldZ / 310 + x / 51 + PHASE_C)
    return floor + smooth(210, 430, x) * (145 + 40 * wave) - 25 * smooth(750, 900, x)
  }
  const distance = Math.abs(x)
  const bank = smooth(10, 55, distance)
  const hills = smooth(55, 180, distance)
  const outer = smooth(180, HALF_WIDTH, distance)
  const wave = Math.sin(worldZ * 0.009 + PHASE_A) * 0.55 +
    Math.cos(worldZ * 0.017 + x * 0.006 + PHASE_B) * 0.3 +
    Math.sin(worldZ * 0.0037 - x * 0.011 + PHASE_C) * 0.15
  return -2.5 + bank * (4 + wave * 1.5) + hills * (26 + wave * 8) + outer * (22 + wave * 6)
}

function createChunk(material) {
  const group = new THREE.Group()
  const geometry = new THREE.PlaneGeometry(HALF_WIDTH * 2, CHUNK_LENGTH, X_SEGMENTS, Z_SEGMENTS)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, 0, CHUNK_LENGTH / 2)
  // Concentrate the same vertex budget near the track; every chunk has the
  // identical X grid and 8 m Z spacing, so their edge vertices line up exactly.
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i += 1) {
    const u = position.getX(i) / HALF_WIDTH
    position.setX(i, Math.sign(u) * Math.pow(Math.abs(u), 1.6) * (u > 0 ? RIGHT_WIDTH : HALF_WIDTH))
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(position.count * 3), 3))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const ground = new THREE.Mesh(geometry, material)
  ground.name = 'moonlit-valley-ground'
  ground.castShadow = false
  ground.receiveShadow = false
  ground.raycast = () => {}
  ground.userData.noCameraCollision = true
  group.add(ground)
  return { group, ground, geometry, index: 0, onRecycle: new Set() }
}

function rebuildChunk(chunk, index) {
  chunk.index = index
  chunk.group.name = `moonlit-valley-chunk-${index}`
  chunk.group.userData.worldZ = index * CHUNK_LENGTH
  const position = chunk.geometry.attributes.position
  const normal = chunk.geometry.attributes.normal
  const color = chunk.geometry.attributes.color
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const worldZ = index * CHUNK_LENGTH + position.getZ(i)
    position.setY(i, valleyHeightAt(x, worldZ))
    // Evaluate the SAME height gradient on both sides of each edge. Per-mesh
    // computeVertexNormals() would give the two edge rows different normals.
    const dx = (valleyHeightAt(x + NORMAL_STEP, worldZ) - valleyHeightAt(x - NORMAL_STEP, worldZ)) / (2 * NORMAL_STEP)
    const dz = (valleyHeightAt(x, worldZ + NORMAL_STEP) - valleyHeightAt(x, worldZ - NORMAL_STEP)) / (2 * NORMAL_STEP)
    const length = Math.hypot(dx, 1, dz)
    normal.setXYZ(i, -dx / length, 1 / length, -dz / length)
    const variation = Math.sin(x * 0.013 + worldZ * 0.008 + PHASE_B) * 0.08 +
      Math.cos(x * 0.005 - worldZ * 0.014 + PHASE_C) * 0.04
    const facingMoon = Math.max(0, (-dx * MOON_DIRECTION.x + MOON_DIRECTION.y - dz * MOON_DIRECTION.z) / length)
    const tint = THREE.MathUtils.clamp(0.43 + variation * 0.6, 0.35, 0.55) + facingMoon * 0.08
    const wet = x > 0 ? smooth(100, 120, x) * (1 - smooth(210, 240, x)) : 0
    const ballast = 1 - smooth(4, 6, Math.abs(x))
    const red = tint * (0.65 - wet * 0.15)
    const green = tint * (0.85 - wet * 0.25)
    const blue = tint * (0.62 + wet * 0.16)
    color.setXYZ(i, red * (1 - ballast) + 0.21 * ballast,
      green * (1 - ballast) + 0.19 * ballast, blue * (1 - ballast) + 0.17 * ballast)
  }
  position.needsUpdate = true
  normal.needsUpdate = true
  color.needsUpdate = true
  chunk.geometry.computeBoundingBox()
  chunk.geometry.computeBoundingSphere()
  // Future tree/rock batches rebuild their own placement only when their
  // owning chunk changes world index, not independently every frame.
  for (const callback of chunk.onRecycle) callback(chunk)
}

function surfaceHeightAt(chunk, x, worldZ) {
  // The analytic h() defines the valley, but a grid renders planar triangles.
  // Anchor future props to THAT triangle, avoiding tiny gaps on curved hills.
  const positions = chunk.geometry.attributes.position
  const localZ = THREE.MathUtils.clamp(worldZ - chunk.index * CHUNK_LENGTH, 0, CHUNK_LENGTH)
  const row = Math.min(Z_SEGMENTS - 1, Math.floor(localZ / (CHUNK_LENGTH / Z_SEGMENTS)))
  const clampedX = THREE.MathUtils.clamp(x, -HALF_WIDTH, RIGHT_WIDTH)
  let column = 0
  while (column < X_SEGMENTS - 1 && positions.getX(column + 1) < clampedX) column += 1
  const a = row * (X_SEGMENTS + 1) + column
  const b = a + X_SEGMENTS + 1
  const d = a + 1
  const c = b + 1
  const u = (clampedX - positions.getX(a)) / (positions.getX(d) - positions.getX(a))
  const v = (localZ - positions.getZ(a)) / (CHUNK_LENGTH / Z_SEGMENTS)
  return u + v <= 1
    ? positions.getY(a) * (1 - u - v) + positions.getY(d) * u + positions.getY(b) * v
    : positions.getY(c) * (u + v - 1) + positions.getY(d) * (1 - v) + positions.getY(b) * (1 - u)
}

function createMountainRing(hazeColor, getViewerZ) {
  const group = new THREE.Group()
  group.name = 'moonlit-mountain-ring'
  const haze = new THREE.Color(hazeColor ?? 0x142943)
  const tint = new THREE.Color()
  const rim = new THREE.Color(0x9fb4d8)
  const normal = new THREE.Vector3()
  const moonAngle = Math.atan2(MOON_DIRECTION.x, MOON_DIRECTION.z)
  const moonElevation = Math.asin(MOON_DIRECTION.y)
  const angular = 1024
  const radial = 6
  const rings = [
    { inner: 1050, outer: 1300, height: 210, amplitude: 90, color: 0x0b1a1f, topHaze: 0.15, baseHaze: 0.5, contrast: 0.8 },
    { inner: 1350, outer: 1750, height: 350, amplitude: 100, color: 0x15263c, topHaze: 0.35, baseHaze: 0.7, contrast: 0.88 }
  ]
  rings.forEach((ring, ringIndex) => {
    const forest = new THREE.Color(ring.color)
    const positions = new Float32Array((angular + 1) * (radial + 1) * 3)
    const colors = new Float32Array(positions.length)
    const indices = new Uint16Array(angular * radial * 6)
    for (let j = 0; j <= radial; j += 1) {
      const t = j / radial
      const radius = ring.inner + (ring.outer - ring.inner) * t
      const rise = Math.pow(Math.sin(Math.PI * t), 0.85)
      for (let i = 0; i <= angular; i += 1) {
        const angle = (i % angular) / angular * Math.PI * 2
        const wave = 0.5 * Math.sin(angle * 3 + ringIndex * 1.3) +
          0.3 * Math.sin(angle * 5 + 0.7) + 0.2 * Math.cos(angle * 9 - ringIndex)
        let height = -60 + rise * (ring.height + ring.amplitude * wave + 60)
        if (j === radial / 2) {
          const hash = Math.sin((i % angular) * 127.1 + ringIndex * 311.7 + 19.3) * 43758.5453
          height += 4 + 8 * (hash - Math.floor(hash))
          height = Math.min(height, ring.height + ring.amplitude)
        }
        // A broad saddle under the moon guarantees >= 3 degrees of clearance.
        const moonSector = smooth(Math.cos(25 * Math.PI / 180), Math.cos(12 * Math.PI / 180), Math.cos(angle - moonAngle))
        const ceiling = 5 + radius * Math.tan(moonElevation - 3 * Math.PI / 180)
        height = Math.min(height, ceiling + (1 - moonSector) * 1000)
        const offset = (j * (angular + 1) + i) * 3
        positions[offset] = radius * Math.sin(angle)
        positions[offset + 1] = height
        positions[offset + 2] = radius * Math.cos(angle)
        if (j < radial && i < angular) {
          const a = j * (angular + 1) + i
          const b = a + angular + 1
          indices.set([a, b, a + 1, a + 1, b, b + 1], (j * angular + i) * 6)
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    geometry.computeVertexNormals()
    const normals = geometry.attributes.normal
    // Weld the duplicate angular seam's shading without changing the buffers.
    for (let j = 0; j <= radial; j += 1) {
      const a = j * (angular + 1)
      const b = a + angular
      normal.set(normals.getX(a) + normals.getX(b), normals.getY(a) + normals.getY(b), normals.getZ(a) + normals.getZ(b)).normalize()
      normals.setXYZ(a, normal.x, normal.y, normal.z)
      normals.setXYZ(b, normal.x, normal.y, normal.z)
    }
    for (let j = 0; j <= radial; j += 1) {
      const rise = Math.pow(Math.sin(Math.PI * j / radial), 0.85)
      const mist = ring.baseHaze + (ring.topHaze - ring.baseHaze) * rise
      for (let i = 0; i <= angular; i += 1) {
        const vertex = j * (angular + 1) + i
        normal.fromBufferAttribute(normals, vertex)
        const facing = Math.max(0, normal.dot(MOON_DIRECTION))
        const speckle = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin((i % angular) * 127.1 + j * 311.7 + ringIndex))
        tint.copy(forest).multiplyScalar((0.3 + 0.7 * facing) * speckle).lerp(haze, mist)
        tint.lerp(rim, facing * rise * 0.025)
        // Preserve silhouette contrast even at the brightest moon-facing rim.
        tint.r = Math.min(tint.r, haze.r * ring.contrast)
        tint.g = Math.min(tint.g, haze.g * ring.contrast)
        tint.b = Math.min(tint.b, haze.b * ring.contrast)
        colors[vertex * 3] = tint.r; colors[vertex * 3 + 1] = tint.g; colors[vertex * 3 + 2] = tint.b
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: true })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `mountain-ring-${ringIndex}`
    mesh.renderOrder = -900
    mesh.frustumCulled = false
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.raycast = () => {}
    mesh.userData.noCameraCollision = true
    group.add(mesh)
  })
  function update() { group.position.set(0, 0, getViewerZ()) }
  update()
  // Geometry/material disposal is handled once by the valley traversal.
  return { group, update }
}

function createGroundCover(chunks, onChunkRecycle, cardGeometry, viewerZ) {
  const texture = new THREE.TextureLoader().load(broadleafCardUrl)
  texture.colorSpace = THREE.SRGBColorSpace
  const bushMaterial = new THREE.MeshLambertMaterial({ map: texture, color: new THREE.Color(0x4a6058).multiplyScalar(1.15), alphaTest: 0.5, side: THREE.DoubleSide, fog: true })
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2e31, flatShading: true, roughness: 1, fog: true })
  addSceneryFade(bushMaterial, viewerZ)
  addSceneryFade(rockMaterial, viewerZ)
  const bushGeometry = cardGeometry.clone()
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0)
  const transform = new THREE.Object3D()
  let seed = 0
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (const chunk of chunks) {
    const bushes = new THREE.InstancedMesh(bushGeometry, bushMaterial, 120)
    const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 60)
    bushes.name = 'moonlit-valley-bushes'
    rocks.name = 'moonlit-valley-rocks'
    for (const mesh of [bushes, rocks]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.boundingBox = new THREE.Box3()
      mesh.boundingSphere = new THREE.Sphere()
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.raycast = () => {}
      mesh.userData.noCameraCollision = true
      chunk.group.add(mesh)
    }
    const rebuildCover = () => {
      seed = (Math.imul(chunk.index, 668265263) ^ 0x62757368) >>> 0
      for (let i = 0; i < 120; i += 1) {
        const height = 1.2 + random() * 2.3
        const width = height * 0.5
        const x = (i % 2 ? 1 : -1) * (i < 48
          ? 4 + width * 0.5 + random() * (10 - width * 0.5)
          : i < 72 ? 14 + random() * 26 : 40 + random() * 80)
        const z = random() * CHUNK_LENGTH
        transform.position.set(x, surfaceHeightAt(chunk, x, chunk.index * CHUNK_LENGTH + z) - 0.1, z)
        transform.rotation.set(0, random() * Math.PI * 2, 0)
        transform.scale.set(width, height, width)
        transform.updateMatrix()
        bushes.setMatrixAt(i, transform.matrix)
      }
      for (let cluster = 0; cluster < 20; cluster += 1) {
        const side = cluster % 2 ? 1 : -1
        // Only two small clusters close to the track; most rocks sit farther out.
        const centreX = side * (cluster < 2 ? 12 + random() * 5 : 25 + random() * 90)
        const centreZ = 3 + random() * (CHUNK_LENGTH - 6)
        for (let k = 0; k < 3; k += 1) {
          const rawX = centreX + (random() - 0.5) * 6
          const size = 0.4 + random() * (Math.abs(rawX) < 20 ? 1.2 : 1.8)
          const scaleY = size * (0.5 + random() * 0.3)
          const x = side * THREE.MathUtils.clamp(Math.abs(rawX), 5 + size, 120 - size)
          const z = THREE.MathUtils.clamp(centreZ + (random() - 0.5) * 6, 0, CHUNK_LENGTH)
          transform.position.set(x, surfaceHeightAt(chunk, x, chunk.index * CHUNK_LENGTH + z) + scaleY * 0.5, z)
          transform.rotation.set((random() - 0.5) * 0.1, random() * Math.PI * 2, (random() - 0.5) * 0.1)
          transform.scale.set(size, scaleY, size)
          transform.updateMatrix()
          rocks.setMatrixAt(cluster * 3 + k, transform.matrix)
        }
      }
      bushes.instanceMatrix.needsUpdate = true
      rocks.instanceMatrix.needsUpdate = true
      bushes.computeBoundingBox(); bushes.computeBoundingSphere()
      rocks.computeBoundingBox(); rocks.computeBoundingSphere()
    }
    onChunkRecycle(chunk, rebuildCover)
    rebuildCover()
  }
  return texture
}

function createRails(getViewerZ) {
  const group = new THREE.Group()
  group.name = 'moonlit-valley-rails'
  const geometry = new THREE.BoxGeometry(0.07, 0.15, 2400)
  const material = new THREE.MeshStandardMaterial({ color: 0x252c32, metalness: 0.8, roughness: 0.35, fog: true })
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(geometry, material)
    // Level 2 has no physical wheel mesh: use track bed + 0.25 m rail top.
    mesh.position.set(side * (1.435 + 0.07) / 2, -2.5 + 0.25 - 0.15 / 2, 0)
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.raycast = () => {}
    mesh.userData.noCameraCollision = true
    group.add(mesh)
  }
  function update() { group.position.z = getViewerZ() }
  update()
  return { group, update }
}

function legacyPolesAndWires() {
  // Preserve moving-mode infrastructure exactly for this first step: x=11.5,
  // spacing 28 m, legacy 24 drawn poles/arms and TWO complete wire runs.
  // At x=11.5 the old corridor height function is always -2.5, so py=0.75.
  const group = new THREE.Group()
  group.name = 'trackside-infrastructure'
  const wood = new THREE.MeshStandardMaterial({ color: 0x3d2717, roughness: 0.9 })
  const wire = new THREE.LineBasicMaterial({ color: 0x111115 })
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 6.5, 8), wood, 24)
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.1, 0.12), wood, 24)
  const dummy = new THREE.Object3D()
  const runs = [[], []]
  let index = 0
  for (let z = -360; z <= 360; z += 28) {
    // Legacy's array capacity is 24 although this loop produces 26 wire
    // anchors. Keep that visible result without out-of-bounds matrix writes.
    if (index < 24) {
      dummy.position.set(11.5, 0.75, z)
      dummy.updateMatrix()
      poles.setMatrixAt(index, dummy.matrix)
      dummy.position.set(11.5, 3.55, z)
      dummy.updateMatrix()
      arms.setMatrixAt(index, dummy.matrix)
    }
    runs[0].push(new THREE.Vector3(10.75, 3.6, z))
    runs[1].push(new THREE.Vector3(12.25, 3.6, z))
    index += 1
  }
  poles.instanceMatrix.needsUpdate = true
  arms.instanceMatrix.needsUpdate = true
  group.add(poles, arms)
  for (const run of runs) {
    const points = []
    for (let i = 0; i < run.length - 1; i += 1) {
      const mid = new THREE.Vector3().lerpVectors(run[i], run[i + 1], 0.5)
      mid.y -= 0.85
      points.push(run[i], mid, run[i + 1])
    }
    const curve = new THREE.CatmullRomCurve3(points)
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(points.length * 4)), wire))
  }
  return group
}

export function createMoonlitValley(options = {}) {
  const group = new THREE.Group()
  group.name = 'outdoor-environment'
  const material = new THREE.MeshStandardMaterial({
    color: 0x243b33, vertexColors: true, roughness: 1, metalness: 0, fog: true
  })
  const chunks = Array.from({ length: CHUNK_COUNT }, () => createChunk(material))
  const getViewerZ = options.getViewerZ || (() => 0)
  const viewerZ = { value: getViewerZ() }
  addSceneryFade(material, viewerZ)
  let travel = 0
  let baseIndex = Math.floor(getViewerZ() / CHUNK_LENGTH) - AHEAD_CHUNKS
  chunks.forEach((chunk, i) => {
    rebuildChunk(chunk, baseIndex + i)
    chunk.group.position.z = chunk.index * CHUNK_LENGTH
    group.add(chunk.group)
  })
  function onChunkRecycle(chunk, callback) {
    chunk.onRecycle.add(callback)
    return () => chunk.onRecycle.delete(callback)
  }
  const forest = createForest(chunks, onChunkRecycle, viewerZ)
  const coverTexture = createGroundCover(chunks, onChunkRecycle, forest.geometry, viewerZ)
  const mountains = createMountainRing(options.fogColor, getViewerZ)
  const rails = createRails(getViewerZ)
  group.add(mountains.group, rails.group)
  const trackside = legacyPolesAndWires()
  group.add(trackside)
  const speed = options.speed || 35
  let disposed = false

  return {
    group,
    chunks,
    heightAt: valleyHeightAt,
    surfaceHeightAt,
    // Future props live in a chunk's local coordinates. Register a recycle
    // callback to reseed/re-anchor them when this group gets a new world index.
    addToChunk(chunk, object, { x, worldZ, heightOffset = 0 }) {
      object.position.set(x, surfaceHeightAt(chunk, x, worldZ) + heightOffset, worldZ - chunk.index * CHUNK_LENGTH)
      chunk.group.add(object)
      return object
    },
    onChunkRecycle,
    update(delta) {
      if (disposed) return
      travel += delta * speed // Signed scenery delta eases forward, stopped or backward.
      const desiredBase = Math.floor((getViewerZ() - travel) / CHUNK_LENGTH) - AHEAD_CHUNKS
      // Integer world indices work in either direction. Rebuild AT MOST ONE
      // existing buffer per frame; nine groups always remain adjacent. Large
      // teleports catch up across frames instead of rebuilding all nine at once.
      if (desiredBase < baseIndex) {
        rebuildChunk(chunks.find((chunk) => chunk.index === baseIndex + CHUNK_COUNT - 1), baseIndex - 1)
        baseIndex -= 1
      } else if (desiredBase > baseIndex) {
        rebuildChunk(chunks.find((chunk) => chunk.index === baseIndex), baseIndex + CHUNK_COUNT)
        baseIndex += 1
      }
      for (const chunk of chunks) chunk.group.position.z = chunk.index * CHUNK_LENGTH + travel
      // Poles intentionally retain their old wrap for now, driven by the SAME
      // accumulated travel. Forests move with their owning terrain chunks.
      trackside.position.z = ((travel % 28) + 28) % 28 - 14
      viewerZ.value = getViewerZ()
      mountains.update()
      rails.update()
    },
    dispose() {
      if (disposed) return
      disposed = true
      // Dispose these owned shared resources once, outside the generic traversal.
      forest.geometry.dispose()
      forest.materials.forEach((material) => material.dispose())
      forest.textures.forEach((texture) => texture.dispose())
      coverTexture.dispose()
      const geometries = new Set()
      const materials = new Set()
      group.traverse((node) => {
        if (node.geometry === forest.geometry) {
          if (node.isInstancedMesh) node.dispose()
          return
        }
        if (node.geometry) geometries.add(node.geometry)
        if (node.material) materials.add(node.material)
        if (node.isInstancedMesh) node.dispose()
      })
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      chunks.forEach((chunk) => chunk.onRecycle.clear())
    }
  }
}

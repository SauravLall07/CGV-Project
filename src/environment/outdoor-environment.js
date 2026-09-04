import * as THREE from 'three'
import { createSkyShaderMaterial } from '../shaders/sky-shader.js'
import { createTerrainShaderMaterial } from '../shaders/terrain-shader.js'
import { createVegetationShaderMaterial } from '../shaders/vegetation-shader.js'
import { disposeObject } from '../core/dispose.js'

/**
 * 3D Realistic Outdoor Environment System
 * Builds a multi-layered surrounding environment around the train scene:
 * - Atmospheric Sky Dome with Rayleigh scattering & sun bloom
 * - Multi-tiered 3D Terrain (distant mountain peaks, midground rolling hills, ballast embankment)
 * - Instanced Forests (Pine & Deciduous trees), wild bushes, jagged rocks
 * - Trackside railway infrastructure (Telegraph poles, sagging wires, signal gantries, fence posts)
 * - Motion support (stationary for station level, dynamic scrolling for moving heist levels)
 * - Automatic quality tiers (HIGH, MEDIUM, LOW)
 */
// The playable envelope the scenery has to stay clear of: the station concourse
// (x -5..5), the carriage interiors (x ~ 0) and the track (x = 7). Terrain stays
// flat inside CORRIDOR_FLAT_HALF_WIDTH of the centre, and nothing is planted
// closer than CORRIDOR_CLEAR_X, so no hill or tree can intrude on the station or
// sweep through a carriage.
const CORRIDOR_CENTER_X = 1.0
const CORRIDOR_FLAT_HALF_WIDTH = 20.0
const CORRIDOR_CLEAR_X = 24.0

export function createOutdoorEnvironment(options = {}) {
  const mode = options.mode || 'station' // 'station' | 'moving'
  const speed = options.speed || 35.0 // Speed for moving train mode
  const isStormy = options.stormy || false

  // Detect quality level
  const pixelRatio = window.devicePixelRatio || 1
  const isMobile = window.innerWidth < 768 || pixelRatio > 2.5
  const quality = options.quality || (isMobile ? 'LOW' : 'HIGH')

  const group = new THREE.Group()
  group.name = 'outdoor-environment'

  const disposables = []

  // -------------------------------------------------------------
  // 1. Sky Dome & Atmosphere Setup
  // -------------------------------------------------------------
  const sunPosition = options.sunPosition || new THREE.Vector3(120, 35, -90)
  
  const skyTopColor = isStormy ? new THREE.Color(0x0f0b14) : new THREE.Color(0x14192d)
  const skyBottomColor = isStormy ? new THREE.Color(0x4a181b) : new THREE.Color(0xef7d43)
  const sunColor = isStormy ? new THREE.Color(0xff4a3a) : new THREE.Color(0xffd194)
  const atmosphereColor = isStormy ? new THREE.Color(0x3a121d) : new THREE.Color(0x69547d)
  const fogColor = isStormy ? new THREE.Color(0x1a0708) : new THREE.Color(0x241d24)

  const skyMaterial = createSkyShaderMaterial({
    sunPosition,
    topColor: skyTopColor,
    bottomColor: skyBottomColor,
    sunColor,
    atmosphereColor,
    cloudColor: isStormy ? new THREE.Color(0x24080a) : new THREE.Color(0x2b2236),
    hazeDensity: isStormy ? 0.9 : 0.6
  })
  disposables.push(skyMaterial)

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(650, 24, 16),
    skyMaterial
  )
  group.add(skyDome)
  disposables.push(skyDome.geometry)

  // -------------------------------------------------------------
  // 2. Procedural 3D Terrain (Hills & Mountains)
  // -------------------------------------------------------------
  const terrainMaterial = createTerrainShaderMaterial({
    sunDirection: sunPosition.clone().normalize(),
    sunColor,
    skyColor: new THREE.Color(0x5e6f96),
    groundColor: new THREE.Color(0x2a221b),
    grassColor: isStormy ? new THREE.Color(0x1b2416) : new THREE.Color(0x2e3d26),
    rockColor: isStormy ? new THREE.Color(0x332c28) : new THREE.Color(0x4d4944),
    gravelColor: new THREE.Color(0x3d3830),
    fogColor,
    fogNear: isStormy ? 15.0 : 35.0,
    fogFar: isStormy ? 120.0 : 260.0
  })
  disposables.push(terrainMaterial)

  // Trigonometric procedural height calculation
  function getTerrainHeight(x, z) {
    // Keep a flat corridor around the whole PLAYABLE envelope, not just the
    // track. The station spans x -5..5 with its rear wall at x = -5, and the
    // carriage interiors sit at x ~ 0, so a corridor centred on the track
    // (x = 7) with an 8 m half-width put a 13 m hillside — and the trees
    // planted on it — directly behind the station wall and above its roofline.
    const distFromCorridor = Math.abs(x - CORRIDOR_CENTER_X)
    const corridorFactor = THREE.MathUtils.smoothstep(distFromCorridor, CORRIDOR_FLAT_HALF_WIDTH, 62.0)

    // Layered sine/cosine height noise
    const hill1 = Math.sin(x * 0.015 + z * 0.012) * 18.0
    const hill2 = Math.cos(x * 0.035 - z * 0.025) * 8.0
    const ridge = Math.sin((x + 100) * 0.008) * Math.cos(z * 0.008) * 45.0
    
    // Far distant mountain peak boost
    const mountainBoost = Math.pow(Math.max(0.0, (Math.abs(x) - 80.0) / 120.0), 1.8) * 65.0

    return (hill1 + hill2 + ridge) * corridorFactor + mountainBoost - 2.5
  }

  // Build Terrain Mesh
  const gridSegs = quality === 'HIGH' ? 96 : (quality === 'MEDIUM' ? 64 : 36)
  const terrainGeo = new THREE.PlaneGeometry(750, 750, gridSegs, gridSegs)
  terrainGeo.rotateX(-Math.PI / 2)

  const posAttr = terrainGeo.attributes.position
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i)
    const z = posAttr.getZ(i)
    const y = getTerrainHeight(x, z)
    posAttr.setY(i, y)
  }
  terrainGeo.computeVertexNormals()
  disposables.push(terrainGeo)

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMaterial)
  terrainMesh.receiveShadow = true
  group.add(terrainMesh)

  // -------------------------------------------------------------
  // 3. Instanced Forests & Vegetation (Pine, Deciduous, Bushes, Rocks)
  // -------------------------------------------------------------
  const vegMaterial = createVegetationShaderMaterial({
    windSpeed: 1.8,
    windStrength: isStormy ? 0.35 : 0.15,
    sunDirection: sunPosition.clone().normalize(),
    sunColor,
    skyColor: new THREE.Color(0x5e6f96),
    foliageColor: isStormy ? new THREE.Color(0x162414) : new THREE.Color(0x1e331a),
    highlightColor: isStormy ? new THREE.Color(0x324d29) : new THREE.Color(0x416334),
    fogColor,
    fogNear: isStormy ? 15.0 : 35.0,
    fogFar: isStormy ? 120.0 : 260.0
  })
  disposables.push(vegMaterial)

  // Low-poly Pine Tree Geometry
  function createPineTreeGeometry() {
    const geo = new THREE.BufferGeometry()
    const parts = []
    
    // Trunk
    const trunk = new THREE.CylinderGeometry(0.2, 0.35, 1.8, 6)
    trunk.translate(0, 0.9, 0)
    parts.push(trunk)

    // 3 Tiers of foliage cones
    for (let i = 0; i < 3; i++) {
      const radius = 1.6 - i * 0.35
      const height = 2.2 - i * 0.3
      const cone = new THREE.ConeGeometry(radius, height, 7)
      cone.translate(0, 1.8 + i * 1.3, 0)
      parts.push(cone)
    }

    // Merge geometries manually for low overhead
    const merged = mergeBufferGeometries(parts)
    parts.forEach(p => p.dispose())
    return merged
  }

  // Low-poly Deciduous Tree Geometry
  function createDeciduousTreeGeometry() {
    const parts = []
    const trunk = new THREE.CylinderGeometry(0.25, 0.45, 2.2, 6)
    trunk.translate(0, 1.1, 0)
    parts.push(trunk)

    const crown = new THREE.DodecahedronGeometry(1.8, 1)
    crown.scale(1, 0.8, 1)
    crown.translate(0, 2.8, 0)
    parts.push(crown)

    const merged = mergeBufferGeometries(parts)
    parts.forEach(p => p.dispose())
    return merged
  }

  // Low-poly Bush Geometry
  function createBushGeometry() {
    const bush = new THREE.DodecahedronGeometry(0.9, 1)
    bush.scale(1, 0.6, 1.1)
    bush.translate(0, 0.45, 0)
    return bush
  }

  // Rock Geometry
  function createRockGeometry() {
    const rock = new THREE.DodecahedronGeometry(0.8, 0)
    rock.scale(1.3, 0.7, 1.0)
    return rock
  }

  const pineGeo = createPineTreeGeometry()
  const decGeo = createDeciduousTreeGeometry()
  const bushGeo = createBushGeometry()
  const rockGeo = createRockGeometry()

  disposables.push(pineGeo, decGeo, bushGeo, rockGeo)

  // Tree distribution & instance count based on Quality
  const treeCount = quality === 'HIGH' ? 900 : (quality === 'MEDIUM' ? 500 : 250)
  const bushCount = quality === 'HIGH' ? 400 : (quality === 'MEDIUM' ? 200 : 100)
  const rockCount = quality === 'HIGH' ? 250 : (quality === 'MEDIUM' ? 120 : 60)

  const pineMesh = new THREE.InstancedMesh(pineGeo, vegMaterial, treeCount)
  const decMesh = new THREE.InstancedMesh(decGeo, vegMaterial, Math.floor(treeCount * 0.4))
  const bushMesh = new THREE.InstancedMesh(bushGeo, vegMaterial, bushCount)
  
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x484440, roughness: 0.8, metalness: 0.2 })
  disposables.push(rockMaterial)
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMaterial, rockCount)

  pineMesh.castShadow = true
  decMesh.castShadow = true
  bushMesh.castShadow = true
  rockMesh.castShadow = true

  const dummy = new THREE.Object3D()
  
  // Seeded distribution of vegetation outside railway corridor
  let pineIdx = 0, decIdx = 0, bushIdx = 0, rockIdx = 0
  const rangeX = 320, rangeZ = 360

  for (let i = 0; i < treeCount * 2; i++) {
    // Push every trunk clear of the playable corridor, measured from the
    // corridor centre rather than from x = 0.
    let rx = (Math.random() - 0.5) * rangeX * 2
    rx += rx > 0 ? CORRIDOR_CLEAR_X + CORRIDOR_CENTER_X : -CORRIDOR_CLEAR_X + CORRIDOR_CENTER_X

    const rz = (Math.random() - 0.5) * rangeZ * 2
    const ry = getTerrainHeight(rx, rz)

    // Skip if below ground level or too high up rocky peaks
    if (ry < -2 || ry > 45) continue

    const scale = 0.75 + Math.random() * 0.65
    dummy.position.set(rx, ry, rz)
    dummy.rotation.y = Math.random() * Math.PI * 2
    dummy.rotation.x = (Math.random() - 0.5) * 0.1
    dummy.scale.set(scale, scale * (0.9 + Math.random() * 0.2), scale)
    dummy.updateMatrix()

    if (i % 3 === 0 && decIdx < Math.floor(treeCount * 0.4)) {
      decMesh.setMatrixAt(decIdx++, dummy.matrix)
    } else if (pineIdx < treeCount) {
      pineMesh.setMatrixAt(pineIdx++, dummy.matrix)
    }
  }

  // Populate Bushes
  for (let i = 0; i < bushCount; i++) {
    let rx = (Math.random() - 0.5) * rangeX * 1.5
    rx += rx > 0 ? CORRIDOR_CLEAR_X + CORRIDOR_CENTER_X : -CORRIDOR_CLEAR_X + CORRIDOR_CENTER_X

    const rz = (Math.random() - 0.5) * rangeZ * 1.8
    const ry = getTerrainHeight(rx, rz)

    const scale = 0.6 + Math.random() * 0.8
    dummy.position.set(rx, ry, rz)
    dummy.rotation.y = Math.random() * Math.PI * 2
    dummy.scale.set(scale, scale, scale)
    dummy.updateMatrix()
    bushMesh.setMatrixAt(bushIdx++, dummy.matrix)
  }

  // Populate Rocks
  for (let i = 0; i < rockCount; i++) {
    let rx = (Math.random() - 0.5) * rangeX * 1.8
    rx += rx > 0 ? CORRIDOR_CLEAR_X + CORRIDOR_CENTER_X : -CORRIDOR_CLEAR_X + CORRIDOR_CENTER_X

    const rz = (Math.random() - 0.5) * rangeZ * 1.8
    const ry = getTerrainHeight(rx, rz)

    const scale = 0.8 + Math.random() * 1.4
    dummy.position.set(rx, ry, rz)
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0)
    dummy.scale.set(scale * 1.2, scale * 0.6, scale)
    dummy.updateMatrix()
    rockMesh.setMatrixAt(rockIdx++, dummy.matrix)
  }

  // Draw only the instances that actually got a matrix. The scatter loops
  // `continue` past rejected positions, so these meshes are always allocated
  // for more instances than get placed — and every unwritten instance keeps the
  // identity matrix, which draws it at the world origin. Left unset, the
  // leftovers pile into one black blob in the middle of the station and, in the
  // moving levels, slide straight through the carriage interiors.
  pineMesh.count = pineIdx
  decMesh.count = decIdx
  bushMesh.count = bushIdx
  rockMesh.count = rockIdx

  pineMesh.instanceMatrix.needsUpdate = true
  decMesh.instanceMatrix.needsUpdate = true
  bushMesh.instanceMatrix.needsUpdate = true
  rockMesh.instanceMatrix.needsUpdate = true

  group.add(pineMesh, decMesh, bushMesh, rockMesh)

  // -------------------------------------------------------------
  // 4. Trackside Infrastructure (Telegraph Poles, Wires, Gantries, Fences)
  // -------------------------------------------------------------
  const tracksideGroup = new THREE.Group()
  tracksideGroup.name = 'trackside-infrastructure'

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d2717, roughness: 0.9 })
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x22262a, metalness: 0.8, roughness: 0.4 })
  const wireMat = new THREE.LineBasicMaterial({ color: 0x111115 })
  disposables.push(woodMat, metalMat, wireMat)

  const poleZSpacing = 28.0
  const poleCount = Math.floor(rangeZ / poleZSpacing) * 2

  const polesInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.16, 6.5, 8),
    woodMat,
    poleCount
  )
  const crossarmInst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.8, 0.1, 0.12),
    woodMat,
    poleCount
  )

  let poleIdx = 0
  const wirePoints = []

  for (let z = -rangeZ; z <= rangeZ; z += poleZSpacing) {
    const px = 11.5 // Parallel to track at X = 7
    const py = getTerrainHeight(px, z) + 3.25

    dummy.position.set(px, py, z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    polesInst.setMatrixAt(poleIdx, dummy.matrix)

    dummy.position.set(px, py + 2.8, z)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    crossarmInst.setMatrixAt(poleIdx, dummy.matrix)

    // Collect wire attachment points for sagging telegraph wires
    wirePoints.push(new THREE.Vector3(px - 0.75, py + 2.85, z))
    wirePoints.push(new THREE.Vector3(px + 0.75, py + 2.85, z))

    poleIdx++
  }

  // Same identity-matrix trap: the z loop can run a different number of times
  // than poleCount estimated, in either direction.
  polesInst.count = Math.min(poleIdx, poleCount)
  crossarmInst.count = Math.min(poleIdx, poleCount)

  polesInst.instanceMatrix.needsUpdate = true
  crossarmInst.instanceMatrix.needsUpdate = true
  polesInst.castShadow = true
  tracksideGroup.add(polesInst, crossarmInst)

  // Generate sagging catenary telegraph line wires
  for (let side = 0; side < 2; side++) {
    const points = []
    for (let i = side; i < wirePoints.length - 2; i += 2) {
      const p1 = wirePoints[i]
      const p2 = wirePoints[i + 2]
      const midZ = (p1.z + p2.z) / 2
      const midY = (p1.y + p2.y) / 2 - 0.85 // Sag

      points.push(p1, new THREE.Vector3(p1.x, midY, midZ), p2)
    }
    if (points.length > 1) {
      const curve = new THREE.CatmullRomCurve3(points)
      const wireGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(points.length * 4))
      const wireLine = new THREE.Line(wireGeo, wireMat)
      tracksideGroup.add(wireLine)
      disposables.push(wireGeo)
    }
  }

  // Rustic Wooden Fence Lines along railway corridor
  const fencePostsCount = 80
  const fencePostGeo = new THREE.BoxGeometry(0.1, 1.2, 0.1)
  const fenceRailGeo = new THREE.BoxGeometry(0.06, 0.08, 3.8)
  disposables.push(fencePostGeo, fenceRailGeo)

  const fencePostsMesh = new THREE.InstancedMesh(fencePostGeo, woodMat, fencePostsCount * 2)
  const fenceRailsMesh = new THREE.InstancedMesh(fenceRailGeo, woodMat, fencePostsCount * 2)

  let fIdx = 0, rIdx = 0
  for (const sideX of [2.0, 12.5]) { // Fence on left and right of track corridor
    for (let z = -140; z <= 140; z += 3.8) {
      if (fIdx >= fencePostsCount * 2) break

      const fy = getTerrainHeight(sideX, z) + 0.6
      dummy.position.set(sideX, fy, z)
      dummy.rotation.set(0, 0, (Math.random() - 0.5) * 0.08)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      fencePostsMesh.setMatrixAt(fIdx++, dummy.matrix)

      // Top rail
      dummy.position.set(sideX, fy + 0.35, z + 1.9)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      fenceRailsMesh.setMatrixAt(rIdx++, dummy.matrix)
    }
  }
  fencePostsMesh.count = fIdx
  fenceRailsMesh.count = rIdx

  fencePostsMesh.instanceMatrix.needsUpdate = true
  fenceRailsMesh.instanceMatrix.needsUpdate = true
  tracksideGroup.add(fencePostsMesh, fenceRailsMesh)

  group.add(tracksideGroup)

  // -------------------------------------------------------------
  // 5. Dynamic Motion / Parallax Updates
  // -------------------------------------------------------------
  let elapsed = 0
  let scrollerZ = 0
  let currentSpotLights = options.stationSpotLights || []

  function applySpotLights(spotLights) {
    currentSpotLights = spotLights || []
    if (!currentSpotLights.length) return

    const count = Math.min(3, currentSpotLights.length)
    const posArr = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
    const dirArr = [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0)]
    const colArr = [new THREE.Color(0x000000), new THREE.Color(0x000000), new THREE.Color(0x000000)]
    const paramsArr = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()]

    const tempTargetPos = new THREE.Vector3()

    for (let i = 0; i < count; i++) {
      const light = currentSpotLights[i]
      if (!light) continue

      light.getWorldPosition(posArr[i])

      if (light.target) {
        light.target.getWorldPosition(tempTargetPos)
        dirArr[i].subVectors(tempTargetPos, posArr[i]).normalize()
      } else {
        dirArr[i].set(0, -1, 0).applyQuaternion(light.quaternion).normalize()
      }

      colArr[i].copy(light.color)

      const intensity = light.intensity
      const cutoffCos = Math.cos(light.angle)
      const penumbraCos = Math.cos(light.angle * (1.0 - light.penumbra))
      const maxDist = light.distance || 150.0

      paramsArr[i].set(intensity, cutoffCos, penumbraCos, maxDist)
    }

    [terrainMaterial, vegMaterial].forEach(mat => {
      if (mat && mat.customUniforms) {
        mat.customUniforms.uStationSpotLightCount.value = count
        mat.customUniforms.uStationSpotLightPos.value = posArr
        mat.customUniforms.uStationSpotLightDir.value = dirArr
        mat.customUniforms.uStationSpotLightColor.value = colArr
        mat.customUniforms.uStationSpotLightParams.value = paramsArr
      }
    })
  }

  if (options.stationSpotLights) {
    applySpotLights(options.stationSpotLights)
  }

  return {
    group,
    skyDome,
    terrainMesh,
    setStationSpotLights: applySpotLights,

    update(delta) {
      elapsed += delta

      if (currentSpotLights.length > 0) {
        applySpotLights(currentSpotLights)
      }

      // Update shader time uniforms
      if (skyMaterial.customUniforms) skyMaterial.customUniforms.uTime.value = elapsed
      if (terrainMaterial.customUniforms) terrainMaterial.customUniforms.uTime.value = elapsed
      if (vegMaterial.customUniforms) vegMaterial.customUniforms.uTime.value = elapsed

      // Dynamic scrolling for moving train levels
      if (mode === 'moving') {
        const moveDist = delta * speed
        scrollerZ += moveDist

        // Wrap trackside & terrain offset along Z to simulate endless travel
        tracksideGroup.position.z = (scrollerZ % 28.0) - 14.0
        terrainMesh.position.z = (scrollerZ % 50.0) - 25.0
        pineMesh.position.z = (scrollerZ % 60.0) - 30.0
        decMesh.position.z = (scrollerZ % 60.0) - 30.0
        bushMesh.position.z = (scrollerZ % 40.0) - 20.0
        rockMesh.position.z = (scrollerZ % 40.0) - 20.0
      }
    },

    dispose() {
      group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose()
      })
      disposables.forEach(d => {
        if (d.dispose) d.dispose()
      })
      disposeObject(group)
    }
  }
}

/**
 * Utility helper to merge BufferGeometries for low draw calls
 */
function mergeBufferGeometries(geometries) {
  let totalVerts = 0
  let totalIndices = 0

  geometries.forEach(g => {
    totalVerts += g.attributes.position.count
    if (g.index) totalIndices += g.index.count
  })

  const mergedPos = new Float32Array(totalVerts * 3)
  const mergedNorm = new Float32Array(totalVerts * 3)

  let vertOffset = 0
  geometries.forEach(g => {
    const p = g.attributes.position.array
    const n = g.attributes.normal ? g.attributes.normal.array : null

    mergedPos.set(p, vertOffset * 3)
    if (n) mergedNorm.set(n, vertOffset * 3)
    vertOffset += g.attributes.position.count
  })

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3))

  return merged
}

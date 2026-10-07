import * as THREE from 'three'
import { createTerrainShaderMaterial } from '../shaders/terrain-shader.js'
import { createVegetationShaderMaterial } from '../shaders/vegetation-shader.js'
import { enableWind } from './nature-props.js'
import { createDistantRangeMaterial } from '../shaders/distant-range-shader.js'
import { createValleyLightsMaterial } from '../shaders/valley-lights-shader.js'
import { createRockShaderMaterial } from '../shaders/rock-shader.js'
import { createLakeMaterial } from '../shaders/lake-shader.js'
import { SUN_DIRECTION } from './station-blockout.js'
import { insideLanding, LANDING_CLEAR } from './landing/layout.js'
import { disposeObject } from '../core/dispose.js'
import { createGrassField, grassDistance } from './grass-field.js'

/**
 * 3D Realistic Outdoor Environment System
 * Builds a multi-layered surrounding environment around the train scene:
 * - Multi-tiered 3D Terrain (Boarding: a valley around the playable run; moving levels: the original hills)
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

// Reserve the complete Level 1 indoor expansion footprint now (tutorial,
// guards and bridge passageways). Passageways 2/3 will descend below platform
// level, so merely flattening the outdoor terrain at y=-2.5 is not sufficient:
// the terrain must stay underneath the entire enclosed route. The final train
// platform at positive Z intentionally remains outside this exclusion so it can
// keep the level's only exterior-facing environment.
const WEST_WING_CLEAR_MIN_X = -190.0
const WEST_WING_CLEAR_MAX_X = 10.0
const WEST_WING_CLEAR_MIN_Z = -58.0
const WEST_WING_CLEAR_MAX_Z = -14.0
const WEST_WING_TERRAIN_Y = -10.0

// Boarding's walkable footprint. The valley is measured from this box,
// not from the world origin: the station sits at the east end of a run
// that starts near x = -189.
const PLAY_MIN_X = -189
const PLAY_MAX_X = 4.3
const PLAY_MIN_Z = -52
const PLAY_MAX_Z = 27

// Enclosed floors. Terrain under these stays at WEST_WING_TERRAIN_Y so it
// cannot poke through a passage. The open gantry (x <= -170) is not a
// footprint; it gets a pad. Bounds match the passage modules.
const PASSAGE_FOOTPRINTS = [
  { minX: -177.2, maxX: -157.8, minZ: -28.2, maxZ: -20.8 },
  { minX: -160.0, maxX: -124.5, minZ: -41.0, maxZ: -20.6 },
  { minX: -127.0, maxX: -79.0, minZ: -42.8, maxZ: -33.8 },
  { minX: -81.2, maxX: -51.0, minZ: -52.2, maxZ: -21.2 },
  { minX: -53.5, maxX: 11.0, minZ: -30.5, maxZ: -13.5 }
]

function isInsideWestWingClearance(x, z) {
  return (
    x >= WEST_WING_CLEAR_MIN_X &&
    x <= WEST_WING_CLEAR_MAX_X &&
    z >= WEST_WING_CLEAR_MIN_Z &&
    z <= WEST_WING_CLEAR_MAX_Z
  )
}

function distOutsideRect(x, z, minX, maxX, minZ, maxZ) {
  const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0
  const dz = z < minZ ? minZ - z : z > maxZ ? z - maxZ : 0
  return Math.hypot(dx, dz)
}

// 0 when (x, z) is inside any enclosed footprint, otherwise the distance
// to the nearest one. Used to lift the ground up to the building line.
function gapOutsideFootprints(x, z) {
  let gap = Infinity
  for (const box of PASSAGE_FOOTPRINTS) {
    const dx = x < box.minX ? box.minX - x : x > box.maxX ? x - box.maxX : 0
    const dz = z < box.minZ ? box.minZ - z : z > box.maxZ ? z - box.maxZ : 0
    if (dx === 0 && dz === 0) return 0
    gap = Math.min(gap, Math.hypot(dx, dz))
  }
  return gap
}

// North of the gantry, left of the east-facing spawn view. The ellipse
// stays clear of the west wing (z max −14) and the railway corridor.
const LAKE_CX = -95
const LAKE_CZ = 42
const LAKE_RX = 62
const LAKE_RZ = 38

function lakeDrop(x, z) {
  const r = Math.hypot((x - LAKE_CX) / LAKE_RX, (z - LAKE_CZ) / LAKE_RZ)
  if (r >= 1) return 0
  return Math.pow(1 - r, 1.35) * 5.4
}

function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453
  return n - Math.floor(n)
}

function valueNoise2(x, z) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const a = hash2(ix, iz)
  const b = hash2(ix + 1, iz)
  const c = hash2(ix, iz + 1)
  const d = hash2(ix + 1, iz + 1)
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}

// Hillsides come out high, clearings and valley floor come out low.
function forestMask(x, z) {
  return valueNoise2(x * 0.008, z * 0.008) * 0.65
    + valueNoise2(x * 0.019 + 4.2, z * 0.019 - 1.7) * 0.35
}

function makeRng(seed) {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

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

  let disposed = false
  let grassField = null

  // -------------------------------------------------------------
  // 1. Sun and fog colours for the terrain and trees. The visible sky is the
  //    dome from sky-dome.js, added by the level, not a mesh in this group.
  // -------------------------------------------------------------
  const sunPosition = options.sunPosition || new THREE.Vector3(120, 35, -90)

  const sunColor = options.sunColor
    ? new THREE.Color(options.sunColor)
    : new THREE.Color(isStormy ? 0x8a9bb4 : 0xffd194)
  // The sky dome lives in sky-dome.js now. This colour is only the fog the
  // terrain and trees fade into, and it is meant to match that sky's horizon.
  const fogColor = options.fogColor
    ? new THREE.Color(options.fogColor)
    : new THREE.Color(isStormy ? 0x182430 : 0xf0946a)
  const skyColor = options.skyColor
    ? new THREE.Color(options.skyColor)
    : new THREE.Color(0x5e6f96)
  const groundColor = options.groundColor
    ? new THREE.Color(options.groundColor)
    : new THREE.Color(0x2a221b)
  const fogNear = options.fogNear ?? (isStormy ? 15.0 : 35.0)
  const fogFar = options.fogFar ?? (isStormy ? 120.0 : 260.0)
  const fogMax = options.fogMax ?? 1.0

  // -------------------------------------------------------------
  // 2. Procedural 3D Terrain (Hills & Mountains)
  // -------------------------------------------------------------
  const terrainMaterial = createTerrainShaderMaterial({
    sunDirection: sunPosition.clone().normalize(),
    sunColor,
    skyColor,
    groundColor,
    grassColor: isStormy ? new THREE.Color(0x1b2416) : new THREE.Color(0x2e3d26),
    rockColor: isStormy ? new THREE.Color(0x332c28) : new THREE.Color(0x4d4944),
    gravelColor: new THREE.Color(0x3d3830),
    fogColor,
    fogNear,
    fogFar,
    fogMax,
    ambient: options.terrainAmbient ?? 0.7,
    mist: mode === 'station' ? 0.42 : 0,
    paths: mode === 'station' ? 1 : 0,
    photo: mode === 'station' && options.nature?.groundMap ? 1 : 0,
    groundMap: options.nature?.groundMap || null,
    groundNormal: options.nature?.groundNormal || null,
    rockMap: options.nature?.rockMap || null,
    rockNormal: options.nature?.rockNormal || null
  })

  // Moving Heist and Timewreck scroll this same mesh. They keep the original
  // profile, which was built around the train at x = 0. Boarding does not:
  // its playable run is x -189..4.3, and the old |x| boost put a wall
  // beside the station.
  function getLegacyTerrainHeight(x, z) {
    if (isInsideWestWingClearance(x, z)) {
      return WEST_WING_TERRAIN_Y
    }

    const distFromCorridor = Math.abs(x - CORRIDOR_CENTER_X)
    const corridorFactor = THREE.MathUtils.smoothstep(
      distFromCorridor,
      CORRIDOR_FLAT_HALF_WIDTH,
      62.0
    )

    const hill1 = Math.sin(x * 0.015 + z * 0.012) * 18.0
    const hill2 = Math.cos(x * 0.035 - z * 0.025) * 8.0
    const ridge =
      Math.sin((x + 100) * 0.008) *
      Math.cos(z * 0.008) *
      45.0

    const mountainBoost =
      Math.pow(
        Math.max(0.0, (Math.abs(x) - 80.0) / 120.0),
        1.8
      ) * 65.0

    return (
      (hill1 + hill2 + ridge) * corridorFactor +
      mountainBoost -
      2.5
    )
  }

  // Gentle rolls, a few metres at the playable edge and up to about 20 m
  // by 100 m out. Past that the ground keeps climbing, then the border is
  // pulled back down so the square mesh edge stays under the distant ranges.
  function rawValleyHeight(x, z) {
    const d = distOutsideRect(x, z, PLAY_MIN_X, PLAY_MAX_X, PLAY_MIN_Z, PLAY_MAX_Z)
    const foothill = THREE.MathUtils.smoothstep(d, 6, 100)
    const roll =
      Math.sin(x * 0.018 + z * 0.014) * 2.6 +
      Math.cos(x * 0.031 - z * 0.022) * 1.4 +
      Math.sin(x * 0.007 + 2.1) * Math.cos(z * 0.006) * 1.6
    const apron = THREE.MathUtils.lerp(1.6, 9.5, foothill)
    const beyond = Math.max(0, d - 100)
    const rise = Math.pow(beyond / 360, 1.35) * 28
    let height = apron + roll * (0.45 + 0.55 * foothill) + rise
    const radial = Math.hypot(x, z)
    const edgeFade = THREE.MathUtils.smoothstep(radial, 260, 370)
    height = THREE.MathUtils.lerp(height, 10, edgeFade)
    return Math.max(height, -1.2)
  }

  function getStationTerrainHeight(x, z) {
    if (isInsideWestWingClearance(x, z)) {
      // Open service gantry, plus the first metres under the doorway so the
      // pad meets the interior floor instead of dropping into the pit.
      // The deck bottom is about y = -0.28. North and south of the rails
      // the pad rises into a low bank.
      if (x <= -170) {
        const lateral = Math.abs(z - (-24.5))
        const out = THREE.MathUtils.smoothstep(lateral, 3.2, 34)
        return THREE.MathUtils.lerp(-0.4, 1.8, out)
      }

      // Under the enclosed floors, stay clear. Beside them, climb to a low
      // cutting so the outside of a passage reads as built into the ground.
      const gap = gapOutsideFootprints(x, z)
      if (gap <= 0.4) return WEST_WING_TERRAIN_Y
      const lip = THREE.MathUtils.smoothstep(gap, 0.4, 8)
      const beside = Math.min(rawValleyHeight(x, z), 2.4)
      return THREE.MathUtils.lerp(-4.5, beside, lip)
    }

    let height = rawValleyHeight(x, z)
    const wingGap = distOutsideRect(
      x, z,
      WEST_WING_CLEAR_MIN_X, WEST_WING_CLEAR_MAX_X,
      WEST_WING_CLEAR_MIN_Z, WEST_WING_CLEAR_MAX_Z
    )
    if (wingGap < 18) {
      const t = THREE.MathUtils.smoothstep(wingGap, 0, 18)
      height = THREE.MathUtils.lerp(Math.min(height, 1.6), height, t)
    }

    // The railway corridor stays flat, same as the moving levels, so the
    // platform and the track are not sitting on a hill.
    const distFromCorridor = Math.abs(x - CORRIDOR_CENTER_X)
    const corridorFactor = THREE.MathUtils.smoothstep(
      distFromCorridor,
      CORRIDOR_FLAT_HALF_WIDTH,
      70
    )
    const drop = lakeDrop(x, z)
    if (drop > 0) height -= drop
    height = THREE.MathUtils.lerp(-2.5, height, corridorFactor)
    // The head house and its plaza sit on a built pad. Without this the
    // corridor floor is y = -2.5 and the house would hang in the air.
    const dx = x < LANDING_CLEAR.minX ? LANDING_CLEAR.minX - x : x > LANDING_CLEAR.maxX ? x - LANDING_CLEAR.maxX : 0
    const dz = z < LANDING_CLEAR.minZ ? LANDING_CLEAR.minZ - z : z > LANDING_CLEAR.maxZ ? z - LANDING_CLEAR.maxZ : 0
    const padDist = Math.hypot(dx, dz)
    if (padDist < 8) {
      const t = 1 - THREE.MathUtils.smoothstep(padDist, 0, 8)
      height = THREE.MathUtils.lerp(height, LANDING_CLEAR.y, t)
    }
    return height
  }

  function getTerrainHeight(x, z) {
    if (mode === 'station') return getStationTerrainHeight(x, z)
    return getLegacyTerrainHeight(x, z)
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
    skyColor,
    // Boarding is a dark conifer valley. The old highlight read as a
    // bright cartoon crown on the broadleaf trees.
    foliageColor: isStormy
      ? new THREE.Color(0x162414)
      : new THREE.Color(mode === 'station' ? 0x101a12 : 0x1e331a),
    highlightColor: isStormy
      ? new THREE.Color(0x324d29)
      : new THREE.Color(mode === 'station' ? 0x1a2c1c : 0x416334),
    fogColor,
    fogNear,
    fogFar,
    fogMax,
    ambient: options.vegAmbient ?? 0.6,
    mist: mode === 'station' ? 0.36 : 0
  })

  // One merged mesh per variant. Tiers are short wide cones, offset and
  // tilted so the silhouette droops instead of stacking as a perfect pyramid.
  function createConiferGeometry({
    tiers = 7,
    trunkHeight = 2.4,
    trunkRadius = 0.28,
    tierRadius = 1.7,
    tierHeight = 1.35,
    droop = 0.18,
    jitter = 0.16,
    lean = 0
  } = {}) {
    const parts = []
    const trunk = new THREE.CylinderGeometry(trunkRadius * 0.55, trunkRadius, trunkHeight, 6)
    trunk.translate(0, trunkHeight * 0.5, 0)
    parts.push(trunk)
    for (let i = 0; i < tiers; i += 1) {
      const t = tiers === 1 ? 0 : i / (tiers - 1)
      const cone = new THREE.ConeGeometry(
        tierRadius * (1 - t * 0.7),
        tierHeight * (0.85 + (i % 3) * 0.08),
        6
      )
      const y = trunkHeight * 0.42 + i * tierHeight * 0.46
      cone.translate(Math.sin(i * 2.4) * jitter, y, Math.cos(i * 1.7) * jitter)
      cone.rotateZ(Math.sin(i * 1.9) * droop)
      cone.rotateX(Math.cos(i * 1.3) * droop * 0.8)
      parts.push(cone)
    }
    const merged = mergeBufferGeometries(parts)
    if (lean) merged.rotateZ(lean)
    parts.forEach((part) => part.dispose())
    return merged
  }

  // Bare trunk and a few branches. No foliage, so it reads as a dead tree
  // against the conifers. Shares the vegetation shader with a brown tint.
  function createDeadTreeGeometry() {
    const parts = []
    const trunk = new THREE.CylinderGeometry(0.12, 0.26, 4.2, 5)
    trunk.translate(0, 2.1, 0)
    trunk.rotateZ(0.08)
    parts.push(trunk)
    const branches = [
      [0.9, 2.2, 0.5, 0.4],
      [1.5, 2.8, -0.35, -0.2],
      [2.1, 1.1, 0.15, 0.7],
      [2.7, 0.8, -0.5, 0.15]
    ]
    for (const [y, length, rx, rz] of branches) {
      const branch = new THREE.CylinderGeometry(0.035, 0.06, length, 4)
      branch.translate(0, length * 0.5, 0)
      branch.rotateZ(rz)
      branch.rotateX(rx)
      branch.translate(0, y, 0)
      parts.push(branch)
    }
    const merged = mergeBufferGeometries(parts)
    parts.forEach((part) => part.dispose())
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
  function displaceRock(geo, amount, seed) {
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const n = Math.sin(x * 4.1 + seed) * Math.cos(z * 3.4 + y * 2.2 + seed)
      pos.setXYZ(i, x * (1 + n * amount), y * (1 + n * amount * 0.45), z * (1 + n * amount))
    }
    geo.computeVertexNormals()
    return geo
  }

  function createRockGeometry(scale = [1.4, 0.68, 1.08], amount = 0.22, seed = 1) {
    // Non-indexed so each face keeps its own normal. Noise pushes the
    // vertices so one mesh is not a repeated crystal.
    const rock = new THREE.DodecahedronGeometry(0.95, 0)
    rock.scale(scale[0], scale[1], scale[2])
    const flat = rock.toNonIndexed()
    rock.dispose()
    return displaceRock(flat, amount, seed)
  }

  const pineGeo = createConiferGeometry({ tiers: 7, trunkHeight: 2.6, tierRadius: 1.85, tierHeight: 1.45, droop: 0.22, jitter: 0.2 })
  const spruceGeo = createConiferGeometry({ tiers: 8, trunkHeight: 3.4, trunkRadius: 0.18, tierRadius: 0.95, tierHeight: 1.15, droop: 0.08, jitter: 0.06 })
  const youngGeo = createConiferGeometry({ tiers: 4, trunkHeight: 1.1, trunkRadius: 0.12, tierRadius: 0.7, tierHeight: 0.7, droop: 0.16, jitter: 0.08 })
  const deadGeo = createDeadTreeGeometry()
  const decGeo = createDeciduousTreeGeometry()
  const bushGeo = createBushGeometry()
  const rockGeo = createRockGeometry([1.4, 0.68, 1.08], 0.22, 1.2)
  const outcropGeo = createRockGeometry([1.8, 1.15, 1.1], 0.35, 4.4)
  const slabGeo = createRockGeometry([2.1, 0.38, 1.4], 0.16, 8.1)
  const logGeo = new THREE.CylinderGeometry(0.16, 0.2, 2.4, 6)
  logGeo.rotateZ(Math.PI / 2)
  logGeo.translate(0, 0.18, 0)
  const stumpGeo = new THREE.CylinderGeometry(0.28, 0.34, 0.45, 6)
  stumpGeo.translate(0, 0.18, 0)

  function createTuftGeometry(spread, height) {
    const parts = []
    for (let i = 0; i < 3; i += 1) {
      const blade = new THREE.PlaneGeometry(spread, height, 1, 2)
      blade.translate(0, height * 0.5, 0)
      blade.rotateY((i * Math.PI) / 3)
      parts.push(blade)
    }
    const merged = mergeBufferGeometries(parts)
    parts.forEach((part) => part.dispose())
    return merged
  }
  const grassGeo = createTuftGeometry(0.28, 0.42)
  const fernGeo = createTuftGeometry(0.55, 0.32)


  // Tree distribution & instance count based on Quality
  const treeCount = quality === 'HIGH' ? 900 : (quality === 'MEDIUM' ? 500 : 250)
  const bushCount = quality === 'HIGH' ? 400 : (quality === 'MEDIUM' ? 200 : 100)
  const rockCount = quality === 'HIGH' ? 250 : (quality === 'MEDIUM' ? 120 : 60)

  const deadMaterial = createVegetationShaderMaterial({
    windSpeed: 1.1,
    windStrength: isStormy ? 0.22 : 0.1,
    sunDirection: sunPosition.clone().normalize(),
    sunColor,
    skyColor,
    foliageColor: new THREE.Color(0x3a3228),
    highlightColor: new THREE.Color(0x5a4a38),
    fogColor,
    fogNear,
    fogFar,
    fogMax,
    ambient: options.vegAmbient ?? 0.6,
    mist: mode === 'station' ? 0.36 : 0
  })
  // Boarding shares the sky clock. Writing elapsed here would ignore Slow,
  // Freeze and Rewind. Moving levels have no sky time, so they keep elapsed.
  const grassMaterial = createVegetationShaderMaterial({
    windSpeed: 2.2,
    windStrength: 0.55,
    swayHeight: 0.48,
    sunDirection: sunPosition.clone().normalize(),
    sunColor,
    skyColor,
    foliageColor: new THREE.Color(0x1a2a16),
    highlightColor: new THREE.Color(0x3a4a28),
    fogColor,
    fogNear,
    fogFar,
    fogMax,
    ambient: options.vegAmbient ?? 0.6,
    mist: mode === 'station' ? 0.2 : 0
  })
  if (options.skyTime) {
    vegMaterial.customUniforms.uTime = options.skyTime
    deadMaterial.customUniforms.uTime = options.skyTime
    grassMaterial.customUniforms.uTime = options.skyTime
  }

  function attachTint(mesh, count) {
    const colors = new Float32Array(count * 3)
    colors.fill(1)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
  }

  const pineMesh = new THREE.InstancedMesh(pineGeo, vegMaterial, treeCount)
  const spruceMesh = new THREE.InstancedMesh(spruceGeo, vegMaterial, treeCount)
  const youngMesh = new THREE.InstancedMesh(youngGeo, vegMaterial, treeCount)
  const deadMesh = new THREE.InstancedMesh(deadGeo, deadMaterial, Math.floor(treeCount * 0.12))
  const decMesh = new THREE.InstancedMesh(decGeo, vegMaterial, Math.floor(treeCount * 0.4))
  const bushMesh = new THREE.InstancedMesh(bushGeo, vegMaterial, bushCount)
  const grassCount = mode === 'station' ? 420 : 1
  const fernCount = mode === 'station' ? 140 : 1
  const grassMesh = new THREE.InstancedMesh(grassGeo, grassMaterial, grassCount)
  const fernMesh = new THREE.InstancedMesh(fernGeo, grassMaterial, fernCount)
  for (const mesh of [pineMesh, spruceMesh, youngMesh, deadMesh, decMesh, bushMesh, grassMesh, fernMesh]) {
    attachTint(mesh, mesh.instanceColor ? mesh.count : mesh.count)
    mesh.castShadow = false
    mesh.receiveShadow = false
  }
  
  const rockMaterial = createRockShaderMaterial({
    sunDirection: sunPosition.clone().normalize(),
    sunColor,
    skyColor,
    rockColor: new THREE.Color(mode === 'station' ? 0x6e685f : 0x4a4742),
    ambient: mode === 'station' ? 0.72 : 0.4
  })
  const woodRock = createRockShaderMaterial({
    sunDirection: sunPosition.clone().normalize(),
    sunColor,
    skyColor,
    rockColor: new THREE.Color(0x4a3424),
    ambient: mode === 'station' ? 0.6 : 0.35
  })
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMaterial, rockCount)
  const outcropMesh = new THREE.InstancedMesh(outcropGeo, rockMaterial, mode === 'station' ? 48 : 1)
  const slabMesh = new THREE.InstancedMesh(slabGeo, rockMaterial, mode === 'station' ? 28 : 1)
  const logMesh = new THREE.InstancedMesh(logGeo, woodRock, mode === 'station' ? 36 : 1)
  const stumpMesh = new THREE.InstancedMesh(stumpGeo, woodRock, mode === 'station' ? 24 : 1)
  for (const mesh of [rockMesh, outcropMesh, slabMesh, logMesh, stumpMesh]) {
    mesh.castShadow = false
    mesh.receiveShadow = false
  }

  // Moonlight shadows stay on the station and the characters. Trees and the
  // rest of the distant scenery would fill the shadow map with noise.
  pineMesh.castShadow = false
  decMesh.castShadow = false

  const dummy = new THREE.Object3D()
  
  // Seeded distribution of vegetation outside railway corridor.
  // Boarding keeps an extra margin around the passage wing so trees do not
  // sprout out of the cutting. The moving levels use the original box.
  function isSceneryBlocked(x, z) {
    if (isInsideWestWingClearance(x, z)) return true
    if (mode !== 'station') return false
    if (insideLanding(x, z, 3)) return true
    return (
      x >= WEST_WING_CLEAR_MIN_X - 10 &&
      x <= WEST_WING_CLEAR_MAX_X + 10 &&
      z >= WEST_WING_CLEAR_MIN_Z - 10 &&
      z <= WEST_WING_CLEAR_MAX_Z + 10
    )
  }

  let pineIdx = 0, spruceIdx = 0, youngIdx = 0, deadIdx = 0, decIdx = 0, bushIdx = 0, rockIdx = 0
  let outcropIdx = 0, slabIdx = 0, logIdx = 0, stumpIdx = 0
  const rangeX = 320, rangeZ = 360
  const pineCap = Math.floor(treeCount * 0.5)
  const spruceCap = Math.floor(treeCount * 0.28)
  const youngCap = Math.floor(treeCount * 0.16)
  const deadCap = Math.min(deadMesh.count, Math.floor(treeCount * 0.06))

  function placeTree(mesh, index, x, y, z, scale, rand, tint) {
    dummy.position.set(x, y - (0.18 + scale * 0.28), z)
    dummy.rotation.set((rand() - 0.5) * 0.22, rand() * Math.PI * 2, (rand() - 0.5) * 0.22)
    const spread = 0.86 + rand() * 0.28
    dummy.scale.set(scale * spread, scale, scale * (1.72 - spread))
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
    mesh.instanceColor.setXYZ(index, tint, tint * (0.92 + rand() * 0.16), tint * 0.82)
  }

  if (mode === 'station') {
    // Noise mask. Tall pines and spruce sit in the dense centres.
    // Young pines sit on the thinner edge of the mask. Dead trees are rare.
    // Broadleaf count stays 0; that mesh still exists for the moving-mode update.
    const rand = makeRng(0x5eed01)
    for (let i = 0; i < treeCount * 18 && (pineIdx < pineCap || spruceIdx < spruceCap || youngIdx < youngCap || deadIdx < deadCap); i++) {
      const rx = -360 + rand() * 720
      const rz = -360 + rand() * 720
      if (isSceneryBlocked(rx, rz)) continue
      if (lakeDrop(rx, rz) > 0.35) continue
      // Real models cover the band around the walkable run. The procedural
      // forest stays beyond it.
      if (options.nature && distOutsideRect(rx, rz, PLAY_MIN_X, PLAY_MAX_X, PLAY_MIN_Z, PLAY_MAX_Z) <= 80) continue
      const mask = forestMask(rx, rz)
      if (mask < 0.46) continue
      const ry = getTerrainHeight(rx, rz)
      if (ry < 0.4 || ry > 20) continue
      const hillside = THREE.MathUtils.smoothstep(ry, 1.2, 7)
      if (rand() > mask * (0.5 + hillside * 0.65)) continue
      const tint = 0.78 + rand() * 0.36
      if (mask > 0.66 && pineIdx < pineCap) {
        placeTree(pineMesh, pineIdx, rx, ry, rz, 1.05 + rand() * 0.75, rand, tint)
        pineIdx += 1
      } else if (mask > 0.58 && spruceIdx < spruceCap) {
        placeTree(spruceMesh, spruceIdx, rx, ry, rz, 1.15 + rand() * 0.7, rand, tint * 0.9)
        spruceIdx += 1
      } else if (mask < 0.58 && youngIdx < youngCap) {
        placeTree(youngMesh, youngIdx, rx, ry, rz, 0.4 + rand() * 0.35, rand, tint * 1.05)
        youngIdx += 1
      } else if (deadIdx < deadCap && rand() < 0.08) {
        placeTree(deadMesh, deadIdx, rx, ry, rz, 0.7 + rand() * 0.45, rand, 0.85 + rand() * 0.2)
        deadIdx += 1
      }
    }
    const bushCap = Math.min(bushCount, 260)
    for (let i = 0; i < bushCap * 8 && bushIdx < bushCap; i++) {
      const rx = -340 + rand() * 680
      const rz = -340 + rand() * 680
      if (isSceneryBlocked(rx, rz)) continue
      if (lakeDrop(rx, rz) > 0.2) continue
      const mask = forestMask(rx, rz)
      if (mask < 0.36 || mask > 0.58) continue
      const ry = getTerrainHeight(rx, rz)
      if (ry < 0.2 || ry > 14) continue
      const scale = 0.4 + rand() * 0.65
      dummy.position.set(rx, ry - 0.12, rz)
      dummy.rotation.y = rand() * Math.PI * 2
      dummy.scale.set(scale, scale * 0.8, scale)
      dummy.updateMatrix()
      bushMesh.setMatrixAt(bushIdx++, dummy.matrix)
    }
    const rockCap = Math.min(rockCount, 70)
    for (let i = 0; i < rockCap * 12 && rockIdx < rockCap; i++) {
      const rx = -320 + rand() * 640
      const rz = -320 + rand() * 640
      if (isSceneryBlocked(rx, rz)) continue
      if (lakeDrop(rx, rz) > 0.12) continue
      if (options.nature && distOutsideRect(rx, rz, PLAY_MIN_X, PLAY_MAX_X, PLAY_MIN_Z, PLAY_MAX_Z) <= 55) continue
      if (forestMask(rx, rz) > 0.4) continue
      const ry = getTerrainHeight(rx, rz)
      if (ry < 0 || ry > 16) continue
      const scale = 0.75 + rand() * 1.5
      dummy.position.set(rx, ry - scale * 0.22, rz)
      dummy.rotation.set(rand() * 0.35, rand() * Math.PI * 2, rand() * 0.25)
      dummy.scale.set(scale * 1.2, scale * 0.55, scale * 0.9)
      dummy.updateMatrix()
      rockMesh.setMatrixAt(rockIdx++, dummy.matrix)
    }
    for (let i = 0; i < 500 && (outcropIdx < outcropMesh.count || logIdx < logMesh.count); i += 1) {
      const rx = -300 + rand() * 560
      const rz = -300 + rand() * 560
      if (isSceneryBlocked(rx, rz) || lakeDrop(rx, rz) > 0.15) continue
      if (options.nature && distOutsideRect(rx, rz, PLAY_MIN_X, PLAY_MAX_X, PLAY_MIN_Z, PLAY_MAX_Z) <= 55) continue
      const ry = getTerrainHeight(rx, rz)
      const slope = Math.abs(getTerrainHeight(rx + 2, rz) - ry) + Math.abs(getTerrainHeight(rx, rz + 2) - ry)
      const mask = forestMask(rx, rz)
      if (slope > 1.1 && outcropIdx < 36 && ry > 2 && ry < 18) {
        const mesh = outcropIdx % 3 === 0 ? slabMesh : outcropMesh
        const index = mesh === slabMesh ? slabIdx : outcropIdx
        if (mesh === slabMesh && slabIdx >= slabMesh.count) continue
        dummy.position.set(rx, ry - 0.3, rz)
        dummy.rotation.set(rand() * 0.2, rand() * Math.PI * 2, rand() * 0.2)
        const s = 0.8 + rand() * 1.4
        dummy.scale.set(s, s * (0.7 + rand() * 0.5), s)
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
        if (mesh === slabMesh) slabIdx += 1
        else outcropIdx += 1
        if (rand() < 0.45 && outcropIdx < 36) {
          dummy.position.set(rx + (rand() - 0.5) * 2.2, ry - 0.25, rz + (rand() - 0.5) * 2.2)
          dummy.scale.set(s * 0.7, s * 0.55, s * 0.7)
          dummy.updateMatrix()
          outcropMesh.setMatrixAt(outcropIdx, dummy.matrix)
          outcropIdx += 1
        }
      }
      if (mask > 0.5 && logIdx < logMesh.count && ry > 0.3 && ry < 12) {
        dummy.position.set(rx, ry, rz)
        dummy.rotation.set(0, rand() * Math.PI, (rand() - 0.5) * 0.2)
        dummy.scale.set(0.8 + rand() * 0.6, 0.8 + rand() * 0.5, 0.8 + rand() * 0.6)
        dummy.updateMatrix()
        logMesh.setMatrixAt(logIdx, dummy.matrix)
        logIdx += 1
      } else if (mask > 0.48 && stumpIdx < stumpMesh.count && ry > 0.2 && ry < 10) {
        dummy.position.set(rx, ry - 0.05, rz)
        dummy.rotation.set(0, rand() * Math.PI, 0)
        dummy.scale.set(0.7 + rand() * 0.6, 0.6 + rand() * 0.5, 0.7 + rand() * 0.6)
        dummy.updateMatrix()
        stumpMesh.setMatrixAt(stumpIdx, dummy.matrix)
        stumpIdx += 1
      }
    }
    // Flat crossed-plane tufts. The spawn meadow is the blade field, so
    // these cards stay undrawn on Boarding.
    grassMesh.count = 0
    fernMesh.count = 0
  } else {
  for (let i = 0; i < treeCount * 2; i++) {
    let rx = (Math.random() - 0.5) * rangeX * 2
    rx += rx > 0
      ? CORRIDOR_CLEAR_X + CORRIDOR_CENTER_X
      : -CORRIDOR_CLEAR_X + CORRIDOR_CENTER_X

    const rz = (Math.random() - 0.5) * rangeZ * 2

    // Never place vegetation inside or immediately around the new station wing.
    if (isSceneryBlocked(rx, rz)) continue

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
    rx += rx > 0
      ? CORRIDOR_CLEAR_X + CORRIDOR_CENTER_X
      : -CORRIDOR_CLEAR_X + CORRIDOR_CENTER_X

    const rz = (Math.random() - 0.5) * rangeZ * 1.8

    if (isSceneryBlocked(rx, rz)) continue

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
    rx += rx > 0
      ? CORRIDOR_CLEAR_X + CORRIDOR_CENTER_X
      : -CORRIDOR_CLEAR_X + CORRIDOR_CENTER_X

    const rz = (Math.random() - 0.5) * rangeZ * 1.8

    if (isSceneryBlocked(rx, rz)) continue

    const ry = getTerrainHeight(rx, rz)

    const scale = 0.8 + Math.random() * 1.4
    dummy.position.set(rx, ry, rz)
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0)
    dummy.scale.set(scale * 1.2, scale * 0.6, scale)
    dummy.updateMatrix()
    rockMesh.setMatrixAt(rockIdx++, dummy.matrix)
  }
  }

  // Draw only the instances that actually got a matrix. The scatter loops
  // `continue` past rejected positions, so these meshes are always allocated
  // for more instances than get placed — and every unwritten instance keeps the
  // identity matrix, which draws it at the world origin. Left unset, the
  // leftovers pile into one black blob in the middle of the station and, in the
  // moving levels, slide straight through the carriage interiors.
  pineMesh.count = pineIdx
  spruceMesh.count = spruceIdx
  youngMesh.count = youngIdx
  deadMesh.count = deadIdx
  decMesh.count = decIdx
  bushMesh.count = bushIdx
  rockMesh.count = rockIdx
  outcropMesh.count = outcropIdx
  slabMesh.count = slabIdx
  logMesh.count = logIdx
  stumpMesh.count = stumpIdx

  for (const mesh of [pineMesh, spruceMesh, youngMesh, deadMesh, decMesh, bushMesh, grassMesh, fernMesh, rockMesh]) {
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  if (mode !== 'station') {
    grassMesh.count = 0
    fernMesh.count = 0
  }

  // Real Poly Haven props. One InstancedMesh per file, so one draw each.
  // Geometries are clones: level teardown can release them, and the loaded
  // source stays for the next visit. Nothing here casts a shadow.
  function placeRealNature(props) {
    const buckets = { tree: [], fern: [], rock: [], log: [], stump: [] }
    for (const prop of props) {
      const material = prop.material.clone()
      if (prop.swayHeight) {
        enableWind(material, {
          swayHeight: prop.swayHeight,
          windStrength: prop.windStrength,
          timeUniform: options.skyTime
        })
      }
      const mesh = new THREE.InstancedMesh(prop.geometry.clone(), material, prop.capacity)
      mesh.name = `nature-${prop.key}`
      mesh.castShadow = false
      mesh.receiveShadow = false
      // Same as the grass: a per-frame camera ray must not walk every
      // instance. These props have no gameplay collider.
      mesh.raycast = THREE.Object3D.prototype.raycast
      mesh.userData.noCameraCollision = true
      mesh.count = 0
      const colors = new Float32Array(prop.capacity * 3)
      colors.fill(1)
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
      group.add(mesh)
      buckets[prop.kind].push({ prop, mesh, index: 0 })
    }

    const rand = makeRng(0x0a55e7)
    const onDeck = (x, z) => x < -168 && Math.abs(z + 24.5) < 3.1

    function put(entry, x, y, z, rotX, rotY, rotZ, sx, sy, sz) {
      if (!entry || entry.index >= entry.prop.capacity) return false
      dummy.position.set(x, y, z)
      dummy.rotation.set(rotX, rotY, rotZ)
      dummy.scale.set(sx, sy, sz)
      dummy.updateMatrix()
      entry.mesh.setMatrixAt(entry.index, dummy.matrix)
      const tint = 0.84 + rand() * 0.22
      entry.mesh.instanceColor.setXYZ(entry.index, tint, tint * (0.94 + rand() * 0.1), tint * 0.9)
      entry.index += 1
      return true
    }

    const trees = buckets.tree
    // Gantry spawn. Keep the real trees that sit closest to this point,
    // and prefer the side the opening view looks along (east, +X).
    const SPAWN_X = -182.1
    const SPAWN_Z = -24.5
    const TREE_CAP = 60
    const spots = []
    for (let i = 0; i < 8000 && spots.length < 500 && trees.length; i += 1) {
      const rx = PLAY_MIN_X - 80 + rand() * (PLAY_MAX_X - PLAY_MIN_X + 160)
      const rz = PLAY_MIN_Z - 80 + rand() * (PLAY_MAX_Z - PLAY_MIN_Z + 160)
      if (distOutsideRect(rx, rz, PLAY_MIN_X, PLAY_MAX_X, PLAY_MIN_Z, PLAY_MAX_Z) > 80) continue
      if (isSceneryBlocked(rx, rz) || onDeck(rx, rz) || gapOutsideFootprints(rx, rz) < 1.4) continue
      if (lakeDrop(rx, rz) > 0.2) continue
      if (forestMask(rx, rz) < 0.3 && rand() > 0.4) continue
      const groundY = getTerrainHeight(rx, rz)
      if (groundY < 0.15 || groundY > 16) continue
      const behind = rx < SPAWN_X - 6 ? 30 : 0
      spots.push({
        rx, rz, groundY,
        score: Math.hypot(rx - SPAWN_X, rz - SPAWN_Z) + behind,
        yaw: rand(), lean: rand(), sink: rand(), spread: rand()
      })
    }
    spots.sort((a, b) => a.score - b.score)
    const treeN = Math.min(TREE_CAP, spots.length)
    for (let n = 0; n < treeN; n += 1) {
      const spot = spots[n]
      const entry = trees[n % trees.length]
      const [lo, hi] = entry.prop.scale
      const s = lo + (hi - lo) * spot.spread
      put(
        entry, spot.rx, spot.groundY - (0.16 + spot.sink * 0.22), spot.rz,
        (spot.lean - 0.5) * 0.08, spot.yaw * Math.PI * 2, (spot.spread - 0.5) * 0.08,
        s, s * (0.92 + spot.lean * 0.16), s
      )
    }

    const ferns = buckets.fern
    let fernN = 0
    // A few ferns in the meadow, as accents. The blade field is the ground cover.
    const FERN_ACCENTS = 16
    for (let i = 0; i < 4000 && fernN < FERN_ACCENTS && ferns.length; i += 1) {
      const rx = -224 + rand() * 120
      const rz = -72 + rand() * 90
      const gap = gapOutsideFootprints(rx, rz)
      if (gap < 1.4 || gap > 9 || onDeck(rx, rz) || lakeDrop(rx, rz) > 0.15) continue
      if (grassDistance(rx, rz) > 24) continue
      const groundY = getTerrainHeight(rx, rz)
      if (groundY < -0.45 || groundY > 3) continue
      const entry = ferns[fernN % ferns.length]
      const [lo, hi] = entry.prop.scale
      const s = lo + rand() * (hi - lo)
      if (put(
        entry, rx, groundY - 0.05, rz,
        (rand() - 0.5) * 0.22, rand() * Math.PI * 2, (rand() - 0.5) * 0.18,
        s, 0.75 + rand() * 0.65, s
      )) fernN += 1
    }

    function scatter(list, limit, radius, upright) {
      let n = 0
      for (let i = 0; i < limit * 50 && n < limit && list.length; i += 1) {
        const rx = PLAY_MIN_X - radius + rand() * (PLAY_MAX_X - PLAY_MIN_X + radius * 2)
        const rz = PLAY_MIN_Z - radius + rand() * (PLAY_MAX_Z - PLAY_MIN_Z + radius * 2)
        if (distOutsideRect(rx, rz, PLAY_MIN_X, PLAY_MAX_X, PLAY_MIN_Z, PLAY_MAX_Z) > radius) continue
        if (isSceneryBlocked(rx, rz) || onDeck(rx, rz) || gapOutsideFootprints(rx, rz) < 0.9) continue
        if (lakeDrop(rx, rz) > 0.12) continue
        const groundY = getTerrainHeight(rx, rz)
        if (groundY < -0.3 || groundY > 14) continue
        const entry = list[n % list.length]
        const [lo, hi] = entry.prop.scale
        const s = lo + rand() * (hi - lo)
        const sink = upright ? 0.08 : 0.08 + s * 0.12
        const tilt = upright ? 0.04 : 0.4
        if (put(
          entry, rx, groundY - sink, rz,
          (rand() - 0.5) * tilt, rand() * Math.PI * 2, (rand() - 0.5) * tilt,
          s * (0.85 + rand() * 0.35), s * (upright ? 0.85 + rand() * 0.3 : 0.75 + rand() * 0.45), s * (0.85 + rand() * 0.35)
        )) n += 1
      }
    }
    scatter(buckets.rock, 36, 50, false)
    scatter(buckets.log, 14, 45, true)
    scatter(buckets.stump, 10, 45, true)

    for (const list of Object.values(buckets)) {
      for (const entry of list) {
        entry.mesh.count = entry.index
        entry.mesh.instanceMatrix.needsUpdate = true
        if (entry.mesh.instanceColor) entry.mesh.instanceColor.needsUpdate = true
      }
    }
  }

  if (mode === 'station' && options.nature?.props?.length) placeRealNature(options.nature.props)

  // Spawn meadow. One draw, no shadows. Moving levels do not build it.
  if (mode === 'station') {
    grassField = createGrassField({
      getTerrainHeight,
      gapOutsideFootprints,
      skyTime: options.skyTime || null,
      sunDirection: sunPosition.clone().normalize(),
      fogColor,
      fogNear,
      fogFar,
      fogMax,
      mist: 0.36
    })
    group.add(grassField.mesh)
  }

  group.add(pineMesh, spruceMesh, youngMesh, deadMesh, decMesh, bushMesh, grassMesh, fernMesh, rockMesh, outcropMesh, slabMesh, logMesh, stumpMesh)

  // -------------------------------------------------------------
  // 4. Trackside Infrastructure (Telegraph Poles, Wires, Gantries, Fences)
  // -------------------------------------------------------------
  const tracksideGroup = new THREE.Group()
  tracksideGroup.name = 'trackside-infrastructure'

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d2717, roughness: 0.9 })
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x22262a, metalness: 0.35, roughness: 0.78 })
  const wireMat = new THREE.LineBasicMaterial({ color: 0x111115 })

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
  const wireRuns = [[], []]
  for (let z = -rangeZ; z <= rangeZ; z += poleZSpacing) {
    const px = 11.5 // Parallel to track at X = 7
    // The forecourt occupies this side of the rails. A pole here would
    // stand in the plaza, and the wire would cut the facade.
    if (mode === 'station' && insideLanding(px, z, 1)) {
      wireRuns[0].push(null)
      wireRuns[1].push(null)
      continue
    }
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

    wireRuns[0].push(new THREE.Vector3(px - 0.75, py + 2.85, z))
    wireRuns[1].push(new THREE.Vector3(px + 0.75, py + 2.85, z))

    poleIdx++
  }

  // Same identity-matrix trap: the z loop can run a different number of times
  // than poleCount estimated, in either direction.
  polesInst.count = Math.min(poleIdx, poleCount)
  crossarmInst.count = Math.min(poleIdx, poleCount)

  polesInst.instanceMatrix.needsUpdate = true
  crossarmInst.instanceMatrix.needsUpdate = true
  tracksideGroup.add(polesInst, crossarmInst)

  // Each contiguous run of poles gets its own wire, so a gap at the
  // forecourt does not sling a cable through the head house.
  for (const run of wireRuns) {
    let span = []
    function flushSpan() {
      if (span.length < 2) {
        span = []
        return
      }
      const points = []
      for (let i = 0; i < span.length - 1; i += 1) {
        const p1 = span[i]
        const p2 = span[i + 1]
        const mid = new THREE.Vector3().lerpVectors(p1, p2, 0.5)
        mid.y -= 0.85
        points.push(p1, mid, p2)
      }
      const curve = new THREE.CatmullRomCurve3(points)
      const wireGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(points.length * 4))
      tracksideGroup.add(new THREE.Line(wireGeo, wireMat))
      span = []
    }
    for (const point of run) {
      if (!point) flushSpan()
      else span.push(point)
    }
    flushSpan()
  }

  // Rustic Wooden Fence Lines along railway corridor
  const fencePostsCount = 80
  const fencePostGeo = new THREE.BoxGeometry(0.1, 1.2, 0.1)
  const fenceRailGeo = new THREE.BoxGeometry(0.06, 0.08, 3.8)

  const fencePostsMesh = new THREE.InstancedMesh(fencePostGeo, woodMat, fencePostsCount * 2)
  const fenceRailsMesh = new THREE.InstancedMesh(fenceRailGeo, woodMat, fencePostsCount * 2)

  let fIdx = 0, rIdx = 0
  for (const sideX of [2.0, 12.5]) { // Fence on left and right of track corridor
    for (let z = -140; z <= 140; z += 3.8) {
      if (fIdx >= fencePostsCount * 2) break
      if (mode === 'station' && sideX > 8 && insideLanding(sideX, z, 2)) continue

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
  // 5. Boarding only: distant ranges and valley lights.
  //    Moving Heist and Timewreck keep the scrolling hills and do not
  //    get these. The ranges hide the 375 m terrain edge. The lights are
  //    points in the direction the spawn camera faces (east, +X).
  // -------------------------------------------------------------
  let valleyLightMaterial = null

  if (mode === 'station') {
    addDistantRanges(group)
    valleyLightMaterial = addValleyLights(group, getTerrainHeight, options.skyTime)
    if (options.skyUniforms) {
      addLake(group, options.skyUniforms, getTerrainHeight)
      addCreek(group, options.skyUniforms, getTerrainHeight)
    }
    addValleySetDressing(group, getTerrainHeight)
  }

  // -------------------------------------------------------------
  // 6. Dynamic Motion / Parallax Updates
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

  function writeFog(material, { color, near, far, max }) {
    const uniforms = material?.customUniforms
    if (!uniforms) return
    if (color !== undefined) {
      if (color.isColor) uniforms.uFogColor.value.copy(color)
      else uniforms.uFogColor.value.set(color)
    }
    if (near !== undefined) uniforms.uFogNear.value = near
    if (far !== undefined) uniforms.uFogFar.value = far
    if (max !== undefined) uniforms.uFogMax.value = max
  }

  function setFog(options) {
    writeFog(terrainMaterial, options)
    writeFog(vegMaterial, options)
    writeFog(deadMaterial, options)
    writeFog(grassMaterial, options)
    if (grassField) writeFog(grassField.material, options)
  }

  function setFogColor(color) {
    setFog({ color })
  }

  return {
    group,
    terrainMesh,
    setStationSpotLights: applySpotLights,
    setFogColor,
    setFog,

    update(delta) {
      elapsed += delta

      if (currentSpotLights.length > 0) {
        applySpotLights(currentSpotLights)
      }

      // Update shader time uniforms
      if (terrainMaterial.customUniforms) terrainMaterial.customUniforms.uTime.value = elapsed
      if (vegMaterial.customUniforms && !options.skyTime) vegMaterial.customUniforms.uTime.value = elapsed
      if (deadMaterial.customUniforms && !options.skyTime) deadMaterial.customUniforms.uTime.value = elapsed
      if (grassMaterial.customUniforms && !options.skyTime) grassMaterial.customUniforms.uTime.value = elapsed
      // Boarding grass shares the sky clock. This is only the fallback.
      if (grassField && !options.skyTime) grassField.material.customUniforms.uTime.value = elapsed
      // Shared with the sky when Boarding passes skyTime, so time powers
      // already drive the twinkle. This is only the fallback.
      if (valleyLightMaterial && !options.skyTime) {
        valleyLightMaterial.customUniforms.uTime.value = elapsed
      }

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
      if (disposed) return
      disposed = true
      if (grassField) grassField.dispose()
      disposeObject(group)
    }
  }
}

// One ring per layer, one draw call, no shadows. The eastern arc, seen
// from the Boarding spawn, rises to about 15–20°. The west stays low so
// the ring behind the station is not a wall. A notch sits on the afterglow
// azimuth and a dip sits under the moon.
const SPAWN_X = -187
const SPAWN_Z = -24.5
const NOTCH_ANGLE = Math.atan2(-10, 16)
const MOON_ANGLE = Math.atan2(3, 16)
const AFTERGLOW_DIR = new THREE.Vector3(16, 0.28, -10)

const DISTANT_RANGE_LAYERS = [
  {
    inner: 348, outer: 500, base: 6, freq: 4.4, seed: 2.2, scale: 1,
    baseColor: 0x1a221c, forestColor: 0x142016, snowColor: 0xc8d0dc,
    hazeColor: 0x1a1830, haze: 0.22, forest: 1, mist: 0.5
  },
  {
    inner: 560, outer: 760, base: 8, freq: 3.2, seed: 9.4, scale: 0.82,
    baseColor: 0x222838, forestColor: 0x1a2830, snowColor: 0xb8c4d4,
    hazeColor: 0x241830, haze: 0.5, forest: 0.35, mist: 0.22
  },
  {
    inner: 840, outer: 1060, base: 10, freq: 2.1, seed: 21.7, scale: 0.62,
    baseColor: 0x2a243c, forestColor: 0x2a243c, snowColor: 0xa8b4c8,
    hazeColor: 0x321838, haze: 0.78, forest: 0, mist: 0.08
  }
]

function wrapAngle(a) {
  const pi = Math.PI
  return Math.atan2(Math.sin(a), Math.cos(a))
}

// Elevation in degrees of the crest, from the spawn eye.
function crestDegrees(bearing, ridge, scale) {
  const east = Math.max(0, Math.cos(bearing))
  const eastMask = east * east
  let deg = (6 + ridge * 3.2) * (1 - eastMask) + (14 + ridge * 6.5) * eastMask
  const notch = Math.exp(-((wrapAngle(bearing - NOTCH_ANGLE) / 0.2) ** 2))
  deg = deg * (1 - notch) + 4.8 * notch
  const moon = Math.exp(-((wrapAngle(bearing - MOON_ANGLE) / 0.16) ** 2))
  deg = Math.min(deg, 11 + (1 - moon) * 24)
  return deg * scale
}

function hash1(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123
  return x - Math.floor(x)
}

function valueNoise1(t) {
  const i = Math.floor(t)
  const f = t - i
  const u = f * f * (3 - 2 * f)
  return hash1(i) + (hash1(i + 1) - hash1(i)) * u
}

// Five octaves of value noise on the ring angle. The ridgeline is this
// function raised to a power so most of the ring stays a low pass and a
// few angles become peaks. Farther layers show through the passes.
function ridgeNoise(angle, frequency, seed) {
  let amplitude = 0.5
  let freq = 1
  let sum = 0
  let weight = 0
  const t = angle * frequency + seed
  for (let octave = 0; octave < 5; octave += 1) {
    sum += amplitude * valueNoise1(t * freq)
    weight += amplitude
    amplitude *= 0.5
    freq *= 2.03
  }
  return sum / weight
}

function addDistantRanges(group) {
  const segments = 160
  for (let layer = 0; layer < DISTANT_RANGE_LAYERS.length; layer += 1) {
    const spec = DISTANT_RANGE_LAYERS[layer]
    const vertCount = (segments + 1) * 2
    const positions = new Float32Array(vertCount * 3)
    const uvs = new Float32Array(vertCount * 2)
    const indices = new Uint32Array(segments * 6)

    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const x = cos * spec.outer
      const z = sin * spec.outer
      const bearing = Math.atan2(z - SPAWN_Z, x - SPAWN_X)
      const dist = Math.hypot(x - SPAWN_X, z - SPAWN_Z)
      const ridge = Math.pow(1 - Math.abs(ridgeNoise(bearing, spec.freq, spec.seed) * 2 - 1), 0.72)
      const deg = crestDegrees(bearing, ridge, spec.scale)
      const crestY = 2 + dist * Math.tan(deg * Math.PI / 180)
      const inner = i * 2
      const outer = inner + 1

      positions[inner * 3] = cos * spec.inner
      positions[inner * 3 + 1] = spec.base
      positions[inner * 3 + 2] = sin * spec.inner
      uvs[inner * 2 + 1] = 0

      positions[outer * 3] = cos * spec.outer
      positions[outer * 3 + 1] = crestY
      positions[outer * 3 + 2] = sin * spec.outer
      uvs[outer * 2 + 1] = 1

      if (i < segments) {
        const a = inner
        const b = outer
        const c = (i + 1) * 2
        const d = c + 1
        const k = i * 6
        indices[k] = a
        indices[k + 1] = b
        indices[k + 2] = c
        indices[k + 3] = b
        indices[k + 4] = d
        indices[k + 5] = c
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    geometry.computeVertexNormals()

    const mesh = new THREE.Mesh(geometry, createDistantRangeMaterial({
      baseColor: spec.baseColor,
      forestColor: spec.forestColor,
      snowColor: spec.snowColor,
      hazeColor: spec.hazeColor,
      haze: spec.haze,
      forest: spec.forest,
      mist: spec.mist,
      afterglowDir: AFTERGLOW_DIR,
      moonDir: SUN_DIRECTION
    }))
    mesh.name = `distant-range-${layer}`
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.raycast = () => {}
    group.add(mesh)
  }
}

// One ellipse, one draw call. The water sits a little under the shore
// height so the basin rim covers the edge. No collider.
function addLake(group, skyUniforms, getTerrainHeight) {
  const shore = getTerrainHeight(LAKE_CX + LAKE_RX * 0.92, LAKE_CZ)
  const waterY = shore - 0.35
  const geometry = new THREE.CircleGeometry(1, 48)
  geometry.rotateX(-Math.PI / 2)
  geometry.scale(LAKE_RX, 1, LAKE_RZ)
  const mesh = new THREE.Mesh(geometry, createLakeMaterial(skyUniforms))
  mesh.name = 'valley-lake'
  mesh.position.set(LAKE_CX, waterY, LAKE_CZ)
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.raycast = () => {}
  group.add(mesh)
}

// A narrow ribbon of the same lake shader, plus stones on the banks.
// The points run off the eastern hillside into the north shore of the lake.
const CREEK_POINTS = [
  [70, 108],
  [28, 88],
  [-8, 68],
  [-42, 54],
  [-62, 48]
]

function addCreek(group, skyUniforms, getTerrainHeight) {
  const half = 1.7
  const positions = []
  const indices = []
  for (let i = 0; i < CREEK_POINTS.length; i += 1) {
    const [x, z] = CREEK_POINTS[i]
    const prev = CREEK_POINTS[Math.max(0, i - 1)]
    const next = CREEK_POINTS[Math.min(CREEK_POINTS.length - 1, i + 1)]
    let tx = next[0] - prev[0]
    let tz = next[1] - prev[1]
    const len = Math.hypot(tx, tz) || 1
    tx /= len
    tz /= len
    const y = getTerrainHeight(x, z) - 0.45
    positions.push(x - tz * half, y, z + tx * half, x + tz * half, y, z - tx * half)
    if (i < CREEK_POINTS.length - 1) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, createLakeMaterial(skyUniforms))
  mesh.name = 'valley-creek'
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.raycast = () => {}
  group.add(mesh)

  const stone = new THREE.DodecahedronGeometry(0.35, 0)
  const flat = stone.toNonIndexed()
  flat.computeVertexNormals()
  stone.dispose()
  const material = createRockShaderMaterial({
    sunDirection: SUN_DIRECTION,
    sunColor: new THREE.Color(0x9aafd0).multiplyScalar(3),
    skyColor: new THREE.Color(0x243656),
    rockColor: new THREE.Color(0x6e685f),
    ambient: 0.7
  })
  const rocks = new THREE.InstancedMesh(flat, material, CREEK_POINTS.length * 4)
  const dummy = new THREE.Object3D()
  let n = 0
  for (let i = 0; i < CREEK_POINTS.length; i += 1) {
    const [x, z] = CREEK_POINTS[i]
    for (const side of [-1, 1]) {
      dummy.position.set(x + side * 2.1, getTerrainHeight(x + side * 2.1, z) - 0.1, z + side * 0.4)
      dummy.rotation.set(0, i, 0)
      dummy.scale.set(0.8 + (i % 3) * 0.25, 0.45, 0.7)
      dummy.updateMatrix()
      rocks.setMatrixAt(n, dummy.matrix)
      n += 1
    }
  }
  rocks.count = n
  rocks.castShadow = false
  rocks.receiveShadow = false
  rocks.instanceMatrix.needsUpdate = true
  group.add(rocks)
}

// Cabins, a signal box, a water tower and a fenced field. All east of the
// playable run, in the direction the spawn camera looks. No colliders,
// no real lights, no shadows. Windows are emissive only.
function addValleySetDressing(group, getTerrainHeight) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3424, roughness: 0.86 })
  const roof = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.55, metalness: 0.45 })
  const glass = new THREE.MeshStandardMaterial({
    color: 0xffe2b0,
    emissive: 0xffb15a,
    emissiveIntensity: 1.5,
    roughness: 0.3
  })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.4, metalness: 0.6 })
  const walls = []
  const roofs = []
  const windows = []
  const chimneys = []

  function pushBox(list, w, h, d, x, y, z) {
    const geo = new THREE.BoxGeometry(w, h, d)
    geo.translate(x, y, z)
    list.push(geo)
  }

  function cabin(x, z, w, d, h) {
    const y = getTerrainHeight(x, z)
    pushBox(walls, w, h, d, x, y + h / 2, z)
    pushBox(roofs, w + 0.45, 0.16, d + 0.45, x, y + h + 0.08, z)
    pushBox(windows, 0.7, 0.7, 0.06, x, y + h * 0.55, z + d / 2 + 0.02)
    pushBox(windows, 0.55, 0.55, 0.06, x + w / 2 + 0.02, y + h * 0.55, z)
    pushBox(chimneys, 0.28, 0.9, 0.28, x + w * 0.3, y + h + 0.7, z)
  }

  cabin(58, 40, 4.2, 3.2, 2.6)
  cabin(78, 46, 3.4, 2.8, 2.3)
  // Signal box beside the eastern track, and a water tower just beyond it.
  const boxY = getTerrainHeight(46, -10)
  pushBox(walls, 2.2, 2.4, 2.2, 46, boxY + 1.6, -10)
  pushBox(windows, 0.8, 0.6, 0.06, 46, boxY + 2.0, -10 + 1.12)
  pushBox(roofs, 2.6, 0.1, 2.6, 46, boxY + 2.9, -10)
  const towerY = getTerrainHeight(64, 4)
  const tank = new THREE.CylinderGeometry(1.3, 1.3, 1.5, 8)
  tank.translate(64, towerY + 6.2, 4)
  roofs.push(tank)
  pushBox(walls, 0.18, 5.2, 0.18, 63.1, towerY + 2.6, 3.1)
  pushBox(walls, 0.18, 5.2, 0.18, 64.9, towerY + 2.6, 3.1)
  pushBox(walls, 0.18, 5.2, 0.18, 63.1, towerY + 2.6, 4.9)
  pushBox(walls, 0.18, 5.2, 0.18, 64.9, towerY + 2.6, 4.9)

  function mergeList(parts, material, name) {
    const usable = parts.filter(Boolean)
    if (!usable.length) return
    const geometry = mergeBufferGeometries(usable)
    usable.forEach((geo) => geo.dispose())
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    mesh.castShadow = false
    mesh.receiveShadow = false
    group.add(mesh)
  }
  mergeList(walls, wood, 'valley-walls')
  mergeList(roofs, roof, 'valley-roofs')
  mergeList(windows, glass, 'valley-windows')
  mergeList(chimneys, dark, 'valley-chimneys')

  // A small field just east of the station, in the spawn view.
  const fenceX0 = 46
  const fenceX1 = 78
  const fenceZ0 = -28
  const fenceZ1 = -8
  const posts = []
  const rails = []
  const step = 2.4
  function fenceRun(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.max(1, Math.round(len / step))
    for (let i = 0; i <= n; i += 1) {
      const t = i / n
      const x = x0 + (x1 - x0) * t
      const z = z0 + (z1 - z0) * t
      const y = getTerrainHeight(x, z)
      posts.push([x, y, z])
      if (i < n) {
        const x2 = x0 + (x1 - x0) * ((i + 1) / n)
        const z2 = z0 + (z1 - z0) * ((i + 1) / n)
        rails.push([(x + x2) / 2, (y + getTerrainHeight(x2, z2)) / 2, (z + z2) / 2, Math.atan2(x2 - x, z2 - z), Math.hypot(x2 - x, z2 - z)])
      }
    }
  }
  fenceRun(fenceX0, fenceZ0, fenceX1, fenceZ0)
  fenceRun(fenceX1, fenceZ0, fenceX1, fenceZ1)
  fenceRun(fenceX1, fenceZ1, fenceX0, fenceZ1)
  fenceRun(fenceX0, fenceZ1, fenceX0, fenceZ0)
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.05, 0.1), wood, posts.length)
  const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 1), wood, rails.length)
  const dummy = new THREE.Object3D()
  posts.forEach(([x, y, z], i) => {
    dummy.position.set(x, y + 0.5, z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    postMesh.setMatrixAt(i, dummy.matrix)
  })
  rails.forEach(([x, y, z, rot, len], i) => {
    dummy.position.set(x, y + 0.85, z)
    dummy.rotation.set(0, rot, 0)
    dummy.scale.set(1, 1, len)
    dummy.updateMatrix()
    railMesh.setMatrixAt(i, dummy.matrix)
  })
  for (const mesh of [postMesh, railMesh]) {
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.instanceMatrix.needsUpdate = true
  }
  group.add(postMesh, railMesh)
}

// Eastern valley only. Spawn looks along +X, so the clusters and the
// signal line sit on that side of the station and recede away from it.
function addValleyLights(group, getTerrainHeight, skyTime) {
  const positions = []
  const colors = []
  const seeds = []
  const sizes = []
  let seed = 17
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  const warm = [new THREE.Color(0xffc98a), new THREE.Color(0xffe2b0), new THREE.Color(0xff9a4a)]

  function push(x, y, z, color, size) {
    positions.push(x, y, z)
    colors.push(color.r, color.g, color.b)
    seeds.push(rand())
    sizes.push(size)
  }

  const clusters = [
    { x: 78, z: 34, count: 16 },
    { x: 150, z: -26, count: 14 },
    { x: 214, z: 46, count: 18 },
    { x: 270, z: 6, count: 12 }
  ]
  for (const cluster of clusters) {
    for (let i = 0; i < cluster.count; i += 1) {
      const x = cluster.x + (rand() - 0.5) * 34
      const z = cluster.z + (rand() - 0.5) * 26
      const y = getTerrainHeight(x, z) + 0.5 + rand() * 3.4
      push(x, y, z, warm[i % warm.length], 5.2 + rand() * 2.4)
    }
  }

  const red = new THREE.Color(0xff3a3a)
  const green = new THREE.Color(0x3dff7a)
  let signal = 0
  for (let x = 48; x <= 340; x += 26) {
    for (const z of [-2.4, 2.4]) {
      const y = getTerrainHeight(x, z) + 5.4
      const color = (signal + (z > 0 ? 1 : 0)) % 2 === 0 ? green : red
      push(x, y, z, color, 7.2)
    }
    signal += 1
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1))
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1))

  const material = createValleyLightsMaterial(skyTime)
  const points = new THREE.Points(geometry, material)
  points.name = 'valley-lights'
  points.castShadow = false
  points.receiveShadow = false
  points.raycast = () => {}
  group.add(points)
  return material
}

/**
 * Utility helper to merge BufferGeometries without changing their topology.
 */
export function mergeBufferGeometries(geometries) {
  if (!geometries?.length) return new THREE.BufferGeometry()

  const indexed = geometries.some((geometry) => geometry.index !== null)
  let totalVerts = 0
  let totalIndices = 0

  geometries.forEach(g => {
    totalVerts += g.attributes.position.count
    totalIndices += g.index ? g.index.count : g.attributes.position.count
  })

  const mergedPos = new Float32Array(totalVerts * 3)
  const mergedNorm = new Float32Array(totalVerts * 3)
  const IndexArray = totalVerts > 65535 ? Uint32Array : Uint16Array
  const mergedIndices = indexed ? new IndexArray(totalIndices) : null

  let vertOffset = 0
  let indexOffset = 0
  geometries.forEach(g => {
    const p = g.attributes.position.array
    const n = g.attributes.normal ? g.attributes.normal.array : null

    mergedPos.set(p, vertOffset * 3)
    if (n) mergedNorm.set(n, vertOffset * 3)

    if (indexed) {
      const count = g.index ? g.index.count : g.attributes.position.count
      for (let i = 0; i < count; i += 1) {
        mergedIndices[indexOffset + i] = (g.index ? g.index.getX(i) : i) + vertOffset
      }
      indexOffset += count
    }
    vertOffset += g.attributes.position.count
  })

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3))
  if (mergedIndices) merged.setIndex(new THREE.BufferAttribute(mergedIndices, 1))

  return merged
}

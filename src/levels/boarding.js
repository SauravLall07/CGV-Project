import * as THREE from 'three'
import {
  createStationBlockout,
  createStationLighting,
  bounds,
  PLATFORM_COVER,
  PLATFORM_MIN_Z,
  PLATFORM_MAX_Z,
  APPROACH_GATE_X,
  APPROACH_START_X,
  APPROACH_CENTER_Z,
  JUNCTION_CHECKPOINT,
  updateStationSunShadow,
  SUN_DIRECTION,
  PLATFORM_MOON_DIRECTION
} from '../environment/station-blockout.js'
import { createTrain } from '../entities/train.js'
import { createOutdoorEnvironment } from '../environment/outdoor-environment.js'
import { createMoonlitValley } from '../environment/moonlit-valley.js'
import { createPlatformSurroundings } from '../environment/platform-surroundings.js'
import { getBoardingAssets } from '../environment/nature-props.js'
import { createSkyDome } from '../environment/sky-dome.js'
import { captureSkyEnvironment } from '../environment/sky-environment.js'
import { createTutorialPassage } from '../environment/passageways/passage-tutorial.js'
import { createGuardPassage } from '../environment/passageways/passage-guards.js'
import { createBridgePassage } from '../environment/passageways/passage-bridge.js'
import { createStealthSystem } from '../systems/stealth.js'
import { createDistractionSystem } from '../systems/distraction.js'
import { disposeObject } from '../core/dispose.js'
import { createLightPool, POINT_LIGHT_POOL_SIZE, TORCH_SPOT_POOL_SIZE } from '../core/light-pool.js'
import { createLandingScene } from '../environment/landing/index.js'
import { entranceStairHeightAt } from '../environment/landing/facade.js'
import { CENTER_Z, FACADE_X, LANDING_FIGURE, PLAZA } from '../environment/landing/layout.js'
import { createZoneVisibility } from './boarding-zones.js'
import { capRegionLights } from './boarding-lighting.js'
import { resetKitMaterials } from '../environment/level1-kit/kit-materials.js'

const BOARDING_HOLD_SECONDS = 5
const BOARDING_RETURN_TIMEOUT = 2
const BOARDING_OPEN_SECONDS = 0.6
const BOARDING_WALK_SECONDS = 1.6
const BOARDING_TURN_SECONDS = 0.6
const BOARDING_CLOSE_SECONDS = 0.6
const BOARDING_PAUSE_SECONDS = 0.4
const BOARDING_DEPART_SECONDS = 2.6
const BOARDING_ACCELERATION = 6.5
// 8.35 m from the x=5.55 carriage side, below the canopy and outside cover.
const BOARDING_CAMERA_POSITION = new THREE.Vector3(-2.8, 2.6, 35.5)
const BOARDING_CAMERA_LOOK = new THREE.Vector3(5.8, 1.5, 45.5)
const BOARDING_CAMERA_MOVE_SECONDS = 1.0
const BOARDING_PLATFORM_ANCHOR = new THREE.Vector3(3.8, 0, 43.2)
const PLATFORM_CHECKPOINTS = [
  { threshold: -6, position: new THREE.Vector3(-1.3, 0, -5.7) },
  { threshold: 18, position: new THREE.Vector3(-1.3, 0, 19.2) }
]

// Level 1 — "The Boarding". The complete stealth infiltration level:
// - Deterministic guard patrol AI (concourse, column perimeter, boarding sentry)
// - Wall-mounted sweeping security cameras with vision cone projections
// - Laser security grid and interactive bypass terminal
// - Suspicion / alert fail-state
// - Cinematic train departure sequence into Level 2

export function createBoardingLevel({
  scene,
  interaction,
  assets,
  hud,
  player,
  camera,
  renderCamera,
  respawn,
  timeSystem,
  advance,
  beginCinematic,
  renderer
}) {
  // Level 1 is pure stealth. The Chrono Interface has not been stolen yet, so
  // all temporal abilities are genuinely unavailable and the Chrono HUD stays hidden.
  timeSystem?.setMode?.('NORMAL')
  timeSystem?.setAbilityAvailability?.({ SLOW: false, FREEZE: false, REWIND: false, GHOST: false })
  hud?.setChronoVisible?.(false)
  resetKitMaterials()
  const { group: station, wallColliders, hallDressing, platform, track, coverCores } = createStationBlockout({ includePlaceholders: false })
  // East of the rails, outside the walkable bounds. Not a child of `station`,
  // so it is not an interaction blocker and guards do not treat it as cover.
  const landing = createLandingScene()
  landing.town.visible = false
  const landingPointLights = []
  landing.group.traverse((node) => {
    if (node.isPointLight) landingPointLights.push(node)
  })
  const plazaPointLights = landingPointLights.length

  // Shared finite inventory for throwable guard distractions. Passageways 2
  // and 3 both read/write this same object, so pickups carry across the vent.
  const distractionInventory = { count: 0, max: 3 }

  // The station door enters Passageway 1 directly; its west end stays sealed.
  const tutorialPassage = createTutorialPassage({
    interaction,
    hud,
    player,
    respawn,
    connectedToPassage0: false,
    connectedToPassage2: true
  })
  const guardPassage = createGuardPassage({
    scene,
    interaction,
    hud,
    player,
    respawn,
    camera,
    distractionInventory,
    worldObstacles: wallColliders,
    connectedToPassage3: true
  })
  const bridgePassage = createBridgePassage({
    scene,
    interaction,
    hud,
    player,
    respawn,
    camera,
    distractionInventory,
    worldObstacles: wallColliders
  })

  station.add(tutorialPassage.group, guardPassage.group, bridgePassage.group)
  wallColliders.push(
    ...tutorialPassage.colliders,
    ...guardPassage.colliders,
    ...bridgePassage.colliders
  )

  const levelBounds = {
    minX: Math.min(bounds.minX, tutorialPassage.bounds.minX, guardPassage.bounds.minX, bridgePassage.bounds.minX),
    maxX: Math.max(bounds.maxX, tutorialPassage.bounds.maxX, guardPassage.bounds.maxX, bridgePassage.bounds.maxX),
    minZ: Math.min(bounds.minZ, tutorialPassage.bounds.minZ, guardPassage.bounds.minZ, bridgePassage.bounds.minZ),
    maxZ: Math.max(bounds.maxZ, tutorialPassage.bounds.maxZ, guardPassage.bounds.maxZ, bridgePassage.bounds.maxZ)
  }
  // The concourse clamp (x = 4.3) stops short of the plaza. Widen the
  // rectangle, then wall off the tracks and the ground north of the platform
  // so the extra space is only the cobbles.
  const concourseMaxZ = levelBounds.maxZ
  levelBounds.maxX = Math.max(levelBounds.maxX, FACADE_X - 0.2)
  levelBounds.maxZ = Math.max(levelBounds.maxZ, PLAZA.maxZ - 0.1)
  wallColliders.push(
    ...landing.colliders,
    { minX: 4.5, maxX: PLAZA.minX + 0.2, minZ: -80, maxZ: 80 },
    { minX: -400, maxX: PLAZA.minX + 0.05, minZ: concourseMaxZ - 0.05, maxZ: 90 },
    { minX: PLAZA.minX - 0.3, maxX: FACADE_X + 0.4, minZ: -80, maxZ: PLAZA.minZ + 0.05 },
    { minX: PLAZA.minX - 0.3, maxX: FACADE_X + 0.4, minZ: PLAZA.maxZ - 0.05, maxZ: 90 }
  )

  const { train, stationSteam, boardingDoor, hideBoardingCues, openDoor, closeDoor,
    getDoorOpenFraction, warmBoardingVisuals, update: updateTrain } = createTrain()
  const lights = createStationLighting()
  const sunlight = lights.find((node) => node.name === 'station-sun')
  const skyFill = lights.find((node) => node.name === 'station-sky')
  const ambientFill = lights.find((node) => node.name === 'station-fill')
  const FORECOURT_FILL = { sky: 0.48, ambient: 0.06, environment: 0.4 }

  const nightFog = new THREE.Fog(0x121022, 40, 240)
  const plazaFog = new THREE.FogExp2(0x05060c, 0.023)
  const platformFog = new THREE.Fog(0x1f3d63, 60, 700)
  const NIGHT_SHADER_FOG = { color: 0x121022, near: 50, far: 260, max: 0.88 }
  const PLAZA_SHADER_FOG = { color: 0x05060c, near: 20, far: 62, max: 0.98 }

  // Guards, cameras and lasers are added to the scene later, not under the
  // station group. The zones place them by where they stand.
  const STEALTH_NAMES = new Set([
    'guard',
    'guard-shielded',
    'security-camera',
    'laser-grid'
  ])
  // Visibility each light had when the plaza hid it, so leaving restores
  // whatever other systems had set rather than forcing everything on.
  const hiddenOutside = new Map()
  let outsideHidden = false

  // Lights the forecourt never needs. Every visible light runs in every lit
  // shader, even at intensity 0: the mountain floods, the empty torch slots,
  // and the point slots past the forecourt's own lights. The station regions
  // are not drawn from the forecourt, so its lights hold the first slots.
  function plazaSpareLights() {
    const spare = [...lights.spotLights]
    for (const node of lightPools.children) {
      if (!node.isLight) continue
      if (node.name.startsWith('torch-pool-')) spare.push(node)
      const slot = node.name.match(/^light-pool-(\d+)$/)
      if (slot && Number(slot[1]) >= plazaPointLights) spare.push(node)
    }
    return spare
  }

  function setOutsideHidden(hide) {
    if (hide === outsideHidden) return
    outsideHidden = hide
    if (hide) {
      for (const node of plazaSpareLights()) {
        hiddenOutside.set(node, node.visible)
        node.visible = false
      }
    } else {
      for (const [node, visible] of hiddenOutside) node.visible = visible
      hiddenOutside.clear()
    }
    // The town stands over the platform and the track, so it is shown only
    // while they are hidden.
    landing.town.visible = hide
    sky.uniforms.uGroundBlack.value = hide ? 1 : 0
    // At the plaza's 0.06 the environment map is invisible but still costs
    // two cube-map lookups per lit pixel. The light count and fog type change
    // on this same frame, so dropping it adds no extra shader recompile.
    scene.environment = hide ? null : skyTarget?.texture ?? null
  }

  // Runs whenever the visible set changes; see boarding-zones.js.
  const floodIntensity = lights.spotLights.map((spot) => spot.intensity)
  function onZoneChange(zone) {
    if (import.meta.env?.DEV && isBoardingCinematic) logBoarding('zone', zone.name)
    if (zone.name !== 'plaza') ensureSkyEnvironment()
    const onPlatform = zone.name === 'platform'
    // Leaving the platform restores the established look immediately, including
    // direct dev teleports to the forecourt. Entry blends over one real second.
    sky.setPreset(onPlatform ? 'boarding-platform' : 'boarding', onPlatform ? 1 : 0)
    // The mountain floods cast no shadows, so indoors they would light the
    // passages straight through the roof.
    lights.spotLights.forEach((spot, i) => {
      spot.intensity = zone.outdoor && !onPlatform ? floodIntensity[i] : 0
    })
    // Wherever walls or buildings cover most of the screen, the sky draws
    // after them with a depth test and only shades the pixels left over.
    sky.mesh.material.depthTest = !zone.outdoor
    sky.mesh.renderOrder = zone.outdoor ? -1000 : 1000
    // Off the cobbles the landing is only scenery across the track; its
    // lamps would take pool slots from the station's.
    for (const light of landingPointLights) light.userData.lightPoolOff = zone.name !== 'plaza'
  }
  const zones = createZoneVisibility({
    dynamic: () => scene.children.filter((child) => STEALTH_NAMES.has(child.name)),
    onChange: onZoneChange
  })

  function applyForecourtFill(viewer) {
    if (!viewer) return
    // The carriage interior overlaps the forecourt's x>=6 zone. Keep the
    // platform's regions, sky, fog and lighting while the actor walks inside.
    if (isBoardingCinematic) viewer = BOARDING_PLATFORM_ANCHOR
    const onPlaza = viewer.x > 6 && viewer.x < 36 && viewer.z > -10 && viewer.z < 48
    if (skyFill) skyFill.intensity = onPlaza ? 0.1 : FORECOURT_FILL.sky
    if (ambientFill) ambientFill.intensity = onPlaza ? 0.01 : FORECOURT_FILL.ambient
    scene.environmentIntensity = onPlaza ? 0.06 : FORECOURT_FILL.environment
    scene.fog = onPlaza ? plazaFog : nightFog
    outdoorEnv.setFog(onPlaza ? PLAZA_SHADER_FOG : NIGHT_SHADER_FOG)
    // Not drawn at all past the cobbles: terrain, ranges, the platform and
    // the train. The sky and the landing stay. The door teleport leaves this
    // box on the same frame, which switches the zone before the fade-in.
    setOutsideHidden(onPlaza)
    zones.update(viewer)
    if (zones.zone?.name === 'platform') {
      platformFog.color = sky.horizonColor
      scene.fog = platformFog
      scene.environment = platformSkyTarget?.texture ?? null
    } else {
      scene.environment = onPlaza ? null : skyTarget?.texture ?? null
    }
  }
  const sky = createSkyDome('boarding')
  let hiddenOutdoorDelta = 0
  let hiddenLandingDelta = 0
  let hiddenTrainDelta = 0
  // These updates are analytic visual clocks only. Accumulate skipped time
  // so their phase catches up BEFORE they next draw, without changing gameplay.
  function updateVisibleScenery(delta, includeOutdoor = true) {
    if (includeOutdoor) {
      hiddenOutdoorDelta += delta
      if (outdoorEnv.group.visible) { outdoorEnv.update(hiddenOutdoorDelta); hiddenOutdoorDelta = 0 }
    }
    hiddenLandingDelta += delta
    if (landing.group.visible) { landing.update(hiddenLandingDelta); hiddenLandingDelta = 0 }
    hiddenTrainDelta += delta
    if (train.visible || isBoardingCinematic) { updateTrain(hiddenTrainDelta); hiddenTrainDelta = 0 }
  }
  const outdoorEnv = createOutdoorEnvironment({
    mode: 'station',
    trimLegacyScenery: true,
    stationSpotLights: lights.spotLights,
    // Darker than the sky's purple horizon tint, so the mountain fades out
    // instead of picking up the afterglow.
    fogColor: 0x121022,
    sunPosition: SUN_DIRECTION,
    // Terrain and trees ignore the real directional light. This is the
    // same moonlight colour, at 3×, so the hills pick up its shading.
    sunColor: new THREE.Color(0x9aafd0).multiplyScalar(3),
    skyColor: 0x243656,
    groundColor: 0x0c0a10,
    fogNear: 50,
    fogFar: 260,
    fogMax: 0.88,
    terrainAmbient: 0.88,
    vegAmbient: 0.64,
    // Same clock as the sky, so valley lights and creek water follow
    // Slow/Freeze/Rewind. The creek also shares the sky colour uniforms.
    skyTime: sky.timeUniform,
    skyUniforms: sky.uniforms,
    nature: getBoardingAssets()
  })

  // Track bed bottom is -1.7: the canonical -2.5 valley ground gains 0.8 m.
  // One-sided terrain begins at world x=13, outside the 4.4 m track bed.
  const platformValley = createMoonlitValley({
    static: true, speed: 0, valleySide: 1, offsetX: 7, offsetY: 0.8,
    chunkCount: 3, centerZ: 0, omitHillSide: true, rails: false, poles: false,
    fogColor: 0x1f3d63, moonDirection: PLATFORM_MOON_DIRECTION,
    staticGroundColor: 0x849482
  })
  const platformBackdrop = platformValley.group
  platformBackdrop.visible = false
  const surroundings = createPlatformSurroundings(platformValley, sky.timeUniform)
  surroundings.group.visible = false

  // Far sheet, with procedural alpha and soft edges. No texture, lights,
  // collision or per-frame geometry uploads; the shared sky clock drifts noise.
  const mistMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: sky.timeUniform, uColor: { value: new THREE.Color(0x829eae) } }
    ]),
    vertexShader: `
      varying vec2 vUv;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        #include <begin_vertex>
        #include <project_vertex>
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 s = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), s.x),
          mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), s.x), s.y);
      }
      void main() {
        vec2 edge = smoothstep(vec2(0.0), vec2(0.18), vUv)
          * smoothstep(vec2(0.0), vec2(0.18), vec2(1.0) - vUv);
        vec2 p = vUv * vec2(7.0, 3.0) + vec2(uTime * 0.016, uTime * 0.006);
        float density = smoothstep(0.28, 0.8, noise(p) * 0.7 + noise(p * 2.1) * 0.3);
        gl_FragColor = vec4(uColor, 0.12 * edge.x * edge.y * density);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    forceSinglePass: true, fog: true
  })
  // UniformsUtils.merge clones uniforms; restore this clock's shared identity.
  mistMaterial.uniforms.uTime = sky.timeUniform
  const mistGeometry = new THREE.PlaneGeometry(1, 1)
  // Remove only the near floating blob formerly centred at world (65,1,0).
  // Retain the distant sheet and the separate end fog banks unchanged.
  for (const [x, y, z, width, length] of [[145, 2.4, 20, 180, 300]]) {
    const mist = new THREE.Mesh(mistGeometry, mistMaterial)
    mist.name = 'platform-valley-mist'
    mist.rotation.x = -Math.PI / 2
    mist.scale.set(width, length, 1)
    // Parent carries the track alignment and height offset.
    mist.position.set(x - 7, y - 0.8, z)
    mist.raycast = () => {}
    mist.userData.noCameraCollision = true
    mist.userData.noInteractionBlocker = true
    platformBackdrop.add(mist)
  }
  platformBackdrop.userData.drawCalls = platformValley.stats.drawCalls + 1
  platformBackdrop.userData.triangles = platformValley.stats.triangles + 2
  if (import.meta.env?.DEV) console.info('[boarding platform backdrop]', {
    drawCalls: platformBackdrop.userData.drawCalls,
    triangles: platformBackdrop.userData.triangles,
    terrainX: [13, 907], terrainZ: [-160, 320], chunks: 3, mistDrawCalls: 1
  })

  scene.add(sky.mesh, outdoorEnv.group, platformBackdrop, station, hallDressing, train, stationSteam, landing.group, ...lights)
  scene.add(surroundings.group)

  // The plaza uses no environment map. Capture these once when leaving it.
  let skyTarget = null
  let platformSkyTarget = null
  function ensureSkyEnvironment() {
    if (!renderer || skyTarget) return
    sky.setPreset('boarding')
    skyTarget = captureSkyEnvironment(renderer, sky.mesh)
    sky.setPreset('boarding-platform')
    platformSkyTarget = captureSkyEnvironment(renderer, sky.mesh)
    sky.setPreset('boarding')
    scene.environmentIntensity = 0.4
  }

  const unregisterStationBlocker = interaction.registerBlocker(station)
  const unregisterTrainBlocker = interaction.registerBlocker(train)

  // Blue hour. The dome covers the main view. Fog is a dark twilight, not
  // the sky's afterglow, so the far mountain reads as a silhouette. The
  // clear stays dark: the minimap copies scene.background.
  scene.background = new THREE.Color(0x1a1a2e)
  scene.fog = nightFog

  // Collect solid obstacles for line-of-sight raycasts
  const collidables = []
  station.traverse((child) => {
    if (child.isMesh && child.name !== 'vision-cone' && !child.userData.decor) {
      collidables.push(child)
    }
  })

  // -------------------------------------------------------------
  // Stealth & Infiltration System
  // -------------------------------------------------------------
  const stealth = createStealthSystem({
    scene,
    player,
    respawn,
    hud,
    collidables,
    obstacles: wallColliders,
    assets
  })

  tutorialPassage.setupStealth(stealth)
  guardPassage.setupStealth(stealth)
  bridgePassage.setupStealth(stealth)

  // Deaths respawn at the checkpoint without ending the run; suspicion should
  // start fresh each time so a prior alert does not carry over.
  const unregisterRespawnSuspicionReset = respawn?.onFail?.(() => {
    stealth.clearSuspicion()
  }) ?? (() => {})

  // Passageways 4 and 5 reuse the same finite distraction inventory as P2/P3.
  // Their guards belong to the station-level stealth system, so they need a
  // station-level throw handler rather than one owned by either lower passage.
  const stationDistraction = createDistractionSystem({
    scene,
    player,
    camera,
    stealth,
    hud,
    inventory: distractionInventory,
    hearingRadius: 10.5,
    groundHeightAt: () => 0,
    obstacles: wallColliders,
    isEnabled: () => Boolean(
      bridgePassage.isComplete() &&
      player?.mesh?.position?.y > -0.55 &&
      !bridgePassage.isInsidePassage()
    )
  })

  const stationPickupUnregisters = []
  const stationPickupGeometry = new THREE.CylinderGeometry(0.09, 0.09, 0.26, 10)
  stationPickupGeometry.rotateZ(Math.PI / 2)
  const stationPickupMaterial = new THREE.MeshStandardMaterial({
    color: 0xb08d3f,
    emissive: 0x3a2608,
    emissiveIntensity: 0.45,
    roughness: 0.28,
    metalness: 0.9
  })

  function addStationDistractorPickup(position, name, bottle = false) {
    const pickup = new THREE.Group()
    pickup.name = name
    pickup.position.copy(position)

    const body = new THREE.Mesh(bottle ? new THREE.CylinderGeometry(0.07, 0.09, 0.25, 10) : stationPickupGeometry, stationPickupMaterial)
    body.position.y = 0.16
    pickup.add(body)
    if (bottle) {
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.12, 8), stationPickupMaterial)
      neck.position.y = 0.34
      pickup.add(neck)
    }
    station.add(pickup)

    let collected = false
    const unregister = interaction.register(pickup, {
      prompt: bottle ? 'Pick up bottle distractor' : 'Pick up loose metal distractor',
      range: 2.2,
      onInteract: () => {
        if (collected) return
        if (distractionInventory.count >= distractionInventory.max) {
          hud?.showToast?.(`Distractor pouch full — ${distractionInventory.count}/${distractionInventory.max}`, 1300)
          return
        }

        collected = true
        distractionInventory.count += 1
        pickup.visible = false
        hud?.showToast?.(`Distractor collected — ${distractionInventory.count}/${distractionInventory.max}`, 1300)
      }
    })
    stationPickupUnregisters.push(unregister)
  }

  // Two replenishment points in Passageway 4's west approach and two in the
  // final station passage. They remain uncollected if the pouch is already full.
  addStationDistractorPickup(new THREE.Vector3(-43.5, 0.02, -26.2), 'distractor-pickup-p4-a')
  addStationDistractorPickup(new THREE.Vector3(-14.5, 0.02, -22.7), 'distractor-pickup-p4-b')
  addStationDistractorPickup(new THREE.Vector3(0.2, 0.02, -10.0), 'distractor-pickup-p5-a')
  addStationDistractorPickup(new THREE.Vector3(-2.8, 0.02, 10.0), 'distractor-pickup-p5-b')
  addStationDistractorPickup(new THREE.Vector3(-1.3, 0.02, 19.4), 'distractor-pickup-sentry-bottle', true)

  // -------------------------------------------------------------
  // New west-side infiltration wing — four extra stealth zones before the
  // original level. These guards/cameras use the exact same stealth system as
  // the existing platform section; only their positions and patrol routes are new.
  // -------------------------------------------------------------

  // Wing Zone A — Entry Gallery
  /*stealth.addGuard({
    waypoints: [
      new THREE.Vector3(-47.0, 0, -24.2),
      new THREE.Vector3(-41.5, 0, -24.2)
    ],
    speed: 1.25,
    waitTime: 2.6,
    initialWaypoint: 0
  })*/

  // Wing Zone B — Baggage Passage (medium)
  stealth.addGuard({
    waypoints: [
      new THREE.Vector3(-37.0, 0, -23.0),
      new THREE.Vector3(-31.0, 0, -26.0)
    ],
    speed: 1.45,
    waitTime: 2.0,
    initialWaypoint: 0
  })

  const approachLaserGrid = stealth.addLaserGrid({
    position: new THREE.Vector3(
      APPROACH_GATE_X[1],
      0,
      -23.025
    ),
    width: 2.1,
    height: 2.2,
    beamCount: 4,
    rotationY: Math.PI / 2
  })

  // -------------------------------------------------------------
  // West Wing Laser Terminal
  // Mounted on the north wall before Gate 2.
  // -------------------------------------------------------------
  const approachTerminal = new THREE.Group()
  approachTerminal.name = 'west-wing-security-terminal'
  approachTerminal.position.set(-32.0, 1.2, -22.0)

  // Rotate the existing terminal design so its screen faces into
  // the east-west corridor.
  approachTerminal.rotation.y = Math.PI / 2

  const approachTermBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.55, 0.22),
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.8
    })
  )

  approachTerminal.add(approachTermBox)

  const approachTermScreenMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 2.5,
    roughness: 0.2
  })

  const approachTermScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.28, 0.16),
    approachTermScreenMat
  )

  approachTermScreen.position.set(0.18, 0.05, 0)
  approachTerminal.add(approachTermScreen)

  const approachTermLight = new THREE.PointLight(
    0xef4444,
    3,
    3
  )

  approachTermLight.position.set(0.3, 0.05, 0)
  approachTerminal.add(approachTermLight)

  station.add(approachTerminal)

  let isApproachGridDisabled = false

  const unregisterApproachTerminal = interaction.register(
    approachTerminal,
    {
      prompt: 'Deactivate West Wing Laser Grid',

      onInteract: () => {
        if (isApproachGridDisabled) return

        isApproachGridDisabled = true

        approachLaserGrid.setActive(false)

        approachTermScreenMat.color.setHex(0x10b981)
        approachTermScreenMat.emissive.setHex(0x059669)
        approachTermLight.color.setHex(0x10b981)

        interaction.flashPrompt(
          'West Wing Security Grid Deactivated!'
        )

        if (hud) {
          hud.showToast(
            'Laser grid offline — Gate 2 is clear',
            2200
          )
        }
      }
    }
  )

  // Wing Zone C — Security Hall (medium-hard)
  stealth.addGuard({
    waypoints: [
      new THREE.Vector3(-27.0, 0, -26.0),
      new THREE.Vector3(-20.0, 0, -23.0)
    ],
    speed: 1.55,
    waitTime: 1.7,
    initialWaypoint: 1
  })


  // Wing Zone D — Final Approach (hard)
  stealth.addGuard({
    waypoints: [
      new THREE.Vector3(-16.0, 0, -23.0),
      new THREE.Vector3(-8.0, 0, -26.0)
    ],
    speed: 1.7,
    waitTime: 1.5,
    initialWaypoint: 0
  })

  stealth.addCamera({
    position: new THREE.Vector3(-10.5, 4.6, -21.95),
    baseAngle: Math.PI,
    sweepRange: Math.PI / 3.6,
    sweepSpeed: 0.9,
    range: 8.0
  })

  // Native waypoint patrols preserve detection, scanning and distractions.
  const platformPatrols = [
    { id: 'platform-A', points: [[-3.2, -16], [3.65, -16]], speed: 1.25, waitTime: 2, yaw: Math.PI / 2 },
    // The hall's north wall crosses x=-3.2 at z=-21.75. Stay north of
    // its face; the nearest bench/tree edges remain 0.62/0.65 m away.
    { id: 'platform-B', points: [[-3.2, -8], [-3.2, -20.4]], speed: 1.1, waitTime: 4, yaw: Math.PI },
    { id: 'platform-C', points: [[3, -4], [3, 16], [-3, 16], [-3, -4]], speed: 1.3, waitTime: 2, yaw: 0 },
    { id: 'platform-D', points: [[3.65, 16], [3.65, -4]], speed: 1.15, waitTime: 4, yaw: Math.PI },
    { id: 'platform-E', points: [[0, 30]], speed: 1.2, waitTime: 0, yaw: Math.PI },
    { id: 'platform-F', points: [[3.65, 20], [3.65, 35]], speed: 1.2, waitTime: 4, yaw: 0 }
  ]
  const platformGuards = platformPatrols.map(route => {
    route.waypoints = route.points.map(([x, z]) => new THREE.Vector3(x, 0, z))
    const guard = stealth.addGuard({
      waypoints: route.waypoints,
      speed: route.speed, waitTime: route.waitTime, initialWaypoint: 0
    })
    guard.group.userData.patrolId = route.id
    guard.facing = route.yaw
    guard.scanBase = guard.facing
    guard.group.rotation.y = guard.facing
    guard.waitTimer = route.waitTime
    return guard
  })
  const sentry = platformGuards[4], sentryHome = platformPatrols[4].waypoints
  const sentryReturn = [sentryHome[0], sentryHome[0]]
  let sentryTime = 0
  function resetPlatformGuards() {
    stealth.reset()
    platformGuards.forEach((guard, i) => {
      const route = platformPatrols[i]
      guard.waypoints = route.waypoints
      guard.group.position.copy(route.waypoints[0])
      guard.targetIdx = route.waypoints.length > 1 ? 1 : 0
      guard.facing = route.yaw
      guard.scanBase = route.yaw
      guard.group.rotation.y = route.yaw
      guard.waitTimer = route.waitTime
    })
    sentryTime = 0
  }
  function updatePlatformSentry(delta) {
    if (sentry.state !== 'PATROL') { sentryTime = 0; return }
    if (sentry.group.position.distanceToSquared(sentryHome[0]) > 0.04) {
      if (sentry.waypoints !== sentryReturn) {
        sentry.waypoints = sentryReturn; sentry.targetIdx = 0; sentry.waitTimer = 0
      }
      return // Let native patrol movement bring him home after a distraction.
    }
    sentry.waypoints = sentryHome
    sentryTime = (sentryTime + delta) % 10
    sentry.facing = sentryTime < 4 ? Math.PI : sentryTime < 5 ? Math.PI * (1 - THREE.MathUtils.smoothstep(sentryTime, 4, 5))
      : sentryTime < 9 ? 0 : Math.PI * THREE.MathUtils.smoothstep(sentryTime, 9, 10)
    sentry.scanBase = sentry.facing
    sentry.group.rotation.y = sentry.facing
  }

  if (import.meta.env?.DEV && new URLSearchParams(window.location.search).has('checkCover')) {
    // Opt-in geometry audit: its two 0.1 m flood fills must not run on every boot.
    // Test the sheltered face of EVERY opaque piece against all routine guard
    // route positions. An isolated prop cannot hide someone on its exposed face.
    // Conservatively aim each guard directly at the probe (superset of its FOV).
    const range = 7.5
    const ray = new THREE.Raycaster(), eye = new THREE.Vector3(), target = new THREE.Vector3()
    const direction = new THREE.Vector3()
    station.updateMatrixWorld(true)
    const table = PLATFORM_COVER.filter(p => !p.seeThrough).map(piece => {
      let tested = 0, failed = null
      for (const guard of stealth.getGuards()) {
        if (guard.waypoints.some(p => Math.abs(p.y) > 0.01)) continue
        for (let segment = 0; segment < guard.waypoints.length; segment++) {
          const a = guard.waypoints[segment], b = guard.waypoints[(segment + 1) % guard.waypoints.length]
          const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 0.25))
          for (let step = 0; step <= steps; step++) {
            eye.lerpVectors(a, b, step / steps); eye.y += 1.55
            const dx = piece.x - eye.x, dz = piece.z - eye.z
            const extent = Math.max(Math.abs(dx) / (piece.width / 2), Math.abs(dz) / (piece.length / 2))
            if (extent < 1) continue
            const norm = Math.hypot(dx, dz)
            const px = piece.x + dx / extent + dx / norm * 0.5
            const pz = piece.z + dz / extent + dz / norm * 0.5
            for (const [ox, oz] of [[0, 0], [-0.18, -0.18], [-0.18, 0.18], [0.18, -0.18], [0.18, 0.18]]) {
              target.set(px + ox, piece.height >= 1.6 ? 1.2 : 0.72, pz + oz)
              direction.subVectors(target, eye)
              const distance = direction.length()
              if (distance > range) continue
              tested++
              ray.set(eye, direction.normalize()); ray.far = distance - 0.3
              if (!ray.intersectObject(coverCores.get(piece.id), false).length)
                failed ||= `${guard.group.userData.patrolId || 'hall-guard'} at ${eye.x.toFixed(2)},${eye.z.toFixed(2)}`
            }
          }
        }
      }
      return { piece: piece.id, posture: piece.height >= 1.6 ? 'standing' : 'crouched',
        tested, result: failed ? 'EXPOSED' : 'correct', failed }
    })
    console.table(table)
    console.info(`cover self-test: ${table.filter(row => row.result === 'correct').length}/${table.length} pieces correct`)
    console.assert(table.every(row => row.result === 'correct'), 'Cover core fails sheltered-side LOS test')
    // These checkpoints promise safety at respawn, with guards reset to their
    // initial positions/facings, rather than permanent immunity during patrol.
    for (const checkpoint of PLATFORM_CHECKPOINTS) {
      let safe = true
      for (const guard of stealth.getGuards()) for (const height of [0.72, 1.2]) {
        eye.copy(guard.group.position); eye.y += 1.55
        target.copy(checkpoint.position); target.y += height
        direction.subVectors(target, eye)
        const distance = direction.length(), flatDistance = Math.hypot(direction.x, direction.z)
        if (distance > range) continue
        const dot = (direction.x * Math.sin(guard.facing) + direction.z * Math.cos(guard.facing)) / Math.max(flatDistance, 1e-6)
        if (dot < 0.52 && flatDistance >= 1.6) continue
        ray.set(eye, direction.normalize()); ray.far = distance - 0.3
        if (!ray.intersectObjects(collidables, false).length) safe = false
      }
      console.assert(safe, 'Checkpoint exposed at reset:', checkpoint.position)
    }
    const doorRoute = platformPatrols[5]
    const [routeStart, routeEnd] = doorRoute.points.map(point => point[1])
    // F's entire route now lies beyond door detection range. Report one
    // complete nominal cycle (turn time only extends it), not a fictitious
    // crossing of the range boundary beyond his northern endpoint.
    const safeWindow = routeEnd < 43.2 - range
      ? 2 * (routeEnd - routeStart) / doorRoute.speed + 2 * doorRoute.waitTime
      : 2 * (43.2 - range - routeStart) / doorRoute.speed + doorRoute.waitTime
    console.info(`door window: ${safeWindow.toFixed(1)} s`)
    console.assert(safeWindow >= 7 && 43.2 - 30 > range, 'Door window too short')
    // Match PLAYER_COLLISION_RADIUS in entities/player.js (0.18 m). That
    // module does not export the constant, and is outside this edit's scope.
    // Movement uses circle-vs-AABB distance, not expanded-square corners.
    const playerRadius = 0.18, spareClearance = 0.15, gridStep = 0.1
    const probeRadius = playerRadius + spareClearance
    const gridMinX = -5, gridMaxX = 4.5
    const gridMinZ = bounds.minZ, gridMaxZ = bounds.maxZ
    const columns = Math.round((gridMaxX - gridMinX) / gridStep) + 1
    const rows = Math.round((gridMaxZ - gridMinZ) / gridStep) + 1
    const movementBoxes = wallColliders.filter(box => box.enabled !== false &&
      box.maxX >= gridMinX - probeRadius && box.minX <= gridMaxX + probeRadius &&
      box.maxZ >= gridMinZ - probeRadius && box.minZ <= gridMaxZ + probeRadius)
    // Exact distance from a horizontal/vertical path segment to an AABB.
    // Every edge is checked as a swept circle, so the flood cannot skip a
    // thin collider or cut a corner between two free grid nodes.
    const segmentDistance = (a, b, box) => {
      const dx = Math.max(box.minX - Math.max(a.x, b.x), Math.min(a.x, b.x) - box.maxX, 0)
      const dz = Math.max(box.minZ - Math.max(a.z, b.z), Math.min(a.z, b.z) - box.maxZ, 0)
      return Math.hypot(dx, dz)
    }
    const segmentClear = (a, b, radius) => movementBoxes.every(box => segmentDistance(a, b, box) >= radius - 1e-8)
    for (const route of platformPatrols) for (let i = 0; i < route.waypoints.length; i++) {
      const a = route.waypoints[i], b = route.waypoints[(i + 1) % route.waypoints.length]
      console.assert(segmentClear(a, b, 0.6), 'Guard route lacks 0.6 m geometry clearance:', route.id, a, b)
    }
    const indexAt = p => Math.round((p.z - gridMinZ) / gridStep) * columns + Math.round((p.x - gridMinX) / gridStep)
    const pointAt = index => ({ x: gridMinX + (index % columns) * gridStep,
      z: gridMinZ + Math.floor(index / columns) * gridStep })
    const flood = radius => {
      const free = new Uint8Array(columns * rows), reached = new Uint8Array(free.length)
      const queue = new Int32Array(free.length)
      for (let i = 0; i < free.length; i++) {
        const p = pointAt(i)
        free[i] = segmentClear(p, p, radius) ? 1 : 0
      }
      const start = indexAt({ x: -3.5, z: -24.5 })
      let head = 0, tail = 0
      if (free[start]) { reached[start] = 1; queue[tail++] = start }
      else console.warn('Cover reachability seed is blocked at (-3.5,-24.5)', { radius })
      while (head < tail) {
        const index = queue[head++], x = index % columns, z = Math.floor(index / columns)
        const neighbours = []
        if (x > 0) neighbours.push(index - 1)
        if (x + 1 < columns) neighbours.push(index + 1)
        if (z > 0) neighbours.push(index - columns)
        if (z + 1 < rows) neighbours.push(index + columns)
        const p = pointAt(index)
        for (const next of neighbours) {
          if (!free[next] || reached[next] || !segmentClear(p, pointAt(next), radius)) continue
          reached[next] = 1; queue[tail++] = next
        }
      }
      return point => Boolean(reached[indexAt(point)])
    }
    const reachable = flood(playerRadius), reachableWithSpare = flood(probeRadius)
    const destinations = [{ name: 'boarding spot', x: 4.1, z: 43.2 },
      ...PLATFORM_CHECKPOINTS.map((checkpoint, i) => ({ name: `checkpoint-${i + 1}`, x: checkpoint.position.x, z: checkpoint.position.z }))]
    for (const point of destinations) {
      console.assert(reachable(point), 'Route blocked:', point)
      console.assert(reachableWithSpare(point), 'Route lacks 0.15 m spare clearance:', point)
    }
    console.info(destinations.every(reachable) ? 'route reachability: OK' : 'route reachability: BLOCKED — see coordinates above')
    // Mesh/point submissions, not a GPU/frame measurement. Include instance
    // multiplicity and geometry groups; shadows/postprocessing are excluded.
    const count = root => {
      const total = { drawCalls: 0, triangles: 0 }
      root.traverse(node => {
        if ((!node.isMesh && !node.isPoints) || !node.visible) return
        total.drawCalls += Array.isArray(node.material) ? node.geometry.groups.length : 1
        if (node.isMesh) total.triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3 * (node.isInstancedMesh ? node.count : 1)
      })
      return total
    }
    const platformCounts = count(platform), trackCounts = count(track)
    const engineCounts = count(train.getObjectByName('locomotive-and-tender'))
    console.table({ platform: platformCounts, track: trackCounts,
      locomotive: engineCounts, trainIncludingLocomotive: count(train) })
    // Code-derived conservative comparison: >=99 old platform submissions
    // removed; car batching adds 36, steam adds 2, track batching adds 28.
    const drawDeltaUpperBound = platformCounts.drawCalls + engineCounts.drawCalls + 36 + 2 + 28 - 99
    const triangleDeltaUpperBound = platformCounts.triangles + engineCounts.triangles + 1000
    console.info('Platform budget conservative delta bounds:', { drawCalls: drawDeltaUpperBound, triangles: triangleDeltaUpperBound })
    console.assert(drawDeltaUpperBound <= 60 && triangleDeltaUpperBound <= 80000, 'Platform geometry budget exceeded')
    console.info('Cover blockers:', coverCores.size, 'Platform point-light sources: 3. Counts are geometry submissions before frustum culling.')
  }

  // -------------------------------------------------------------
  // Boarding Sequence & Cinematic Transition
  // -------------------------------------------------------------
  let isBoardingCinematic = false
  let cinematicTimer = 0
  let boardingPhase = null
  let boardingReturn = null
  let boardingStartedAt = 0
  let boardingOverlayObserver = null
  function logBoarding(event, detail) {
    if (import.meta.env?.DEV) console.info(`[boarding +${((performance.now() - boardingStartedAt) / 1000).toFixed(3)}s @${performance.now().toFixed(0)}ms] ${event}`, detail)
  }
  function watchBoardingOverlays() {
    if (!import.meta.env?.DEV) return
    const previous = new WeakMap()
    const report = node => {
      if (!(node instanceof HTMLElement) || (node !== veil && !/loading|overlay|caught|transition/i.test(node.id))) return
      const style = getComputedStyle(node)
      const state = `${style.display}/${style.visibility}/${style.opacity}`
      if (previous.get(node) === state) return
      previous.set(node, state)
      logBoarding('overlay', { element: node.id || 'station-entry-veil', state })
    }
    document.querySelectorAll('[id]').forEach(report)
    report(veil)
    boardingOverlayObserver = new MutationObserver(records => {
      for (const record of records) report(record.target)
    })
    boardingOverlayObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] })
  }
  const departureStartZ = train.position.z
  const boardingTarget = new THREE.Vector3()
  const boardingView = { mode: 'fixed', position: BOARDING_CAMERA_POSITION.clone(),
    target: BOARDING_CAMERA_LOOK.clone(), allowPress: false,
    initialPosition: new THREE.Vector3(),
    initialRotation: new THREE.Quaternion(), targetRotation: new THREE.Quaternion(),
    moveSeconds: BOARDING_CAMERA_MOVE_SECONDS, moveElapsed: 0 }

  function startBoardingCamera() {
    // Capture before changing view mode, including the first-person eye pose.
    renderCamera.getWorldPosition(boardingView.initialPosition)
    renderCamera.getWorldQuaternion(boardingView.initialRotation)
    const look = new THREE.Matrix4().lookAt(boardingView.position, boardingView.target, new THREE.Vector3(0, 1, 0))
    boardingView.targetRotation.setFromRotationMatrix(look)
    boardingView.moveElapsed = 0
    camera.setMode('third', { announce: false })
    player.mesh.visible = true
    player.setCinematicView(boardingView)
  }

  function beginBoardingPhase(phase) {
    boardingPhase = phase
    cinematicTimer = 0
    if (import.meta.env?.DEV) logBoarding('phase', phase)
  }

  function startBoardingWalk() {
    beginBoardingPhase('walking')
    boardingDoor.getWorldPosition(boardingTarget)
    const z = boardingTarget.z
    player.startScriptedWalk([
      player.mesh.position.clone(),
      new THREE.Vector3(4.55, 0.05, z),
      new THREE.Vector3(5.05, 0.24, z),
      new THREE.Vector3(5.55, 0.55, z),
      new THREE.Vector3(6.3, 0.55, z)
    ], BOARDING_WALK_SECONDS, () => {
      player.startScriptedTurn(player.mesh.rotation.y + Math.PI, BOARDING_TURN_SECONDS)
      beginBoardingPhase('turning')
    })
  }

  // Last carriage, world z=43.2; departure sequencing stays shared with Level 2.
  const unregisterBoarding = interaction.register(boardingDoor, {
    prompt: 'Force the door',
    holdSeconds: BOARDING_HOLD_SECONDS,
    isEligible: () => {
      boardingDoor.getWorldPosition(boardingTarget)
      const p = player.mesh.position
      return !isBoardingCinematic && !respawn.isFailing() &&
        !player.isAirborne() && Math.abs(p.y) < 0.15 &&
        p.x >= 3.8 && Math.abs(p.z - boardingTarget.z) <= 0.6
    },
    onHoldStart: () => player.startInteractionPull?.(boardingDoor),
    onHoldCancel: ({ reset }) => {
      if (reset) player.resetInteractionAnimation?.()
      else player.returnInteractionPull?.()
    },
    onHoldComplete: () => {
      if (isBoardingCinematic || respawn.isFailing()) return
      isBoardingCinematic = true
      boardingStartedAt = performance.now()
      if (import.meta.env?.DEV) watchBoardingOverlays()
      applyForecourtFill(BOARDING_PLATFORM_ANCHOR)
      if (import.meta.env?.DEV) logBoarding('platform lock', { zone: zones.zone?.name, train: train.visible, platform: platform.visible, background: scene.background?.getHexString() })
      hideBoardingCues()
      beginBoardingPhase('returning')
      boardingReturn = player.returnInteractionPull?.(true)
      startBoardingCamera()
      beginCinematic?.()
      interaction.flashPrompt('Boarding the Chrono Express…')
      if (hud) hud.setObjective('Departing station… hold on!')
    }
  })

  const approachZoneNames = [
    'Infiltrate the west gallery — use luggage and benches as cover',
    'Baggage passage — find a way through the security laser',
    'Security hall — stay behind cover and avoid the patrol',
    'Final approach — reach the station junction'
  ]
  let approachZoneIndex = -1

  const zoneNames = [
    'Two patrols cover the platform — watch both before crossing',
    'Weave through the small baggage stacks — watch the loop and track patrol',
    'A sentry and track patrol watch the far end — a bottle might turn his head'
  ]
  let zoneIndex = -1
  let platformCheckpointActive = false
  let platformCheckpointIndex = -1

  // The level manager needs an initial respawn position before any checkpoint
  // has been reached. Once the player reaches the old spawn/junction, this is
  // replaced by the level's one real checkpoint.
  const junctionCheckpointPos = new THREE.Vector3(
    JUNCTION_CHECKPOINT.x,
    0,
    JUNCTION_CHECKPOINT.z
  )
  let junctionCheckpointActive = false

  // The station door sets this checkpoint when it teleports into Passageway 1.
  const passage1CheckpointPos = tutorialPassage.spawn.clone()

  // Passageway 2 is the first real stealth test. Reaching it becomes a
  // checkpoint so a learning mistake does not force the player to repeat the
  // entire Passageway 1 tutorial and staircase.
  const passage2CheckpointPos = guardPassage.entryCheckpoint.clone()
  let passage2CheckpointActive = false

  // Passageway 3 gets its own checkpoint only after the player successfully
  // clears the crouch vent. That makes the vent a real transition without
  // respawning the player inside its low ceiling.
  const passage3CheckpointPos = bridgePassage.entryCheckpoint.clone()
  let passage3CheckpointActive = false

  // Passageway 4 starts immediately after Passageway 3's upper return stairs.
  // Give the player a checkpoint as soon as they step onto that upper approach
  // corridor, before any Passageway 4 stealth encounters begin.
  const passage4CheckpointPos = bridgePassage.exitCheckpoint.clone()
  let passage4CheckpointActive = false

  // Zone regions. The passages are already one group each. The rest of the
  // station is split into the hall (Passageway 4, west of the rear wall) and
  // the platform, by where each piece sits. Region groups, rather than the
  // pieces themselves, are toggled, so a collected pickup stays hidden.
  const passageGroups = new Set([
    tutorialPassage.group,
    guardPassage.group,
    bridgePassage.group
  ])
  const hallRegion = new THREE.Group()
  hallRegion.name = 'station-hall-region'
  const platformRegion = new THREE.Group()
  platformRegion.name = 'station-platform-region'
  const regionBox = new THREE.Box3()
  const regionCentre = new THREE.Vector3()
  station.updateMatrixWorld(true)
  for (const child of [...station.children]) {
    if (passageGroups.has(child)) continue
    regionBox.setFromObject(child)
    const x = regionBox.isEmpty() ? child.position.x : regionBox.getCenter(regionCentre).x
    ;(child.userData.platformRegion || x >= -5 ? platformRegion : hallRegion).add(child)
  }
  station.add(hallRegion, platformRegion)

  // A fixed handful of real lights per region; see boarding-lighting.js.
  // Worst case is the west hall: Passageway 3, the hall and the platform.
  const lampPools = new THREE.Group()
  lampPools.name = 'lamp-floor-glows'
  scene.add(lampPools)
  const regionLights = [
    { root: tutorialPassage.group, keep: 3, pools: new THREE.Group() },
    { root: guardPassage.group, keep: 2, pools: new THREE.Group() },
    { root: bridgePassage.group, keep: 2, pools: new THREE.Group() },
    { root: hallRegion, keep: 3, pools: new THREE.Group() },
    { root: platformRegion, keep: 3, pools: new THREE.Group() }
  ]
  for (const region of regionLights) {
    capRegionLights([region], region.pools)
    lampPools.add(region.pools)
  }

  zones.addRegion('p1', tutorialPassage.group, regionLights[0].pools)
  zones.addRegion('p2', guardPassage.group, regionLights[1].pools)
  zones.addRegion('p3', bridgePassage.group, regionLights[2].pools)
  zones.addRegion('p4', hallRegion, hallDressing, regionLights[3].pools)
  zones.addRegion('platform', platformRegion, regionLights[4].pools)
  zones.addRegion('train', train, stationSteam)
  zones.addRegion('landing', landing.group)
  zones.addRegion('outdoor', outdoorEnv.group)
  zones.addRegion('platform-backdrop', platformBackdrop, surroundings.group)

  // Sources stay hidden. These slots are the only point lights and guard
  // torches the shader ever sees, and the count does not change at runtime.
  const lightPools = new THREE.Group()
  lightPools.name = 'boarding-light-pools'
  scene.add(lightPools)
  const pointPool = createLightPool({
    roots: [station, train, landing.group],
    host: lightPools,
    size: POINT_LIGHT_POOL_SIZE
  })
  const torchPool = createLightPool({
    root: scene,
    host: lightPools,
    size: TORCH_SPOT_POOL_SIZE,
    accept: (node) => node.name === 'torch-spot',
    name: 'torch-pool',
    kind: 'spot'
  })

  const stationObjective = 'Infiltrate all three security passageways, then rejoin the station route to the Chrono Express'
  const veil = document.createElement('div')
  Object.assign(veil.style, {
    position: 'fixed',
    inset: '0',
    background: '#000',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '40'
  })
  document.body.appendChild(veil)

  const door = new THREE.Object3D()
  door.name = 'landing-door'
  // Position the E interaction directly in front of the centre entrance door.
  // Leave its range, callback and station-entry transition unchanged.
  door.position.set(FACADE_X - 0.30, 1.55, CENTER_Z)
  landing.group.add(door)

  let enteredStation = false
  let enteringStation = false
  let enterFade = null
  const FADE_SECONDS = 0.6

  function arriveInside() {
    warmTrain()
    enteredStation = true
    player.setPose(passage1CheckpointPos, Math.PI / 2)
    camera?.setYaw?.(Math.PI / 2)
    camera?.setPitch?.(0.25)
    camera?.snap?.()
    respawn.setCheckpoint(passage1CheckpointPos.clone(), Math.PI / 2, {
      restore: () => stealth.reset()
    })
    hud?.setObjective(stationObjective)
  }

  function updateDoorFade(delta) {
    if (!enterFade) return
    enterFade.t += delta
    const u = Math.min(1, enterFade.t / FADE_SECONDS)
    if (enterFade.phase === 'out') {
      veil.style.opacity = String(u)
      if (u >= 1) {
        arriveInside()
        enterFade = { t: 0, phase: 'in' }
      }
    } else {
      veil.style.opacity = String(1 - u)
      if (u >= 1) {
        veil.style.opacity = '0'
        enterFade = null
        enteringStation = false
      }
    }
  }

  const unregisterDoor = interaction.register(door, {
    prompt: 'Enter the station',
    range: 2.7,
    onInteract() {
      if (enteredStation || enterFade) return
      enteringStation = true
      enterFade = { t: 0, phase: 'out' }
      beginCinematic?.()
    }
  })

  // The train is hidden from the plaza. Prepare it under the station-entry
  // fade instead of making every launch wait for an unseen vestibule.
  function warmTrain() {
    ensureSkyEnvironment()
    const savedFog = scene.fog, savedEnvironment = scene.environment
    try {
      scene.fog = platformFog
      scene.environment = platformSkyTarget?.texture ?? savedEnvironment
      warmBoardingVisuals(renderer, scene)
    } finally {
      scene.fog = savedFog
      scene.environment = savedEnvironment
    }
  }

  return {
    objective: 'Enter the station',
    get minimapVisible() {
      return Boolean(zones.zone && zones.zone.name !== 'plaza')
    },
    checkpoint: {
      position: new THREE.Vector3(LANDING_FIGURE.x, LANDING_FIGURE.y, LANDING_FIGURE.z),
      yaw: LANDING_FIGURE.yaw,
      pitch: LANDING_FIGURE.pitch,
      restore: () => stealth.reset()
    },
    bounds: levelBounds,
    obstacles: wallColliders,
    groundHeightAt(x, z, fallback = 0) {
      if (
        x >= PLAZA.minX - 0.4 && x <= FACADE_X + 0.4 &&
        z >= PLAZA.minZ - 0.4 && z <= PLAZA.maxZ + 0.4
      ) {
        const stairHeight = entranceStairHeightAt(x, z)
        return stairHeight ?? PLAZA.y
      }

      const bridgeHeight = bridgePassage.getGroundHeight(x, z, Number.NaN)
      if (Number.isFinite(bridgeHeight)) return bridgeHeight

      const lowerHeight = guardPassage.getGroundHeight(x, z, Number.NaN)
      if (Number.isFinite(lowerHeight)) return lowerHeight

      const tutorialHeight = tutorialPassage.getGroundHeight(x, z, Number.NaN)
      if (Number.isFinite(tutorialHeight)) return tutorialHeight

      return fallback
    },

    handleAction(action) {
      if (bridgePassage.handleAction(action)) return true
      if (guardPassage.handleAction(action)) return true
      if (action === 'distract') return stationDistraction.throw()
      return false
    },

    getGuards: () => stealth.getGuards(),

    // Title screen: the level update does not run, but the sky should still
    // twinkle while the menu camera drifts. The dome recentres itself.
    updateAtmosphere(delta, viewer) {
      sky.update(delta, null)
      // The title camera is not the player, so the pool and the moon shadow
      // have to follow it or the facade stays unlit until the run starts.
      if (viewer) {
        applyForecourtFill(viewer)
        updateStationSunShadow(sunlight, landing.shadowFocus,
          zones.zone?.name === 'platform' ? sky.uniforms.uMoonDirection.value : SUN_DIRECTION)
        pointPool.update(viewer, delta)
      }
      updateVisibleScenery(delta, false)
    },

    get isCinematic() {
      return isBoardingCinematic || enteringStation
    },

    update(delta) {
      updateDoorFade(delta)
      applyForecourtFill(player.mesh.position)
      sky.update(delta, timeSystem)
      updateStationSunShadow(sunlight, isBoardingCinematic ? BOARDING_PLATFORM_ANCHOR : player.mesh.position,
        zones.zone?.name === 'platform' ? sky.uniforms.uMoonDirection.value : SUN_DIRECTION)
      updateVisibleScenery(delta)
      tutorialPassage.update(delta)
      guardPassage.update(delta)
      bridgePassage.update(delta)
      stationDistraction.update(delta)

      if (!passage2CheckpointActive && guardPassage.isInsidePassage()) {
        passage2CheckpointActive = true
        respawn.setCheckpoint(passage2CheckpointPos, Math.PI / 2)
        hud?.showToast?.('Checkpoint reached — lower security passage', 2100)
      }

      if (!passage3CheckpointActive && bridgePassage.hasClearedVent()) {
        passage3CheckpointActive = true
        respawn.setCheckpoint(passage3CheckpointPos, Math.PI)
        hud?.showToast?.('Checkpoint reached — Passageway 3 maintenance level', 2200)
      }

      if (!passage4CheckpointActive && bridgePassage.hasReachedExit()) {
        passage4CheckpointActive = true
        respawn.setCheckpoint(passage4CheckpointPos, Math.PI / 2)
        hud?.showToast?.('Checkpoint reached — Passageway 4 approach', 2200)
      }

      // The old west-wing progression also runs west -> east, so X alone is no
      // longer enough to identify it now that Passageway 2 is directly below.
      // Gate these toasts/checkpoint to the upper station footprint.
      if (!junctionCheckpointActive && !platformCheckpointActive) {
        const inExistingApproach = (
          bridgePassage.isComplete() &&
          player.mesh.position.y > -0.15 &&
          player.mesh.position.x >= APPROACH_START_X - 0.15 &&
          Math.abs(player.mesh.position.z - APPROACH_CENTER_Z) <= 3.0
        )

        if (inExistingApproach) {
          const crossedApproach = APPROACH_GATE_X.filter((g) => player.mesh.position.x > g).length
          if (crossedApproach !== approachZoneIndex) {
            approachZoneIndex = crossedApproach
            if (hud) hud.showToast(approachZoneNames[approachZoneIndex], 2200)
          }
        }

        // Activate the original station checkpoint only after Stage 3 eventually
        // reconnects the player to the upper concourse.
        const checkpointDistance = Math.hypot(
          player.mesh.position.x - JUNCTION_CHECKPOINT.x,
          player.mesh.position.z - JUNCTION_CHECKPOINT.z
        )
        if (bridgePassage.isComplete() && player.mesh.position.y > -1 && checkpointDistance < 1.4) {
          junctionCheckpointActive = true
          respawn.setCheckpoint(junctionCheckpointPos, 0, {
            restore: () => stealth.reset()
          })
          if (hud) hud.showToast('Checkpoint reached — station concourse infiltrated', 2400)
        }
      }
      const p = player.mesh.position
      const onPlatform = p.y > -0.15 && p.x > -4.8 && p.x < 4.5 && p.z > PLATFORM_MIN_Z && p.z < PLATFORM_MAX_Z
      if (onPlatform && !isBoardingCinematic) {
        const crossed = p.z >= 18 ? 2 : p.z >= -6 ? 1 : 0
        if (crossed !== zoneIndex) {
          zoneIndex = crossed
          if (hud) hud.showToast(zoneNames[zoneIndex], 2200)
          hud?.setObjective('Time the patrols and reach the last carriage — Force the door')
        }
        const checkpointIndex = p.z >= PLATFORM_CHECKPOINTS[1].threshold ? 1 : p.z >= PLATFORM_CHECKPOINTS[0].threshold ? 0 : -1
        if (checkpointIndex > platformCheckpointIndex) {
          platformCheckpointIndex = checkpointIndex
          platformCheckpointActive = true
          const checkpoint = PLATFORM_CHECKPOINTS[checkpointIndex]
          respawn.setCheckpoint(checkpoint.position, 0, { restore: resetPlatformGuards })
          hud?.showToast(`Checkpoint ${checkpointIndex + 1} reached — luggage shelter`, 2400)
        }
      }

      if (isBoardingCinematic) {
        cinematicTimer += delta
        if (boardingPhase === 'returning' && (!boardingReturn || boardingReturn.finished || cinematicTimer >= BOARDING_RETURN_TIMEOUT)) {
          player.resetInteractionAnimation?.()
          openDoor()
          beginBoardingPhase('opening')
        } else if (boardingPhase === 'opening' && cinematicTimer >= BOARDING_OPEN_SECONDS && getDoorOpenFraction() >= 0.8) {
          startBoardingWalk()
        } else if (boardingPhase === 'walking') {
          player.updateScriptedWalk(delta)
        } else if (boardingPhase === 'turning' && player.updateScriptedTurn(delta)) {
          boardingView.allowPress = true
          player.playPress()
          closeDoor()
          beginBoardingPhase('closing')
        } else if (boardingPhase === 'closing' && cinematicTimer >= BOARDING_CLOSE_SECONDS) {
          player.mesh.visible = false
          boardingView.allowPress = false
          beginBoardingPhase('pause')
        } else if (boardingPhase === 'pause' && cinematicTimer >= BOARDING_PAUSE_SECONDS) {
          beginBoardingPhase('departing')
        } else if (boardingPhase === 'departing') {
          const t = Math.min(cinematicTimer, BOARDING_DEPART_SECONDS)
          train.position.z = departureStartZ - 0.5 * BOARDING_ACCELERATION * t * t
        }
        pointPool.update(BOARDING_PLATFORM_ANCHOR, delta)
        torchPool.update(BOARDING_PLATFORM_ANCHOR, delta)

        if (boardingPhase === 'departing' && cinematicTimer >= BOARDING_DEPART_SECONDS) {
          if (import.meta.env?.DEV) logBoarding('departure complete; advance/loading may begin', { trainZ: train.position.z })
          isBoardingCinematic = false
          advance()
        }
        return
      }

      updatePlatformSentry(delta)
      stealth.update(delta)
      pointPool.update(player.mesh.position, delta)
      torchPool.update(player.mesh.position, delta)
    },

    dispose() {
      boardingOverlayObserver?.disconnect()
      player.setCinematicView(null)
      player.cancelScriptedWalk()
      player.resetInteractionAnimation?.()
      if (boardingPhase) player.mesh.visible = true
      unregisterRespawnSuspicionReset()
      unregisterStationBlocker()
      unregisterTrainBlocker()
      unregisterApproachTerminal()
      unregisterBoarding()
      unregisterDoor()
      veil.remove()
      tutorialPassage.dispose()
      guardPassage.dispose()
      bridgePassage.dispose()
      stationPickupUnregisters.forEach((unregister) => unregister())
      stationDistraction.dispose()
      stealth.dispose()
      outdoorEnv.dispose()
      surroundings.dispose()
      platformValley.dispose()
      sky.dispose()
      if (skyTarget) {
        if (scene.environment === skyTarget.texture || scene.environment === platformSkyTarget?.texture || outsideHidden) {
          scene.environment = null
          scene.environmentIntensity = 1
        }
        skyTarget.dispose()
        skyTarget = null
      }
      platformSkyTarget?.dispose()
      platformSkyTarget = null
      scene.remove(sky.mesh, outdoorEnv.group, platformBackdrop, station, hallDressing, train, stationSteam, landing.group, ...lights, lightPools, lampPools)
      scene.remove(surroundings.group)
      disposeObject([station, hallDressing, train, stationSteam, landing.group, ...lights, lightPools, lampPools])
    }
  }
}

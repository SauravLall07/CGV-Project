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
import { CENTER_Z, FACADE_X, LANDING_FIGURE, PLAZA } from '../environment/landing/layout.js'
import { createZoneVisibility } from './boarding-zones.js'
import { capRegionLights } from './boarding-lighting.js'
import { resetKitMaterials } from '../environment/level1-kit/kit-materials.js'

const BOARDING_HOLD_SECONDS = 5
const BOARDING_RETURN_TIMEOUT = 2
const BOARDING_OPEN_SECONDS = 0.6
const BOARDING_WALK_SECONDS = 1.6
const BOARDING_TURN_SECONDS = 0.5
const BOARDING_CLOSE_SECONDS = 0.6
const BOARDING_PAUSE_SECONDS = 0.4
const BOARDING_DEPART_SECONDS = 3.5
const BOARDING_ACCELERATION = 6.5
const BOARDING_CAMERA_POSITION = new THREE.Vector3(2.25, 1.8, 39.2)
const BOARDING_CAMERA_DAMPING = 5

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
    connectedToPassage3: true
  })
  const bridgePassage = createBridgePassage({
    scene,
    interaction,
    hud,
    player,
    respawn,
    camera,
    distractionInventory
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

  const { train, stationSteam, boardingDoor, hideBoardingCues, openDoor, closeDoor, update: updateTrain } = createTrain()
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
    // Same clock as the sky, so valley-light twinkle and the lake follow
    // Slow/Freeze/Rewind. The lake also shares the sky colour uniforms.
    skyTime: sky.timeUniform,
    skyUniforms: sky.uniforms,
    nature: getBoardingAssets()
  })

  // Track bed bottom is -1.7: the canonical -2.5 valley ground gains 0.8 m.
  // One-sided terrain begins at world x=13, outside the 4.4 m track bed.
  const platformValley = createMoonlitValley({
    static: true, speed: 0, valleySide: 1, offsetX: 7, offsetY: 0.8,
    chunkCount: 3, centerZ: 0, omitHillSide: true, rails: false, poles: false,
    fogColor: 0x1f3d63, moonDirection: PLATFORM_MOON_DIRECTION
  })
  const platformBackdrop = platformValley.group
  platformBackdrop.visible = false

  // Two low sheets, with procedural alpha and soft edges. No texture, lights,
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
  for (const [x, y, z, width, length] of [[65, 1.0, 0, 100, 260], [145, 2.4, 20, 180, 300]]) {
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
  platformBackdrop.userData.drawCalls = platformValley.stats.drawCalls + 2
  platformBackdrop.userData.triangles = platformValley.stats.triangles + 4
  if (import.meta.env.DEV) console.info('[boarding platform backdrop]', {
    drawCalls: platformBackdrop.userData.drawCalls,
    triangles: platformBackdrop.userData.triangles,
    terrainX: [13, 907], terrainZ: [-160, 320], chunks: 3, mistDrawCalls: 2
  })

  scene.add(sky.mesh, outdoorEnv.group, platformBackdrop, station, hallDressing, train, stationSteam, landing.group, ...lights)

  // Capture each look once. Retain the original environment map everywhere
  // outside the platform; no per-frame capture or forecourt reflection change.
  let skyTarget = null
  let platformSkyTarget = null
  if (renderer) {
    skyTarget = captureSkyEnvironment(renderer, sky.mesh)
    sky.setPreset('boarding-platform')
    platformSkyTarget = captureSkyEnvironment(renderer, sky.mesh)
    sky.setPreset('boarding')
    scene.environment = skyTarget.texture
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

  // Losing one of the first two lives keeps the current level instance alive,
  // but suspicion should start fresh at the checkpoint. The third failure
  // rebuilds the whole level anyway, so its new stealth system already starts
  // at zero.
  const unregisterRespawnSuspicionReset = respawn?.onFail?.((_reason, state) => {
    if (!state?.gameOver) stealth.clearSuspicion()
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

  function addStationDistractorPickup(position, name) {
    const pickup = new THREE.Group()
    pickup.name = name
    pickup.position.copy(position)

    const body = new THREE.Mesh(stationPickupGeometry, stationPickupMaterial)
    body.position.y = 0.16
    pickup.add(body)
    station.add(pickup)

    let collected = false
    const unregister = interaction.register(pickup, {
      prompt: 'Pick up loose metal distractor',
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

  // Edge patrols expose the old wall/track shortcuts; middle islands are shelter.
  const platformPatrols = [
    { id: 'platform-rear', x: 3.6, start: -22, end: -2, speed: 1.25, waitTime: 3, initialWaypoint: 0, delay: 0 },
    { id: 'platform-middle', x: -3.4, start: 6, end: 26, speed: 1.35, waitTime: 3.5, initialWaypoint: 1, delay: 0 },
    { id: 'platform-front', x: 3.6, start: 24, end: 37, speed: 1.2, waitTime: 4, initialWaypoint: 0, delay: 3 }
  ]
  const platformGuards = platformPatrols.map(route => {
    const guard = stealth.addGuard({
      waypoints: [new THREE.Vector3(route.x, 0, route.start), new THREE.Vector3(route.x, 0, route.end)],
      speed: route.speed, waitTime: route.waitTime, initialWaypoint: route.initialWaypoint
    })
    guard.group.userData.patrolId = route.id
    guard.facing = route.initialWaypoint === 0 ? 0 : Math.PI
    guard.scanBase = guard.facing
    guard.group.rotation.y = guard.facing
    guard.waitTimer = route.delay
    return guard
  })

  if (import.meta.env.DEV) {
    // Runs once during construction, before visibility regions hide anything.
    // These mirror stealth.js's REAL detection constants, not the narrower cone mesh.
    const range = 7.5, fovDot = 0.52, scanAmplitude = Math.PI / 3.4
    const ray = new THREE.Raycaster(), eye = new THREE.Vector3(), target = new THREE.Vector3()
    const direction = new THREE.Vector3(), flat = new THREE.Vector3()
    station.updateMatrixWorld(true)
    const table = PLATFORM_COVER.map(pocket => {
      let tested = 0, exposed = null
      // Probe centre and all corners of the player's radius bounding square.
      for (const height of pocket.middle ? [0.72] : [0.72, 1.2])
      for (const [dx, dz] of [[0, 0], [-0.18, -0.18], [-0.18, 0.18], [0.18, -0.18], [0.18, 0.18]]) {
      target.set(pocket.pocketX + dx, height, pocket.z + dz)
      // Include every station guard whose route is at platform height. This also
      // checks the hall junction patrol, which can see through the entrance.
      for (const guard of stealth.getGuards()) {
        if (guard.waypoints.some(p => Math.abs(p.y) > 0.01)) continue
        for (let segment = 0; segment < guard.waypoints.length; segment++) {
          const a = guard.waypoints[segment], b = guard.waypoints[(segment + 1) % guard.waypoints.length]
          const length = a.distanceTo(b), steps = Math.max(1, Math.ceil(length / 0.25))
          const heading = Math.atan2(b.x - a.x, b.z - a.z)
          for (let step = 0; step <= steps; step++) {
            eye.lerpVectors(a, b, step / steps); eye.y += 1.55
            direction.subVectors(target, eye)
            const distance = direction.length()
            if (distance > range || distance < 0.1) continue
            flat.set(direction.x, 0, direction.z).normalize()
            // Both travel directions everywhere; dense endpoint scan samples and
            // the exact angle toward the pocket if it lies inside a scan sweep.
            const angles = [heading, heading + Math.PI]
            if (step === 0 || step === steps) for (const base of [heading, heading + Math.PI]) {
              for (let i = 0; i <= 40; i++) angles.push(base - scanAmplitude + 2 * scanAmplitude * i / 40)
              const toward = Math.atan2(flat.x, flat.z)
              const difference = Math.atan2(Math.sin(toward - base), Math.cos(toward - base))
              if (Math.abs(difference) <= scanAmplitude) angles.push(toward)
            }
            for (const angle of angles) {
              if (flat.x * Math.sin(angle) + flat.z * Math.cos(angle) < fovDot) continue
              tested++
              ray.set(eye, direction.clone().normalize()); ray.far = distance
              const blocked = ray.intersectObjects(collidables, false).some(hit => hit.distance < distance - 0.3)
              if (!blocked && !exposed) exposed = `${guard.group.userData.patrolId || 'hall-guard'} at (${eye.x.toFixed(2)},${eye.y.toFixed(2)},${eye.z.toFixed(2)}), yaw ${angle.toFixed(3)}`
            }
          }
        }
      }
      }
      return { pocket: pocket.id, middle: pocket.middle, x: pocket.pocketX, z: pocket.z,
        result: exposed ? 'EXPOSED' : 'safe', samplesInFov: tested, exposedFrom: exposed || '—' }
    })
    console.table(table)
    const islandTable = table.filter(row => row.middle)
    console.info(`cover self-test: ${islandTable.filter(row => row.result === 'safe').length}/${islandTable.length} islands safe`)
    console.assert(islandTable.every(row => row.result === 'safe'), 'A middle island exposes a crouched player')
    console.info('Checkpoint shelter standing AND crouched probes:', table.find(row => !row.middle))
    // This is a lower bound independent of FOV/scan phase: use the entire 7.5 m
    // range projected along Z, even ignoring horizontal/vertical separation.
    const doorRoute = platformPatrols[2]
    const safeWindow = 2 * (43.2 - range - doorRoute.start) / doorRoute.speed + doorRoute.waitTime
    const patrolCycle = 2 * (doorRoute.end - doorRoute.start) / doorRoute.speed + 2 * doorRoute.waitTime
    console.info('Boarding door guaranteed unseen window (standing AND crouched):', {
      seconds: safeWindow, cycleExcludingTurns: patrolCycle, required: 7,
      assumptions: 'routine patrol; 7.5 m range, eye y=1.55; FOV/scanning can only extend this range-only window'
    })
    console.assert(safeWindow >= 7, 'Boarding window is shorter than seven seconds')
    console.info('Cover test uses y=1.55 / target=0.72, range=7.5, detection dot>=0.52; animated torch origin still needs playtesting.')

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
    const entryTable = PLATFORM_COVER.map(pocket => {
      const endClearance = sign => {
        const entryZ = pocket.z + sign * (pocket.length / 2 + 0.75)
        const lane = { x: 0, z: entryZ }, bend = { x: pocket.pocketX, z: entryZ }
        const centre = { x: pocket.pocketX, z: pocket.z }
        return Math.min(...movementBoxes.map(box => Math.min(
          segmentDistance(lane, bend, box), segmentDistance(bend, centre, box)
        ))) - playerRadius
      }
      const rear = endClearance(-1), front = endClearance(1)
      const entries = [rear >= spareClearance - 1e-8 ? 'rear (-Z)' : '',
        front >= spareClearance - 1e-8 ? 'front (+Z)' : ''].filter(Boolean).join(', ')
      return { pocket: pocket.id, entries: entries || 'BLOCKED',
        rearSpare: rear.toFixed(3), frontSpare: front.toFixed(3), playerDiameter: 2 * playerRadius,
        result: entries ? 'OK (>=0.15 m per side)' : 'BLOCKED' }
    })
    console.table(entryTable)
    console.assert(entryTable.every(row => row.entries !== 'BLOCKED'), 'A cover pocket has no entry with 0.15 m spare clearance')
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
      return pocket => Boolean(reached[indexAt({ x: pocket.pocketX, z: pocket.z })])
    }
    const reachable = flood(playerRadius)
    const reachableWithSpare = flood(probeRadius)
    const reachTable = PLATFORM_COVER.map(pocket => ({ pocket: pocket.id,
      middle: pocket.middle,
      result: reachable(pocket) ? 'reachable' : 'BLOCKED',
      with015mSpare: reachableWithSpare(pocket) ? 'reachable' : 'BLOCKED' }))
    console.table(reachTable)
    const islandReachTable = reachTable.filter(row => row.middle)
    console.info(`cover reachability: ${islandReachTable.filter(row => row.result === 'reachable').length}/${islandReachTable.length} islands reachable`)
    console.info(`cover reachability with 0.15 m spare: ${islandReachTable.filter(row => row.with015mSpare === 'reachable').length}/${islandReachTable.length} islands reachable`)
    console.assert(reachTable.every(row => row.with015mSpare === 'reachable'), 'A cover pocket is disconnected from the platform start')
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
  const departureStartZ = train.position.z
  const boardingTarget = new THREE.Vector3()
  const boardingView = { mode: 'fixed', position: BOARDING_CAMERA_POSITION,
    target: new THREE.Vector3(5.5, 1.4, 43.2), damping: BOARDING_CAMERA_DAMPING, allowPress: false }

  function beginBoardingPhase(phase) {
    boardingPhase = phase
    cinematicTimer = 0
  }

  function startBoardingWalk() {
    beginBoardingPhase('walking')
    player.setCinematicView(boardingView)
    boardingDoor.getWorldPosition(boardingTarget)
    const z = boardingTarget.z
    player.startScriptedWalk([
      player.mesh.position.clone(),
      new THREE.Vector3(4.55, 0.05, z),
      new THREE.Vector3(5.05, 0.24, z),
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
      hideBoardingCues()
      beginBoardingPhase('returning')
      boardingReturn = player.returnInteractionPull?.(true)
      camera?.setMode?.('third', { announce: false })
      player.setCinematicView({ mode: 'follow' })
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
    'Guards patrol the edges — move through the middle, from cover to cover',
    'Keep low between the paired luggage stacks; time each open crossing',
    'The last carriage door is ahead at the far end — hold to force it open'
  ]
  let zoneIndex = -1
  let platformCheckpointActive = false

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
  zones.addRegion('platform-backdrop', platformBackdrop)

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
  door.position.set(FACADE_X - 3.05, 1.15, CENTER_Z)
  landing.group.add(door)

  let enteredStation = false
  let enteringStation = false
  let enterFade = null
  const FADE_SECONDS = 0.6

  function arriveInside() {
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

  return {
    objective: 'Enter the station',
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
      ) return PLAZA.y

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
      updateStationSunShadow(sunlight, player.mesh.position,
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
        const crossed = p.z > 34 ? 2 : p.z > 8 ? 1 : 0
        if (crossed !== zoneIndex) {
          zoneIndex = crossed
          if (hud) hud.showToast(zoneNames[zoneIndex], 2200)
          hud?.setObjective('Use the middle cover islands to reach the last carriage — Force the door')
        }
        if (!platformCheckpointActive && p.z >= 6) {
          platformCheckpointActive = true
          // Protected pocket centre, not the exposed patrol lane. No passage
          // prerequisite: Shift+6 is also able to exercise this checkpoint.
          respawn.setCheckpoint(new THREE.Vector3(4.1, 0, 6), 0, {
            restore: () => {
              stealth.reset()
              platformGuards.forEach((guard, i) => {
                const route = platformPatrols[i]
                guard.group.position.copy(guard.waypoints[route.initialWaypoint])
                guard.targetIdx = 1 - route.initialWaypoint
                guard.facing = route.initialWaypoint === 0 ? 0 : Math.PI
                guard.scanBase = guard.facing
                guard.group.rotation.y = guard.facing
                guard.waitTimer = route.delay
              })
            }
          })
          hud?.showToast('Checkpoint reached — platform luggage shelter', 2400)
        }
      }

      if (isBoardingCinematic) {
        cinematicTimer += delta
        if (boardingPhase === 'returning' && (!boardingReturn || boardingReturn.finished || cinematicTimer >= BOARDING_RETURN_TIMEOUT)) {
          player.resetInteractionAnimation?.()
          openDoor()
          beginBoardingPhase('opening')
        } else if (boardingPhase === 'opening' && cinematicTimer >= BOARDING_OPEN_SECONDS) {
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
          boardingView.target.set(6, 1.4, 44.3 + train.position.z - departureStartZ)
        }
        pointPool.update(player.mesh.position, delta)
        torchPool.update(player.mesh.position, delta)

        if (boardingPhase === 'departing' && cinematicTimer >= BOARDING_DEPART_SECONDS) {
          isBoardingCinematic = false
          advance()
        }
        return
      }

      stealth.update(delta)
      pointPool.update(player.mesh.position, delta)
      torchPool.update(player.mesh.position, delta)
    },

    dispose() {
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
      disposeObject([station, hallDressing, train, stationSteam, landing.group, ...lights, lightPools, lampPools])
    }
  }
}

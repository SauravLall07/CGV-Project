import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

// Mixamo detective: Idle.fbx is the skinned mesh; the other FBXs are
// animation-only clips retargeted onto that skeleton by track/bone name.

const MIXAMO_CM_SCALE = 0.01
const CROSSFADE = 0.3
const PRESS_SPEED = 1.0
const PRESS_FADE_IN = 0.08
const PRESS_FADE_OUT = 0.2
const PICKUP_SPEED = 1.3
const PICKUP_FADE_OUT = 0.25
const PULL_RETURN_SPEED = 1.5
// Pushing the trolley: forward lean of the upper spine (rad) standing and
// while it rolls, and how far out to the side the elbows bend.
const PUSH_LEAN = 0.12
const PUSH_LEAN_MOVING = 0.24
const PUSH_ELBOW_OUT = 0.6
// The crouch transitions last ~0.3s once sped up, so a full CROSSFADE would
// hide them; they fade in and out faster.
const CROUCH_FADE = 0.12
// player.js jump: v0=6.4, g=18 → hang time 2*v0/g. Speed the Mixamo clip
// (typically ~1.9s) so takeoff-to-land lines up with that airtime.
const JUMP_AIR_TIME = (2 * 6.4) / 18

const FILES = {
  idle: new URL('../assets/models/detective/Idle.fbx', import.meta.url),
  run: new URL('../assets/models/detective/Running.fbx', import.meta.url),
  walk: new URL('../assets/models/detective/Walking.fbx', import.meta.url),
  press: new URL('../assets/models/detective/Button Pushing.fbx', import.meta.url),
  pickup: new URL('../assets/models/detective/Pick Up.fbx', import.meta.url),
  pull: new URL('../assets/models/detective/Pull Pilot From Seat.fbx', import.meta.url),
  jumpIdle: new URL('../assets/models/detective/Jump.fbx', import.meta.url),
  jumpRun: new URL('../assets/models/detective/Standing Jump Running.fbx', import.meta.url),
  cast: new URL('../assets/models/detective/Standing 1H Cast Spell 01.fbx', import.meta.url),
  standToCrouch: new URL('../assets/models/detective/Standing To Crouch.fbx', import.meta.url),
  crouchIdle: new URL('../assets/models/detective/Crouch Idle 02 Looking Around.fbx', import.meta.url),
  crouchWalk: new URL('../assets/models/detective/Crouch Walk Forward.fbx', import.meta.url),
  crouchToStand: new URL('../assets/models/detective/Crouch To Standing.fbx', import.meta.url),
  throw: new URL('../assets/models/detective/Throw.fbx', import.meta.url),
  salute: new URL('../assets/models/detective/Salute.fbx', import.meta.url)
}

const CROUCH_TRANSITIONS = new Set(['standToCrouch', 'crouchToStand'])
const ONE_SHOTS = new Set(['cast', 'throw', 'salute'])
// Throw.fbx's forward hand swing, sampled at 30 fps (frame 24).
const THROW_RELEASE_TIME = 24 / 30

function firstClip(fbx, name) {
  const clip = fbx?.animations?.[0]?.clone()
  if (!clip) return null
  clip.name = name
  return clip
}

// Mixamo locomotion often keyframes mixamorig:Hips.position in XZ, which adds
// travel on top of player.js. Zero X/Z (keep Y bob); player velocity stays
// the only world-space motion.
const HIPS_POSITION = /(?:^|mixamorig[:.]?)Hips\.position$/
const HIPS_POSITION_AXIS = /(?:^|mixamorig[:.]?)Hips\.position\[([xyz])\]$/

function stripRootMotion(clip) {
  const notes = []
  if (!clip?.tracks) return notes

  clip.tracks = clip.tracks.filter((track) => {
    const axis = track.name.match(HIPS_POSITION_AXIS)
    if (axis) {
      if (axis[1] === 'y') {
        notes.push(`kept ${track.name}`)
        return true
      }
      notes.push(`removed ${track.name}`)
      return false
    }

    if (HIPS_POSITION.test(track.name)) {
      const size = typeof track.getValueSize === 'function' ? track.getValueSize() : 3
      if (size === 3) {
        const keys = track.values.length / 3
        for (let i = 0; i < track.values.length; i += 3) {
          track.values[i] = 0
          track.values[i + 2] = 0
        }
        notes.push(`zeroed X/Z on ${track.name} (${keys} keys, Y kept)`)
        return true
      }
      notes.push(`removed ${track.name}`)
      return false
    }

    return true
  })

  return notes
}

// Horizontal Hips travel from the first key to the last, in metres. Read
// before stripRootMotion zeroes it; `scale` turns Mixamo cm into metres.
function rootTravel(clip, scale) {
  const track = clip?.tracks.find((t) => HIPS_POSITION.test(t.name))
  if (!track || track.getValueSize() !== 3 || track.times.length < 2) return null
  const last = track.values.length - 3
  const span = track.times[track.times.length - 1] - track.times[0]
  if (!(span > 0)) return null
  const distance = Math.hypot(
    track.values[last] - track.values[0],
    track.values[last + 2] - track.values[2]
  ) * scale
  return { distance, span, speed: distance / span }
}

function jumpTakeoffTime(clip) {
  const track = clip.tracks.find((t) => HIPS_POSITION.test(t.name))
  if (!track || track.getValueSize() !== 3 || track.times.length < 3) return 0

  const standY = track.values[1]
  const yAt = (i) => track.values[i * 3 + 1]

  // Use the FIRST crouch dip (wind-up), not the global min — Mixamo standing
  // jumps often land in a deeper squat than they take off from, so the global
  // min is the last frame and a search after it never finds liftoff.
  let minIndex = 0
  let minY = standY
  let dropping = false
  for (let i = 1; i < track.times.length; i++) {
    const y = yAt(i)
    const prev = yAt(i - 1)
    if (y < prev - 0.05) {
      dropping = true
      if (y < minY) {
        minY = y
        minIndex = i
      }
    } else if (dropping && y > prev + 0.05 && standY - minY > 2) {
      break
    }
  }

  if (standY - minY <= 2) return 0

  const threshold = standY - Math.max(1, (standY - minY) * 0.05)
  for (let i = minIndex + 1; i < track.times.length; i++) {
    if (yAt(i) >= threshold) return track.times[i]
  }
  return 0
}

function jumpTouchdownTime(clip, takeoff) {
  const track = clip.tracks.find((t) => HIPS_POSITION.test(t.name))
  if (!track || track.getValueSize() !== 3) return clip.duration

  const standY = track.values[1]
  const yAt = (i) => track.values[i * 3 + 1]
  let start = 0
  for (let i = 0; i < track.times.length; i++) {
    if (track.times[i] >= takeoff) {
      start = i
      break
    }
  }

  let apex = start
  let maxY = yAt(start)
  for (let i = start; i < track.times.length; i++) {
    if (yAt(i) > maxY) {
      maxY = yAt(i)
      apex = i
    }
  }

  for (let i = apex + 1; i < track.times.length; i++) {
    if (yAt(i) <= standY) return track.times[i]
  }
  return clip.duration
}

function trimJumpAnticipation(clip) {
  const start = jumpTakeoffTime(clip)
  if (start <= 0.05) return clip
  const fps = 30
  const trimmed = THREE.AnimationUtils.subclip(
    clip,
    clip.name,
    start * fps,
    clip.duration * fps + 1,
    fps
  )
  trimmed.name = clip.name
  if (import.meta.env?.DEV) console.log(
    `[detective] ${clip.name} skipped ${start.toFixed(3)}s crouch wind-up ` +
    `(${clip.duration.toFixed(3)}s → ${trimmed.duration.toFixed(3)}s)`
  )
  return trimmed
}

function loadOptionalFbx(assets, url) {
  return assets.loadFbx(url).catch((error) => {
    console.warn(`[detective] failed to load ${url}`, error)
    return null
  })
}

// FBXLoader expands Mixamo meshes into unique-per-face vertices, so imported
// normals shade flat. Do NOT mergeVertices on a SkinnedMesh: welding rebuilds
// the BufferGeometry and the mesh stays in bind pose (T-pose) even while the
// mixer animates bones. Average coincident normals in place instead.
function smoothGeometry(mesh) {
  const geometry = mesh.geometry
  const position = geometry?.getAttribute('position')
  if (!position) return

  geometry.deleteAttribute('normal')
  geometry.computeVertexNormals()

  const normal = geometry.getAttribute('normal')
  if (!normal || position.count === 0) return

  const sums = new Map()
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`
    let acc = sums.get(key)
    if (!acc) {
      acc = new THREE.Vector3()
      sums.set(key, acc)
    }
    acc.x += normal.getX(i)
    acc.y += normal.getY(i)
    acc.z += normal.getZ(i)
  }
  for (const acc of sums.values()) acc.normalize()
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`
    const n = sums.get(key)
    normal.setXYZ(i, n.x, n.y, n.z)
  }
  normal.needsUpdate = true
}

// The rest of the game is ACES + MeshStandardMaterial. FBXLoader emits Phong
// or Lambert (never Standard), which reads as faceted under that lighting.
function toStandardMaterial(material) {
  if (!material) return material
  if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
    material.flatShading = false
    material.needsUpdate = true
    return material
  }

  const standard = new THREE.MeshStandardMaterial()
  standard.name = material.name
  if (material.color) standard.color.copy(material.color)
  if (material.emissive) standard.emissive.copy(material.emissive)
  standard.map = material.map ?? null
  standard.normalMap = material.normalMap ?? null
  standard.emissiveMap = material.emissiveMap ?? null
  standard.alphaMap = material.alphaMap ?? null
  standard.aoMap = material.aoMap ?? null
  standard.transparent = Boolean(material.transparent)
  standard.opacity = material.opacity
  standard.side = material.side
  standard.alphaTest = material.alphaTest
  standard.vertexColors = material.vertexColors
  standard.flatShading = false
  standard.roughness = material.isMeshPhongMaterial ? 0.55 : 0.75
  standard.metalness = 0.04
  standard.needsUpdate = true
  return standard
}

function prepareModel(model) {
  const wrapper = new THREE.Group()
  wrapper.name = 'detective'
  wrapper.add(model)

  model.updateMatrixWorld(true)
  const raw = new THREE.Box3().setFromObject(wrapper)
  const rawSize = raw.getSize(new THREE.Vector3())
  // Mixamo is usually centimetres (~180). Already-metre files stay at 1.
  const scale = rawSize.y > 10 ? MIXAMO_CM_SCALE : 1
  model.scale.setScalar(scale)
  wrapper.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(wrapper)
  if (Number.isFinite(box.min.y)) wrapper.position.y -= box.min.y

  model.traverse((node) => {
    if (!node.isMesh) return
    smoothGeometry(node)

    const materials = Array.isArray(node.material) ? node.material : [node.material]
    const converted = materials.map(toStandardMaterial)
    node.material = Array.isArray(node.material) ? converted : converted[0]

    node.castShadow = true
    node.receiveShadow = true
    // Skinned bounding spheres from Mixamo are often tight/wrong and pop
    // the mesh out of the frustum at screen edges.
    if (node.isSkinnedMesh) node.frustumCulled = false
  })

  const worldSize = box.getSize(new THREE.Vector3())
  return {
    wrapper,
    scale,
    rawHeight: rawSize.y,
    worldHeight: worldSize.y,
    rotation: model.rotation.clone()
  }
}

const sources = new WeakMap()

function loadSource(assets) {
  if (!sources.has(assets)) {
    const ready = Promise.all(Object.entries(FILES).map(async ([name, url]) =>
      [name, name === 'idle' ? await assets.loadFbx(url.href) : await loadOptionalFbx(assets, url.href)]
    )).then(entries => {
      const files = Object.fromEntries(entries)
      return { files, info: prepareModel(files.idle) }
    }).catch(error => {
      sources.delete(assets)
      throw error
    })
    sources.set(assets, ready)
  }
  return sources.get(assets)
}

// `crouchSpeed` is the player's crouched ground speed (m/s) and
// `crouchSettleTime` how long player.js takes to settle into or out of the
// crouch (s). Both come from player.js so the clips follow its tuning.
export async function loadDetectiveVisual(assets, { crouchSpeed = 0, crouchSettleTime = 0 } = {}) {
  const source = await loadSource(assets)
  const { run: runFbx, jumpIdle: jumpIdleFbx, jumpRun: jumpRunFbx, cast: castFbx,
    standToCrouch: standToCrouchFbx, crouchIdle: crouchIdleFbx, crouchWalk: crouchWalkFbx,
    crouchToStand: crouchToStandFbx, throw: throwFbx, walk: walkFbx, press: pressFbx,
    pull: pullFbx, pickup: pickupFbx, salute: saluteFbx } = source.files
  const wrapper = cloneSkinned(source.info.wrapper)
  wrapper.traverse(node => {
    if (!node.isMesh) return
    // Each visual owns its geometry/materials so ghost teardown cannot dispose
    // the player's resources. Textures are read-only shared source assets.
    node.geometry = node.geometry.clone()
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    const cloned = materials.map(material => {
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.userData.sharedTexture = true
      }
      return material.clone()
    })
    node.material = Array.isArray(node.material) ? cloned : cloned[0]
  })
  const info = { ...source.info, wrapper }
  const idleFbx = wrapper.children[0]
  if (import.meta.env?.DEV) console.log(
    `[detective] scale=${info.scale} rawHeight=${info.rawHeight.toFixed(1)} ` +
    `worldHeight=${info.worldHeight.toFixed(2)}m feetY=${info.wrapper.position.y.toFixed(3)} ` +
    `rootRot=(${info.rotation.x.toFixed(3)}, ${info.rotation.y.toFixed(3)}, ${info.rotation.z.toFixed(3)})`
  )

  const mixer = new THREE.AnimationMixer(idleFbx)

  const clips = {
    idle: firstClip(idleFbx, 'idle'),
    run: firstClip(runFbx, 'run'),
    walk: firstClip(walkFbx, 'walk'),
    pull: firstClip(pullFbx, 'pull'),
    pickup: firstClip(pickupFbx, 'pickup'),
    jumpIdle: firstClip(jumpIdleFbx, 'jumpIdle'),
    jumpRun: firstClip(jumpRunFbx, 'jumpRun'),
    cast: firstClip(castFbx, 'cast'),
    standToCrouch: firstClip(standToCrouchFbx, 'standToCrouch'),
    crouchIdle: firstClip(crouchIdleFbx, 'crouchIdle'),
    crouchWalk: firstClip(crouchWalkFbx, 'crouchWalk'),
    crouchToStand: firstClip(crouchToStandFbx, 'crouchToStand'),
    throw: firstClip(throwFbx, 'throw'),
    salute: firstClip(saluteFbx, 'salute')
  }

  const crouchWalkTravel = rootTravel(clips.crouchWalk, info.scale)
  const walkTravel = rootTravel(clips.walk, info.scale)
  const pointClip = firstClip(pressFbx, 'press')
  stripRootMotion(pointClip)
  if (import.meta.env?.DEV && pointClip) console.info(`[detective] press duration=${pointClip.duration.toFixed(3)}s`)

  const rootMotionClips = [
    'run', 'walk', 'pull', 'pickup', 'jumpIdle', 'jumpRun',
    'standToCrouch', 'crouchIdle', 'crouchWalk', 'crouchToStand', 'throw'
  ]
  for (const name of rootMotionClips) {
    const clip = clips[name]
    if (!clip) continue
    const notes = stripRootMotion(clip)
    const extras = clip.tracks
      .filter((track) => track.name.endsWith('.position') && !HIPS_POSITION.test(track.name))
      .map((track) => track.name)
    if (import.meta.env?.DEV) console.log(
      `[detective] ${name} root motion: ` +
      (notes.length ? notes.join('; ') : 'no Hips.position tracks') +
      (extras.length ? ` | other position tracks left as-is: ${extras.join(', ')}` : '')
    )
  }

  let jumpIdleAirborneEnd = 0
  let jumpIdleAirborneScale = 1

  if (clips.jumpIdle) {
    const takeoff = jumpTakeoffTime(clips.jumpIdle)
    const touchdown = jumpTouchdownTime(clips.jumpIdle, takeoff)
    jumpIdleAirborneEnd = Math.max(0.05, (takeoff > 0 ? touchdown - takeoff : touchdown))
    clips.jumpIdle = trimJumpAnticipation(clips.jumpIdle)
    if (import.meta.env?.DEV) console.log(
      `[detective] jumpIdle phases airborne=${jumpIdleAirborneEnd.toFixed(3)}s ` +
      `landing=${Math.max(0, clips.jumpIdle.duration - jumpIdleAirborneEnd).toFixed(3)}s (plays at 1.0x)`
    )
  }
  if (clips.jumpRun) clips.jumpRun = trimJumpAnticipation(clips.jumpRun)

  const looping = new Set(['idle', 'run', 'walk', 'crouchIdle', 'crouchWalk'])
  const actions = {}
  for (const [name, clip] of Object.entries(clips)) {
    if (!clip) {
      console.warn(`[detective] clip ${name}: MISSING`)
      continue
    }
    if (import.meta.env?.DEV) console.log(
      `[detective] clip ${name}: duration=${clip.duration.toFixed(3)}s tracks=${clip.tracks.length}`
    )
    const action = mixer.clipAction(clip)
    action.enabled = false
    action.setEffectiveWeight(1)
    if (looping.has(name)) {
      action.setLoop(THREE.LoopRepeat)
    } else {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    }
    actions[name] = action
  }

  let lastMeasuredAirtime = JUMP_AIR_TIME

  function applyJumpTimeScale(airtime) {
    const safe = THREE.MathUtils.clamp(airtime, 0.25, 2)
    if (actions.jumpRun && clips.jumpRun?.duration) {
      actions.jumpRun.timeScale = clips.jumpRun.duration / safe
    }
    if (jumpIdleAirborneEnd > 0) {
      jumpIdleAirborneScale = jumpIdleAirborneEnd / safe
    }
  }

  function syncJumpIdleTimeScale() {
    const action = actions.jumpIdle
    if (!action || currentName !== 'jumpIdle') return
    action.timeScale = action.time >= jumpIdleAirborneEnd ? 1 : jumpIdleAirborneScale
  }

  applyJumpTimeScale(JUMP_AIR_TIME)
  if (actions.jumpIdle) {
    if (import.meta.env?.DEV) console.log(
      `[detective] jumpIdle airborne timeScale=${jumpIdleAirborneScale.toFixed(2)} ` +
      `(${jumpIdleAirborneEnd.toFixed(2)}s clip → ${JUMP_AIR_TIME.toFixed(2)}s air) landing=1.0x`
    )
  }
  if (actions.jumpRun && clips.jumpRun) {
    if (import.meta.env?.DEV) console.log(
      `[detective] jumpRun LoopOnce timeScale=${actions.jumpRun.timeScale.toFixed(2)} ` +
      `(clip ${clips.jumpRun.duration.toFixed(2)}s → assumed airtime ${JUMP_AIR_TIME.toFixed(2)}s)`
    )
  }

  // Crouch walk: play the stride at the speed the player actually covers
  // ground, so the feet do not slide.
  if (actions.crouchWalk) {
    if (crouchWalkTravel && crouchWalkTravel.speed > 0 && crouchSpeed > 0) {
      actions.crouchWalk.timeScale = crouchSpeed / crouchWalkTravel.speed
      if (import.meta.env?.DEV) console.log(
        `[detective] crouchWalk timeScale=${actions.crouchWalk.timeScale.toFixed(3)} ` +
        `(player ${crouchSpeed.toFixed(3)} m/s ÷ clip ${crouchWalkTravel.speed.toFixed(3)} m/s = ` +
        `${crouchWalkTravel.distance.toFixed(3)}m over ${crouchWalkTravel.span.toFixed(3)}s)`
      )
    } else {
      console.warn(
        `[detective] crouchWalk timeScale left at 1: ` +
        (crouchWalkTravel ? `crouchSpeed=${crouchSpeed}` : 'no Hips travel found in the clip')
      )
    }
  }

  // Stand ↔ crouch: finish the clip in the time player.js takes to settle.
  for (const name of CROUCH_TRANSITIONS) {
    const action = actions[name]
    const clip = clips[name]
    if (!action || !clip?.duration) continue
    if (crouchSettleTime > 0) {
      action.timeScale = clip.duration / crouchSettleTime
      if (import.meta.env?.DEV) console.log(
        `[detective] ${name} timeScale=${action.timeScale.toFixed(2)} ` +
        `(clip ${clip.duration.toFixed(3)}s → crouch settle ${crouchSettleTime.toFixed(3)}s)`
      )
    } else {
      console.warn(`[detective] ${name} timeScale left at 1: crouchSettleTime=${crouchSettleTime}`)
    }
  }

  let current = null
  let currentName = null
  let scriptedWalking = false
  let casting = false
  let throwing = null
  const throwHand = idleFbx.getObjectByName('mixamorigRightHand')
  let wanted = 'idle'
  let airborneJump = null
  let wasCrouching = false
  // 'standToCrouch' or 'crouchToStand' while one is playing.
  let crouchTransition = null
  // Whether the player was moving when that transition started.
  let transitionMoving = false
  // Latest input from setLocomotion. The loop after a transition is picked
  // from these when it ends, not from the input when it began.
  let lastMoving = false
  let lastCrouching = false
  // Last logged sub-state: 'standing', a transition, 'crouchIdle' or 'crouchWalk'.
  let crouchState = 'standing'

  // A detached bone-only rig samples the absolute button-press pose. It never
  // competes with locomotion in PropertyMixer's normalized weighted average.
  const pointRig = new THREE.Group()
  idleFbx.traverse(node => {
    if (node.isBone && !node.parent?.isBone) pointRig.add(node.clone(true))
  })
  const upperBody = /(?:Spine\d*|Neck\d*|Head(?:Top_End)?|(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand.*))$/
  const pointBones = []
  if (pointClip) {
    pointClip.tracks = pointClip.tracks.filter(track => {
      const name = THREE.PropertyBinding.parseTrackName(track.name).nodeName
      return upperBody.test(name) && Boolean(pointRig.getObjectByName(name))
    })
    const names = new Set(pointClip.tracks.map(track => THREE.PropertyBinding.parseTrackName(track.name).nodeName))
    for (const name of names) {
      const bone = idleFbx.getObjectByName(name)
      if (bone) pointBones.push({ bone, sample: pointRig.getObjectByName(name),
        position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3() })
    }
  }
  const pointMixer = new THREE.AnimationMixer(pointRig)
  const pointAction = pointClip?.tracks.length ? pointMixer.clipAction(pointClip) : null
  if (pointAction) {
    pointAction.setLoop(THREE.LoopOnce, 1)
    pointAction.clampWhenFinished = true
  }
  let pointElapsed = null
  let pointApplied = false

  // Pushing the service trolley. There is no Mixamo push clip, so the legs
  // walk (slowed to pushing pace) and the upper body is posed on top: a lean
  // into the bar, and each arm solved with two-bone IK so the hands land on
  // the grip points the player passes in (player-local, +X = left).
  const pushArms = ['Left', 'Right'].map((side) => ({
    side,
    arm: idleFbx.getObjectByName(`mixamorig${side}Arm`),
    fore: idleFbx.getObjectByName(`mixamorig${side}ForeArm`),
    hand: idleFbx.getObjectByName(`mixamorig${side}Hand`),
    grip: new THREE.Vector3()
  }))
  const canPush = pushArms.every((limb) => limb.arm && limb.fore && limb.hand)
  const pushSpine = idleFbx.getObjectByName('mixamorigSpine1') ?? idleFbx.getObjectByName('mixamorigSpine')
  const pushBones = [pushSpine, ...pushArms.flatMap((limb) => [limb.arm, limb.fore])].filter(Boolean)
  const pushBase = pushBones.map(() => new THREE.Quaternion())
  let pushInput = null
  let pushWeight = 0
  let pushApplied = false
  const ik = {
    shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3(),
    target: new THREE.Vector3(), dir: new THREE.Vector3(), bend: new THREE.Vector3(),
    from: new THREE.Vector3(), to: new THREE.Vector3(), axis: new THREE.Vector3(),
    world: new THREE.Quaternion(), parent: new THREE.Quaternion(), turn: new THREE.Quaternion(),
    solved: new THREE.Quaternion()
  }

  // Applies a world-space rotation to a bone, keeping its parent where it is.
  function turnBone(bone, rotation) {
    bone.getWorldQuaternion(ik.world)
    bone.parent.getWorldQuaternion(ik.parent).invert()
    bone.quaternion.copy(ik.parent).multiply(rotation).multiply(ik.world)
    bone.updateWorldMatrix(false, true)
  }

  // Turns `bone` so the direction from it to `child` points at `goal`, then
  // blends that toward the animated pose by `weight`.
  function aimBone(bone, child, goal, weight, base) {
    bone.getWorldPosition(ik.from)
    child.getWorldPosition(ik.to)
    ik.to.sub(ik.from).normalize()
    ik.axis.copy(goal).sub(ik.from).normalize()
    turnBone(bone, ik.turn.setFromUnitVectors(ik.to, ik.axis))
    ik.solved.copy(bone.quaternion)
    bone.quaternion.copy(base).slerp(ik.solved, weight)
    bone.updateWorldMatrix(false, true)
  }

  function restorePushBase() {
    if (!pushApplied) return
    pushBones.forEach((bone, i) => bone.quaternion.copy(pushBase[i]))
    pushApplied = false
  }

  function applyPush(delta) {
    pushWeight += ((pushInput ? 1 : 0) - pushWeight) * Math.min(1, delta * 10)
    if (pushWeight < 0.002) {
      pushWeight = 0
      return
    }
    const body = info.wrapper.parent
    if (!canPush || !body) return
    if (pushInput) {
      pushArms[0].grip.copy(pushInput.handles.left)
      pushArms[1].grip.copy(pushInput.handles.right)
    }
    pushBones.forEach((bone, i) => pushBase[i].copy(bone.quaternion))
    pushApplied = true
    body.updateWorldMatrix(true, true)

    // Lean into the bar, more while moving it.
    if (pushSpine) {
      ik.axis.set(1, 0, 0).transformDirection(body.matrixWorld)
      const lean = (pushInput?.speed > 0.1 ? PUSH_LEAN_MOVING : PUSH_LEAN) * pushWeight
      turnBone(pushSpine, ik.turn.setFromAxisAngle(ik.axis, lean))
    }

    pushArms.forEach((limb, i) => {
      const armBase = pushBase[pushBones.indexOf(limb.arm)]
      const foreBase = pushBase[pushBones.indexOf(limb.fore)]
      limb.arm.getWorldPosition(ik.shoulder)
      limb.fore.getWorldPosition(ik.elbow)
      limb.hand.getWorldPosition(ik.wrist)
      const upper = ik.shoulder.distanceTo(ik.elbow)
      const lower = ik.elbow.distanceTo(ik.wrist)
      body.localToWorld(ik.target.copy(limb.grip))

      // Elbow placed in the plane through the shoulder and the target that
      // contains the pole (down and out to that side), at the angle the two
      // bone lengths need to reach.
      ik.dir.copy(ik.target).sub(ik.shoulder)
      const reach = THREE.MathUtils.clamp(ik.dir.length(), Math.abs(upper - lower) + 1e-3, upper + lower - 1e-3)
      ik.dir.normalize()
      ik.bend.set(i === 0 ? PUSH_ELBOW_OUT : -PUSH_ELBOW_OUT, -1, -0.3).transformDirection(body.matrixWorld)
      ik.bend.addScaledVector(ik.dir, -ik.bend.dot(ik.dir)).normalize()
      const cos = THREE.MathUtils.clamp((upper * upper + reach * reach - lower * lower) / (2 * upper * reach), -1, 1)
      ik.elbow.copy(ik.shoulder)
        .addScaledVector(ik.dir, upper * cos)
        .addScaledVector(ik.bend, upper * Math.sqrt(1 - cos * cos))
      ik.target.copy(ik.shoulder).addScaledVector(ik.dir, reach)

      aimBone(limb.arm, limb.fore, ik.elbow, pushWeight, armBase)
      aimBone(limb.fore, limb.hand, ik.target, pushWeight, foreBase)
    })
  }

  let pulling = null
  let pickingUp = null
  function logPickup(event) {
    if (import.meta.env?.DEV) console.info(`[pickup @${performance.now().toFixed(1)}ms] ${event}`)
  }

  function restorePointBase() {
    if (!pointApplied) return
    for (const pose of pointBones) {
      pose.bone.position.copy(pose.position)
      pose.bone.quaternion.copy(pose.quaternion)
      pose.bone.scale.copy(pose.scale)
    }
    pointApplied = false
  }

  function stopPress() {
    restorePointBase()
    pointElapsed = null
    pointAction?.stop()
  }

  function playPress() {
    if (!pointAction || throwing || casting || pulling || pickingUp || scriptedWalking) return
    stopPress()
    pointElapsed = 0
    pointAction.reset().setEffectiveWeight(1).setEffectiveTimeScale(PRESS_SPEED).play()
  }

  function updatePoint(delta) {
    if (pointElapsed == null) return
    pointElapsed += delta
    const end = pointClip.duration / PRESS_SPEED
    const weight = Math.max(0, Math.min(1, pointElapsed / PRESS_FADE_IN,
      (end + PRESS_FADE_OUT - pointElapsed) / PRESS_FADE_OUT))
    if (weight <= 0) { stopPress(); return }
    pointMixer.update(delta)
    for (const pose of pointBones) {
      pose.position.copy(pose.bone.position)
      pose.quaternion.copy(pose.bone.quaternion)
      pose.scale.copy(pose.bone.scale)
      pose.bone.position.lerp(pose.sample.position, weight)
      pose.bone.quaternion.slerp(pose.sample.quaternion, weight)
      pose.bone.scale.lerp(pose.sample.scale, weight)
    }
    pointApplied = true
  }

  function startPull() {
    if (pickingUp) resetInteractionAnimation()
    stopPress()
    cancelThrow()
    casting = false
    crouchTransition = null
    airborneJump = null
    wasCrouching = false
    wanted = 'idle'
    if (pulling) pulling.finished = true
    pulling = { phase: 'forward', finished: false }
    if (actions.pull) {
      actions.pull.setEffectiveTimeScale(1)
      fadeTo('pull', 0.12, { restart: true })
    }
    return pulling
  }

  function returnPull(completed = false) {
    if (!pulling) return { finished: true }
    if (!actions.pull || actions.pull.time <= 0) {
      resetInteractionAnimation()
      return { finished: true }
    }
    pulling.phase = 'reverse'
    const action = actions.pull
    // Do not reset()/fadeTo(): early release must reverse from the current time.
    action.paused = false
    action.enabled = true
    action.stopFading().setEffectiveWeight(1)
    action.setEffectiveTimeScale(completed ? -PULL_RETURN_SPEED : -1).play()
    return pulling
  }

  function resetInteractionAnimation() {
    stopPress()
    if (!pulling && !pickingUp) return
    if (pulling) pulling.finished = true
    if (pickingUp) pickingUp.finished = true
    pulling = null
    pickingUp = null
    actions.pull?.stop().setEffectiveTimeScale(1)
    actions.pickup?.stop().setEffectiveTimeScale(PICKUP_SPEED)
    current = null
    currentName = null
    mixer.stopAllAction()
    crouchTransition = null
    airborneJump = null
    wasCrouching = false
    wanted = 'idle'
    fadeTo('idle', 0)
    mixer.update(0)
  }

  function playPickup() {
    if (!actions.pickup || throwing || casting || pulling || pickingUp || scriptedWalking) {
      logPickup('start ignored (missing clip or animation busy)')
      return { finished: true }
    }
    stopPress()
    crouchTransition = null
    airborneJump = null
    wasCrouching = false
    wanted = 'idle'
    pickingUp = { finished: false }
    logPickup('pickup start')
    actions.pickup.setEffectiveTimeScale(PICKUP_SPEED)
    fadeTo('pickup', PRESS_FADE_IN, { restart: true })
    return pickingUp
  }

  function pickJumpClip(moving) {
    const fromRun = moving || currentName === 'run' || (actions.run?.getEffectiveWeight() ?? 0) > 0.45
    if (fromRun && actions.jumpRun) return 'jumpRun'
    if (actions.jumpIdle) return 'jumpIdle'
    if (actions.jumpRun) return 'jumpRun'
    return null
  }

  function fadeTo(name, duration = CROSSFADE, { restart = false } = {}) {
    const action = actions[name] ?? actions.idle
    if (!action) return
    const resolved = action === actions[name] ? name : 'idle'
    // Restart only on a real change, plus recasts of the ability clips
    // and a fresh jump takeoff (LoopOnce would otherwise keep the old time).
    if (resolved === currentName && !ONE_SHOTS.has(name) && !restart) return

    action.enabled = true
    action.reset()
    // fadeIn() multiplies the 0→1 interpolant by `action.weight`. If weight is
    // 0 (from a previous setEffectiveWeight(0)), the incoming clip stays at
    // effectiveWeight 0 forever while idle fades out — a frozen bind pose.
    action.setEffectiveWeight(1)
    action.play()

    if (duration > 0 && current && current !== action) {
      current.crossFadeTo(action, duration, false)
    } else if (current && current !== action) {
      current.stop()
      current.setEffectiveWeight(0)
    }

    current = action
    currentName = resolved
  }

  mixer.addEventListener('finished', (event) => {
    if (event.action === actions.pickup && pickingUp) {
      logPickup('pickup finished')
      pickingUp.finished = true
      pickingUp = null
      fadeTo(wanted, PICKUP_FADE_OUT)
      return
    }
    if (event.action === actions.pull && pulling) {
      if (event.direction < 0) {
        pulling.finished = true
        pulling = null
        actions.pull.setEffectiveTimeScale(1)
        fadeTo(wanted, 0.12)
      } else {
        pulling.phase = 'held'
      }
      return
    }
    if (crouchTransition && event.action === actions[crouchTransition]) {
      crouchTransition = null
      wanted = lastCrouching ? crouchLoop(lastMoving) : standLoop(lastMoving)
      noteCrouchState('transition finished')
      fadeTo(wanted, CROUCH_FADE)
      return
    }
    if (event.action !== actions.cast && event.action !== actions.throw) return
    // A faded-out cast can finish while the newer throw is still playing.
    if (event.action !== current) return
    if (event.action === actions.throw && throwing) {
      throwing.finished = true
      throwing = null
    }
    casting = false
    fadeTo(wanted, CROSSFADE)
  })

  if (actions.idle) {
    fadeTo('idle', 0)
    if (import.meta.env?.DEV) console.log(
      `[detective] idle started playing=${actions.idle.isRunning()} ` +
      `weight=${actions.idle.getEffectiveWeight().toFixed(2)}`
    )
  } else {
    console.warn('[detective] no idle clip — mesh will stay in bind pose (T-pose)')
  }

  function crouchLoop(moving) {
    if (moving) return actions.crouchWalk ? 'crouchWalk' : (actions.run ? 'run' : 'idle')
    return actions.crouchIdle ? 'crouchIdle' : 'idle'
  }

  function standLoop(moving) {
    return moving && actions.run ? 'run' : 'idle'
  }

  function noteCrouchState(why) {
    const next = crouchTransition ?? (lastCrouching ? crouchLoop(lastMoving) : 'standing')
    if (next === crouchState) return
    if (import.meta.env?.DEV) console.log(`[detective] crouch ${crouchState} → ${next} (${why}, moving=${lastMoving})`)
    crouchState = next
  }

  function setLocomotion(input) {
    const why = updateLocomotion(input)
    noteCrouchState(why)
  }

  // Returns why the crouch sub-state may have changed, for the log.
  // `push`: { handles: { left, right }, speed } while holding the trolley.
  function updateLocomotion({ moving, airborne, crouching, jumpStarted, push = null }) {
    pushInput = canPush && push && !airborne ? push : null
    if (scriptedWalking) return 'scripted walk'
    const crouchStarted = crouching && !wasCrouching
    const crouchEnded = !crouching && wasCrouching
    wasCrouching = crouching
    lastMoving = moving
    lastCrouching = crouching
    if (pulling || pickingUp) {
      wanted = crouching ? crouchLoop(moving) : standLoop(moving)
      return 'pulling'
    }
    let why = crouchStarted ? 'crouch pressed' : crouchEnded ? 'stand' : 'input'

    // Keep physical movement running, but let the full-body throw finish.
    if (throwing) {
      wanted = crouching ? crouchLoop(moving) : standLoop(moving)
      return 'throwing'
    }

    // Pushing walks rather than runs, at whatever pace the trolley allows.
    if (pushInput) {
      airborneJump = null
      casting = false
      crouchTransition = null
      if (crouching) wanted = crouchLoop(moving)
      else if (moving && actions.walk) {
        wanted = 'walk'
        actions.walk.setEffectiveTimeScale(push.speed / (walkTravel?.speed > 0.01 ? walkTravel.speed : 1.4))
      } else wanted = 'idle'
      fadeTo(wanted, CROSSFADE)
      return 'pushing'
    }

    if (jumpStarted) {
      const clipName = pickJumpClip(moving)
      if (clipName) {
        airborneJump = clipName
        wanted = clipName
        casting = false
        crouchTransition = null
        fadeTo(clipName, 0, { restart: true })
        if (clipName === 'jumpIdle' && actions.jumpIdle) {
          actions.jumpIdle.timeScale = jumpIdleAirborneScale
        }
        return 'jump'
      }
    }

    if (airborne) {
      crouchTransition = null
      why = 'airborne'
      wanted = airborneJump && actions[airborneJump]
        ? airborneJump
        : moving ? 'run' : 'idle'
    } else if (
      !crouching &&
      airborneJump === 'jumpIdle' &&
      actions.jumpIdle &&
      !actions.jumpIdle.paused
    ) {
      // Physics already landed: skip leftover hang time and play recovery at 1x.
      if (actions.jumpIdle.time < jumpIdleAirborneEnd) {
        actions.jumpIdle.time = jumpIdleAirborneEnd
      }
      actions.jumpIdle.timeScale = 1
      wanted = 'jumpIdle'
      return 'landing'
    } else {
      airborneJump = null
      if (crouchStarted || crouchEnded) {
        // Toggled again mid-transition: drop it and fade straight to the
        // loop that matches the new state.
        if (crouchTransition) {
          crouchTransition = null
          why = 'toggled mid-transition'
        } else if (crouchStarted && actions.standToCrouch) {
          crouchTransition = 'standToCrouch'
          transitionMoving = moving
        } else if (crouchEnded && actions.crouchToStand) {
          crouchTransition = 'crouchToStand'
          transitionMoving = moving
        }
      } else if (crouchTransition && moving !== transitionMoving) {
        // Movement pressed or released mid-transition: blend straight into
        // the loop for the current input instead of waiting for the clip.
        crouchTransition = null
        why = 'moving changed mid-transition'
      }
      wanted = crouchTransition ?? (crouching ? crouchLoop(moving) : standLoop(moving))
    }

    if (casting) {
      if (wanted !== 'idle') {
        casting = false
        fadeTo(wanted, CROSSFADE)
      }
      return why
    }

    const quick = CROUCH_TRANSITIONS.has(wanted) || CROUCH_TRANSITIONS.has(currentName)
    fadeTo(wanted, quick ? CROUCH_FADE : CROSSFADE)
    return why
  }

  function noteJumpAirtime(seconds) {
    const jumpAction = airborneJump ? actions[airborneJump] : (actions.jumpIdle ?? actions.jumpRun)
    if (!(seconds > 0) || !jumpAction) return
    const clipTime = jumpAction.time
    const scale = jumpAction.timeScale || 1
    const wallPlayed = clipTime / scale
    lastMeasuredAirtime = seconds
    applyJumpTimeScale(seconds)
    const nextScale =
      airborneJump === 'jumpIdle'
        ? `airborne=${jumpIdleAirborneScale.toFixed(2)} landing=1.00`
        : `nextTimeScale=${jumpAction.timeScale.toFixed(2)}`
    if (import.meta.env?.DEV) console.log(
      `[detective] ${airborneJump ?? 'jump'} airtime measured=${seconds.toFixed(3)}s ` +
      `clipTime=${clipTime.toFixed(3)}s (raw clip timeline, not wall clock) ` +
      `wallPlayed=${wallPlayed.toFixed(3)}s (clipTime/timeScale) ` +
      nextScale
    )
  }

  // One-shot ability pose. Standing: play the clip. Moving/airborne: skip so
  // run/jump are not held for the cast duration.
  function playCast() {
    if (pulling || pickingUp || scriptedWalking) return
    if (throwing) return
    if (!actions.cast) return
    if (wanted !== 'idle') return
    stopPress()
    casting = true
    fadeTo('cast', CROSSFADE)
  }

  function playThrow() {
    if (pulling || pickingUp || scriptedWalking) return null
    if (throwing) return null
    // Preserve the existing mechanic if this optional clip failed to load.
    if (!actions.throw) return { released: true, finished: true, cancelled: false }
    stopPress()
    casting = false
    crouchTransition = null
    airborneJump = null
    throwing = {
      released: false,
      finished: false,
      cancelled: false,
      releasePosition: null
    }
    fadeTo('throw', 0.12)
    return throwing
  }

  function cancelThrow() {
    if (!throwing) return
    throwing.cancelled = true
    throwing = null
    fadeTo(wanted, CROSSFADE)
  }

  function setScriptedWalking(value) {
    stopPress()
    scriptedWalking = value
    casting = false
    cancelThrow()
    crouchTransition = null
    airborneJump = null
    wanted = 'idle'
    if (value) setScriptedWalkSpeed(0)
    fadeTo(value ? 'walk' : 'idle', 0.2)
  }

  function setScriptedWalkSpeed(speed) {
    // Root travel is measured before stripping X/Z; 1.4 m/s is the explicit
    // fallback for an optional in-place clip with no measurable root travel.
    actions.walk?.setEffectiveTimeScale(Math.max(0, speed) / (walkTravel?.speed > 0.01 ? walkTravel.speed : 1.4))
  }

  let mixerFrames = 0
  function update(delta) {
    // Restore last frame's base even when idle tracks have not changed; the
    // main mixer may otherwise skip writing a constant property this frame.
    restorePointBase()
    restorePushBase()
    if (throwing?.cancelled) cancelThrow()
    const activeThrow = throwing
    mixer.update(delta)
    // Keep the handle even if this tick also fires the finished event.
    if (activeThrow && !activeThrow.cancelled && !activeThrow.released &&
        actions.throw.time >= Math.min(THROW_RELEASE_TIME, clips.throw.duration)) {
      if (throwHand) {
        info.wrapper.updateWorldMatrix(true, true)
        activeThrow.releasePosition = throwHand.getWorldPosition(new THREE.Vector3())
      }
      activeThrow.released = true
    }
    syncJumpIdleTimeScale()
    updatePoint(delta)
    applyPush(delta)
    mixerFrames += 1
    if (import.meta.env?.DEV && (mixerFrames === 1 || mixerFrames % 60 === 0)) {
      const w = (name) => (actions[name]?.getEffectiveWeight() ?? 0).toFixed(2)
      console.log(
        `[detective] mixer.update #${mixerFrames} delta=${delta.toFixed(4)} ` +
        `idle=${w('idle')} run=${w('run')} jumpIdle=${w('jumpIdle')} jumpRun=${w('jumpRun')} cast=${w('cast')} ` +
        `throw=${w('throw')} standToCrouch=${w('standToCrouch')} crouchIdle=${w('crouchIdle')} ` +
        `crouchWalk=${w('crouchWalk')} crouchToStand=${w('crouchToStand')} ` +
        `airborneJump=${airborneJump ?? 'none'} crouchTransition=${crouchTransition ?? 'none'} ` +
        `lastAirtime=${lastMeasuredAirtime.toFixed(2)}s ` +
        `idleTime=${(actions.idle?.time ?? 0).toFixed(2)} ` +
        `runTime=${(actions.run?.time ?? 0).toFixed(2)}`
      )
    }
  }

  function dispose() {
    resetInteractionAnimation()
    pointMixer.stopAllAction()
    pointMixer.uncacheRoot(pointRig)
    cancelThrow()
    mixer.stopAllAction()
    mixer.uncacheRoot(idleFbx)
  }

  // Sample the locomotion clip itself so the footstep rhythm cannot drift
  // away from the visible running/crouch-walking animation.
  function getFootstepCycle() {
    if (currentName !== 'run' && currentName !== 'crouchWalk') return null
    const action = actions[currentName]
    const duration = action?.getClip()?.duration
    if (!duration || !action.isRunning()) return null
    return { mode: currentName, phase: (action.time % duration) / duration }
  }

  return { root: info.wrapper, mixer, actions, setLocomotion, getFootstepCycle, playCast, playThrow, cancelThrow,
    playPress, playPickup, stopPress, startPull, returnPull, resetInteractionAnimation,
    setScriptedWalking, setScriptedWalkSpeed, noteJumpAirtime, update, dispose }
}

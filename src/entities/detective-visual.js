import * as THREE from 'three'

// Mixamo detective: Idle.fbx is the skinned mesh; the other FBXs are
// animation-only clips retargeted onto that skeleton by track/bone name.

const MIXAMO_CM_SCALE = 0.01
const CROSSFADE = 0.3
// player.js jump: v0=6.4, g=18 → hang time 2*v0/g. Speed the Mixamo clip
// (typically ~1.9s) so takeoff-to-land lines up with that airtime.
const JUMP_AIR_TIME = (2 * 6.4) / 18

const FILES = {
  idle: new URL('../assets/models/detective/Idle.fbx', import.meta.url),
  run: new URL('../assets/models/detective/Running.fbx', import.meta.url),
  jumpIdle: new URL('../assets/models/detective/Jump.fbx', import.meta.url),
  jumpRun: new URL('../assets/models/detective/Standing Jump Running.fbx', import.meta.url),
  cast: new URL('../assets/models/detective/Standing 1H Cast Spell 01.fbx', import.meta.url)
}

function firstClip(fbx, name) {
  const clip = fbx?.animations?.[0]
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
  console.log(
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

export async function loadDetectiveVisual(assets) {
  const [idleFbx, runFbx, jumpIdleFbx, jumpRunFbx, castFbx] = await Promise.all([
    assets.loadFbx(FILES.idle.href),
    loadOptionalFbx(assets, FILES.run.href),
    loadOptionalFbx(assets, FILES.jumpIdle.href),
    loadOptionalFbx(assets, FILES.jumpRun.href),
    loadOptionalFbx(assets, FILES.cast.href)
  ])

  const info = prepareModel(idleFbx)
  console.log(
    `[detective] scale=${info.scale} rawHeight=${info.rawHeight.toFixed(1)} ` +
    `worldHeight=${info.worldHeight.toFixed(2)}m feetY=${info.wrapper.position.y.toFixed(3)} ` +
    `rootRot=(${info.rotation.x.toFixed(3)}, ${info.rotation.y.toFixed(3)}, ${info.rotation.z.toFixed(3)})`
  )

  const mixer = new THREE.AnimationMixer(idleFbx)

  const clips = {
    idle: firstClip(idleFbx, 'idle'),
    run: firstClip(runFbx, 'run'),
    jumpIdle: firstClip(jumpIdleFbx, 'jumpIdle'),
    jumpRun: firstClip(jumpRunFbx, 'jumpRun'),
    cast: firstClip(castFbx, 'cast')
  }

  const rootMotionClips = ['run', 'jumpIdle', 'jumpRun']
  for (const name of rootMotionClips) {
    const clip = clips[name]
    if (!clip) continue
    const notes = stripRootMotion(clip)
    const extras = clip.tracks
      .filter((track) => track.name.endsWith('.position') && !HIPS_POSITION.test(track.name))
      .map((track) => track.name)
    console.log(
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
    console.log(
      `[detective] jumpIdle phases airborne=${jumpIdleAirborneEnd.toFixed(3)}s ` +
      `landing=${Math.max(0, clips.jumpIdle.duration - jumpIdleAirborneEnd).toFixed(3)}s (plays at 1.0x)`
    )
  }
  if (clips.jumpRun) clips.jumpRun = trimJumpAnticipation(clips.jumpRun)

  const looping = new Set(['idle', 'run'])
  const actions = {}
  for (const [name, clip] of Object.entries(clips)) {
    if (!clip) {
      console.warn(`[detective] clip ${name}: MISSING`)
      continue
    }
    console.log(
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
    console.log(
      `[detective] jumpIdle airborne timeScale=${jumpIdleAirborneScale.toFixed(2)} ` +
      `(${jumpIdleAirborneEnd.toFixed(2)}s clip → ${JUMP_AIR_TIME.toFixed(2)}s air) landing=1.0x`
    )
  }
  if (actions.jumpRun && clips.jumpRun) {
    console.log(
      `[detective] jumpRun LoopOnce timeScale=${actions.jumpRun.timeScale.toFixed(2)} ` +
      `(clip ${clips.jumpRun.duration.toFixed(2)}s → assumed airtime ${JUMP_AIR_TIME.toFixed(2)}s)`
    )
  }

  let current = null
  let currentName = null
  let casting = false
  let wanted = 'idle'
  let airborneJump = null

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
    // Restart only on a real change, plus recasts of the ability clip
    // and a fresh jump takeoff (LoopOnce would otherwise keep the old time).
    if (resolved === currentName && name !== 'cast' && !restart) return

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
    if (event.action !== actions.cast) return
    casting = false
    fadeTo(wanted, CROSSFADE)
  })

  if (actions.idle) {
    fadeTo('idle', 0)
    console.log(
      `[detective] idle started playing=${actions.idle.isRunning()} ` +
      `weight=${actions.idle.getEffectiveWeight().toFixed(2)}`
    )
  } else {
    console.warn('[detective] no idle clip — mesh will stay in bind pose (T-pose)')
  }

  function setLocomotion({ moving, airborne, crouching, jumpStarted }) {
    if (jumpStarted) {
      const clipName = pickJumpClip(moving)
      if (clipName) {
        airborneJump = clipName
        wanted = clipName
        casting = false
        fadeTo(clipName, 0, { restart: true })
        if (clipName === 'jumpIdle' && actions.jumpIdle) {
          actions.jumpIdle.timeScale = jumpIdleAirborneScale
        }
        return
      }
    }

    if (airborne) {
      wanted = airborneJump && actions[airborneJump]
        ? airborneJump
        : moving ? 'run' : 'idle'
    } else if (
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
      return
    } else {
      airborneJump = null
      wanted = moving ? (actions.run ? 'run' : 'idle') : 'idle'
    }

    if (actions.run) actions.run.timeScale = crouching ? 0.65 : 1

    if (casting) {
      if (wanted !== 'idle') {
        casting = false
        fadeTo(wanted, CROSSFADE)
      }
      return
    }

    fadeTo(wanted, CROSSFADE)
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
    console.log(
      `[detective] ${airborneJump ?? 'jump'} airtime measured=${seconds.toFixed(3)}s ` +
      `clipTime=${clipTime.toFixed(3)}s (raw clip timeline, not wall clock) ` +
      `wallPlayed=${wallPlayed.toFixed(3)}s (clipTime/timeScale) ` +
      nextScale
    )
  }

  // One-shot ability pose. Standing: play the clip. Moving/airborne: skip so
  // run/jump are not held for the cast duration.
  function playCast() {
    if (!actions.cast) return
    if (wanted !== 'idle') return
    casting = true
    fadeTo('cast', CROSSFADE)
  }

  let mixerFrames = 0
  function update(delta) {
    mixer.update(delta)
    syncJumpIdleTimeScale()
    mixerFrames += 1
    if (mixerFrames === 1 || mixerFrames % 60 === 0) {
      const w = (name) => (actions[name]?.getEffectiveWeight() ?? 0).toFixed(2)
      console.log(
        `[detective] mixer.update #${mixerFrames} delta=${delta.toFixed(4)} ` +
        `idle=${w('idle')} run=${w('run')} jumpIdle=${w('jumpIdle')} jumpRun=${w('jumpRun')} cast=${w('cast')} ` +
        `airborneJump=${airborneJump ?? 'none'} ` +
        `lastAirtime=${lastMeasuredAirtime.toFixed(2)}s ` +
        `idleTime=${(actions.idle?.time ?? 0).toFixed(2)} ` +
        `runTime=${(actions.run?.time ?? 0).toFixed(2)}`
      )
    }
  }

  function dispose() {
    mixer.stopAllAction()
    mixer.uncacheRoot(idleFbx)
  }

  return { root: info.wrapper, mixer, actions, setLocomotion, playCast, noteJumpAirtime, update, dispose }
}

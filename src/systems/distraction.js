import * as THREE from 'three'
import { playDistractorImpactSfx, preloadPlayerInteractionSfx } from './player-interaction-sfx.js'

// Reusable throwable-noise distraction system. The throw direction follows the
// same authoritative yaw exposed by player-view, so first/third person throws
// stay aligned even though the two cameras render differently.
export function createDistractionSystem({
  scene,
  player,
  camera,
  stealth,
  hud,
  groundHeightAt,
  obstacles = [],
  isEnabled = () => true,
  hearingRadius = 10,
  inventory = { count: 0, max: 3 },
  onImpact = playDistractorImpactSfx
} = {}) {
  // Preload for every Level 1 throw zone, including the guard and bridge passages.
  void preloadPlayerInteractionSfx()
  if (!Number.isFinite(inventory.count)) inventory.count = 0
  if (!Number.isFinite(inventory.max) || inventory.max < 1) inventory.max = 3

  const projectileMaterial = new THREE.MeshStandardMaterial({
    color: 0xb08d3f,
    roughness: 0.28,
    metalness: 0.9,
    emissive: 0x3a2608,
    emissiveIntensity: 0.45
  })
  const projectileGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10)
  projectileGeometry.rotateZ(Math.PI / 2)

  const noiseMaterial = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false
  })
  const noiseGeometry = new THREE.RingGeometry(0.75, 0.9, 40)
  noiseGeometry.rotateX(-Math.PI / 2)

  let projectile = null
  let velocity = null
  let cooldown = 0
  let noisePulse = null
  let pulseAge = 0
  let firstThrow = true
  let pendingThrow = null
  const projectileRadius = 0.11
  const wallRestitution = 0.42
  const impactDrag = 0.78
  const floorRestitution = 0.36
  const minAudibleImpactSpeed = 0.85
  const impactSoundCooldown = 0.025
  let impactSoundTimer = 0
  let firstImpactHandled = false
  let projectileAge = 0

  function removeProjectile() {
    if (!projectile) return
    scene.remove(projectile)
    projectile = null
    velocity = null
  }

  function removePulse() {
    if (!noisePulse) return
    scene.remove(noisePulse)
    noisePulse = null
    pulseAge = 0
  }

  function throwDistraction() {
    if (!isEnabled()) return false
    if (inventory.count <= 0) {
      hud?.showToast?.('You have nothing to throw', 1700)
      return false
    }
    if (!player?.mesh || cooldown > 0 || projectile || pendingThrow) return false

    const animation = player.playThrow?.()
    if (!animation) return false
    pendingThrow = { animation, yaw: camera?.getYaw?.() ?? player.mesh.rotation.y ?? 0 }
    return true
  }

  function releaseDistraction({ animation, yaw }) {
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))

    projectile = new THREE.Mesh(projectileGeometry, projectileMaterial)
    projectile.name = 'thrown-distraction'

    const crouched = Boolean(player.isCrouching?.())
    projectile.position.copy(player.mesh.position)
    projectile.position.y += crouched ? 0.78 : 1.12
    projectile.position.addScaledVector(forward, 0.55)
    if (animation.releasePosition) projectile.position.copy(animation.releasePosition)
    projectile.rotation.y = yaw

    firstImpactHandled = false
    projectileAge = 0
    impactSoundTimer = 0
    velocity = forward.multiplyScalar(8.8)
    velocity.y = crouched ? 3.6 : 4.15

    scene.add(projectile)
    inventory.count = Math.max(0, inventory.count - 1)
    cooldown = 0.65

    if (firstThrow) {
      firstThrow = false
      hud?.showToast?.(`Distractor thrown — ${inventory.count}/${inventory.max} remaining. Guards who hear it will investigate.`, 2400)
    } else {
      hud?.showToast?.(`Distractors: ${inventory.count}/${inventory.max}`, 1100)
    }
  }

  // Each physical collision plays a sound; only the first substantial impact
  // produces the guard distraction pulse. Later bounces stay audible.
  function registerImpact(position, speed) {
    if (speed < minAudibleImpactSpeed) return
    if (impactSoundTimer <= 0) {
      // Existing callbacks without parameters remain compatible.
      onImpact?.(Math.min(1, speed / 8))
      impactSoundTimer = impactSoundCooldown
    }
    if (firstImpactHandled) return
    firstImpactHandled = true
    const impact = position.clone()
    removePulse()

    noiseMaterial.opacity = 0.72
    noisePulse = new THREE.Mesh(noiseGeometry, noiseMaterial)
    noisePulse.name = 'distraction-noise-pulse'
    noisePulse.position.copy(impact)
    noisePulse.position.y += 0.035
    noisePulse.scale.setScalar(0.35)
    scene.add(noisePulse)

    const responders = stealth?.investigate?.(impact, {
      radius: hearingRadius,
      duration: 3.4
    }) ?? 0

    if (responders > 0) {
      hud?.showToast?.(
        responders === 1 ? 'A guard heard the noise and is investigating.' : `${responders} guards heard the noise and are investigating.`,
        1700
      )
    } else {
      hud?.showToast?.('The impact was too far away for a guard to hear.', 1400)
    }
  }

  // Sweep the projectile centre against expanded obstacle rectangles. Unlike an
  // endpoint push-out, this also catches a fast throw crossing a thin wall in
  // a single frame. The outward face normal determines the bounce direction.
  function firstWallHit(start, step) {
    let best = null
    for (const box of obstacles) {
      if (!box || box.enabled === false) continue
      const minX = box.minX - projectileRadius
      const maxX = box.maxX + projectileRadius
      const minZ = box.minZ - projectileRadius
      const maxZ = box.maxZ + projectileRadius
      if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) continue
      let enter = 0
      let exit = 1
      let nx = 0
      let nz = 0
      let miss = false
      for (const [origin, movement, low, high, ax, az] of [
        [start.x, step.x, minX, maxX, 1, 0],
        [start.z, step.z, minZ, maxZ, 0, 1]
      ]) {
        if (Math.abs(movement) < 1e-9) {
          if (origin < low || origin > high) { miss = true; break }
          continue
        }
        const t1 = (low - origin) / movement
        const t2 = (high - origin) / movement
        const near = Math.min(t1, t2)
        const far = Math.max(t1, t2)
        if (near > enter) {
          enter = near
          const sign = movement > 0 ? -1 : 1
          nx = ax * sign
          nz = az * sign
        }
        exit = Math.min(exit, far)
        if (enter > exit) { miss = true; break }
      }
      // Ignore boxes containing the starting point; these can be structural
      // floor/room bounds, and have no incoming wall face to reflect against.
      if (miss || (nx === 0 && nz === 0) || enter < 0 || enter > 1) continue
      if (!best || enter < best.t) best = { t: enter, nx, nz }
    }
    return best
  }

  function moveProjectile(delta) {
    let remaining = delta
    // Multiple rebounds can happen during a long frame or in a narrow room.
    for (let i = 0; i < 5 && remaining > 0.00001; i++) {
      const start = projectile.position.clone()
      const step = velocity.clone().multiplyScalar(remaining)
      const hit = firstWallHit(start, step)
      if (!hit) {
        projectile.position.add(step)
        break
      }
      projectile.position.addScaledVector(step, Math.max(0, hit.t))
      projectile.position.x += hit.nx * 0.002
      projectile.position.z += hit.nz * 0.002
      const vn = velocity.x * hit.nx + velocity.z * hit.nz
      if (vn < 0) {
        registerImpact(projectile.position, -vn)
        velocity.x -= (1 + wallRestitution) * vn * hit.nx
        velocity.z -= (1 + wallRestitution) * vn * hit.nz
        velocity.x *= impactDrag
        velocity.z *= impactDrag
      }
      remaining *= 1 - hit.t
      if (remaining < 0.00001) break
    }
  }

  function update(delta) {
    cooldown = Math.max(0, cooldown - delta)

    if (pendingThrow) {
      if (pendingThrow.animation.cancelled) pendingThrow = null
      else if (pendingThrow.animation.released) {
        releaseDistraction(pendingThrow)
        pendingThrow = null
      }
    }

    if (projectile && velocity) {
      projectileAge += delta
      // Advance all collision and gravity calculations with the same substep.
      const steps = Math.max(1, Math.ceil(delta / (1 / 120)))
      const stepDelta = delta / steps
      for (let i = 0; i < steps && projectile; i++) {
        impactSoundTimer = Math.max(0, impactSoundTimer - stepDelta)
        // Use a short physics step so wall/floor audio follows contact closely.
        velocity.y -= 12.5 * stepDelta
        moveProjectile(stepDelta)
        const fallbackGround = player?.mesh?.position?.y ?? -4
        const groundY = typeof groundHeightAt === 'function'
          ? groundHeightAt(projectile.position.x, projectile.position.z, fallbackGround)
          : fallbackGround
        const floorY = groundY + 0.08
        if (projectile.position.y <= floorY && velocity.y < 0) {
          // Snap to the contact surface before notifying audio and stealth.
          projectile.position.y = floorY
          const hitSpeed = -velocity.y
          registerImpact(projectile.position, hitSpeed)
          // Make floor contacts real rebounds so each audible bounce corresponds
          // to the projectile's movement, rather than only its final landing.
          velocity.y = hitSpeed * floorRestitution
          velocity.x *= impactDrag
          velocity.z *= impactDrag
          if (velocity.y < 0.55) {
            removeProjectile()
            break
          }
        }
      }
      // Prevent a projectile from persisting indefinitely if it gets trapped.
      if (projectile && projectileAge > 5) removeProjectile()
      if (projectile) {
        projectile.rotation.x += delta * 8
        projectile.rotation.z += delta * 4.5
      }
    }

    if (noisePulse) {
      pulseAge += delta
      const t = Math.min(1, pulseAge / 1.05)
      noisePulse.scale.setScalar(0.35 + t * 3.7)
      noisePulse.material.opacity = 0.72 * (1 - t)
      if (t >= 1) removePulse()
    }
  }

  function dispose() {
    if (pendingThrow) pendingThrow.animation.cancelled = true
    pendingThrow = null
    removeProjectile()
    removePulse()
    projectileGeometry.dispose()
    projectileMaterial.dispose()
    noiseGeometry.dispose()
    noiseMaterial.dispose()
  }

  return {
    throw: throwDistraction,
    update,
    dispose,
    isReady: () => cooldown <= 0 && !projectile && !pendingThrow && inventory.count > 0,
    getCount: () => inventory.count
  }
}

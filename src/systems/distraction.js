import * as THREE from 'three'

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
  isEnabled = () => true,
  hearingRadius = 10,
  inventory = { count: 0, max: 3 }
} = {}) {
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
    if (!player?.mesh || cooldown > 0 || projectile) return false
    if (inventory.count <= 0) {
      hud?.showToast?.('No distractors left — search the passage for loose metal objects.', 1700)
      return false
    }

    const yaw = camera?.getYaw?.() ?? player.mesh.rotation.y ?? 0
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))

    projectile = new THREE.Mesh(projectileGeometry, projectileMaterial)
    projectile.name = 'thrown-distraction'
    projectile.castShadow = true

    const crouched = Boolean(player.isCrouching?.())
    projectile.position.copy(player.mesh.position)
    projectile.position.y += crouched ? 0.78 : 1.12
    projectile.position.addScaledVector(forward, 0.55)
    projectile.rotation.y = yaw

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

    return true
  }

  function land(position) {
    const impact = position.clone()
    removeProjectile()
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

  function update(delta) {
    cooldown = Math.max(0, cooldown - delta)

    if (projectile && velocity) {
      velocity.y -= 12.5 * delta
      projectile.position.addScaledVector(velocity, delta)
      projectile.rotation.x += delta * 8
      projectile.rotation.z += delta * 4.5

      const fallbackGround = player?.mesh?.position?.y ?? -4
      const groundY = typeof groundHeightAt === 'function'
        ? groundHeightAt(projectile.position.x, projectile.position.z, fallbackGround)
        : fallbackGround

      if (projectile.position.y <= groundY + 0.08 && velocity.y <= 0) {
        projectile.position.y = groundY + 0.08
        land(projectile.position)
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
    isReady: () => cooldown <= 0 && !projectile && inventory.count > 0,
    getCount: () => inventory.count
  }
}

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BOILER_HOLE, CARRIAGE_HOLES } from '../shaders/ending-time-damage.js'

export const SPLINTERS_PER_HOLE = 16
export const PANEL_STAGGER = 0.15
export const PANEL_GRAVITY = 9.8

function coloredBox(parts, color, w, h, d, x, y, z) {
  const indexed = new THREE.BoxGeometry(w, h, d), geometry = indexed.toNonIndexed()
  indexed.dispose()
  geometry.translate(x, y, z)
  const rgb = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3)
  for (let i = 0; i < colors.length; i += 3) colors.set([rgb.r, rgb.g, rgb.b], i)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geometry)
}

// Panel coordinates: X runs along the carriage, Y runs vertically (across the roof for roof tears).
export function holeFrame(hole, matrix) {
  const rotation = new THREE.Matrix4().makeRotationY(-Math.PI / 2)
  if (hole.roof) rotation.makeRotationX(-Math.PI / 2)
  matrix.copy(rotation); matrix.setPosition(hole.center)
  return matrix
}

export function createEndingDebris(root, carriages, locomotive) {
  const shells = []
  const shellMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9,
    emissive: 0xffb35c, emissiveIntensity: 0.16, side: THREE.DoubleSide })
  for (const pivot of carriages) {
    const parts = []
    coloredBox(parts, 0x5a3a22, 2.6, 0.08, 19.4, 0, 1.57, 0)
    coloredBox(parts, 0x7a5534, 0.06, 2.15, 19.4, 1.28, 2.65, 0)
    for (const z of [-9.65, 9.65]) coloredBox(parts, 0x7a5534, 2.6, 2.15, 0.06, 0, 2.65, z)
    for (const z of [-6.8, -4.1, -1.4, 1.3, 4, 6.7]) {
      coloredBox(parts, 0x8a3a2a, 1.65, 0.45, 0.8, 0.25, 1.86, z)
      coloredBox(parts, 0x8a3a2a, 1.65, 0.9, 0.14, 0.25, 2.3, z + 0.4)
    }
    const shell = new THREE.Mesh(mergeGeometries(parts), shellMaterial)
    parts.forEach(part => part.dispose())
    shell.name = 'ending-damage-interior'; pivot.add(shell); shells.push(shell)
  }
  const sites = []
  for (let i = 0; i < carriages.length; i++) for (const hole of CARRIAGE_HOLES[i]) {
    const frame = holeFrame(hole, new THREE.Matrix4())
    const width = hole.roof ? hole.halfSize.x : hole.halfSize.z
    const height = hole.roof ? hole.halfSize.z : hole.halfSize.y
    for (let n = 0; n < SPLINTERS_PER_HOLE; n++) {
      const angle = n * Math.PI * 2 / SPLINTERS_PER_HOLE
      const x = Math.cos(angle), y = Math.sin(angle), edge = 1 / Math.max(Math.abs(x), Math.abs(y))
      const pose = new THREE.Object3D()
      pose.position.set(x * edge * width, y * edge * height, (n % 3 - 1) * 0.1)
      pose.rotation.set(0.3 * Math.sin(n * 7), 0.45 * Math.cos(n * 3), angle - Math.PI / 2)
      pose.scale.set(0.035 + (n % 3) * 0.015, 0.25 + (n % 5) * 0.08, 0.045)
      pose.updateMatrix()
      sites.push({ pivot: carriages[i], matrix: frame.clone().multiply(pose.matrix) })
    }
  }
  const splinters = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.95 }), sites.length)
  splinters.name = 'ending-damage-splinters'; splinters.frustumCulled = false; root.add(splinters)
  const inverse = new THREE.Matrix4(), local = new THREE.Matrix4(), result = new THREE.Matrix4()
  const shape = new THREE.Shape()
  for (let i = 0; i < 20; i++) {
    const angle = i * Math.PI * 2 / 20, x = Math.cos(angle), y = Math.sin(angle)
    const radius = (0.94 + 0.045 * Math.sin(i * 13.7)) / Math.max(Math.abs(x), Math.abs(y))
    const point = new THREE.Vector2(x * radius, y * radius)
    if (i === 0) shape.moveTo(point.x, point.y); else shape.lineTo(point.x, point.y)
  }
  shape.closePath()
  const panelGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, steps: 1 })
  // Paint the outward cap only; every inward face and torn edge is brown.
  const front = [], back = [], normals = panelGeometry.attributes.normal
  for (let i = 0; i < normals.count; i += 3) {
    const target = normals.getZ(i) > 0.5 ? front : back
    target.push(i, i + 1, i + 2)
  }
  panelGeometry.setIndex([...front, ...back]); panelGeometry.clearGroups()
  panelGeometry.addGroup(0, front.length, 0); panelGeometry.addGroup(front.length, back.length, 1)
  const edgeGeometry = new THREE.EdgesGeometry(panelGeometry, 20)
  const green = new THREE.MeshStandardMaterial({ color: 0x2c4a36, roughness: 0.52, metalness: 0.08,
    emissive: 0x2c4a36, emissiveIntensity: 0.04 })
  const roof = green.clone(); roof.color.setHex(0x2a2e33); roof.emissive.setHex(0x2a2e33)
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.95 })
  const blue = new THREE.LineBasicMaterial({ color: 0x5ab8ff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  const panels = []
  function addPanel(pivot, hole, engine = false) {
    const object = new THREE.Group(); object.name = 'ending-torn-panel'
    const frame = holeFrame(hole, new THREE.Matrix4()), baseRotation = new THREE.Quaternion().setFromRotationMatrix(frame)
    const width = hole.roof ? hole.halfSize.x : hole.halfSize.z
    const height = hole.roof ? hole.halfSize.z : hole.halfSize.y
    const mesh = new THREE.Mesh(panelGeometry, [hole.roof ? roof : green, wood])
    const edge = new THREE.LineSegments(edgeGeometry, blue)
    for (const node of [mesh, edge]) {
      node.frustumCulled = false
      node.scale.set(width, height, 1); node.userData.endingDecoration = true
      object.add(node)
    }
    object.position.copy(hole.center); object.quaternion.copy(baseRotation); pivot.add(object)
    object.userData.hole = hole; object.userData.engine = engine
    const corners = [new THREE.Vector3(-0.7 * width, -0.7 * height, 0), new THREE.Vector3(0.7 * width, -0.7 * height, 0),
      new THREE.Vector3(0.7 * width, 0.7 * height, 0), new THREE.Vector3(-0.7 * width, 0.7 * height, 0)]
    panels.push({ object, hole, pivot, baseRotation, corners, frame, lift: 2.5 + (panels.length % 4) * 0.45,
      fallPosition: new THREE.Vector3(), fallRotation: new THREE.Quaternion(), gravity: new THREE.Vector3(),
      state: 'seated' })
  }
  for (let i = 0; i < carriages.length; i++) for (const hole of CARRIAGE_HOLES[i]) addPanel(carriages[i], hole)
  addPanel(locomotive, BOILER_HOLE, true)
  const threadGeometry = new THREE.BufferGeometry()
  const threadPositions = new Float32Array(panels.length * 4 * 2 * 3)
  threadGeometry.setAttribute('position', new THREE.BufferAttribute(threadPositions, 3).setUsage(THREE.DynamicDrawUsage))
  const threadMaterial = blue.clone(); threadMaterial.opacity = 0.65
  const threads = new THREE.LineSegments(threadGeometry, threadMaterial)
  threads.name = 'ending-time-threads'; threads.frustumCulled = false; root.add(threads)
  const vector = new THREE.Vector3(), rim = new THREE.Vector3(), turn = new THREE.Quaternion()
  const turnAxis = new THREE.Vector3(0.8, 0.25, 0.55).normalize()
  let released = false
  function release() {
    if (released) return false
    released = true
    threads.visible = false
    root.updateWorldMatrix(true, true)
    for (const panel of panels) {
      panel.fallPosition.copy(panel.object.position); panel.fallRotation.copy(panel.object.quaternion)
      local.copy(panel.pivot.matrixWorld).invert()
      panel.gravity.set(0, -1, 0).transformDirection(local)
      panel.state = 'falling'
    }
    return true
  }
  function update(brakeTime = -1, brakeDuration = 4.5, settleDuration = 1.6, releaseTime = -1, rift = 1) {
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i], object = panel.object
      if (released && releaseTime >= 0) {
        object.position.copy(panel.fallPosition).addScaledVector(panel.gravity, PANEL_GRAVITY * releaseTime * releaseTime / 2)
        turn.setFromAxisAngle(turnAxis, releaseTime * (1.1 + i * 0.08))
        object.quaternion.copy(panel.fallRotation).multiply(turn)
      } else {
        const start = brakeDuration * 0.3 + i * PANEL_STAGGER
        const progress = brakeTime < 0 ? 0 : THREE.MathUtils.clamp((brakeTime - start) / (brakeDuration + settleDuration - start), 0, 1)
        const lift = 1 - (1 - progress) ** 3
        object.position.copy(panel.hole.center)
        object.position.y += panel.lift * lift
        if (!panel.hole.roof) object.position.x -= 0.55 * lift
        turn.setFromAxisAngle(turnAxis, THREE.MathUtils.degToRad(10 + (i % 4) * 5) * lift)
        object.quaternion.copy(panel.baseRotation).multiply(turn)
        panel.state = progress === 1 ? 'frozen' : progress > 0 ? 'lifting' : 'seated'
      }
    }
    blue.opacity = 0.9 * rift
    threadMaterial.opacity = 0.65 * rift * (0.92 + 0.08 * Math.sin(Math.max(brakeTime, 0) * 11))
    threads.visible = !released
    root.updateWorldMatrix(true, true); inverse.copy(root.matrixWorld).invert()
    for (let i = 0; i < sites.length; i++) {
      local.multiplyMatrices(inverse, sites[i].pivot.matrixWorld)
      result.multiplyMatrices(local, sites[i].matrix); splinters.setMatrixAt(i, result)
    }
    splinters.instanceMatrix.needsUpdate = true
    let index = 0
    for (const panel of panels) {
      local.multiplyMatrices(inverse, panel.pivot.matrixWorld)
      for (const corner of panel.corners) {
        rim.copy(corner).applyMatrix4(panel.frame).applyMatrix4(local)
        vector.copy(corner).applyMatrix4(panel.object.matrix).applyMatrix4(local)
        threadPositions[index++] = rim.x; threadPositions[index++] = rim.y; threadPositions[index++] = rim.z
        threadPositions[index++] = vector.x; threadPositions[index++] = vector.y; threadPositions[index++] = vector.z
      }
    }
    threadGeometry.attributes.position.needsUpdate = true
  }
  update()
  return { shells, splinters, panels, threads, update, release }
}

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { CARRIAGE_HOLES, createDamageUniforms, patchTimeDamage } from '../shaders/ending-time-damage.js'

function coloredBox(parts, color, w, h, d, x, y, z, bevel = false) {
  const indexed = bevel ? new RoundedBoxGeometry(w, h, d, 1, 0.045) : new THREE.BoxGeometry(w, h, d)
  const geometry = indexed.index ? indexed.toNonIndexed() : indexed
  if (geometry !== indexed) indexed.dispose()
  geometry.translate(x, y, z)
  const rgb = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3)
  for (let i = 0; i < colors.length; i += 3) colors.set([rgb.r, rgb.g, rgb.b], i)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geometry)
}

// Ending-owned interior geometry only; nothing detaches from the train.
export function createEndingDebris(root, carriages) {
  const shells = [], glowParts = [], uniforms = []
  const glowMaterial = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vUv; void main(){float a=pow(max(0.0,1.0-length(vUv-0.5)*2.0),3.0);gl_FragColor=vec4(1.0,0.61,0.23,a*0.55);}'
  })
  root.updateWorldMatrix(true, true)
  const inverse = root.matrixWorld.clone().invert()
  for (let i = 0; i < carriages.length; i++) {
    const pivot = carriages[i]
    const damage = createDamageUniforms(CARRIAGE_HOLES[i]); uniforms.push(damage)
    const shellMaterial = patchTimeDamage(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, emissive: 0xffffff, emissiveIntensity: 0.32
    }), damage)
    const compileDamage = shellMaterial.onBeforeCompile
    shellMaterial.onBeforeCompile = shader => {
      compileDamage(shader)
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor;\n#endif')
    }
    const parts = []
    coloredBox(parts, 0x5a3a22, 2.6, 0.08, 19.4, 0, 1.57, 0)
    coloredBox(parts, 0x6b4529, 0.06, 2.15, 19.4, 1.28, 2.65, 0)
    coloredBox(parts, 0x3a2a1f, 2.6, 0.08, 19.4, 0, 3.76, 0)
    for (const z of [-9.65, 9.65]) coloredBox(parts, 0x6b4529, 2.6, 2.15, 0.06, 0, 2.65, z)
    for (let z = -9; z <= 9; z += 0.6) coloredBox(parts, 0x352619, 0.02, 2.08, 0.026, 1.24, 2.65, z)
    for (let x = -1; x <= 1; x += 0.25) coloredBox(parts, 0x362319, 0.018, 0.014, 19.3, x, 1.62, 0)
    const center = CARRIAGE_HOLES[i][0].center.z
    for (const z of [center - 2.4, center - 0.8, center + 0.8, center + 2.4]) {
      coloredBox(parts, 0x8a1f24, 0.86, 0.23, 0.78, 0.2, 1.96, z, true)
      coloredBox(parts, 0x8a1f24, 0.86, 0.91, 0.18, 0.2, 2.36, z - 0.36, true)
      for (const x of [-0.28, 0.68]) coloredBox(parts, 0x8a1f24, 0.15, 0.34, 0.82, x, 2.18, z, true)
      for (const x of [-0.1, 0.5]) coloredBox(parts, 0x302016, 0.08, 0.24, 0.55, x, 1.75, z)
    }
    for (const z of [center - 1.8, center, center + 1.8]) {
      const lamp = new THREE.CircleGeometry(0.14, 12)
      lamp.rotateY(-Math.PI / 2); lamp.translate(1.19, 3.13, z)
      const rgb = new THREE.Color(0xffcf80), colors = new Float32Array(lamp.attributes.position.count * 3)
      for (let n = 0; n < colors.length; n += 3) colors.set([rgb.r * 4, rgb.g * 4, rgb.b * 4], n)
      lamp.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      const ready = lamp.toNonIndexed(); lamp.dispose(); parts.push(ready)
      const glow = new THREE.PlaneGeometry(0.85, 0.85)
      glow.rotateY(-Math.PI / 2); glow.translate(1.16, 3.13, z)
      glow.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, pivot.matrixWorld))
      glowParts.push(glow)
    }
    const shell = new THREE.Mesh(mergeGeometries(parts), shellMaterial)
    parts.forEach(part => part.dispose())
    shell.name = 'ending-damage-interior'; pivot.add(shell); shells.push(shell)
  }
  const glows = new THREE.Mesh(mergeGeometries(glowParts), glowMaterial)
  glowParts.forEach(part => part.dispose())
  glows.name = 'ending-interior-lamp-glows'; root.add(glows)
  return { shells, glows, uniforms }
}

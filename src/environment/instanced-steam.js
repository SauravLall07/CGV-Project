import * as THREE from 'three'

function steamPuffTexture() {
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5
      const dy = (y + 0.5) / size - 0.5
      const blob = Math.hypot(dx / 0.46, dy / 0.36)
      const wobble = Math.sin(x * 0.45) * 0.04 + Math.cos(y * 0.38) * 0.04
      const falloff = Math.max(0, 1 - blob + wobble)
      const alpha = falloff * falloff * (0.55 + 0.45 * falloff)
      const i = (y * size + x) * 4
      data[i] = 214
      data[i + 1] = 220
      data[i + 2] = 224
      data[i + 3] = Math.round(alpha * 255)
    }
  }
  const texture = new THREE.DataTexture(data, size, size)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function steamPuffMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uStrength: { value: 0.2 } },
    vertexShader: /* glsl */ `
      attribute float aLife;
      attribute float aLayer;
      varying vec2 vUv;
      varying float vLife;
      varying float vLayer;
      void main() {
        vUv = uv;
        vLife = aLife;
        vLayer = aLayer;
        vec4 localCenter = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 viewCenter = modelViewMatrix * localCenter;
        vec3 flow = (modelViewMatrix * vec4(1.0, 0.12, 0.0, 0.0)).xyz;
        flow.z = 0.0;
        float fl = length(flow);
        flow = fl > 0.001 ? flow / fl : vec3(1.0, 0.0, 0.0);
        vec3 wing = vec3(-flow.y, flow.x, 0.0);
        float sx = length(instanceMatrix[0].xyz);
        float sy = length(instanceMatrix[1].xyz);
        vec3 offset = flow * position.x * sx + wing * position.y * sy;
        gl_Position = projectionMatrix * (viewCenter + vec4(offset, 0.0));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uStrength;
      varying vec2 vUv;
      varying float vLife;
      varying float vLayer;
      void main() {
        float sprite = texture2D(uMap, vUv).a;
        float fade = smoothstep(0.0, 0.04, vLife) * (1.0 - smoothstep(0.9, 1.0, vLife));
        float alpha = sprite * fade * uStrength * mix(0.62, 1.0, vLayer);
        if (alpha < 0.02) discard;
        vec3 col = mix(vec3(0.7, 0.75, 0.78), vec3(0.9, 0.93, 0.94), vLayer);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false
  })
}

// Shared Level 3 puff renderer. The level owns and disposes the returned mesh.
export function createInstancedSteam(count) {
  const texture = steamPuffTexture()
  const life = new Float32Array(count)
  const layer = new Float32Array(count)
  const geometry = new THREE.PlaneGeometry(1, 1)
  geometry.setAttribute('aLife', new THREE.InstancedBufferAttribute(life, 1))
  geometry.setAttribute('aLayer', new THREE.InstancedBufferAttribute(layer, 1))
  const mesh = new THREE.InstancedMesh(geometry, steamPuffMaterial(texture), count)
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  return { mesh, life, layer }
}

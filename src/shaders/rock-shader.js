import * as THREE from 'three'

/**
 * Faceted valley rocks for Boarding.
 *
 * MeshStandardMaterial on these stones fell into the ACES toe and read as
 * flat black blobs. This shader lights each face from the moon direction
 * with a little sky fill, and tints the albedo with 3D-free value noise
 * so a face is stone-coloured rather than a silhouette.
 * One shared material, instanced. No shadows, no real lights.
 */
export function createRockShaderMaterial(options = {}) {
  const uniforms = {
    uSunDirection: { value: (options.sunDirection || new THREE.Vector3(0.5, 0.5, 0.2)).clone().normalize() },
    uSunColor: { value: new THREE.Color(options.sunColor || 0x9aafd0) },
    uSkyColor: { value: new THREE.Color(options.skyColor || 0x1a2844) },
    uRockColor: { value: new THREE.Color(options.rockColor || 0x5a564e) },
    uAmbient: { value: options.ambient ?? 0.55 }
  }

  const vertexShader = /* glsl */ `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    void main() {
      vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `

  const fragmentShader = /* glsl */ `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform vec3 uSkyColor;
    uniform vec3 uRockColor;
    uniform float uAmbient;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }

    void main() {
      vec3 normal = normalize(vNormal);
      float grit = noise(vWorldPosition.xz * 0.65 + vWorldPosition.y * 0.4);
      // Warm grey stone, darker in the cracks of the noise.
      vec3 albedo = uRockColor * (0.62 + grit * 0.55);
      float ndotl = max(dot(normal, normalize(uSunDirection)), 0.0);
      float sky = clamp(0.35 + 0.65 * normal.y, 0.0, 1.0);
      vec3 lit = albedo * (uSunColor * ndotl * 1.15 + uSkyColor * sky * uAmbient);
      gl_FragColor = vec4(lit, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader
  })
  material.customUniforms = uniforms
  return material
}

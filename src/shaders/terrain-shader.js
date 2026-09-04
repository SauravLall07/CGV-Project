import * as THREE from 'three'

/**
 * Custom Terrain GLSL Shader Material
 * Features:
 * - Slope-based texture blending (rocky steep cliffs vs grassy flat slopes)
 * - Height-based layer blending (valley grass -> mountain rock -> snow/ridge peak)
 * - Distance fog & atmospheric haze integration
 * - Smooth lighting response matching directional sun and ambient sky
 */
export function createTerrainShaderMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0.0 },
    uSunDirection: { value: options.sunDirection || new THREE.Vector3(1, 1, -0.5).normalize() },
    uSunColor: { value: new THREE.Color(options.sunColor || 0xffb173) },
    uSkyColor: { value: new THREE.Color(options.skyColor || 0x5e6f96) },
    uGroundColor: { value: new THREE.Color(options.groundColor || 0x2a221b) },
    uGrassColor: { value: new THREE.Color(options.grassColor || 0x2b3824) },
    uRockColor: { value: new THREE.Color(options.rockColor || 0x4a4742) },
    uGravelColor: { value: new THREE.Color(options.gravelColor || 0x3d3830) },
    uFogColor: { value: new THREE.Color(options.fogColor || 0x241d24) },
    uFogNear: { value: options.fogNear ?? 30.0 },
    uFogFar: { value: options.fogFar ?? 250.0 }
  }

  const vertexShader = /* glsl */ `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vViewDistance;

    void main() {
      vUv = uv;
      vNormal = normalize(mat3(modelMatrix) * normal);
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;

      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewDistance = -mvPosition.z;

      gl_Position = projectionMatrix * mvPosition;
    }
  `

  const fragmentShader = /* glsl */ `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vViewDistance;

    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform vec3 uSkyColor;
    uniform vec3 uGroundColor;
    uniform vec3 uGrassColor;
    uniform vec3 uRockColor;
    uniform vec3 uGravelColor;
    uniform vec3 uFogColor;
    uniform float uFogNear;
    uniform float uFogFar;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
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

      // Slope factor: 1.0 for flat ground, 0.0 for vertical cliff face
      float slope = clamp(normal.y, 0.0, 1.0);
      float cliffFactor = smoothstep(0.7, 0.45, slope);

      // Height factor: height above track level
      float height = vWorldPosition.y;

      // Distance from track center line (X = 7.0)
      float distFromTrack = abs(vWorldPosition.x - 7.0);
      float trackGravelFactor = smoothstep(12.0, 3.5, distFromTrack) * smoothstep(8.0, -2.0, height);

      // Detail noise texture modulation
      float detailNoise = noise(vWorldPosition.xz * 0.15);
      float microNoise = noise(vWorldPosition.xz * 0.8);

      vec3 grassCol = uGrassColor * (0.85 + detailNoise * 0.35 + microNoise * 0.15);
      vec3 rockCol = uRockColor * (0.8 + detailNoise * 0.4);
      vec3 gravelCol = uGravelColor * (0.9 + microNoise * 0.2);

      // Blend layers
      vec3 baseColor = mix(grassCol, rockCol, cliffFactor);
      baseColor = mix(baseColor, gravelCol, trackGravelFactor * (1.0 - cliffFactor * 0.5));

      // Mountain peak snow/grey rock highlight for tall hills
      float peakFactor = smoothstep(25.0, 60.0, height);
      baseColor = mix(baseColor, uRockColor * 1.3 + vec3(0.1, 0.1, 0.12), peakFactor * (1.0 - slope * 0.4));

      // Hemisphere & Directional Lighting
      float NdotL = max(0.0, dot(normal, uSunDirection));
      float skyDiff = clamp(0.5 + 0.5 * normal.y, 0.0, 1.0);

      vec3 diffuse = NdotL * uSunColor * 1.2;
      vec3 ambient = mix(uGroundColor, uSkyColor, skyDiff) * 0.7;

      vec3 litColor = baseColor * (diffuse + ambient);

      // Distance fog calculation
      float fogFactor = smoothstep(uFogNear, uFogFar, vViewDistance);
      vec3 finalColor = mix(litColor, uFogColor, fogFactor);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide
  })

  material.customUniforms = uniforms
  return material
}

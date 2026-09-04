import * as THREE from 'three'

/**
 * Custom Vegetation GLSL Shader Material
 * Features:
 * - Vertex wind sway displacement for foliage and trees
 * - Translucent leaf lighting (subsurface scattering simulation)
 * - Base-to-tip ambient occlusion darkening
 * - Distance fog integration
 */
export function createVegetationShaderMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0.0 },
    uWindSpeed: { value: options.windSpeed ?? 1.8 },
    uWindStrength: { value: options.windStrength ?? 0.15 },
    uSunDirection: { value: options.sunDirection || new THREE.Vector3(1, 1, -0.5).normalize() },
    uSunColor: { value: new THREE.Color(options.sunColor || 0xffb173) },
    uSkyColor: { value: new THREE.Color(options.skyColor || 0x5e6f96) },
    uFoliageColor: { value: new THREE.Color(options.foliageColor || 0x22361d) },
    uHighlightColor: { value: new THREE.Color(options.highlightColor || 0x4a6b32) },
    uFogColor: { value: new THREE.Color(options.fogColor || 0x241d24) },
    uFogNear: { value: options.fogNear ?? 30.0 },
    uFogFar: { value: options.fogFar ?? 250.0 }
  }

  const vertexShader = /* glsl */ `
    uniform float uTime;
    uniform float uWindSpeed;
    uniform float uWindStrength;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vViewDistance;
    varying float vHeight;

    void main() {
      vUv = uv;
      vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
      
      vec3 pos = position;

      // Wind sway effect: displacement increases with height in local space Y
      float heightFactor = max(0.0, pos.y);
      vec4 instanceWorldPos = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      
      float windWave = sin(uTime * uWindSpeed + instanceWorldPos.x * 0.5 + instanceWorldPos.z * 0.5);
      float gustWave = cos(uTime * uWindSpeed * 0.7 + instanceWorldPos.z * 0.3);
      
      vec3 windOffset = vec3(
        (windWave + gustWave * 0.5) * uWindStrength * heightFactor * 0.25,
        sin(uTime * uWindSpeed * 1.5 + pos.x) * 0.04 * heightFactor,
        (cos(windWave) * 0.5) * uWindStrength * heightFactor * 0.25
      );

      pos += windOffset;
      vHeight = heightFactor;

      vec4 worldPosition = modelMatrix * instanceMatrix * vec4(pos, 1.0);
      vWorldPosition = worldPosition.xyz;

      vec4 mvPosition = viewMatrix * worldPosition;
      vViewDistance = -mvPosition.z;

      gl_Position = projectionMatrix * mvPosition;
    }
  `

  const fragmentShader = /* glsl */ `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying float vViewDistance;
    varying float vHeight;

    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform vec3 uSkyColor;
    uniform vec3 uFoliageColor;
    uniform vec3 uHighlightColor;
    uniform vec3 uFogColor;
    uniform float uFogNear;
    uniform float uFogFar;

    void main() {
      vec3 normal = normalize(vNormal);

      // Base color gradient from trunk/bottom to canopy top
      float topGradient = smoothstep(0.0, 4.0, vHeight);
      vec3 baseColor = mix(uFoliageColor, uHighlightColor, topGradient);

      // Directional light & backlight translucency
      float NdotL = max(0.0, dot(normal, uSunDirection));
      float backLight = max(0.0, dot(-normal, uSunDirection)) * 0.45; // Subsurface translucent glow

      float skyDiff = clamp(0.5 + 0.5 * normal.y, 0.0, 1.0);

      vec3 diffuse = (NdotL + backLight) * uSunColor * 1.1;
      vec3 ambient = uSkyColor * skyDiff * 0.6;

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

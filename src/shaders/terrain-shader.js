import * as THREE from 'three'

function solidTexture(r, g, b) {
  const data = new Uint8Array([r, g, b, 255])
  const texture = new THREE.DataTexture(data, 1, 1)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return texture
}

/**
 * Custom Terrain GLSL Shader Material
 * Features:
 * - Slope-based texture blending (rocky steep cliffs vs grassy flat slopes)
 * - Height-based layer blending (valley grass -> mountain rock -> snow/ridge peak)
 * - Distance fog & atmospheric haze integration
 * - Smooth lighting response matching directional sun and ambient sky
 */
export function createTerrainShaderMaterial(options = {}) {
  const defaultLightPos = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const defaultLightDir = [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0)]
  const defaultLightCol = [new THREE.Color(0x000000), new THREE.Color(0x000000), new THREE.Color(0x000000)]
  const defaultLightParams = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()]

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
    uFogFar: { value: options.fogFar ?? 250.0 },
    // 1 replaces the surface completely at uFogFar. Lower keeps shading.
    uFogMax: { value: options.fogMax ?? 1.0 },
    uAmbient: { value: options.ambient ?? 0.7 },
    // 0 leaves the surface alone. Boarding raises this for valley mist.
    uMist: { value: options.mist ?? 0 },
    // 1 draws the worn valley tracks. 0 on the moving levels.
    uPaths: { value: options.paths ?? 0 },
    // Forest-floor and rock photos near Boarding's playable run.
    // 0 keeps the procedural colour on the moving levels.
    uPhoto: { value: options.photo ?? 0 },
    uGroundMap: { value: options.groundMap || solidTexture(80, 90, 60) },
    uGroundNormal: { value: options.groundNormal || solidTexture(128, 128, 255) },
    uRockMap: { value: options.rockMap || solidTexture(90, 86, 80) },
    uRockNormal: { value: options.rockNormal || solidTexture(128, 128, 255) },

    uStationSpotLightCount: { value: 0 },
    uStationSpotLightPos: { value: defaultLightPos },
    uStationSpotLightDir: { value: defaultLightDir },
    uStationSpotLightColor: { value: defaultLightCol },
    uStationSpotLightParams: { value: defaultLightParams }
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
    uniform float uFogMax;
    uniform float uAmbient;
    uniform float uMist;
    uniform float uPaths;
    uniform float uPhoto;
    uniform sampler2D uGroundMap;
    uniform sampler2D uGroundNormal;
    uniform sampler2D uRockMap;
    uniform sampler2D uRockNormal;
    uniform float uTime;

    uniform int uStationSpotLightCount;
    uniform vec3 uStationSpotLightPos[3];
    uniform vec3 uStationSpotLightDir[3];
    uniform vec3 uStationSpotLightColor[3];
    uniform vec4 uStationSpotLightParams[3]; // x: intensity, y: cutoffCos, z: penumbraCos, w: distance

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    float segDist(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a;
      vec2 ba = b - a;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      return length(pa - ba * h);
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
      // Worn earth. Two segments leave the station area and head up the
      // valley. uPaths is 0 on the moving levels, so this stays off there.
      float pathA = segDist(vWorldPosition.xz, vec2(-168.0, -18.0), vec2(-30.0, 28.0));
      float pathB = segDist(vWorldPosition.xz, vec2(-30.0, 28.0), vec2(55.0, 78.0));
      float worn = 1.0 - smoothstep(1.1, 3.4, min(pathA, pathB));
      baseColor = mix(baseColor, uGravelColor * 0.72 + vec3(0.06, 0.04, 0.02), worn * uPaths);

      float peakFactor = smoothstep(25.0, 60.0, height);
      baseColor = mix(baseColor, uRockColor * 1.3 + vec3(0.1, 0.1, 0.12), peakFactor * (1.0 - slope * 0.4));

      // Photo ground near the walkable run. The maps are sRGB stored as
      // raw texels, so they are converted before the moonlight multiply.
      // uPhoto is 0 on the moving levels and this block stays off.
      vec2 playMin = vec2(-189.0, -52.0);
      vec2 playMax = vec2(4.3, 27.0);
      vec2 clampedXZ = clamp(vWorldPosition.xz, playMin, playMax);
      float playGap = length(vWorldPosition.xz - clampedXZ);
      float nearPlay = (1.0 - smoothstep(6.0, 40.0, playGap)) * uPhoto;
      if (nearPlay > 0.001) {
        vec2 groundUv = vWorldPosition.xz * 0.11;
        vec2 rockUv = vWorldPosition.xz * 0.07;
        vec3 groundTex = pow(texture2D(uGroundMap, groundUv).rgb, vec3(2.2));
        vec3 rockTex = pow(texture2D(uRockMap, rockUv).rgb, vec3(2.2));
        vec3 photo = mix(groundTex, rockTex, cliffFactor);
        // Daylight photos are too green and too saturated for moonlight.
        // Pull them toward a cool grey so the grain stays and the hue does not.
        float photoLuma = dot(photo, vec3(0.299, 0.587, 0.114));
        photo = mix(photo, vec3(photoLuma), 0.32);
        photo *= vec3(0.82, 0.88, 1.0);
        baseColor = mix(baseColor, photo * (0.9 + detailNoise * 0.16), nearPlay);
        vec3 groundN = texture2D(uGroundNormal, groundUv).xyz * 2.0 - 1.0;
        vec3 rockN = texture2D(uRockNormal, rockUv).xyz * 2.0 - 1.0;
        vec3 photoN = mix(groundN, rockN, cliffFactor);
        normal = normalize(normal + vec3(photoN.x, photoN.z, photoN.y) * nearPlay * 0.5);
      }

      // Hemisphere & Directional Lighting
      float NdotL = max(0.0, dot(normal, uSunDirection));
      float skyDiff = clamp(0.5 + 0.5 * normal.y, 0.0, 1.0);

      vec3 diffuse = NdotL * uSunColor * 1.2;
      vec3 ambient = mix(uGroundColor, uSkyColor, skyDiff) * uAmbient;

      // Textured Boarding ground uses the same diffuse model as a standard
      // material: station moonlight (0xc8daf6 at 1.95), the hemisphere
      // (0x2a4068 over 0x0a090e at 0.48), and a dim cool fill for the
      // environment map at intensity 0.4. Diffuse is divided by PI.
      // nearPlay is 0 on the moving levels, so they keep the line above.
      vec3 moonIrradiance = vec3(0.784, 0.855, 0.965) * 1.95 * NdotL;
      vec3 hemiIrradiance = mix(vec3(0.039, 0.035, 0.055), vec3(0.165, 0.251, 0.408), skyDiff) * 0.48;
      vec3 envIrradiance = vec3(0.10, 0.12, 0.18) * 0.4;
      vec3 standardLit = baseColor * (moonIrradiance + hemiIrradiance + envIrradiance) * 0.3183;
      vec3 legacyLit = baseColor * (diffuse + ambient);

      // Station Exterior Spotlight Illumination
      vec3 stationLightContrib = vec3(0.0);
      for (int i = 0; i < 3; i++) {
        if (i >= uStationSpotLightCount) break;
        vec3 pos = uStationSpotLightPos[i];
        vec3 dir = normalize(uStationSpotLightDir[i]);
        vec3 col = uStationSpotLightColor[i];
        float intensity = uStationSpotLightParams[i].x;
        float cutoffCos = uStationSpotLightParams[i].y;
        float penumbraCos = uStationSpotLightParams[i].z;
        float maxDist = uStationSpotLightParams[i].w;

        vec3 toLight = vWorldPosition - pos;
        float dist = length(toLight);
        if (dist > maxDist || maxDist <= 0.0) continue;

        vec3 lDir = -normalize(toLight);
        float cosAngle = dot(lDir, -dir);

        if (cosAngle > cutoffCos) {
          float spotFactor = smoothstep(cutoffCos, penumbraCos, cosAngle);
          float distRatio = dist / maxDist;
          float distFactor = clamp(1.0 - distRatio * distRatio, 0.0, 1.0);
          distFactor = distFactor * distFactor;

          float spotNdotL = max(0.0, dot(normal, lDir));
          stationLightContrib += col * (intensity * spotNdotL * spotFactor * distFactor);
        }
      }

      vec3 litColor = mix(legacyLit, standardLit, nearPlay) + baseColor * stationLightContrib;

      // Distance fog calculation
      float fogFactor = min(smoothstep(uFogNear, uFogFar, vViewDistance), uFogMax);
      vec3 finalColor = mix(litColor, uFogColor, fogFactor);

      // Low mist. Stronger in the valley floor, drifting slowly with uTime.
      // uMist is 0 on the moving levels.
      float drift = noise(vWorldPosition.xz * 0.02 + vec2(uTime * 0.012, 0.0));
      float mist = smoothstep(9.0, 0.4, vWorldPosition.y);
      mist *= smoothstep(30.0, 110.0, vViewDistance);
      mist *= (0.55 + 0.45 * drift) * uMist;
      finalColor = mix(finalColor, uFogColor * 0.72 + vec3(0.025, 0.03, 0.045), mist);

      gl_FragColor = vec4(finalColor, 1.0);
      // Same ACES curve and sRGB output as the standard materials. Without
      // this, a shadowed slope's linear colour is stored as if it were already
      // display-ready and reads as black.
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
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

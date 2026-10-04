import * as THREE from 'three'

/**
 * Boarding spawn grass.
 *
 * One ShaderMaterial shared by a single InstancedMesh. The instance matrix
 * is only the blade's position and yaw. Height, width, lean and colour are
 * hashed in the vertex shader from that position, so every blade differs
 * without a second buffer.
 *
 * uTime is the sky dome's clock. Slow, Freeze and Rewind move the gusts
 * with the clouds. The fragment shader uses the same fog uniforms as the
 * terrain, then the same ACES and sRGB chunks as the rest of the scene.
 *
 * Demo notes are in the shader source below.
 */
export function createGrassShaderMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0.0 },
    uSunDirection: { value: options.sunDirection || new THREE.Vector3(0.5, 0.6, 0.2).normalize() },
    uFogColor: { value: new THREE.Color(options.fogColor || 0x121022) },
    uFogNear: { value: options.fogNear ?? 50.0 },
    uFogFar: { value: options.fogFar ?? 260.0 },
    uFogMax: { value: options.fogMax ?? 0.88 },
    uMist: { value: options.mist ?? 0.36 }
  }

  // The sky passes its own uniform object in. Sharing the reference means
  // this shader reads the time-scaled clock instead of raw frame time.
  if (options.skyTime) uniforms.uTime = options.skyTime

  const vertexShader = /* glsl */ `
    uniform float uTime;

    varying float vHeight;
    varying vec3 vTint;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying float vViewDistance;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // Value noise. One octave is enough for gusts; a second sample
    // below adds the smaller ripple on top.
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
      // The blade mesh is a unit card: y is 0 at the root and 1 at the
      // tip, x is -0.5..0.5 across the width, z is a small resting curl
      // stored as a fraction of height.
      vec3 origin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

      // --- Per-blade shape ---
      // Hashed from the blade's own position so neighbours do not match.
      float nH = hash(origin.xz);
      float nW = hash(origin.xz + vec2(19.1, 7.7));
      float nL = hash(origin.xz + vec2(3.3, 41.9));
      float nC = hash(origin.zx + vec2(8.2, 2.6));
      float bladeHeight = mix(0.32, 1.05, nH);
      float bladeWidth = mix(0.045, 0.13, nW);
      float lean = mix(0.04, 0.26, nL);

      float along = position.y;
      vec3 pos = vec3(
        position.x * bladeWidth,
        along * bladeHeight,
        position.z * bladeHeight + lean * along * along
      );

      // --- Wind ---
      // Gusts are spatial noise scrolled by uTime, so a Freeze holds the
      // field still and a Rewind runs the gusts backwards. The bend is
      // zero at the root (along^2) and strongest at the tip.
      vec2 windDir = vec2(0.72, 0.28);
      vec2 gustUv = origin.xz * 0.045 + windDir * uTime * 0.32;
      float gust = noise(gustUv);
      float ripple = noise(origin.xz * 0.28 + vec2(uTime * 0.85, nC));
      float tip = along * along;
      float amp = tip * mix(0.03, 0.48, smoothstep(0.2, 0.85, gust));
      vec3 worldPush = vec3(windDir.x, 0.0, windDir.y) * amp;
      worldPush.xz += vec2(-0.25, 0.65) * (ripple * 2.0 - 1.0) * tip * 0.07;
      // Inverse of the yaw. transpose() is not in the GLSL this project compiles.
      mat3 worldRot = mat3(modelMatrix * instanceMatrix);
      mat3 invRot = mat3(
        vec3(worldRot[0].x, worldRot[1].x, worldRot[2].x),
        vec3(worldRot[0].y, worldRot[1].y, worldRot[2].y),
        vec3(worldRot[0].z, worldRot[1].z, worldRot[2].z)
      );
      pos += invRot * worldPush;

      vec4 worldPosition = modelMatrix * instanceMatrix * vec4(pos, 1.0);
      vWorldPosition = worldPosition.xyz;
      vHeight = along;

      // Colour is chosen here and only painted in the fragment shader.
      // A cool, slightly yellow tip over a bluer root.
      vTint = mix(vec3(0.72, 0.82, 0.68), vec3(1.08, 1.16, 0.78), nC);

      vec3 n = normalize(vec3(0.0, lean * 0.35, 1.0));
      vNormal = normalize(worldRot * n);

      vec4 mvPosition = viewMatrix * worldPosition;
      vViewDistance = -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;
    }
  `

  const fragmentShader = /* glsl */ `
    varying float vHeight;
    varying vec3 vTint;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying float vViewDistance;

    uniform vec3 uSunDirection;
    uniform vec3 uFogColor;
    uniform float uFogNear;
    uniform float uFogFar;
    uniform float uFogMax;
    uniform float uMist;
    uniform float uTime;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
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
      if (!gl_FrontFacing) normal = -normal;

      // --- Colour gradient ---
      // Dark cool green at the root, a lighter yellow-green at the tip.
      // vTint is the per-blade colour from the vertex shader.
      vec3 rootCol = vec3(0.020, 0.032, 0.018);
      vec3 tipCol = vec3(0.10, 0.15, 0.075);
      vec3 albedo = mix(rootCol, tipCol, smoothstep(0.08, 1.0, vHeight)) * vTint;

      // --- Moonlight ---
      // Same night model as the textured ground: moon 0xc8daf6 at 1.95,
      // hemisphere 0x2a4068 over 0x0a090e at 0.48, and a dim environment
      // fill at 0.4. Diffuse is divided by PI (0.3183).
      float skyDiff = clamp(0.5 + 0.5 * normal.y, 0.0, 1.0);
      float wrap = clamp((dot(normal, uSunDirection) + 0.5) / 1.5, 0.0, 1.0);
      // Translucency: the tip glows when the moon is behind the blade.
      float through = pow(max(dot(-normal, uSunDirection), 0.0), 1.3) * vHeight * vHeight;
      vec3 moon = vec3(0.784, 0.855, 0.965) * 1.95 * (wrap * 0.9 + through * 0.7);
      vec3 hemi = mix(vec3(0.039, 0.035, 0.055), vec3(0.165, 0.251, 0.408), skyDiff) * 0.48;
      vec3 env = vec3(0.10, 0.12, 0.18) * 0.4;
      vec3 litColor = albedo * (moon + hemi + env) * 0.3183;

      // --- Fog ---
      // Same curve as the terrain and the trees, then the same valley mist.
      float fogFactor = min(smoothstep(uFogNear, uFogFar, vViewDistance), uFogMax);
      vec3 finalColor = mix(litColor, uFogColor, fogFactor);
      float drift = noise(vWorldPosition.xz * 0.02 + vec2(uTime * 0.012, 0.0));
      float mist = smoothstep(9.0, 0.4, vWorldPosition.y);
      mist *= smoothstep(30.0, 110.0, vViewDistance);
      mist *= (0.55 + 0.45 * drift) * uMist;
      finalColor = mix(finalColor, uFogColor * 0.72 + vec3(0.025, 0.03, 0.045), mist);

      gl_FragColor = vec4(finalColor, 1.0);
      // ACES and sRGB, matching every other shader in the scene.
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

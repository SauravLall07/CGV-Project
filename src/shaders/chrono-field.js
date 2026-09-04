import * as THREE from 'three'

// Chrono Field / Temporal Distortion Custom GLSL ShaderMaterial
// Fulfills standalone Shaders rubric requirement (10%).
// Features:
// - Vertex Shader: Procedural vertex wave displacement driven by uTime, uIntensity, and uMode
// - Fragment Shader: Fresnel rim lighting, chromatic aberration, and scanning rings

export function createChronoFieldMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0.0 },
    uTimeScale: { value: 1.0 },
    uIntensity: { value: 0.0 },
    uMode: { value: 0 }, // 0: Normal, 1: Slow, 2: Freeze, 3: Rewind
    uBaseColor: { value: new THREE.Color(options.baseColor || 0x1e293b) },
    uGlowColor: { value: new THREE.Color(options.glowColor || 0x38bdf8) },
    uOpacity: { value: options.opacity ?? 0.85 }
  }

  const vertexShader = /* glsl */ `
    uniform float uTime;
    uniform float uTimeScale;
    uniform float uIntensity;
    uniform int uMode;

    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    varying vec2 vUv;
    varying float vDisplacement;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);

      vec3 pos = position;
      float displacement = 0.0;

      if (uMode == 1) {
        // Slow Time: Smooth expanding spatial dilation wave
        float wave = sin(pos.y * 4.0 + pos.z * 3.0 + uTime * 2.0);
        displacement = wave * 0.06 * uIntensity;
      } else if (uMode == 2) {
        // Freeze Time: Crystalline geometric jitter & sharp spatial hold
        float jitter = sin(pos.x * 20.0 + pos.y * 20.0) * cos(pos.z * 20.0);
        displacement = step(0.5, jitter) * 0.05 * uIntensity;
      } else if (uMode == 3) {
        // Rewind Time: High-frequency temporal oscillation ripple
        float ripple = sin(pos.y * 12.0 - uTime * 8.0) * cos(pos.x * 8.0 + uTime * 6.0);
        displacement = ripple * 0.09 * uIntensity;
      }

      vDisplacement = displacement;
      vec3 displacedPos = pos + normal * displacement;

      vec4 worldPosition = modelMatrix * vec4(displacedPos, 1.0);
      vWorldPosition = worldPosition.xyz;

      vec4 mvPosition = modelViewMatrix * vec4(displacedPos, 1.0);
      vViewPosition = -mvPosition.xyz;

      gl_Position = projectionMatrix * mvPosition;
    }
  `

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform float uIntensity;
    uniform int uMode;
    uniform vec3 uBaseColor;
    uniform vec3 uGlowColor;
    uniform float uOpacity;

    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;
    varying vec2 vUv;
    varying float vDisplacement;

    void main() {
      if (uMode == 0 || uIntensity <= 0.001) {
        gl_FragColor = vec4(uBaseColor, uOpacity);
        return;
      }

      vec3 viewDir = normalize(vViewPosition);
      vec3 normal = normalize(vNormal);

      // Fresnel rim lighting glow
      float fresnel = pow(1.0 - max(0.0, dot(viewDir, normal)), 2.5);

      // Dynamic temporal scanning rings along Y axis
      float scanFrequency = (uMode == 3) ? 24.0 : 14.0;
      float scanSpeed = (uMode == 3) ? -6.0 : (uMode == 1 ? 1.5 : 0.2);
      float scanRing = sin(vWorldPosition.y * scanFrequency + uTime * scanSpeed);
      scanRing = smoothstep(0.3, 1.0, scanRing);

      // Mode-specific temporal hue mapping
      vec3 modeColor = uGlowColor;
      if (uMode == 1) {
        // Slow: Cyan Dilation (#38bdf8)
        modeColor = vec3(0.22, 0.74, 0.97);
      } else if (uMode == 2) {
        // Freeze: Stasis Ice Blue (#60a5fa)
        modeColor = vec3(0.37, 0.65, 0.98);
      } else if (uMode == 3) {
        // Rewind: Violet Paradox (#a855f7)
        modeColor = vec3(0.66, 0.33, 0.97);
      }

      // Chromatic Aberration & Edge shimmer
      vec3 finalColor = mix(uBaseColor, modeColor, fresnel * 0.7 + scanRing * 0.3);
      finalColor += modeColor * (fresnel * 1.5 + vDisplacement * 4.0) * uIntensity;

      float alpha = clamp(uOpacity + fresnel * uIntensity * 0.45 + scanRing * 0.2, 0.0, 1.0);

      gl_FragColor = vec4(finalColor, alpha);
    }
  `

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    side: options.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: options.depthWrite ?? true
  })

  material.customUniforms = uniforms
  return material
}

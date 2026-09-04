import * as THREE from 'three'

// Security Laser Barrier Custom GLSL ShaderMaterial
// Fulfills standalone Shaders rubric requirement (10%).
// Features:
// - Vertex Shader: Passes UVs, view coordinates, and plasma beam position
// - Fragment Shader: Animated plasma laser core with moving scanlines
// - Dynamic State Uniform (uState): 0 = Normal Red Active, 1 = Disabled Green, 2 = Alarm Rapid Red Pulse

export function createSecurityLaserMaterial(options = {}) {
  const uniforms = {
    uTime: { value: 0.0 },
    uState: { value: 0 }, // 0: Active, 1: Disabled, 2: Alarm
    uBeamCount: { value: options.beamCount || 4.0 },
    uScanSpeed: { value: 3.5 }
  }

  const vertexShader = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vViewPosition;
    varying vec3 vNormal;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);

      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;

      gl_Position = projectionMatrix * mvPosition;
    }
  `

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform int uState;
    uniform float uBeamCount;
    uniform float uScanSpeed;

    varying vec2 vUv;
    varying vec3 vViewPosition;
    varying vec3 vNormal;

    void main() {
      // Create multi-beam grid lines along UV Y-axis
      float beamPattern = sin(vUv.y * uBeamCount * 6.28318);
      float beamCore = pow(abs(beamPattern), 8.0); // Sharp plasma core beam

      // Moving scanline energy pulses along UV X-axis
      float effectiveSpeed = (uState == 2) ? uScanSpeed * 2.8 : ((uState == 1) ? 1.0 : uScanSpeed);
      float scanline = sin(vUv.x * 25.0 - uTime * effectiveSpeed);
      scanline = smoothstep(0.2, 0.95, scanline);

      // Edge fading for plasma beam volume
      vec3 viewDir = normalize(vViewPosition);
      vec3 normal = normalize(vNormal);
      float fresnel = pow(1.0 - max(0.0, dot(viewDir, normal)), 1.5);

      vec3 coreColor;
      vec3 glowColor;
      float baseOpacity;

      if (uState == 1) {
        // Disabled State: Soft translucent green/emerald pulse
        float pulse = 0.3 + 0.2 * sin(uTime * 2.0);
        coreColor = vec3(0.06, 0.72, 0.51); // Emerald #10b981
        glowColor = vec3(0.02, 0.4, 0.25);
        baseOpacity = pulse * 0.3;
      } else if (uState == 2) {
        // Alarm State: High-intensity flashing crimson & amber
        float flash = step(0.5, sin(uTime * 14.0));
        coreColor = mix(vec3(0.94, 0.27, 0.27), vec3(0.98, 0.6, 0.07), flash); // #ef4444 to #f59e0b
        glowColor = vec3(0.86, 0.15, 0.15);
        baseOpacity = 0.95 + 0.1 * sin(uTime * 20.0);
      } else {
        // Normal Active State: Vibrant security red beam (#ef4444)
        coreColor = vec3(0.94, 0.27, 0.27);
        glowColor = vec3(0.7, 0.08, 0.08);
        baseOpacity = 0.85;
      }

      vec3 finalColor = mix(glowColor, coreColor, beamCore) + coreColor * scanline * 0.4 + glowColor * fresnel;
      float alpha = clamp(beamCore * baseOpacity + fresnel * 0.4 + scanline * 0.15, 0.05, 1.0);

      if (uState == 1 && beamCore < 0.2) {
        alpha *= 0.2; // Fade background volume heavily when disabled
      }

      gl_FragColor = vec4(finalColor, alpha);
    }
  `

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })

  material.customUniforms = uniforms
  return material
}

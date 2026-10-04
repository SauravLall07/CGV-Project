import * as THREE from 'three'

/**
 * Distant valley lights for Boarding. These are points, not real lights:
 * they do not illuminate the terrain, cast shadows, or show up in reflections.
 *
 * Two kinds of point share this shader. Warm clusters are villages in the
 * eastern valley. Red and green points are railway signals receding east,
 * the direction the spawn camera looks.
 *
 * uTime is the sky dome's clock. Slow, Freeze and Rewind already scale that
 * clock, so the twinkle follows the time powers without a second timer.
 * Each point has its own seed so the line does not flash in unison.
 */
export function createValleyLightsMaterial(timeUniform) {
  const uniforms = {
    uTime: timeUniform || { value: 0 }
  }

  const vertexShader = /* glsl */ `
    uniform float uTime;
    attribute vec3 aColor;
    attribute float aSeed;
    attribute float aSize;
    varying vec3 vColor;
    varying float vTwinkle;

    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;

      // Gentle twinkle. aSeed is 0..1, so each lamp has its own phase.
      vTwinkle = 0.72 + 0.28 * sin(uTime * 1.6 + aSeed * 6.28318);
      float dist = max(1.0, -mvPosition.z);
      gl_PointSize = clamp(aSize * vTwinkle * (150.0 / dist), 1.5, 18.0);
      vColor = aColor;
    }
  `

  const fragmentShader = /* glsl */ `
    varying vec3 vColor;
    varying float vTwinkle;

    void main() {
      // Round the point. The corners are discarded so a light is a dot,
      // not a square. Additive blending then fades the edge to nothing.
      vec2 p = gl_PointCoord - vec2(0.5);
      float d = length(p);
      if (d > 0.5) discard;
      float glow = smoothstep(0.5, 0.08, d);
      // Bright enough that ACES still leaves a warm speck at this distance.
      vec3 color = vColor * glow * vTwinkle * 3.2;
      gl_FragColor = vec4(color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: true
  })
  material.customUniforms = uniforms
  return material
}

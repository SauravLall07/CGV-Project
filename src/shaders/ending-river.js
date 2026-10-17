import * as THREE from 'three'

export function createEndingRiverMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uFlowScale: { value: 1 },
      uDeep: { value: new THREE.Color(0x1e3a66) }, uMoon: { value: new THREE.Color(0x9fb6e8) }
    }]),
    fog: true, side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uFlowScale;
      uniform vec3 uDeep;
      uniform vec3 uMoon;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
          mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      void main() {
        vec2 flow = vec2(vWorld.x * 0.32 + uTime * 0.8, vWorld.z * 2.6);
        float streak = smoothstep(0.73, 0.92, noise(flow)) *
          smoothstep(0.45, 0.8, noise(flow * vec2(0.4, 1.7) + 19.0));
        float ripple = noise(flow * 0.28) * 0.18;
        gl_FragColor = vec4(mix(uDeep * (0.7 + ripple), uMoon, streak * 0.75), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  })
}

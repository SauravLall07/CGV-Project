import * as THREE from 'three'

export const CRACK_REACH = 2.4
export const RIM_COLOR = 0x5ab8ff
export const FRESNEL_COLOR = 0x3d7dff
const hole = (x, y, z, hx, hy, hz, seed, roof = 0) => Object.freeze({
  center: new THREE.Vector3(x, y, z), halfSize: new THREE.Vector3(hx, hy, hz), seed, roof })
// +Z is the front; the first side opening and its entire crack field stay behind z=6.
export const CARRIAGE_HOLES = Object.freeze([
  Object.freeze([hole(-1.45, 2.55, -3.5, 0.35, 1.05, 1.8, 11)]),
  Object.freeze([hole(-1.45, 2.55, -1, 0.35, 1.15, 2.1, 23), hole(0, 4.1, 1, 1.15, 0.5, 1.9, 29, 1)]),
  Object.freeze([hole(-1.45, 2.55, 1.5, 0.35, 1.1, 1.9, 37), hole(0, 4.1, -1, 1.2, 0.5, 1.75, 41, 1)]),
  Object.freeze([hole(0, 4.1, -2, 0.9, 0.5, 1.25, 53, 1)])
])
export const BOILER_HOLE = hole(-0.65, 2.6, 1.65, 0.55, 0.7, 1.1, 67)

export function createDamageUniforms(holes = []) {
  const padded = [...holes]
  while (padded.length < 4) padded.push(hole(10000, 10000, 10000, 0, 0, 0, 0))
  return { uHoles: { value: padded }, uTime: { value: 0 }, uRift: { value: 1 } }
}

const declarations = /* glsl */ `
  struct EndingHole { vec3 center; vec3 halfSize; float seed; float roof; };
  uniform EndingHole uHoles[4];
  uniform float uTime;
  uniform float uRift;
  varying vec3 vDamageLocal;
  float damageHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  vec2 damageSite(vec2 p) { return vec2(damageHash(p), damageHash(p + 17.4)); }
  float damageNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(damageHash(i),damageHash(i+vec2(1,0)),f.x),
      mix(damageHash(i+vec2(0,1)),damageHash(i+1.0),f.x),f.y);
  }
  float damageCells(vec2 p) {
    vec2 cell = floor(p), f = fract(p); float first = 10.0, second = 10.0;
    for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++) {
      vec2 g=vec2(float(x),float(y)); vec2 d=g+damageSite(cell+g)-f;
      float distanceToSite=dot(d,d);
      if(distanceToSite<first) { second=first; first=distanceToSite; }
      else second=min(second,distanceToSite);
    }
    return sqrt(second)-sqrt(first);
  }
`

export function patchTimeDamage(material, uniforms) {
  material.side = THREE.DoubleSide
  material.userData.endingTimeDamage = uniforms
  material.customProgramCacheKey = () => 'ending-time-damage-v1'
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = 'varying vec3 vDamageLocal;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vDamageLocal = transformed;
      #ifdef USE_INSTANCING
        vDamageLocal = (instanceMatrix * vec4(transformed,1.0)).xyz;
      #endif
    `)
    shader.fragmentShader = declarations + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float damageRim=0.0, damageHalo=0.0, damageCracks=0.0;
      for(int h=0;h<4;h++) {
        EndingHole hole=uHoles[h]; vec3 offset=vDamageLocal-hole.center;
        vec2 q=hole.roof>0.5 ? offset.xz : offset.zy;
        vec2 extent=hole.roof>0.5 ? hole.halfSize.xz : hole.halfSize.zy;
        float slab=hole.roof>0.5 ? abs(offset.y)-hole.halfSize.y : abs(offset.x)-hole.halfSize.x;
        float tear=(damageNoise(q*7.0+hole.seed)-0.5)*0.28
          +(damageNoise(q*19.0-hole.seed)-0.5)*0.1;
        float edge=max(abs(q.x)-extent.x,abs(q.y)-extent.y)+tear;
        if(slab<0.0 && edge<0.0) discard;
        float nearSurface=1.0-smoothstep(0.0,0.2,slab);
        damageRim=max(damageRim,(1.0-smoothstep(0.015,0.06,abs(edge)))*nearSurface);
        damageHalo=max(damageHalo,exp(-max(edge,0.0)*9.0)*nearSurface*step(0.0,edge));
        float spread=(1.0-smoothstep(0.25,${CRACK_REACH.toFixed(1)},edge))*step(0.0,edge)*nearSurface;
        float cells=damageCells(q*2.4+hole.seed);
        damageCracks=max(damageCracks,(1.0-smoothstep(0.012,0.045,cells))*spread);
      }
      float pulse=0.87+0.09*sin(uTime*2.1)+0.04*sin(uTime*13.7);
      vec3 riftBlue=vec3(0.10224,0.47932,1.0);
      float fresnel=pow(1.0-abs(dot(normal,normalize(vViewPosition))),3.0);
      totalEmissiveRadiance += uRift*(riftBlue*(damageRim*3.5+damageHalo*0.45+damageCracks*1.9)*pulse
        +vec3(0.04667,0.20508,1.0)*fresnel*0.15);
      if(!gl_FrontFacing) { diffuseColor.rgb*=0.12; totalEmissiveRadiance*=0.18; }
    `)
  }
  material.needsUpdate = true
  return material
}

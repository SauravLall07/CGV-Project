import * as THREE from 'three'

export const RIM_COLOR = 0x5ab8ff
export const FRESNEL_COLOR = 0x3d7dff
export const TORN_TOOTH_REACH = 0.3
export const EDGE_WIDTH = 0.05
export const HALO_WIDTH = 0.22
export const METAL_WIDTH = 0.05
const hole = (x, y, z, hx, hy, hz, seed, roof = 0) => Object.freeze({
  center: new THREE.Vector3(x, y, z), halfSize: new THREE.Vector3(hx, hy, hz), seed, roof })
// roof=2 unfolds the roof and camera-facing wall into ONE continuous tear field.
// Widths include the large teeth. +Z is the front, ending at approximately z=10.
export const REAR_OPENING = hole(-1.45, 3.55, -4.2, 0.4, 1.65, 1.45, 11, 2)
export const LARGE_OPENING = hole(-1.45, 3.55, -1, 0.4, 1.65, 2.45, 23, 2)
export const THIRD_OPENING = hole(-1.45, 3.55, 1.5, 0.4, 1.65, 1.95, 37, 2)
export const SMALL_OPENING = hole(-1.45, 2.7, -5, 0.4, 0.55, 0.65, 41)
export const REAR_CARRIAGE_OPENING = hole(-1.45, 3.55, -2, 0.4, 1.65, 1.65, 53, 2)
export const CARRIAGE_HOLES = Object.freeze([
  Object.freeze([REAR_OPENING]), Object.freeze([LARGE_OPENING]),
  Object.freeze([THIRD_OPENING, SMALL_OPENING]), Object.freeze([REAR_CARRIAGE_OPENING])
])
export const BOILER_HOLE = hole(-0.65, 2.6, 1.65, 0.6, 0.55, 0.95, 67)
export const CAB_HOLE = hole(-1.3, 3.25, -2.2, 0.4, 1.25, 0.8, 79, 2)

export function createDamageUniforms(holes = []) {
  const padded = [...holes]
  while (padded.length < 4) padded.push(hole(10000, 10000, 10000, 0, 0, 0, 0))
  return { uHoles: { value: padded }, uTime: { value: 0 }, uRift: { value: 1 } }
}

// Shared by surface and silhouette shaders so the hull cannot fill a torn opening.
export const DAMAGE_DECLARATIONS = /* glsl */ `
  struct EndingHole { vec3 center; vec3 halfSize; float seed; float roof; };
  uniform EndingHole uHoles[4];
  uniform float uTime;
  uniform float uRift;
  varying vec3 vDamageLocal;
  float damageHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float damageTeeth(float p, float seed) {
    float i=floor(p); float f=fract(p);
    return mix(damageHash(vec2(i,seed)),damageHash(vec2(i+1.0,seed)),f)*2.0-1.0;
  }
  vec2 damageEdge(vec3 position, EndingHole hole) {
    vec3 offset=position-hole.center;
    vec2 q=offset.zy, extent=hole.halfSize.zy;
    float slab=abs(offset.x)-hole.halfSize.x;
    if(hole.roof>1.5) {
      // A shared unfolded coordinate crosses from the wall onto the roof.
      q.y+=max(0.0,position.x-hole.center.x);
      slab=max(position.x-0.25,min(abs(offset.x)-hole.halfSize.x,3.45-position.y));
    } else if(hole.roof>0.5) {
      q=offset.xz; extent=hole.halfSize.xz;
      slab=abs(offset.y)-hole.halfSize.y;
    }
    float toothX=0.30*damageTeeth(q.y*2.3,hole.seed);
    float toothY=0.30*damageTeeth(q.x*2.1,hole.seed+7.0);
    float edge=max(abs(q.x)-extent.x+toothX,abs(q.y)-extent.y+toothY);
    return vec2(edge,slab);
  }
`

export function patchTimeDamage(material, uniforms) {
  material.side = THREE.DoubleSide
  material.userData.endingTimeDamage = uniforms
  material.customProgramCacheKey = () => 'ending-time-damage-v2'
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
    shader.fragmentShader = DAMAGE_DECLARATIONS + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float damageRim=0.0, damageHalo=0.0, damageMetal=0.0;
      for(int h=0;h<4;h++) {
        vec2 field=damageEdge(vDamageLocal,uHoles[h]);
        float edge=field.x;
        if(field.y<0.0 && edge<0.0) discard;
        float nearSurface=1.0-smoothstep(0.0,0.05,field.y);
        damageRim=max(damageRim,(1.0-smoothstep(0.04,0.05,edge))*nearSurface);
        damageHalo=max(damageHalo,(1.0-smoothstep(0.05,0.27,edge))*nearSurface);
        damageMetal=max(damageMetal,(1.0-smoothstep(0.10,0.11,edge))*nearSurface);
      }
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.254,0.275,0.305),damageMetal);
      float pulse=0.94+0.06*sin(uTime*1.7);
      totalEmissiveRadiance+=uRift*vec3(0.10224,0.47932,1.0)*(damageRim*3.5+damageHalo*0.7)*pulse;
      if(!gl_FrontFacing) { diffuseColor.rgb*=0.12; totalEmissiveRadiance*=0.12; }
    `)
  }
  material.needsUpdate = true
  return material
}

import * as THREE from 'three'

export const RIM_COLOR = 0x5ab8ff
export const TORN_TOOTH_REACH = 0.3
export const EDGE_WIDTH = 0.025
export const HALO_WIDTH = 0.035
export const METAL_WIDTH = 0.05
export const AGING_REACH = 4

export const LAMP_FLICKER_GLSL = /* glsl */ `
  float endingLampFlicker(float time,float seed) {
    float tick=floor(time*8.0);
    float jump=fract(sin(tick*12.9898+seed*7.17)*43758.5453);
    return mix(0.12,1.0,smoothstep(0.15,0.38,jump))*(0.92+0.08*sin(time*19.7+seed));
  }
`
const hole = (x, y, z, hx, hy, hz, seed, roof = 0, clean = 0) => Object.freeze({
  center: new THREE.Vector3(x, y, z), halfSize: new THREE.Vector3(hx, hy, hz), seed, roof, clean })
export const ENDING_DOOR_HOLE = hole(-1.45, 2.6, 7.5, 0.4, 1.05, 0.65, 0, 0, 1)
// roof=2 unfolds the roof and camera-facing wall into ONE continuous tear field.
// Widths include the large teeth. +Z is the front, ending at approximately z=10.
// A five-metre cut cannot cover 35% of a 20-metre side. The rear-only cuts
// are widened to 8.4 m to satisfy the area floor while reserving the front.
export const REAR_OPENING = hole(-1.45, 3.0, -5, 0.4, 2.05, 4.2, 11, 2)
export const LARGE_OPENING = hole(-1.45, 3.0, -0.7, 0.4, 2.05, 4.4, 23, 2)
export const THIRD_OPENING = hole(-1.45, 3.0, 0.5, 0.4, 2.05, 4.0, 37, 2)
export const SMALL_OPENING = hole(-1.45, 2.7, -5, 0.4, 0.55, 0.65, 41)
export const REAR_CARRIAGE_OPENING = hole(-1.45, 3.0, -2, 0.4, 2.05, 4.2, 53, 2)
export const CARRIAGE_HOLES = Object.freeze([
  Object.freeze([REAR_OPENING]), Object.freeze([LARGE_OPENING]),
  Object.freeze([THIRD_OPENING, SMALL_OPENING]), Object.freeze([REAR_CARRIAGE_OPENING])
])
export const BOILER_HOLE = hole(-0.65, 2.6, 1.65, 0.6, 0.55, 0.95, 67)
export const CAB_HOLE = hole(-1.3, 3.25, -2.2, 0.4, 1.25, 0.8, 79, 2)

export function createDamageUniforms(holes = []) {
  const padded = [...holes]
  while (padded.length < 4) padded.push(hole(10000, 10000, 10000, 0, 0, 0, 0))
  return { uHoles: { value: padded }, uTime: { value: 0 }, uRift: { value: 1 },
    uSag: { value: 0 }, uProtectedFront: { value: 10000 } }
}

// Pivot-local field used by the ending's torn exterior and interior surfaces.
export const DAMAGE_DECLARATIONS = /* glsl */ `
  struct EndingHole { vec3 center; vec3 halfSize; float seed; float roof; float clean; };
  uniform EndingHole uHoles[4];
  uniform float uTime;
  uniform float uRift;
  uniform float uSag;
  uniform float uProtectedFront;
  varying vec3 vDamageLocal;
  float damageHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float damageTeeth(float p, float seed) {
    float i=floor(p); float f=fract(p);
    return mix(damageHash(vec2(i,seed)),damageHash(vec2(i+1.0,seed)),f)*2.0-1.0;
  }
  float agingNoise(vec2 p) {
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(damageHash(i),damageHash(i+vec2(1,0)),f.x),
      mix(damageHash(i+vec2(0,1)),damageHash(i+1.0),f.x),f.y);
  }
  vec2 damageEdge(vec3 position, EndingHole hole) {
    vec3 offset=position-hole.center;
    vec2 q=offset.zy, extent=hole.halfSize.zy;
    float slab=abs(offset.x)-hole.halfSize.x;
    if(hole.clean>0.5) return vec2(max(abs(q.x)-extent.x,abs(q.y)-extent.y),slab);
    if(hole.roof>1.5) {
      // A shared unfolded coordinate crosses from the wall onto the roof.
      q.y+=max(0.0,position.x-hole.center.x)*0.35;
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
  material.defines = { ...material.defines }
  if (material.emissiveIntensity > 0.5) material.defines.ENDING_LAMP = 1
  if (material.metalness > 0.45 && material.color.r > material.color.b * 1.4) material.defines.ENDING_BRASS = 1
  material.customProgramCacheKey = () => 'ending-time-aging-v3'
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = DAMAGE_DECLARATIONS + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vDamageLocal = transformed;
      #ifdef USE_INSTANCING
        vDamageLocal = (instanceMatrix * vec4(transformed,1.0)).xyz;
      #endif
      if(vDamageLocal.y>3.45 && vDamageLocal.z<uProtectedFront) {
        float sag=0.0;
        for(int h=0;h<4;h++) {
          if(uHoles[h].clean>0.5) continue;
          vec2 field=damageEdge(vDamageLocal,uHoles[h]);
          sag=max(sag,(1.0-smoothstep(0.0,1.4,abs(field.x)))*(1.0-smoothstep(0.0,0.3,field.y)));
        }
        transformed.y-=uSag*sag*(0.7+0.3*sin(vDamageLocal.z*2.7));
      }
    `)
    shader.fragmentShader = DAMAGE_DECLARATIONS + LAMP_FLICKER_GLSL + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float damageRim=0.0, damageHalo=0.0, damageMetal=0.0, ageAmount=0.0;
      for(int h=0;h<4;h++) {
        vec2 field=damageEdge(vDamageLocal,uHoles[h]);
        float edge=field.x;
        if(uHoles[h].clean>0.5) {
          if(field.y<0.0 && edge<0.0) discard;
          continue;
        }
        if(field.y<0.0 && edge<0.0 && vDamageLocal.z<uProtectedFront) discard;
        float nearSurface=1.0-smoothstep(0.0,0.05,field.y);
        damageRim=max(damageRim,(1.0-smoothstep(0.02,0.025,edge))*nearSurface);
        damageHalo=max(damageHalo,(1.0-smoothstep(0.025,0.035,edge))*nearSurface);
        damageMetal=max(damageMetal,(1.0-smoothstep(0.10,0.11,edge))*nearSurface);
        float organic=agingNoise(vDamageLocal.zy*0.85+float(h)*7.0);
        float spread=mix(1.5,4.0,smoothstep(1.0,5.0,uTime));
        float distanceToTear=length(max(field,vec2(0.0)));
        ageAmount=max(ageAmount,(1.0-smoothstep(0.0,spread,distanceToTear+organic*0.7)));
      }
      if(vDamageLocal.z>=uProtectedFront) {
        damageRim=0.0;damageHalo=0.0;damageMetal=0.0;ageAmount=0.0;
      }
      float patches=agingNoise(vDamageLocal.zy*1.4+vDamageLocal.x);
      float flakes=step(0.72,agingNoise(vDamageLocal.zy*8.0));
      vec3 faded=vec3(dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722)))*vec3(0.72,0.82,0.73);
      diffuseColor.rgb=mix(diffuseColor.rgb,faded,ageAmount*0.7);
      vec3 rust=mix(vec3(0.147,0.042,0.013),vec3(0.254,0.070,0.016),patches);
      float rustMask=ageAmount*smoothstep(0.35,0.75,patches+damageMetal*0.4);
      diffuseColor.rgb=mix(diffuseColor.rgb,rust,rustMask*0.8);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.22,0.26,0.22),flakes*ageAmount*0.35);
      diffuseColor.rgb*=1.0-ageAmount*(0.12+0.16*patches);
      #ifdef ENDING_BRASS
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.078,0.147,0.102),ageAmount*patches*0.7);
      #endif
      #ifdef ENDING_LAMP
        totalEmissiveRadiance*=mix(1.0,endingLampFlicker(uTime,vDamageLocal.z),uRift*ageAmount);
      #endif
      float pulse=0.72+0.16*sin(uTime*1.3)+0.12*sin(uTime*2.17+0.6);
      totalEmissiveRadiance+=uRift*vec3(0.10224,0.47932,1.0)*(damageRim*3.5+damageHalo*0.15)*pulse;
      if(!gl_FrontFacing) { diffuseColor.rgb*=0.12; totalEmissiveRadiance*=0.12; }
    `)
  }
  material.needsUpdate = true
  return material
}

export function patchEndingLamp(material, uniforms) {
  material.userData.endingLamp = uniforms
  material.customProgramCacheKey = () => 'ending-lamp-stutter-v1'
  material.onBeforeCompile = shader => {
    shader.uniforms.uTime = uniforms.uTime; shader.uniforms.uRift = uniforms.uRift
    shader.fragmentShader = 'uniform float uTime;uniform float uRift;\n' + LAMP_FLICKER_GLSL + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance*=mix(1.0,endingLampFlicker(uTime,2.1),uRift);')
  }
  return material
}

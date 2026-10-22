import * as THREE from 'three'

export const EXPLOSION_GROW = 0.35
export const EXPLOSION_HOLD = 0.15
export const EXPLOSION_FADE = 1
export const EXPLOSION_SECONDS = EXPLOSION_GROW+EXPLOSION_HOLD+EXPLOSION_FADE
const EDGE = 0.08, TURBULENCE = 0.04

export function createEndingExplosion() {
  const uniforms={uTime:{value:-1},uCentre:{value:new THREE.Vector2()},uAspect:{value:1},
    uRadius:{value:0},uOpacity:{value:0},uEdge:{value:EDGE},uTurbulence:{value:TURBULENCE},
    uCore:{value:new THREE.Color('#eaf6ff')},uBody:{value:new THREE.Color('#4aa8ff')}}
  const material=new THREE.ShaderMaterial({name:'ending-blue-explosion',uniforms,
    transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 vNdc;void main(){vNdc=position.xy;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:`
      uniform float uTime,uAspect,uRadius,uOpacity,uEdge,uTurbulence;
      uniform vec2 uCentre;uniform vec3 uCore,uBody;varying vec2 vNdc;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec2 p=(vNdc-uCentre)*vec2(uAspect,1.0);float d=length(p);
        float n=0.57*noise(p*9.0+uTime*3.0)+0.29*noise(p*21.0-uTime*5.0)+0.14*noise(p*43.0+uTime*7.0);
        float wave=d+(n*2.0-1.0)*uTurbulence;
        float alpha=(1.0-smoothstep(uRadius-uEdge,uRadius+uEdge,wave))*uOpacity;
        float core=1.0-smoothstep(0.0,max(0.01,uRadius*0.65),d);
        float ring=exp(-pow((wave-uRadius*0.86)/0.045,2.0))+0.6*exp(-pow((wave-uRadius*0.62)/0.035,2.0));
        vec3 color=mix(uBody,uCore,core)*(0.94+0.12*n)+uCore*ring*0.7;
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }`})
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material)
  mesh.name='ending-blue-explosion';mesh.frustumCulled=false;mesh.renderOrder=100;mesh.visible=false
  let peakRadius=1
  function configure(impact,camera) {
    const ndc=impact.clone().project(camera);uniforms.uCentre.value.set(ndc.x,ndc.y);uniforms.uAspect.value=camera.aspect
    peakRadius=0
    for(const x of [-1,1])for(const y of [-1,1])peakRadius=Math.max(peakRadius,Math.hypot((x-ndc.x)*camera.aspect,y-ndc.y))
    peakRadius+=EDGE+TURBULENCE+0.03
  }
  function update(time) {
    uniforms.uTime.value=time;mesh.visible=time>=0&&time<EXPLOSION_SECONDS
    const growth=THREE.MathUtils.smoothstep(time,0,EXPLOSION_GROW)
    uniforms.uRadius.value=peakRadius*growth
    uniforms.uOpacity.value=mesh.visible?1-THREE.MathUtils.smoothstep(time,EXPLOSION_GROW+EXPLOSION_HOLD,EXPLOSION_SECONDS):0
  }
  // Lower bound on shader opacity for ANY noise value, not a noise-free proxy.
  function guaranteedOpacity(x,y) {
    const d=Math.hypot((x-uniforms.uCentre.value.x)*uniforms.uAspect.value,y-uniforms.uCentre.value.y)+TURBULENCE
    return (1-THREE.MathUtils.smoothstep(d,uniforms.uRadius.value-EDGE,uniforms.uRadius.value+EDGE))*uniforms.uOpacity.value
  }
  function coverage() {
    let covered=0,total=0
    for(let x=0;x<=32;x++)for(let y=0;y<=18;y++){total++;if(guaranteedOpacity(x/16-1,y/9-1)>=0.95)covered++}
    const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>guaranteedOpacity(x,y))
    return {coveredFraction:covered/total,minimumCornerOpacity:Math.min(...corners),opacity:uniforms.uOpacity.value,visible:mesh.visible}
  }
  return {mesh,material,uniforms,configure,update,guaranteedOpacity,coverage}
}

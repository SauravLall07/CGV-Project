import * as THREE from 'three'

// All regions use image coordinates, with y measured down from the top.
export const PLUME_FLOW_STRENGTH = 0.020
export const MENU_FILM = {
  plume: [0.08, 0.22, 0.84, 0.50],
  moon: [0.915, 0.13, 0.04], cloudsA: [0, 0, 0.30, 0.25], cloudsB: [0.62, 0, 1, 0.30],
  mist: [0.22, 0.55, 0.80, 0.80], windows: [0.10, 0.475, 0.70, 0.505],
  headlamp: [0.795, 0.478], stars: [0.25, 0, 0.75, 0.22],
  plumeFlowStrength: PLUME_FLOW_STRENGTH, plumeBrightness: 0.14,
  plumeSpeedA: 0.010, plumeSpeedB: 0.017, plumePhaseSeconds: 19,
  plumeSpeedLarge: 0.006, plumeLargeCycles: 3, plumeLargeWeight: 0.65,
  plumeMinStrength: 0.85, plumeMaxStrength: 1,
  plumeLuminance: [0.45, 0.75], plumeLuminanceWeights: [0.2126, 0.7152, 0.0722],
  plumeFineFrequencyA: 22, plumeFineFrequencyB: 31,
  plumeNoiseCenter: 0.4375, plumeNoiseScale: 2,
  moonBreath: 0.12, moonSeconds: 6, cloudDrift: 0.004, cloudSeconds: 10,
  mistOpacity: 0.12, lightFlicker: 0.10, zoom: 0.02, zoomSeconds: 30, grain: 0.010,
  maskSoftness: 0.015, vignette: 0.22
}

export function createMenuFilm(texture) {
  const uniforms = { uImage: { value: texture }, uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uImageSize: { value: new THREE.Vector2(texture.image.width, texture.image.height) } }
  for (const [name, value] of Object.entries(MENU_FILM)) uniforms[`u${name[0].toUpperCase()}${name.slice(1)}`] = {
    value: Array.isArray(value) ? value.length === 4 ? new THREE.Vector4(...value)
      : value.length === 3 ? new THREE.Vector3(...value) : new THREE.Vector2(...value) : value }
  const material = new THREE.ShaderMaterial({ name: 'menu-film', uniforms, depthTest: false,
    depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `
      uniform sampler2D uImage;
      uniform vec2 uResolution,uImageSize,uHeadlamp;
      uniform vec3 uMoon;
      uniform vec4 uPlume,uCloudsA,uCloudsB,uMist,uWindows,uStars;
      uniform float uTime,uPlumeFlowStrength,uPlumeBrightness,uPlumeSpeedA,uPlumeSpeedB,uPlumePhaseSeconds;
      uniform float uPlumeSpeedLarge,uPlumeLargeCycles,uPlumeLargeWeight,uPlumeMinStrength,uPlumeMaxStrength;
      uniform float uPlumeFineFrequencyA,uPlumeFineFrequencyB,uPlumeNoiseCenter,uPlumeNoiseScale;
      uniform vec2 uPlumeLuminance;
      uniform vec3 uPlumeLuminanceWeights;
      uniform float uMoonBreath,uMoonSeconds,uCloudDrift,uCloudSeconds,uMistOpacity;
      uniform float uLightFlicker,uZoom,uZoomSeconds,uGrain,uMaskSoftness,uVignette;
      varying vec2 vUv;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<3;i++){v+=a*noise(p);p=p*2.03+7.1;a*=.5;}return v;}
      float region(vec2 p,vec4 r){vec2 a=smoothstep(r.xy-vec2(uMaskSoftness),r.xy+vec2(uMaskSoftness),p);
        vec2 b=1.-smoothstep(r.zw-vec2(uMaskSoftness),r.zw+vec2(uMaskSoftness),p);return a.x*a.y*b.x*b.y;}
      vec3 image(vec2 p){return texture2D(uImage,vec2(p.x,1.-p.y)).rgb;}
      void main(){
        float aspect=uResolution.x/max(uResolution.y,1.),ia=uImageSize.x/uImageSize.y;
        vec2 fit=vec2(min(1.,aspect/ia),min(1.,ia/aspect));
        float zoom=1.+uZoom*(.5-.5*cos(uTime*6.283185/uZoomSeconds));
        vec2 p=(vec2(vUv.x,1.-vUv.y)-.5)*fit/zoom+.5;
        vec3 original=image(p);float brightness=max(original.r,max(original.g,original.b));
        float white=smoothstep(.15,.8,brightness);
        // p is the cropped/zoomed IMAGE coordinate, with y measured from top.
        float luminance=dot(original,uPlumeLuminanceWeights);
        float smoke=smoothstep(uPlumeLuminance.x,uPlumeLuminance.y,luminance);
        float plume=region(p,uPlume)*smoke;
        // Advect left: features of f(x+vt) travel toward decreasing x.
        vec2 a=p+vec2(uTime*uPlumeSpeedA,0.);
        vec2 b=p+vec2(uTime*uPlumeSpeedB,0.);
        vec2 flowA=vec2(fbm(a*uPlumeFineFrequencyA),fbm(a*uPlumeFineFrequencyA+9.))-uPlumeNoiseCenter;
        vec2 flowB=vec2(fbm(b*uPlumeFineFrequencyB+4.),fbm(b*uPlumeFineFrequencyB+17.))-uPlumeNoiseCenter;
        vec2 large=(p+vec2(uTime*uPlumeSpeedLarge,0.))*uPlumeLargeCycles/(uPlume.z-uPlume.x);
        vec2 flowLarge=vec2(fbm(large),fbm(large+9.))-uPlumeNoiseCenter;
        float phase=.5-.5*cos(uTime*6.283185/uPlumePhaseSeconds);
        vec2 flow=mix(mix(flowA,flowB,phase),flowLarge,uPlumeLargeWeight)*uPlumeNoiseScale;
        flow/=max(1.,length(flow));
        float turbulence=mix(uPlumeMinStrength,uPlumeMaxStrength,smoothstep(uPlume.x,uPlume.z,p.x));
        vec2 q=p+flow*uPlumeFlowStrength*plume*turbulence;
        float clouds=max(region(p,uCloudsA),region(p,uCloudsB))*white;
        q.x+=sin(uTime*6.283185/uCloudSeconds)*uCloudDrift*clouds;
        q=clamp(q,vec2(0.),vec2(1.));
        vec3 color=image(q)*(1.+plume*uPlumeBrightness*sin(uTime*.8+fbm(p*30.)*6.28));
        vec2 md=(p-uMoon.xy)*vec2(1.,uImageSize.y/uImageSize.x);
        float halo=exp(-dot(md,md)/(uMoon.z*uMoon.z*2.))*0.07;
        color+=halo*(1.+uMoonBreath*sin(uTime*6.283185/uMoonSeconds));
        float mist=region(p,uMist)*uMistOpacity*fbm(p*12.+vec2(uTime*.025,-uTime*.015));
        color=mix(color,vec3(.72),mist);
        float lights=region(p,uWindows)*white;
        float flicker=sin(uTime*2.1)*sin(uTime*3.7)*uLightFlicker;
        color+=lights*vec3(.13,.09,.035)*(1.+flicker);
        vec2 hd=(p-uHeadlamp)*vec2(1.,uImageSize.y/uImageSize.x);
        color+=exp(-dot(hd,hd)/.00012)*vec3(.22,.16,.07)*(1.+flicker);
        vec2 cell=floor(p*vec2(360.,200.));vec2 star=fract(p*vec2(360.,200.))-.5;
        float points=(1.-smoothstep(.02,.10,length(star)))*step(.995,hash(cell));
        color+=points*region(p,uStars)*(1.-smoothstep(.015,.10,brightness))*(.5+.5*sin(uTime*.7+hash(cell)*6.28));
        color*=1.-uVignette*smoothstep(.2,.75,length(vUv-.5));
        color+=(hash(floor(vUv*uResolution)+floor(uTime*24.))-.5)*uGrain;
        gl_FragColor=vec4(max(color,vec3(0)),1.);
        #include <colorspace_fragment>
      }` })
  return { material, uniforms }
}

import * as THREE from 'three'

export const SPARK_COUNT = 216
export const SPARK_LIFETIME_MIN = 0.25
export const SPARK_LIFETIME_MAX = 0.6
export function brakeIntensity(progress) {
  return progress > 0 && progress < 1 ? Math.sin(Math.PI * progress) : 0
}

export function createEndingSparks(parent, vehicles, railOffset) {
  const geometry = new THREE.PlaneGeometry(1, 1)
  const seeds = new Float32Array(SPARK_COUNT * 4), contacts = new Float32Array(SPARK_COUNT * 3)
  const wheelSites = [[-0.8, 1, 2.8, 4.4, 5.25], [-8.25, -5.75, 5.75, 8.25], [-8.25, -5.75, 5.75, 8.25]]
  for (let i = 0; i < SPARK_COUNT; i++) {
    const vehicle = i % 3, seed = ((i * 73 + 19) % 997) / 997
    seeds.set([seed, vehicle, 0.25 + 0.35 * ((i * 37 % 211) / 211), (i * 53 % 199) / 199], i * 4)
    contacts.set([(i % 2 ? 1 : -1) * railOffset, 0.06, wheelSites[vehicle][Math.floor(i / 3) % wheelSites[vehicle].length]], i * 3)
  }
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4))
  geometry.setAttribute('aContact', new THREE.InstancedBufferAttribute(contacts, 3))
  const transforms = vehicles.map(() => new THREE.Matrix4())
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uVehicles: { value: transforms },
      uHot: { value: new THREE.Color(0xffd27a) }, uCool: { value: new THREE.Color(0xff6a1a) } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    side: THREE.DoubleSide, forceSinglePass: true,
    vertexShader: `
      attribute vec4 aSeed; attribute vec3 aContact;
      uniform float uTime; uniform float uIntensity; uniform mat4 uVehicles[3];
      varying float vLife; varying vec2 vUv;
      void main(){
        float age=mod(uTime+aSeed.x*aSeed.z,aSeed.z);
        vLife=age/aSeed.z; vUv=uv;
        vec3 velocity=vec3((aSeed.w-0.5)*2.0,1.8+aSeed.x*2.8,-3.0-aSeed.w*5.0);
        vec3 p=aContact+velocity*age+vec3(0.0,-4.9*age*age,0.0);
        vec4 view=modelViewMatrix*uVehicles[int(aSeed.y)]*vec4(p,1.0);
        vec3 tangent=mat3(modelViewMatrix*uVehicles[int(aSeed.y)])*(velocity+vec3(0.0,-9.8*age,0.0));
        vec2 along=normalize(tangent.xy+vec2(0.0001)), across=vec2(-along.y,along.x);
        view.xy+=(across*position.x*0.035+along*position.y*(0.12+0.22*aSeed.x))*step(0.001,uIntensity);
        gl_Position=projectionMatrix*view;
      }
    `,
    fragmentShader: `
      uniform float uIntensity; uniform vec3 uHot; uniform vec3 uCool;
      varying float vLife; varying vec2 vUv;
      void main(){
        float shape=(1.0-abs(vUv.x*2.0-1.0))*(1.0-abs(vUv.y*2.0-1.0));
        gl_FragColor=vec4(mix(uHot,uCool,vLife)*2.0,shape*(1.0-vLife)*uIntensity);
      }
    `
  })
  const mesh = new THREE.InstancedMesh(geometry, material, SPARK_COUNT)
  mesh.name = 'ending-brake-sparks'; mesh.frustumCulled = false
  mesh.userData.endingDecoration = true; parent.add(mesh)
  const inverse = new THREE.Matrix4()
  function update(delta, progress) {
    material.uniforms.uTime.value += Math.max(0, delta)
    material.uniforms.uIntensity.value = brakeIntensity(progress)
    parent.updateWorldMatrix(true, false); inverse.copy(parent.matrixWorld).invert()
    for (let i = 0; i < vehicles.length; i++) {
      vehicles[i].updateWorldMatrix(true, false)
      transforms[i].multiplyMatrices(inverse, vehicles[i].matrixWorld)
    }
  }
  update(0, -1)
  return { mesh, material, update }
}

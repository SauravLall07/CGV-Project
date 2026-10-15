// L3 cinematic only: the side view includes the locomotive and both ends of
// the missing track, rather than leaving the break behind the camera.
export function setWreckStopShot(camera, target, seconds) {
  camera.position.set(target.x + 18 + Math.min(seconds, 3) * 0.5, 9, target.z - 15)
  camera.lookAt(target.x, 0, target.z - 13)
}

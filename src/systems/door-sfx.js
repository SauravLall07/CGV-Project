import { playSfx } from './sound-effects.js'
export const playDoorOpen = (volume = 0.5) => playSfx('door-open', { volume })
export const playDoorClose = (volume = 0.5) => playSfx('door-close', { volume })

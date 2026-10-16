import { sound, playSfx } from './sound-effects.js'
// Keep the existing public API; share caches, concurrency and lifecycle.
const names = { SLOW: 'ability-slow', FREEZE: 'ability-freeze', REWIND: 'ability-rewind', GHOST: 'ability-ghost' }
export const preloadAbilitySfx = () => sound.preload(Object.values(names))
export function playAbilitySfx(kind) {
  if (names[kind]) playSfx(names[kind], { volume: 0.85, priority: 3, cooldown: 0.12 })
}

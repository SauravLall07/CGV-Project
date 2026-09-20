// Input blockers can overlap. Centralising precedence prevents a finished
// respawn from enabling controls over a menu, transition, credits, or cinematic.
export function resolveInputState({ gameStarted, creditsOpen, paused, transitioning, caught, cinematic }) {
  if (!gameStarted) return 'TITLE'
  if (creditsOpen) return 'CREDITS'
  if (paused) return 'PAUSED'
  if (transitioning) return 'TRANSITION'
  if (caught) return 'CAUGHT'
  if (cinematic) return 'CINEMATIC'
  return 'PLAYING'
}

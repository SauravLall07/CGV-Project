// Per-level gameplay countdown limits (seconds). Ending / Complete have none.
export const LEVEL_TIME_LIMITS = Object.freeze({
  Boarding: 600, // 10:00
  MovingHeist: 450, // 07:30
  Timewreck: 300 // 05:00
})

export const LEVEL_TIME_URGENT_SECONDS = 30

export function getLevelTimeLimit(state) {
  const limit = LEVEL_TIME_LIMITS[state]
  return Number.isFinite(limit) ? limit : 0
}

export function formatLevelClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds - 1e-9))
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function levelTimeBriefing(state) {
  const limit = getLevelTimeLimit(state)
  if (!limit) return null
  return `TIME LIMIT ${formatLevelClock(limit)} — complete this stage before the clock runs out.`
}

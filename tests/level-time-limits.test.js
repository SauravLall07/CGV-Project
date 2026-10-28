import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  LEVEL_TIME_LIMITS,
  LEVEL_TIME_URGENT_SECONDS,
  formatLevelClock,
  getLevelTimeLimit,
  levelTimeBriefing
} from '../src/core/level-time-limits.js'

test('level time limits match the design brief', () => {
  assert.equal(LEVEL_TIME_LIMITS.Boarding, 600)
  assert.equal(LEVEL_TIME_LIMITS.MovingHeist, 450)
  assert.equal(LEVEL_TIME_LIMITS.Timewreck, 300)
  assert.equal(getLevelTimeLimit('Boarding'), 600)
  assert.equal(getLevelTimeLimit('MovingHeist'), 450)
  assert.equal(getLevelTimeLimit('Timewreck'), 300)
  assert.equal(getLevelTimeLimit('Ending'), 0)
  assert.equal(getLevelTimeLimit('Complete'), 0)
  assert.equal(LEVEL_TIME_URGENT_SECONDS, 30)
})

test('formatLevelClock and briefing copy stay stable', () => {
  assert.equal(formatLevelClock(600), '10:00')
  assert.equal(formatLevelClock(450), '07:30')
  assert.equal(formatLevelClock(300), '05:00')
  assert.equal(formatLevelClock(30), '00:30')
  assert.equal(formatLevelClock(0.2), '00:01')
  assert.equal(formatLevelClock(0), '00:00')
  assert.match(levelTimeBriefing('Boarding'), /10:00/)
  assert.match(levelTimeBriefing('MovingHeist'), /07:30/)
  assert.match(levelTimeBriefing('Timewreck'), /05:00/)
  assert.equal(levelTimeBriefing('Ending'), null)
})

test('HUD countdown is labelled TIME REMAINING and no longer Chrono-warps', () => {
  const hudSource = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8')
  assert.match(hudSource, /TIME REMAINING/)
  assert.match(hudSource, /displayRemaining/)
  assert.match(hudSource, /function updateRunTimer\(\{ remaining/)
  assert.doesNotMatch(hudSource, /function updateRunTimer\(\{ elapsed/)
  assert.match(hudSource, /urgent/)
})

test('main restarts only the current level when the countdown expires', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(main, /levelTimeRemaining = Math\.max\(0, levelTimeRemaining - delta\)/)
  assert.match(main, /levelManager\.restart\(\)/)
  assert.match(main, /beginLevelCountdown\(state\)/)
  assert.match(main, /announceLevelCountdown/)
  assert.doesNotMatch(main, /levelManager\.enter\('Boarding'\)/)
})

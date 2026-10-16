import test from 'node:test'
import assert from 'node:assert/strict'
import { createMovementAudio } from '../src/systems/movement-audio.js'

function fixture() {
  const events = [], handles = []
  const audio = createMovementAudio((name, options) => {
    events.push({ name, ...options })
    const handle = { stop() { this.stopped = true } }
    handles.push(handle); return handle
  })
  const tick = overrides => audio.update({ delta: 1 / 60, dx: 0, dz: 0,
    airborne: false, wasAirborne: false, ...overrides })
  return { audio, events, handles, tick }
}
test('walking, running and crouching do not emit footsteps on any surface', () => {
  const walk = fixture(), run = fixture(), crouch = fixture()
  for (let i = 0; i < 120; i++) {
    walk.tick({ dz: 4 / 60, surface: 'wood' })
    run.tick({ dz: 6.8 / 60, running: true, surface: 'metal' })
    crouch.tick({ dz: 1.68 / 60, crouching: true, surface: 'carpet' })
  }
  const steps = f => f.events.filter(e => e.name.startsWith('step-'))
  assert.equal(steps(walk).length, 0)
  assert.equal(steps(run).length, 0)
  assert.equal(steps(crouch).length, 0)
  assert.deepEqual(crouch.events.map(e => e.name), ['cloth'], 'posture feedback remains')
})
test('starting, stopping and jumping remain silent', () => {
  const f = fixture()
  for (let i = 0; i < 100; i++) f.tick()
  assert.equal(f.events.length, 0)
  f.tick({ dz: 1.4 })
  f.tick()
  f.tick({ dz: 1.4 })
  f.tick({ dz: 0.1, airborne: true, jumpStarted: true })
  for (let i = 0; i < 60; i++) f.tick({ dz: 0.1, airborne: true, wasAirborne: true })
  assert.equal(f.events.length, 0)
})
test('landings require confirmed airborne transitions; large impacts are louder and resets are silent', () => {
  const f = fixture()
  f.tick({ wasAirborne: true, impact: 6.4 })
  f.tick({ impact: 6.4 })
  f.tick({ wasAirborne: true, impact: 12 })
  f.tick({ wasAirborne: true, impact: 0.5 })
  assert.deepEqual(f.events.map(e => e.name), ['land', 'land'])
  assert.ok(f.events[1].volume > f.events[0].volume)
  const count = f.events.length
  f.audio.reset(); f.tick({ dz: 20 })
  assert.equal(f.events.length, count, 'teleports cannot emit a footstep burst')
})

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
test('cadence uses resolved distance, accelerates running, quietens crouch and varies surfaces', () => {
  const walk = fixture(), run = fixture(), crouch = fixture()
  for (let i = 0; i < 120; i++) {
    walk.tick({ dz: 4 / 60, surface: 'wood' })
    run.tick({ dz: 6.8 / 60, running: true, surface: 'metal' })
    crouch.tick({ dz: 1.68 / 60, crouching: true, surface: 'carpet' })
  }
  const steps = f => f.events.filter(e => e.name.startsWith('step-'))
  assert.ok(steps(run).length > steps(walk).length)
  assert.ok(steps(crouch).length < steps(walk).length)
  assert.ok(steps(crouch)[0].volume < steps(walk)[0].volume)
  assert.equal(steps(run)[0].name, 'step-metal')
  assert.equal(steps(walk)[0].name, 'step-wood')
  assert.equal(new Set(steps(walk).map(e => e.rate)).size, 4)
})
test('blocked/stopped movement and airborne travel have no footsteps; current step stops immediately', () => {
  const f = fixture()
  for (let i = 0; i < 100; i++) f.tick()
  assert.equal(f.events.length, 0)
  f.tick({ dz: 1.4 })
  assert.equal(f.events.length, 1)
  f.tick()
  assert.equal(f.handles[0].stopped, true)
  f.tick({ dz: 1.4 })
  f.tick({ dz: 0.1, airborne: true, jumpStarted: true })
  assert.equal(f.handles[1].stopped, true)
  for (let i = 0; i < 60; i++) f.tick({ dz: 0.1, airborne: true, wasAirborne: true })
  assert.equal(f.events.filter(e => e.name === 'jump').length, 1)
  assert.equal(f.events.filter(e => e.name.startsWith('step-')).length, 2)
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

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  brightnessToExposure, DEFAULT_OPTIONS, OPTION_DEFS
} from '../src/core/settings.js'

const STORAGE_KEY = 'chrono-express:settings:v1'
let importSequence = 0

function storageWith(payload) {
  let raw = payload === null ? null : JSON.stringify(payload)
  globalThis.window = {
    localStorage: {
      getItem: (key) => key === STORAGE_KEY ? raw : null,
      setItem: (key, value) => {
        if (key === STORAGE_KEY) raw = value
      }
    }
  }
  return { read: () => JSON.parse(raw) }
}

async function loadSettings(payload) {
  const storage = storageWith(payload)
  const module = await import(`../src/core/settings.js?brightness-test=${++importSequence}`)
  return { ...module, storage }
}

test('brightness percentages map to the recalibrated exposure points', () => {
  const expected = [
    [0, 0.4],
    [50, 1.3],
    [100, 2.2],
    [150, 3.3],
    [200, 4.4]
  ]
  for (const [percentage, exposure] of expected) {
    assert.ok(Math.abs(brightnessToExposure(percentage) - exposure) < 1e-12,
      `${percentage}% should map to ${exposure} exposure`)
  }
  assert.equal(brightnessToExposure(-10), 0.4)
  assert.equal(brightnessToExposure(210), 4.4)
})

test('brightness UI uses the displayed zero-to-two-hundred percent scale', () => {
  const definition = OPTION_DEFS.find((entry) => entry.id === 'brightness')
  assert.equal(DEFAULT_OPTIONS.brightness, 100)
  assert.equal(definition.min, 0)
  assert.equal(definition.max, 200)
  assert.equal(definition.step, 'any')
  assert.equal(definition.format(0), '0%')
  assert.equal(definition.format(100), '100%')
  assert.equal(definition.format(200), '200%')
})

test('legacy maximum save migrates to 100% without changing exposure', async () => {
  const { settings, storage } = await loadSettings({
    options: { brightness: 2.2 },
    bindings: {},
    bindingsVersion: 2
  })
  assert.equal(settings.get('brightness'), 100)
  assert.equal(brightnessToExposure(settings.get('brightness')), 2.2)
  assert.equal(storage.read().brightnessVersion, 2)
  assert.equal(storage.read().options.brightness, 100)
})

test('legacy default save retains its exact existing exposure', async () => {
  const { settings } = await loadSettings({
    options: { brightness: 1.15 },
    bindings: {},
    bindingsVersion: 2
  })
  assert.ok(Math.abs(brightnessToExposure(settings.get('brightness')) - 1.15) < 1e-12)
})

test('current saves keep their percentages and persist extended values', async () => {
  const { settings, storage } = await loadSettings({
    options: { brightness: 150 },
    bindings: {},
    bindingsVersion: 2,
    brightnessVersion: 2
  })
  assert.equal(settings.get('brightness'), 150)
  settings.set('brightness', 200)
  assert.equal(storage.read().options.brightness, 200)
  assert.equal(storage.read().brightnessVersion, 2)
})

test('reset restores the new 100% reference', async () => {
  const { settings } = await loadSettings(null)
  settings.set('brightness', 0)
  settings.resetOptions()
  assert.equal(settings.get('brightness'), 100)
  assert.equal(brightnessToExposure(settings.get('brightness')), 2.2)
})

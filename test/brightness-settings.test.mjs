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
    [50, 0.775],
    [100, 1.15],
    [150, 1.675],
    [200, 2.2]
  ]
  for (const [percentage, exposure] of expected) {
    assert.ok(Math.abs(brightnessToExposure(percentage) - exposure) < 1e-12,
      `${percentage}% should map to ${exposure} exposure`)
  }
  assert.equal(brightnessToExposure(-10), 0.4)
  assert.equal(brightnessToExposure(210), 2.2)
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

test('legacy maximum save migrates to 200% without changing exposure', async () => {
  const { settings, storage } = await loadSettings({
    options: { brightness: 2.2 },
    bindings: {},
    bindingsVersion: 2
  })
  assert.equal(settings.get('brightness'), 200)
  assert.equal(brightnessToExposure(settings.get('brightness')), 2.2)
  assert.equal(storage.read().brightnessVersion, 2)
  assert.equal(storage.read().options.brightness, 200)
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

test('reset restores the calibrated 100% reference', async () => {
  const { settings } = await loadSettings(null)
  settings.set('brightness', 0)
  settings.resetOptions()
  assert.equal(settings.get('brightness'), 100)
  assert.equal(brightnessToExposure(settings.get('brightness')), 1.15)
})


test('legacy exposures across both segments survive migration and reload', async () => {
  for (const exposure of [0.4, 0.775, 1.15, 1.675, 2.2]) {
    const migrated = await loadSettings({ options: { brightness: exposure } })
    assert.ok(Math.abs(brightnessToExposure(migrated.settings.get('brightness')) - exposure) < 1e-12)
    const reloaded = await loadSettings(migrated.storage.read())
    assert.equal(reloaded.settings.get('brightness'), migrated.settings.get('brightness'))
  }
})

test('saved percentages use the corrected curve without resetting other preferences', async () => {
  const { settings } = await loadSettings({
    brightnessVersion: 2,
    options: { brightness: 78, bloom: false, shadowQuality: 'off' }
  })
  assert.equal(settings.get('brightness'), 78)
  assert.ok(Math.abs(brightnessToExposure(78) - 0.985) < 1e-12)
  assert.equal(settings.get('bloom'), false)
  assert.equal(settings.get('shadowQuality'), 'off')
})

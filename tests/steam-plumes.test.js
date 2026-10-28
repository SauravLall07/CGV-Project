import test from 'node:test'
import assert from 'node:assert/strict'
import { createSteamPlume } from '../src/environment/steam-plumes.js'

test('steam plume stays bounded and fades existing puffs after emission stops', () => {
  const plume = createSteamPlume({
    count: 24,
    life: 0.8,
    emission: time => time < 1 ? 1 : 0,
    sample: (age, seed, density, out) => out.set(seed + age, density, -age)
  })
  const { geometry, material } = plume.points

  plume.update(0.35)
  assert.equal(geometry.attributes.position.count, 24)
  assert.ok(geometry.attributes.aOpacity.array.some(value => value > 0))
  assert.ok([...geometry.attributes.position.array].every(Number.isFinite))
  assert.equal(material.transparent, true)
  assert.equal(material.depthTest, true)
  assert.equal(material.depthWrite, false)
  const positions = [...geometry.attributes.position.array]
  plume.update(0.55)
  assert.ok(geometry.attributes.position.array.some((value, i) => value !== positions[i]))

  plume.update(4)
  assert.ok(geometry.attributes.aOpacity.array.every(value => value === 0))
  geometry.dispose()
  material.dispose()
})

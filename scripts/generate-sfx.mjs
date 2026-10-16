// Original deterministic sound design for Chrono Express. No external samples.
// Generated assets and this generator are dedicated to CC0-1.0.
import fs from 'node:fs/promises'
const dir = new URL('../src/assets/audio/sfx/', import.meta.url)
const rate = 22050
let seed = 49013
const noise = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2147483648 - 1 }
const sine = (f, t) => Math.sin(2 * Math.PI * f * t)
const hit = (t, f, decay, grit = 0.2) => t < 0 ? 0 : Math.exp(-t * decay) * (sine(f, t) * (1 - grit) + noise() * grit)
const chime = (t, notes) => notes.reduce((v, f, i) => v + hit(t - i * 0.085, f, 10, 0.01) * 0.32, 0)
const designs = {
  'step-stone': [0.16, t => hit(t, 115, 35, 0.65) * 0.65],
  'step-metal': [0.22, t => hit(t, 170, 28, 0.35) * 0.48 + hit(t, 670, 35, 0.1) * 0.12],
  'step-wood': [0.17, t => hit(t, 195, 38, 0.3) * 0.6],
  'step-carpet': [0.12, t => hit(t, 80, 48, 0.4) * 0.35],
  jump: [0.23, t => hit(t, 140 + 550 * t, 19, 0.5) * 0.4],
  land: [0.32, t => hit(t, 65, 18, 0.35) * 0.75 + hit(t - 0.03, 190, 30, 0.6) * 0.22],
  cloth: [0.18, t => noise() * Math.exp(-t * 28) * 0.16],
  'door-open': [0.72, t => hit(t, 85, 20, 0.4) * 0.6 + Math.sin(Math.PI * t / 0.72) ** 2 * (noise() * 0.13 + sine(95 + t * 70, t) * 0.09)],
  'door-close': [0.66, t => Math.sin(Math.PI * t / 0.66) ** 2 * noise() * 0.12 + hit(t - 0.48, 70, 24, 0.35) * 0.7],
  'door-locked': [0.2, t => hit(t, 210, 32, 0.35) * 0.5 + hit(t - 0.09, 165, 38, 0.2) * 0.32],
  unlock: [0.32, t => hit(t, 1300, 30, 0.15) * 0.2 + chime(t - 0.04, [660, 990]) * 0.6],
  switch: [0.12, t => hit(t, 340, 65, 0.45) * 0.5 + hit(t - 0.025, 170, 40, 0.2) * 0.24],
  'switch-release': [0.12, t => hit(t, 260, 60, 0.4) * 0.35],
  dial: [0.1, t => hit(t, 860, 70, 0.4) * 0.34],
  pickup: [0.3, t => chime(t, [880, 1320]) * 0.8],
  throw: [0.18, t => noise() * Math.sin(Math.PI * t / 0.18) ** 2 * 0.22],
  'metal-impact': [0.38, t => hit(t, 530, 20, 0.24) * 0.4 + hit(t, 1273, 16, 0.08) * 0.18 + hit(t - 0.075, 880, 28, 0.2) * 0.15],
  'debris-impact': [0.32, t => hit(t, 95, 20, 0.6) * 0.62],
  checkpoint: [0.48, t => chime(t, [523, 659, 784]) * 0.6],
  objective: [0.46, t => chime(t, [659, 784, 1046]) * 0.65],
  fail: [0.5, t => chime(t, [330, 247, 165]) * 0.75],
  'game-over': [0.8, t => chime(t, [294, 220, 165, 110]) * 0.8],
  respawn: [0.46, t => chime(t, [330, 494, 660]) * 0.55],
  warning: [0.3, t => (hit(t, 740, 24, 0.01) + hit(t - 0.14, 740, 24, 0.01)) * 0.23],
  error: [0.2, t => chime(t, [220, 185]) * 0.5],
  'ability-end': [0.3, t => hit(t, 440 - 850 * t, 12, 0.18) * 0.25],
  'ui-click': [0.07, t => hit(t, 1000, 90, 0.04) * 0.15],
  'ui-nav': [0.06, t => hit(t, 1350, 110, 0.01) * 0.08],
  'ui-open': [0.16, t => chime(t, [660, 880]) * 0.24],
  'ui-close': [0.16, t => chime(t, [880, 660]) * 0.24],
  'ui-change': [0.06, t => hit(t, 900, 90, 0.02) * 0.12],
  electrical: [0.28, t => noise() * Math.exp(-t * 22) * 0.4 + hit(t, 60, 18, 0.2) * 0.22],
  steam: [0.6, t => noise() * Math.sin(Math.PI * t / 0.6) ** 2 * 0.2],
  machinery: [0.42, t => hit(t, 75, 16, 0.3) * 0.32 + hit(t - 0.12, 140, 20, 0.3) * 0.22],
  zipline: [1.8, t => Math.sin(Math.PI * t / 1.8) ** 2 * (noise() * 0.1 + sine(800 - t * 240, t) * 0.055)],
  'train-air': [2, t => noise() * 0.12 + sine(44, t) * 0.08 + sine(66, t) * 0.035],
  'roof-wind': [2, () => noise() * 0.16]
}
await fs.mkdir(dir, { recursive: true })
let bytes = 0
for (const [name, [duration, sample]] of Object.entries(designs)) {
  const length = Math.round(rate * duration), wav = Buffer.alloc(44 + length * 2)
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(length * 2, 40)
  let low = 0
  for (let i = 0; i < length; i++) {
    // Low-pass broad-band noise and soften both edges, including ambience seams.
    const value = sample(i / rate)
    low += 0.48 * (value - low)
    const edge = Math.min(1, i / 100, (length - i - 1) / 180)
    wav.writeInt16LE(Math.round(Math.max(-0.95, Math.min(0.95, low * edge)) * 32767), 44 + i * 2)
  }
  await fs.writeFile(new URL(name + '.wav', dir), wav); bytes += wav.length
}
console.log('Generated ' + Object.keys(designs).length + ' original mono WAV effects, ' + bytes + ' bytes')

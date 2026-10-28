import image1 from '../assets/textures/story/l3-1-tremor.jpg'
import image2 from '../assets/textures/story/l3-2-rockslide.jpg'
import image3 from '../assets/textures/story/l3-3-timewarp.jpg'
import line1 from '../assets/audio/story/l3-1-tremor.mp3'
import line2 from '../assets/audio/story/l3-2-rockslide.mp3'
import line3 from '../assets/audio/story/l3-3-timewarp.mp3'
import rumble from '../assets/audio/story/l3-rumble.mp3'
import { introBeat, PANEL_CROSSFADE_S, CAPTION_FADE_S, TYPEWRITER_FRACTION, SUBTITLE_BOTTOM_VH } from './intro-beat.js'

// Level 2 → Level 3 story beat. Plays after the Core is taken: the theft
// shakes the valley, a rockslide breaks the bridge track ahead, and time
// starts pulling the train apart. Same ink-panel film as the intro, but no
// newspaper/title/train/smoke: it opens and closes on black, and Level 3 is
// built once, under full black, before the first panel appears.

// --- presentation timings (seconds) -------------------------------------
export const L3_START_FADE_S = 0.8          // Level 2 → black (music fades with it)
export const L3_FIRST_PANEL_FADE_S = 0.8    // black → panel 1
export const L3_NARRATION_DELAY_S = 0.5     // each panel appears, then its line starts
export const L3_PANEL_HOLD_S = 0.9          // after each line ends
export const L3_LAST_PANEL_HOLD_S = 1.3     // longer hold on the final panel
export const L3_PANEL_CROSSFADE_S = PANEL_CROSSFADE_S
export const L3_END_DARKEN_S = 1.0          // last panel → black
export const L3_SKIP_AUDIO_FADE_S = 0.3
export const L3_SKIP_DARKEN_S = 0.4
export const L3_WARM_GOOD_FRAMES = 20       // same warm check as the intro hand-over
export const L3_WARM_FRAME_MS = 33
export const L3_WARM_MAX_S = 5
export const L3_REVEAL_FADE_S = 0.8         // black → Level 3
export const L3_FALLBACK_CLIP_S = 5         // panel length if a line fails to load
export const L3_PREPARE_TIMEOUT_S = 8
export const L3_HARD_TIMEOUT_S = 60         // safety net for the whole cutscene
export const L3_MAX_FRAME_S = 0.25          // a long frame cannot skip a panel

// --- audio ----------------------------------------------------------------
export const L3_RUMBLE_GAIN = 0.5           // relative to narration (unity)
export const L3_RUMBLE_FADE_S = 0.6

// --- panel effects ------------------------------------------------------
// Image-space amounts (fraction of the picture). Panels zoom from 1.04, which
// leaves ~2% overscan on each side, more than the largest combined offset.
export const L3_PANEL_ZOOM = [1.04, 1.07]
export const TREMOR_SHAKE = 0.003
export const TREMOR_SHAKE_IN = [1.0, 2.0]   // envelope 0 → 1 between these panel times
export const TREMOR_SHAKE_END = 0.4         // eases to this by panel end
export const RIPPLE_CENTER = [0.41, 0.50]   // centre of the drawn blue ring (image uv)
export const RIPPLE_SQUASH = 0.26           // ring height / width, matches the drawn ellipse
export const RIPPLE_MAX_RADIUS = 0.9
export const RIPPLES = [                    // panel time, duration, strength
  { at: 0.6, duration: 3.0, strength: 1.0 },
  { at: 4.6, duration: 3.0, strength: 0.6 } // "The whole valley felt it."
]
export const ROCK_SHAKE = 0.008
export const ROCK_SHAKE_VERTICAL = 1.3
export const ROCK_SHAKE_KEYS = [[0, 0.1], [1, 0.5], [2, 1], [4.5, 1], [5.6, 0.4], [6.1, 0]]
export const DUST_STRENGTH = 0.35           // set to 0 to remove the falling dust
export const WARP_PULSE_HZ = 0.7
export const SLIP_EVERY = [1.8, 2.6]        // seconds between "time slip" glitches
export const SLIP_DURATION_S = 0.12
export const SLIP_BAND = [0.06, 0.12]       // band height range (screen fraction)
export const SLIP_MIN_Y = 0.24              // never in the subtitle area (bottom fifth)
export const SLIP_MAX_Y = 0.9

export const l3TransitionBeat = {
  id: 'l3-transition',
  timings: {
    startFade: L3_START_FADE_S, firstPanelFade: L3_FIRST_PANEL_FADE_S,
    narrationDelay: L3_NARRATION_DELAY_S, hold: L3_PANEL_HOLD_S, lastHold: L3_LAST_PANEL_HOLD_S,
    crossfade: L3_PANEL_CROSSFADE_S, endDarken: L3_END_DARKEN_S,
    skipAudioFade: L3_SKIP_AUDIO_FADE_S, skipDarken: L3_SKIP_DARKEN_S,
    warmGoodFrames: L3_WARM_GOOD_FRAMES, warmFrameMs: L3_WARM_FRAME_MS, warmMax: L3_WARM_MAX_S,
    revealFade: L3_REVEAL_FADE_S, fallbackClip: L3_FALLBACK_CLIP_S,
    prepareTimeout: L3_PREPARE_TIMEOUT_S, timeout: L3_HARD_TIMEOUT_S, maxFrame: L3_MAX_FRAME_S,
    captionFade: CAPTION_FADE_S, typewriterFraction: TYPEWRITER_FRACTION
  },
  captions: { bottomVh: SUBTITLE_BOTTOM_VH },
  // Same narration bus/limiter as the intro, so both beats sit at one level.
  bus: introBeat.bus,
  panels: [
    { image: image1, audio: line1, fx: 'tremor', pan: [0.006, 0.002],
      captions: [
        { at: 0, text: "Taking the Core shook more than Vane's empire." },
        { at: 4.16, text: 'The whole valley felt it.' }
      ] },
    { image: image2, audio: line2, fx: 'rockslide', pan: [-0.006, 0.004],
      sfx: { url: rumble, gain: L3_RUMBLE_GAIN, fade: L3_RUMBLE_FADE_S },
      captions: [
        { at: 0, text: 'The mountain gave way.' },
        { at: 1.92, text: 'The bridge ahead has no track left.' }
      ] },
    { image: image3, audio: line3, fx: 'timewarp', pan: [0.006, -0.002],
      captions: [
        { at: 0, text: "Time's pulling the train apart." },
        { at: 3.34, text: 'I have to reach the engine and stop it before the bridge does.' }
      ] }
  ].map(panel => ({ ...panel, zoom: L3_PANEL_ZOOM }))
}

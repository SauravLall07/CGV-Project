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
// starts pulling the train apart.
//
// Level 3's constructor blocks the main thread for a few seconds and cannot
// be split from here. The beat hides that inside itself:
//  - entry: Level 2 crossfades straight into panel 1 and the first line
//    starts; Level 3 is built and compiled while panel 1 holds still (no
//    zoom, no effects yet) and the voice keeps playing (Web Audio runs off
//    the main thread). Panel 1's effects begin on "The whole valley felt it".
//  - exit: the time-warp cracks flood the whole screen chrono-blue. That
//    surge is a compositor-animated page layer, so it keeps pulsing even
//    while Level 3's first heavy frames run underneath; once Level 3 renders
//    steadily the blue clears onto it.

// --- presentation timings (seconds) -------------------------------------
export const L3_START_FADE_S = 0.8          // Level 2 → panel 1 crossfade (music fades with it)
export const L3_FIRST_LINE_DELAY_S = 0.9    // panel 1's line starts as the crossfade completes
export const L3_NARRATION_DELAY_S = 0.5     // panels 2–3: panel appears, then its line starts
export const L3_PANEL_HOLD_S = 0.9          // after each line ends
export const L3_LAST_PANEL_HOLD_S = 1.3     // longer hold on the final panel
export const L3_PANEL_CROSSFADE_S = PANEL_CROSSFADE_S
// Level 3's first real frame (shader compiles, texture uploads, GPU catch-up)
// is drawn while panel 1 holds still; panel 1 only starts moving once frames
// are steady again, and is lengthened if its effects would otherwise be cut.
export const L3_SETTLE_FRAME_MS = 100       // a frame this fast counts as steady
export const L3_SETTLE_FRAMES = 3           // …this many in a row
export const L3_PANEL1_FX_MIN_S = 2.8       // panel 1's ring/shake always get this long
export const L3_SURGE_S = 1.2               // panel 3's cracks flood the screen blue
export const L3_SURGE_WARP = 2.5            // crack glow/flow multiplier at the surge peak
export const L3_SKIP_AUDIO_FADE_S = 0.3
export const L3_SKIP_SURGE_S = 0.5
// Under full blue, Level 3 runs live until there are no more stalls. Level 3
// itself may run at 10–15 fps on a laptop, so this looks for the absence of
// hitches, not for a high frame rate.
export const L3_BLUE_MIN_S = 0.4
export const L3_BLUE_MAX_S = 3.0
export const L3_WARM_GOOD_FRAMES = 6
export const L3_WARM_FRAME_MS = 250
export const L3_REVEAL_FADE_S = 1.0         // blue clears onto Level 3
export const L3_FALLBACK_CLIP_S = 5         // panel length if a line fails to load
export const L3_PREPARE_TIMEOUT_S = 8
export const L3_HARD_TIMEOUT_S = 60         // safety net, counted from the first moving panel

// --- audio ----------------------------------------------------------------
export const L3_RUMBLE_GAIN = 0.5           // relative to narration (unity)
export const L3_RUMBLE_FADE_S = 0.6

// --- panel effects ------------------------------------------------------
// Image-space amounts (fraction of the picture). Panels zoom from 1.04, which
// leaves ~2% overscan on each side, more than the largest combined offset.
export const L3_PANEL_ZOOM = [1.04, 1.07]
export const TREMOR_SHAKE = 0.0015          // halved
export const TREMOR_SHAKE_IN = [5.0, 5.8]   // on "The whole valley felt it."
export const TREMOR_SHAKE_END = 0.4         // eases to this by panel end
export const RIPPLE_CENTER = [0.41, 0.50]   // centre of the drawn blue ring (image uv)
export const RIPPLE_SQUASH = 0.26           // ring height / width, matches the drawn ellipse
export const RIPPLE_MAX_RADIUS = 0.9
export const RIPPLES = [                    // panel time, duration, strength
  { at: 5.0, duration: 3.0, strength: 1.0 },  // "The whole valley felt it."
  { at: 6.0, duration: 2.0, strength: 0.6 }
]
export const ROCK_SHAKE = 0.0035            // was 0.006, originally 0.008
export const ROCK_SHAKE_VERTICAL = 1.3
export const ROCK_SHAKE_KEYS = [[0, 0.1], [1, 0.5], [2, 1], [4.5, 1], [5.6, 0.4], [6.1, 0]]
export const DUST_STRENGTH = 0.35           // set to 0 to remove the falling dust
// Panel 3: the blue cracks flow, glow and pulse; energy travels along them.
export const WARP_PULSE_HZ = 0.9

export const l3TransitionBeat = {
  id: 'l3-transition',
  timings: {
    startFade: L3_START_FADE_S,
    narrationDelay: L3_NARRATION_DELAY_S, hold: L3_PANEL_HOLD_S, lastHold: L3_LAST_PANEL_HOLD_S,
    crossfade: L3_PANEL_CROSSFADE_S, surge: L3_SURGE_S, surgeWarp: L3_SURGE_WARP,
    settleFrameMs: L3_SETTLE_FRAME_MS, settleFrames: L3_SETTLE_FRAMES, panel1FxMin: L3_PANEL1_FX_MIN_S,
    skipAudioFade: L3_SKIP_AUDIO_FADE_S, skipSurge: L3_SKIP_SURGE_S,
    blueMin: L3_BLUE_MIN_S, blueMax: L3_BLUE_MAX_S,
    warmGoodFrames: L3_WARM_GOOD_FRAMES, warmFrameMs: L3_WARM_FRAME_MS, revealFade: L3_REVEAL_FADE_S,
    fallbackClip: L3_FALLBACK_CLIP_S, prepareTimeout: L3_PREPARE_TIMEOUT_S, timeout: L3_HARD_TIMEOUT_S,
    captionFade: CAPTION_FADE_S, typewriterFraction: TYPEWRITER_FRACTION
  },
  captions: { bottomVh: SUBTITLE_BOTTOM_VH },
  // Same narration bus/limiter as the intro, so both beats sit at one level.
  bus: introBeat.bus,
  panels: [
    // No pan on panel 1: it holds still while Level 3 builds, then zooms.
    { image: image1, audio: line1, fx: 'tremor', pan: [0, 0], narrationDelay: L3_FIRST_LINE_DELAY_S,
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

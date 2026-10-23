import image1 from '../assets/textures/story/story-intro-01.jpg'
import image2 from '../assets/textures/story/story-intro-02.jpg'
import image3 from '../assets/textures/story/story-intro-03.jpg'
import image4 from '../assets/textures/story/story-intro-04.jpg'
import image5 from '../assets/textures/story/story-intro-05.jpg'
import image6 from '../assets/textures/story/story-intro-06.jpg'
import line1 from '../assets/audio/story/story-intro-line-1.mp3'
import line2 from '../assets/audio/story/story-intro-line-2.mp3'
import line3 from '../assets/audio/story/story-intro-line-3.mp3'
import line4 from '../assets/audio/story/story-intro-line-4.mp3'
import line5 from '../assets/audio/story/story-intro-line-5.mp3'
import rain from '../assets/audio/story/story-rain.mp3'
import whistle from '../assets/audio/story/story-whistle.mp3'

export const INTRO_LINE2_SPLIT_S = 1.8
export const PANEL_HOLD_S = 0.6
export const PANEL_CROSSFADE_S = 0.8
export const FADE_IN_S = 0.8
export const FADE_OUT_S = 0.8
export const SKIP_FADE_S = 0.4
export const FALLBACK_PANEL_S = 6
export const HARD_TIMEOUT_S = 90
export const TYPEWRITER_FRACTION = 0.85
export const PANEL_ZOOM_START = 1
export const PANEL_ZOOM_END = 1.08
export const NEWSPAPER_S = 7.0
export const NEWSPAPER_SPIN_S = 1.8
export const NEWSPAPER_LEAD_S = 0.75
export const NEWSPAPER_HOLD_S = 3.5
export const NEWSPAPER_SHAKE_S = 0.15
export const NEWSPAPER_CROSSFADE_S = 0.8
export const NEWSPAPER_TURNS = 3
export const NEWSPAPER_HEIGHT = 0.75
export const NEWSPAPER_PUSH = 1.04
export const NEWSPAPER_SHAKE = 0.004
export const END_PUSH_S = 1.2
export const END_PUSH_ZOOM = 1.25
export const END_PUSH_PAN = [0.08, 0]
export const RIPPLE_S = 1.2
export const TITLE_SETTLE_S = 0.8
export const TITLE_HOLD_S = 1.5
export const DISSOLVE_S = 1.5
export const SKIP_DISSOLVE_S = 0.6
export const WHISTLE_VOLUME = 0.8
export const RAIN_VOLUME = 0.5
export const RAIN_FADE_IN_S = 1.5
export const AUDIO_UNLOCK_WAIT_S = 2.5
export const PREPARE_TIMEOUT_S = 8
export const BAND_TOP = 0
export const BAND_BOTTOM = 0
export const CAPTION_FADE_S = 0.3
export const CAPTION_SLIDE_PX = 10
export const CAPTION_MARGIN = 0.04
export const CAPTION_CORNERS = ['top-left', 'bottom-left', 'bottom-right', 'top-left', 'bottom-left', 'top-left']

// A narration group owns one continuous source. switchAt is measured from
// that source's start, and begins the incoming panel's crossfade. Only the
// last panel in a group receives the post-narration hold. Missing/locked
// narration instead gives each panel its own fallback duration.
export const introBeat = {
  id: 'intro',
  timings: {
    hold: PANEL_HOLD_S, crossfade: PANEL_CROSSFADE_S,
    fadeIn: FADE_IN_S, fadeOut: FADE_OUT_S, skipFade: SKIP_FADE_S,
    fallback: FALLBACK_PANEL_S, timeout: HARD_TIMEOUT_S,
    typewriterFraction: TYPEWRITER_FRACTION,
    opening: NEWSPAPER_S, openingCrossfade: NEWSPAPER_CROSSFADE_S,
    newspaperSpin: NEWSPAPER_SPIN_S, newspaperLead: NEWSPAPER_LEAD_S,
    newspaperHold: NEWSPAPER_HOLD_S, newspaperShake: NEWSPAPER_SHAKE_S,
    push: END_PUSH_S, ripple: RIPPLE_S, titleSettle: TITLE_SETTLE_S,
    titleHold: TITLE_HOLD_S, dissolve: DISSOLVE_S, skipDissolve: SKIP_DISSOLVE_S,
    captionFade: CAPTION_FADE_S,
    rainFadeIn: RAIN_FADE_IN_S, unlockWait: AUDIO_UNLOCK_WAIT_S,
    prepareTimeout: PREPARE_TIMEOUT_S
  },
  newspaper: { turns: NEWSPAPER_TURNS, height: NEWSPAPER_HEIGHT, push: NEWSPAPER_PUSH, shake: NEWSPAPER_SHAKE },
  ending: { zoom: END_PUSH_ZOOM, pan: END_PUSH_PAN },
  captions: { margin: CAPTION_MARGIN, slide: CAPTION_SLIDE_PX },
  whistle: { url: whistle, volume: WHISTLE_VOLUME },
  rain: { url: rain, volume: RAIN_VOLUME },
  band: { top: BAND_TOP, bottom: BAND_BOTTOM },
  audio: [line1, line2, line3, line4, line5],
  panels: [
    { image: image1, audio: 0, pan: [-0.012, 0.008],
      caption: '1934. Twelve years on the force. One man I could never bring to justice. Cornelius Vane.' },
    { image: image2, audio: 1, pan: [0.012, 0.006],
      caption: 'He owns the railways.' },
    { image: image3, audio: 1, switchAt: INTRO_LINE2_SPLIT_S, pan: [-0.014, -0.006],
      caption: 'Every witness against him disappeared. Every file I built was rewritten overnight.' },
    { image: image4, audio: 2, pan: [0.008, -0.012],
      caption: 'His secret is the Chrono Core, a machine that bends time. With it, he erases his crimes before anyone can prove them.' },
    { image: image5, audio: 3, pan: [-0.01, 0.01],
      caption: "The police and the courts belong to him. No warrant will ever touch that man. So I'll do what the law can't." },
    { image: image6, audio: 4, pan: [0.014, -0.008],
      caption: "The Core travels on the Chrono Express tonight. I'm going to steal it, and bring Vane down." }
  ].map((panel, i) => ({ ...panel, corner: CAPTION_CORNERS[i], zoom: [PANEL_ZOOM_START, PANEL_ZOOM_END] }))
}

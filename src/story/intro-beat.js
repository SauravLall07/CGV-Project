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
export const OPENING_CARD_S = 5.0
export const OPENING_TYPE_S = 1.6
export const OPENING_CROSSFADE_S = 0.8
export const END_CARD_S = 4.5
export const END_CARD_FADE_IN_S = 1.0
export const END_CARD_HOLD_S = 2.5
export const END_CARD_FADE_OUT_S = 1.0
export const RAIN_VOLUME = 0.35
export const RAIN_FADE_IN_S = 1.5
export const AUDIO_UNLOCK_WAIT_S = 2.5
export const PREPARE_TIMEOUT_S = 8
export const LETTERBOX_TOP = 0.07
export const LETTERBOX_BOTTOM = 0.20

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
    opening: OPENING_CARD_S, openingType: OPENING_TYPE_S,
    openingCrossfade: OPENING_CROSSFADE_S,
    endCard: END_CARD_S, endFadeIn: END_CARD_FADE_IN_S,
    endHold: END_CARD_HOLD_S, endFadeOut: END_CARD_FADE_OUT_S,
    rainFadeIn: RAIN_FADE_IN_S, unlockWait: AUDIO_UNLOCK_WAIT_S,
    prepareTimeout: PREPARE_TIMEOUT_S
  },
  openingText: 'Some cases never close.',
  rain: { url: rain, volume: RAIN_VOLUME },
  band: { top: LETTERBOX_TOP, bottom: LETTERBOX_BOTTOM },
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
  ].map(panel => ({ ...panel, zoom: [PANEL_ZOOM_START, PANEL_ZOOM_END] }))
}

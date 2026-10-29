import { THEME, createOverlayRoot, createButton } from './ui-theme.js'

// Rolling credits overlay. Two entry points share this panel: the title
// screen's CREDITS button (solid dark scrim) and the Complete state (a
// translucent veil over the frozen last frame of the heist). Any click or
// key dismisses it; the composition root decides whether that means "back
// to the menu overlay" or "quit the run to title".

const SCROLL_PX_PER_SEC = 50
const DISMISS_GRACE_MS = 500

function addBlock(parent, children) {
  const block = document.createElement('div')
  Object.assign(block.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    width: '100%'
  })
  for (const child of children) block.appendChild(child)
  parent.appendChild(block)
  return block
}

function heading(text, size = 'clamp(22px, 4vw, 42px)') {
  const el = document.createElement('div')
  el.textContent = text
  Object.assign(el.style, {
    fontFamily: THEME.serif,
    fontSize: size,
    fontWeight: '700',
    letterSpacing: '0.18em',
    color: THEME.parchment,
    textTransform: 'uppercase',
    textShadow: '0 2px 12px rgba(0, 0, 0, 0.8)',
    textAlign: 'center'
  })
  return el
}

function label(text) {
  const el = document.createElement('div')
  el.textContent = text
  Object.assign(el.style, {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.28em',
    color: 'rgba(176, 141, 63, 0.85)',
    textTransform: 'uppercase',
    paddingBottom: '6px',
    borderBottom: `1px solid ${THEME.brassFaint}`,
    marginBottom: '4px'
  })
  return el
}

function line(text, { dim = false, italic = false, size = '15px' } = {}) {
  const el = document.createElement('div')
  el.textContent = text
  Object.assign(el.style, {
    fontSize: size,
    lineHeight: '1.55',
    letterSpacing: '0.04em',
    color: dim ? THEME.parchmentFaint : THEME.parchmentDim,
    fontStyle: italic ? 'italic' : 'normal',
    textAlign: 'center',
    maxWidth: '36em'
  })
  return el
}

function spacer(px = 36) {
  const el = document.createElement('div')
  el.style.height = `${px}px`
  return el
}

function buildRollContent() {
  const roll = document.createElement('div')
  Object.assign(roll.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '28px',
    width: 'min(92vw, 640px)',
    padding: '0 24px 50vh',
    textAlign: 'center',
    willChange: 'transform'
  })

  const heistCompleteBlock = addBlock(roll, [
    heading('Heist Complete', 'clamp(18px, 3.2vw, 32px)'),
    line('Completion Time: 00:00.0', { size: '16px' })
  ])
  heistCompleteBlock.dataset.heistComplete = '1'
  heistCompleteBlock.style.display = 'none'
  heistCompleteBlock.lastElementChild.dataset.completionTime = '1'

  addBlock(roll, [
    heading('Chrono Express'),
    line('A Time-Manipulation Stealth Heist', { size: '13px' })
  ])

  addBlock(roll, [
    label('Music'),
    line('All music by Kevin MacLeod (incompetech.com)'),
    line('Licensed under Creative Commons: By Attribution 4.0', { dim: true }),
    line('creativecommons.org/licenses/by/4.0/', { dim: true, size: '13px' }),
    spacer(8),
    line('"Constance" — Level 1 (Boarding)'),
    line('"Mistake the Getaway" — Level 2 (Moving Heist)'),
    line('"Final Count" — Level 3 (Timewreck)'),
    line('"Vibing Over Venus" — Main Menu'),
    line('"Take a Chance" — Victory')
  ])

  addBlock(roll, [
    label('Sound Effects'),
    line('"Freeze Sound Effect FX" by antonsoederberg (Freesound.org) — CC0'),
    line('"Quick Zoom Slow Down" by bevibeldesign (Freesound.org) — CC0'),
    line('"Vinyl Rewind" by tasmanianpower (Freesound.org) — CC0'),
    line('"Ghost Noise" by whiprealgood (Freesound.org) — CC0'),
    line('"intercom in" by bevibeldesign (Freesound.org) — CC0'),
    line('"WelcomeAboardTrain" by Molly (freetts.org) — CC0'),
    line('"TrainDepart" by Leah (freetts.org) — CC0'),
    line('"WelcomeToStation" by Molly (freetts.org) — CC0'),
  ])

  // Level 1 attribution audit (2026-10-29). Credits are grouped by source.
  // Pixabay sounds may be edited/trimmed for gameplay; author names follow
  // the original downloaded filenames or verified source listings.
  addBlock(roll, [
    label('Level 1 — Guard Voices'),
    line('VoiceBosch — THE ALERTED NPC (Male) Audio Pack'),
    line('Hey; What’s That?; Who’s There?; I Think Someone’s Here; He’s Here; You’re Dead; You’re Not Leaving Here Alive'),
    line('voicebosch.itch.io/the-alerted-npc-male-audio-pack', { dim: true, size: '13px' }),
    line('Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)', { dim: true, size: '13px' }),
    spacer(8),
    line('VoiceBosch — NPC GUARDS (Warning Phrases) Audio Pack'),
    line('Track 41: All Trespassers Will Be Neutralized (station announcement)'),
    line('voicebosch.itch.io/npc-guards-warning-phrases-audio-pack', { dim: true, size: '13px' }),
    line('Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)', { dim: true, size: '13px' }),
    spacer(8),
    line('Guard grunt — freesound_community / Pixabay: Angry Grunt (103204)'),
    line('Gameplay copies are converted or edited from original recordings.', { dim: true, size: '13px' })
  ])

  addBlock(roll, [
    label('Level 1 — Movement & Interaction SFX'),
    line('Footsteps — freesound_community, Concrete Footsteps 1 (6265) / Pixabay'),
    line('Jump — freesound_community, Jumps (65494) / Pixabay'),
    line('Landing — u_qqkrn9bn55, JumpLanding (398256) / Pixabay'),
    line('Panting — u_jt2rhdzi3j, Man Panting Softly (401018) / Pixabay'),
    line('Station entrance door — DRAGON-STUDIO, Open Door Stock SFX (454246) / Pixabay'),
    line('Metal door opening — Universfield, Opening Metal Door (199581) / Pixabay'),
    line('Distractor metallic contact — freesound_community, MetalClang (63232) / Pixabay')
  ])

  addBlock(roll, [
    label('Level 1 — Puzzles & Security SFX'),
    line('Puzzle 1 switch — SoundReality, Light Switch (156813) / Pixabay'),
    line('Puzzle 2 pressure plates — freesound_community, Breaker Switch (45684) / Pixabay'),
    line('Puzzle 3 tile turns — newagesoup via freesound_community, MECH-KEYBOARD-02 (102918) / Pixabay'),
    line('Laser ambience — PureAudioNinja via freesound_community, Electricity Ambience 2 (31877) / Pixabay'),
    line('Laser contact — yodguard, Short Energy Beam Shot 3 (482517) / Pixabay'),
    line('Puzzle door whoosh — SoundReality, Whoosh Large Sub (384631) / Pixabay'),
    line('Puzzle door sliding — Heavy Metal Sliding #1 (original creator/source unverified)'),
    line('Incorrect puzzle answer — Universfield, Wrong Answer Beep (149895) / Pixabay'),
    line('Camera capture alarm — freesound_community, Security Alarm (80493) / Pixabay')
  ])

  addBlock(roll, [
    label('Level 1 — Station & Train SFX'),
    line('Station ambience — freesound_community, Ambi Empty Train Station (57614) / Pixabay'),
    line('Train door opening — chrysalyn, Train Automatic Door Opening (608392) / Pixabay'),
    line('Forced train door — DRAGON-STUDIO, Groaning Metal (511322) / Pixabay'),
    line('Train departing — phoenix_connection_brazil, Train 1 (99265) / Pixabay'),
    line('Additional door and security mechanisms — synthesized in-game where no recording is used'),
    spacer(8),
    line('Pixabay Content License — pixabay.com/service/license-summary/', { dim: true, size: '13px' }),
    line('Sound recordings may be trimmed, mixed, filtered or converted for gameplay.', { dim: true, size: '13px' })
  ])

  addBlock(roll, [
    label('Level 2 — Sound Effects'),
    line('Chrono Core charge — Sci-Fi Weapon Charging 01 by Tim_Verberne via freesound_community (Pixabay #96645)'),
    line('Core structural creak — Creaking by DRAGON-STUDIO (Pixabay #401724)'),
    line('Core explosion — Explosion FX by SoundReality (Pixabay #343683)'),
    line('Metal door opening/closing — Universfield, Opening Metal Door (199581) / Pixabay; edited and reversed variants (credited in Level 1)'),
    line('Mechanical door slam — Metal Slam 5 by floraphonic (Pixabay #189786)'),
    line('Interface pickup click — reuses Level 1 Puzzle 3 MECH-KEYBOARD-02 (102918); credited above'),
    line('Rooftop wind — Wind Blowing SFX 07 by DRAGON-STUDIO (Pixabay #423677)'),
    line('Roof zipline — Zipper Unzip 3 (Slow) by freesound_community (Pixabay #93379)'),
    line('Breach alarm — Security Alarm by freesound_community (Pixabay #80493)'),
    line('Breach voice — VoiceBosch, Security Breach Detected (voice pack; not Pixabay)'),
    line('Moving obstacles — Chalk Slide Short by DishantBabariya (Pixabay #516557)'),
    line('Steam hazards — Steam Hissing 2 by DRAGON-STUDIO (Pixabay #386162)'),
    line('Moving train — Train Running Sound by freesound_gamestudio (Pixabay #384968)'),
    line('Interface warp — Warp Magic 4 by yodguard (Pixabay #382391)'),
    spacer(8),
    line('Pixabay recordings: Pixabay Content License; some files trimmed, processed or reversed.', { dim: true, size: '13px' }),
  ])

  addBlock(roll, [
    label('Level 3 — Sound Effects'),
    line('Brake pressure release — Depressurization of the Brakes of a Train by freesound_community (Pixabay #106983)'),
    line('Brake screech — Train Braking Sound by Alex_Jauk (Pixabay #180113)'),
    line('Short electric cue — Electric Whoosh 01 by DavidDumaisAudio (Pixabay #204487)'),
    line('Electric death — Lightning Spell by DRAGON-STUDIO (Pixabay #386163)'),
    line('Ending explosion — Metal Design Explosion by muzaproduction (Pixabay #13491)'),
    line('Ending horn — Train by kauasilbershlachparodes (Pixabay #493986)'),
    line('Flying debris whoosh — Epic Whoosh by DRAGON-STUDIO (Pixabay #478371)'),
    line('Falling blocks — Heavy Rock Rolling by DRAGON-STUDIO (Pixabay #515254)'),
    line('Rolling luggage — Rolling Office Chair by freesound_community (Pixabay #33190)'),
    line('Wood impact — Wooden Thud Mono by freesound_community (Pixabay #6244)'),
    spacer(8),
    line('Pixabay recordings: Pixabay Content License; some files trimmed, processed or reversed.', { dim: true, size: '13px' }),
  ])

  addBlock(roll, [
    label('Level 2 — Additional Source Notes'),
    line('Security breach announcement — VoiceBosch; verify the specific voice-pack listing and applicable terms.'),
  ])

  addBlock(roll, [
    label('3D Models & Animations'),
    line('"Character (Type Detective)" by LokitoBlu (Sketchfab)'),
    line('Licensed under Creative Commons Attribution 4.0', { dim: true }),
    spacer(8),
    line('"Character (Type Male Police)" by LokitoBlu (Sketchfab)'),
    line('Licensed under Creative Commons Attribution 4.0', { dim: true }),
    spacer(8),
    line('"Flashlight" by MAR.COS. (Sketchfab)'),
    line('Licensed under Creative Commons Attribution 4.0', { dim: true }),
    spacer(8),
    line('Character animations from Adobe Mixamo (mixamo.com)')
  ])

  // --- Team credits ---
  addBlock(roll, [
    label('Cast & Crew'),
    line('Development Team'),
    line('Saurav Lall'),
    line('Nayan Makanjee'),
    line('Hemesh Parshotam'),
    line('Jai Parbhoo'),
    line('Roko Vidjak'),
    line('Ayesha Ally')
  ])

  // --- PLACEHOLDER: third-party assets ---
  addBlock(roll, [
    label('Additional Assets'),
    line('Intro and cutscene illustrations generated with ChatGPT (OpenAI)'),
    line('Title menu artwork generated with ChatGPT (OpenAI)'),
    line('Narration voice generated with ElevenLabs (voice: David) (elevenlabs.io)'),
    line('Rain ambience generated with ElevenLabs (elevenlabs.io)'),
    line('Steam whistle sound generated with ElevenLabs (elevenlabs.io)'),
    line('Rockslide rumble sound generated with ElevenLabs (elevenlabs.io)'),
    line('Ending background paintings — AI-generated with ChatGPT (OpenAI), edited for Chrono Express'),
    line('Physics library: cannon-es'),
    line('Built with Three.js', { size: '13px' }),
    spacer(8),
    line('Sky scattering adapted from the three.js Sky example'),
    line('Preetham daylight model (Rayleigh + Mie), MIT License', { dim: true }),
    line('github.com/mrdoob/three.js — examples/jsm/objects/Sky.js', { dim: true, size: '13px' }),
    spacer(8),
    line('Nature models and surface textures from Poly Haven'),
    line('polyhaven.com — CC0', { dim: true }),
    line('Pine Sapling Small', { size: '13px' }),
    line('Fir Sapling', { size: '13px' }),
    line('Fir Sapling Medium', { size: '13px' }),
    line('Pine Sapling Medium', { size: '13px' }),
    line('Fern 02', { size: '13px' }),
    line('Rock Moss Set 01', { size: '13px' }),
    line('Rock Moss Set 02', { size: '13px' }),
    line('Dead Tree Trunk', { size: '13px' }),
    line('Tree Stump 01', { size: '13px' }),
    line('Castle Brick 02 Red', { size: '13px' }),
    line('Corrugated Iron', { size: '13px' }),
    line('Forest Ground 01', { size: '13px' }),
    line('Rock Face', { size: '13px' })
  ])


  addBlock(roll, [
    spacer(24),
    line('Press any key to return to menu', { size: '12px' })
  ])

  return roll
}

function formatCompletionClock(seconds) {
  const tenths = Math.max(0, Math.floor(seconds * 10 + 1e-6))
  const minutes = Math.floor(tenths / 600)
  const secs = Math.floor((tenths % 600) / 10)
  const tenth = tenths % 10
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenth}`
}

export function createCredits({ onDismiss } = {}) {
  const root = createOverlayRoot('credits', 90)
  root.style.overflow = 'hidden'
  root.style.alignItems = 'flex-start'
  root.style.justifyContent = 'center'

  const roll = buildRollContent()
  const heistCompleteBlock = roll.querySelector('[data-heist-complete]')
  const completionTimeLine = roll.querySelector('[data-completion-time]')
  root.appendChild(roll)
  const mainMenu=createButton('Main Menu',{onClick:event=>{
    event.preventDefault();event.stopPropagation()
    if(isOpen&&source==='complete')close()
  }})
  mainMenu.id='credits-main-menu'
  Object.assign(mainMenu.style,{position:'absolute',right:'24px',bottom:'24px',display:'none',zIndex:'1'})
  mainMenu.hidden=true;root.appendChild(mainMenu)
  document.body.appendChild(root)

  let isOpen = false
  let source = 'menu'
  let ignoreUntil = 0

  function applyBackdrop() {
    if (source === 'complete') {
      // Translucent veil only — the frozen heist frame stays readable
      // through it. No blur: that would smear the last shot.
      root.style.background = 'rgba(0, 0, 0, 0.6)'
      root.style.backdropFilter = 'none'
      root.style.WebkitBackdropFilter = 'none'
    } else {
      root.style.background = 'rgba(4, 5, 12, 0.94)'
      root.style.backdropFilter = 'blur(7px)'
      root.style.WebkitBackdropFilter = 'blur(7px)'
    }
  }

  function startRoll() {
    roll.style.animation = 'none'
    void roll.offsetHeight
    const distance = roll.offsetHeight + window.innerHeight
    const duration = Math.max(12, distance / SCROLL_PX_PER_SEC)
    roll.style.animation = `cx-credits-roll ${duration}s linear forwards`
  }

  function open({ source: nextSource = 'menu', completionTime } = {}) {
    if (isOpen) return
    source = nextSource
    isOpen = true
    ignoreUntil = performance.now() + DISMISS_GRACE_MS
    mainMenu.hidden=source!=='complete';mainMenu.style.display=source==='complete'?'block':'none';mainMenu.disabled=false
    if (source === 'complete' && completionTime != null && Number.isFinite(completionTime)) {
      heistCompleteBlock.style.display = 'flex'
      completionTimeLine.textContent = `Completion Time: ${formatCompletionClock(completionTime)}`
    } else {
      heistCompleteBlock.style.display = 'none'
    }
    applyBackdrop()
    root.style.display = 'flex'
    root.style.pointerEvents = 'auto'
    void root.offsetWidth
    root.style.opacity = '1'
    startRoll()
    if(source==='complete')mainMenu.focus({preventScroll:true})
  }

  function close() {
    if (!isOpen) return
    isOpen = false
    mainMenu.disabled=true
    roll.style.animation = 'none'
    root.style.opacity = '0'
    root.style.pointerEvents = 'none'
    const dismissedFrom = source
    setTimeout(() => {
      if (!isOpen) root.style.display = 'none'
    }, 220)
    if (onDismiss) onDismiss(dismissedFrom)
  }

  function tryDismiss(event) {
    if (!isOpen) return
    if (performance.now() < ignoreUntil) {
      if (event) event.stopPropagation()
      return
    }
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    close()
  }

  function onKeyDown(event) {
    if (!isOpen || event.repeat) return
    if(source==='complete'&&event.key==='Tab')return
    if(source==='complete'&&event.target===mainMenu&&(event.key==='Enter'||event.key===' ')) {
      event.preventDefault();event.stopPropagation();close();return
    }
    tryDismiss(event)
  }

  function onClick(event) {
    tryDismiss(event)
  }

  window.addEventListener('keydown', onKeyDown, true)
  root.addEventListener('click', onClick)

  function dispose() {
    isOpen=false
    window.removeEventListener('keydown', onKeyDown, true)
    root.remove()
  }

  return {
    open,
    close,
    dispose,
    get isOpen() { return isOpen }
  }
}

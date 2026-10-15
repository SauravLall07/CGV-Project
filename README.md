# Chrono Express

A Three.js stealth game set aboard a train, built for the department's
graphics course. The player sneaks through the train's carriages, evading
guards, using a time-manipulation ability (slow/freeze/rewind/"time ghost")
to get past obstacles across three levels.

All three levels are implemented: station stealth and boarding, time-powered
carriage and roof traversal, and the wrecked-train escape to the emergency brake.
The environment combines procedural Three.js geometry/textures with imported
character and nature assets, animations, music and sound effects. See the in-game
credits for the recorded sources; team identities and provenance confirmation
remain outstanding.

Level 3's N1-N8 expansion is implemented, including Cargo's static wreck benchmark.
Automated traversal covers both Convergence routes, retries and lifecycle checks.
The production New Game-to-victory run, rendered/audio checks, human difficulty
and measured performance remain pending because no browser surface is available.
See the [current completion handover](reports/level-3-expansion-plan.md#n1-completion-and-final-verification-2026-10-15)
for evidence and the remaining acceptance work.

## Controls

Every key below is rebindable in **Settings → Controls** (from the title screen
or the pause menu); these are the defaults.

- **WASD** / **arrow keys** — move (camera-relative: forward is always away
  from the camera)
- **Shift** — run
- **Space** — jump
- **X** / **Z** — crouch toggle: press once to crouch, again to
  stand (jumping or pressing Shift also stands you up). **Settings → Gameplay
  → Crouch** switches back to hold-to-crouch
- **Click the canvas, then move the mouse** — orbit the third-person camera
  around the player (uses the Pointer Lock API)
- **E** — interact with whatever you're facing (a prompt appears when in range)
- **V** — switch between third-person and first-person view (look direction is
  carried across, so the switch never turns you)
- **1/Q**, **2/F**, **3/C**, **4/G** — Slow, Freeze, Rewind, Time Ghost
- **R** — restart the current level (no page refresh); on the completion
  screen, restarts the whole run
- **Esc** — pause. The pause menu shows the current level, objective, run
  clock, Chrono power, suspicion and checkpoint resets, and fronts Resume,
  Restart Level, Settings and Quit to Title. Not rebindable, since it is also
  what backs out of every menu.

## Settings

Reachable from **SETTINGS** on the title screen and from the pause menu — the
same panel either way. Everything is written straight to `localStorage`, so it
survives a reload.

| Tab | What it holds |
|---|---|
| Display | Brightness (tone-mapping exposure), field of view, render resolution scale, shadows on/off, soft vs hard shadows, FPS counter |
| Gameplay | Mouse sensitivity, invert vertical look, third-person camera distance, hold/toggle crouch |
| Audio | Master volume and mute |
| Controls | Two rebindable slots per action — movement, run, jump, crouch, interact, view switch, the four time abilities and restart — with conflict handling that unbinds the key from whatever held it |

## Tech stack

| Piece | Choice | Why |
|---|---|---|
| Graphics library | [three](https://threejs.org/) | Required by the brief |
| Build tool | [Vite](https://vite.dev/) | Bundles to a plain static `dist/` folder, deployable as-is to the LAMP server |
| Language | Plain JavaScript (ES modules) | Keeps the code simple; revisit for TypeScript later if wanted |
| Decorative physics | Cannon-es | Loose debris; player collision and support queries use the existing custom system |
| Dev-only camera controls | `three/examples/jsm/controls/OrbitControls.js` | Kept in the repo for debugging other scenes; not used by the active scene now that the real third-person camera exists |

## Project structure

```
index.html            entry point: canvas + module script, no boilerplate
vite.config.js         base: './' so built asset URLs stay relative
src/
  main.js               composition root — wires everything together
  core/                 generic Three.js plumbing, nothing game-specific
    renderer.js           WebGLRenderer, capped pixel ratio, shadow map, resize
    scene.js               Scene with a visible (non-black) background
    camera.js               PerspectiveCamera, resize handling
    clock.js                 delta-time wrapper (THREE.Timer-backed)
    loop.js                   requestAnimationFrame loop + update callbacks
    lights.js                  flat ambient + directional test lighting
                                (superseded per-level; kept for other scenes)
    assets.js                 LoadingManager + GLTFLoader (+ lazy Draco),
                                progress-callback fan-out
    settings.js               persisted display/gameplay options + the
                                rebindable key map, with change subscriptions
    dispose.js                recursive geometry/material/texture/light cleanup
    level-manager.js          state machine over the level sequence: build,
                                dispose-based teardown, restart, advance
  levels/                level content, one module each, built by level-manager
    boarding.js           Level 1 — station concourse + train + boarding control
    moving-heist.js       Level 2 — five-carriage traversal, one time ability per
                           car, roof-crossing set piece, vault break-in
    timewreck.js          Level 3 — the escape run back down the wrecked train:
                           fast-time, time-loop, frozen and breaking carriages,
                           then the Core-depletion sprint to the brake
    complete.js           terminal state — completion message only
  systems/               cross-level gameplay systems
    interaction.js        raycast-from-player, contextual prompt, register()/E
    respawn.js            one active checkpoint + generic fail() → respawn
  ui/                    DOM overlays
    hud.js                objective line, toast, suspicion meter, Chrono deck
                           (ability slots label themselves from the bindings)
    loading-screen.js     progress bar driven by assets.js
    main-menu.js          title screen over a live cinematic shot of the
                           station; NEW GAME + SETTINGS
    pause-menu.js         Esc overlay: run status, control reference, resume /
                           restart / settings / quit to title
    settings-menu.js      display, gameplay and key-rebinding panel, shared by
                           the title screen and the pause menu
    ui-theme.js           shared menu styling and widgets (buttons, sliders,
                           toggles, key caps) used by the three overlays
  entities/
    train.js              Train group + named carriage-N child groups +
                           locomotive; exports the track height constants
    player.js               Movement + walk cycle over a humanoid figure
    humanoid.js             Shared figure builder (player and guards)
  environment/
    station-blockout.js   Level 1 station: concourse, track bed, rear wall,
                           columns, train shed, props, placeholders, lighting
    carriage-interior.js  Reusable carriage interior; `damaged: true` re-dresses
                           the same geometry as Level 3's wreckage
    carriages.js          The five distinct carriage interiors (passenger →
                           security → cargo → mechanical → vault) as one
                           hierarchy, plus Level 2's roof catwalk;
                           `damaged: true` re-dresses them as Level 3's wreck
                           and adds the locomotive cab
    particles.js          Single-draw-call THREE.Points fields (embers, sparks)
                           with zero per-frame allocation
    textures.js           Procedural canvas textures + derived normal maps
  input/
    keyboard-state.js     key codes to game actions, held-state + press
                           listeners, driven by the rebindable key map
  cameras/
    player-view.js          Owns both cameras and the active view mode; the
                             rest of the game talks to this, not to either
                             camera directly
    third-person-camera.js  Follows + orbits the player (mouse look); sole
                             owner of pointer lock and the look angles
    first-person-camera.js  Eye-height camera driven by those same angles,
                             with a crouch-height blend
  dev/
    dev-controls.js       TEMPORARY OrbitControls — not wired into the
                           active scene, kept for debugging other scenes
```

`core/` only ever holds generic Three.js infrastructure — no gameplay code
belongs there. `systems/` is game logic reused across levels; `levels/` is
per-level content the manager builds and tears down one at a time. `dev/` is
kept separate so it's obvious what's scaffolding versus what ships.

## Running locally

```
npm install
npm run dev
```

Opens a dev server on the Level 1 station greybox: walk the player around with
WASD, click the canvas and move the mouse to orbit the camera, walk up to the
green boarding control and press **E** to transition into the Level 2 stub,
and press **R** at any point to restart the current level without a refresh.

## Building for production

```
npm run build
```

Produces a static `dist/` folder.

## Testing the production build locally

Always verify the *built* output before considering something deployed — the
dev server resolves things the production LAMP server won't:

```
npm run build
npx serve dist
```

(or `python3 -m http.server` from inside `dist/`). Never open `dist/index.html`
via `file://` — always serve it over local HTTP, or module imports will
silently fail.

## Deployment note

This project is served from a subdirectory on the department LAMP server
(`https://<server>/<group-folder>/`), not the domain root. Because of that:

- `vite.config.js` sets `base: './'` so all built asset URLs are relative.
- No absolute paths (`/src/...`, `/assets/...`) are used anywhere — every
  import/asset reference is relative to the file that uses it.
- Filenames are lowercase and hyphen-separated (the server is Linux and
  case-sensitive).

When deploying, zip the *contents* of `dist/` (so `index.html` sits at the
top level of the archive, not nested).

## Roadmap

### Implemented

- Three levels with checkpoints, failure/retry, restart and completion transitions.
- Station guards, cameras, lasers, suspicion and the boarding sequence.
- Shared Slow/Freeze/Rewind over registered objects, plus the separate Time Ghost.
- Level 2 carriage puzzles, roof traversal and the Chrono Core theft.
- Level 3 Vault escape, two Convergence branches, Mechanical steam/luggage/shutter,
  repairable Cargo gangway and freight, Relay Ghost release/catch, Security
  crossings/island, Passenger seat weave/rack/chase and the buckling connector.
- Carriage-specific wreck dressing, snapshot-driven repair fragments and background
  destruction; Cargo's larger folded framing and broken freight composition.
- Finale stasis, exterior deceleration, broken bridge/locomotive reveal and skip.
- Custom player collision/supports and Cannon-es decorative debris physics.
- First/third-person cameras, key rebinding, hold/toggle crouch, menus, settings,
  minimap, styled HUD, loading feedback, music/SFX, master/mute and credits UI.
- Shaders, post-processing, pooled lighting, conservative L3 visibility and developer
  diagnostics. Their runtime cost still needs measured browser validation.

### Acceptance still open

- A production New Game -> Level 1 -> Level 2 -> Level 3 -> victory run without shortcuts.
- Both views and fork branches; native pointer lock/rebindings, alternate powers,
  Ghost expiry/cancel, minimum-energy retries and menu/finale interruptions.
- Visual/shader/minimap/culling checks, audible balance and identified-hardware
  frame-time/resource/heap measurements across play and repeated restarts.
- First-time human comprehension and Passenger difficulty: the automated route
  briefly reaches about 2 energy, so it does not establish a comfortable margin.
- Exact team names/roles, asset attribution/provenance confirmation, trailer and
  hosted deployment verification. No remote publication is recorded.

The [expansion ledger](reports/level-3-expansion-plan.md#carried-acceptance-ledger-still-open-at-n0)
tracks A1-A9. Older upgrade Batch 6 and refinement R7 acceptance remain open;
completed mechanics do not need rebuilding. Historical plans and audits describe
past baselines; use their latest handovers for current status.

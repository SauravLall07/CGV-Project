# Chrono Express

A Three.js stealth game set aboard a train, built for the department's
graphics course. The player sneaks through the train's carriages, evading
guards, using a time-manipulation ability (slow/freeze/rewind/"time ghost")
to get past obstacles across three levels.

This repo holds the Alpha blockout plus **Phase 1 core systems**: a greyboxed
slice of Level 1 (the boarding station), a walkable blocky humanoid player, a
third-person camera, the train's parent-child hierarchy, and the shared
plumbing the rest of the game builds on — an interaction system, a
state-machine level manager (with dispose-based teardown and
restart-without-refresh), a checkpoint/respawn system, an asset-loading
pipeline with a progress-bar loading screen, and a HUD scaffold. Levels 2 and
3 exist only as gameplay stubs, though they are now set inside a dressed
carriage interior rather than a grey box. Every asset is still built from
Three.js primitives and procedurally generated textures — nothing is modelled
or downloaded — and no stealth logic or time system exists yet. See
[Roadmap](#roadmap) below for exactly what's implemented versus what's still
to come.

## Controls

- **WASD** — move (camera-relative: forward is always away from the camera)
- **Shift** — run
- **Click the canvas, then move the mouse** — orbit the third-person camera
  around the player (uses the Pointer Lock API)
- **E** — interact with whatever you're facing (a prompt appears when in range)
- **R** — restart the current level (no page refresh); on the completion
  screen, restarts the whole run. Temporary until Phase 8's pause menu.

## Tech stack

| Piece | Choice | Why |
|---|---|---|
| Graphics library | [three](https://threejs.org/) | Required by the brief |
| Build tool | [Vite](https://vite.dev/) | Bundles to a plain static `dist/` folder, deployable as-is to the LAMP server |
| Language | Plain JavaScript (ES modules) | Keeps the code simple; revisit for TypeScript later if wanted |
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
    dispose.js                recursive geometry/material/texture/light cleanup
    level-manager.js          state machine over the level sequence: build,
                                dispose-based teardown, restart, advance
  levels/                level content, one module each, built by level-manager
    boarding.js           Level 1 — station concourse + train + boarding control
    moving-heist.js       Level 2 — carriage interior + Chrono Core; gameplay
                           still a STUB for Phase 3
    timewreck.js          Level 3 — the same interior re-dressed as wreckage +
                           emergency brake; STUB for Phase 4
    complete.js           terminal state — completion message only
  systems/               cross-level gameplay systems
    interaction.js        raycast-from-player, contextual prompt, register()/E
    respawn.js            one active checkpoint + generic fail() → respawn
  ui/                    DOM overlays (Phase 8 restyles/merges these)
    hud.js                objective line + transient toast
    loading-screen.js     progress bar driven by assets.js
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
    textures.js           Procedural canvas textures + derived normal maps
  input/
    keyboard-state.js     WASD/shift held-state tracking
  cameras/
    third-person-camera.js  Follows + orbits the player (mouse look)
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

### Done

- Three.js/Vite scaffold: renderer, scene, camera, clock, render loop
- `Train` hierarchy: a parent group with named `carriage-0`..`carriage-4`
  children (passenger → security → cargo → mechanical → vault), correctly
  spaced with coupling gaps — moving/rotating `train` moves every carriage
  with it, and each carriage can move independently of its siblings
- Level 1 station greybox: platform, structural placeholders (wall, pillars,
  platform edge), static non-functional guard/camera placeholders, warm
  station lighting with shadows
- Placeholder player (blocky humanoid) with WASD movement, frame-rate-
  independent via delta time, bounded per level
- Third-person camera: smoothed follow + mouse-look orbit via Pointer Lock
- **Phase 1 core systems** — the shared foundation for all three levels:
  - Interaction system: one raycast per frame from the player along the
    camera yaw against a `register()`-ed set, a contextual prompt, E to fire
    the callback
  - Level manager: explicit `Boarding → MovingHeist → Timewreck → Complete`
    state machine; each transition disposes the old level's
    geometry/materials/textures and builds the next; `advance()` on level
    completion, `restart()` with no page refresh
  - Checkpoint / respawn: one active checkpoint per level, generic `fail()`
    that returns the player to it (fall-out-of-bounds wired; guard/hazard
    hooks land in Phases 2 and 4)
  - Asset pipeline: shared `LoadingManager` + `GLTFLoader` (Draco lazy), and
    a loading screen with a real `onProgress`-driven progress bar
  - HUD scaffold: objective line + transient toast (full HUD is Phase 8)
- Levels 2 and 3 exist as gameplay **stubs** — own lighting, checkpoint and
  one interactable each, enough to exercise the state machine
- **Art pass** (pulls Phase 7 material work forward so the game stops reading
  as greybox):
  - Procedural texture library: wood, marble, carpet, brushed metal, plaster,
    lit-window strips and signage, all generated into `<canvas>` at runtime
    with **normal maps derived from each colour map** — no downloaded or
    modelled assets anywhere, and every map is power-of-two
  - Station: marble concourse, coping and safety line, track bed with ballast,
    sleepers and rails, panelled rear wall with lit arched windows, cast-iron
    columns, train shed with lattice trusses and skylights, pendant gas lamps,
    benches, departure board, clock, porter's trolley
  - Train: locomotive (boiler, cab, chimney, plough, driving wheels, headlamp)
    plus five carriages with barrel roofs, brass trim, per-type liveries,
    textured window strips, doors, bogies and gangways
  - Carriage interior: panelled walls, brass-framed windows onto a passing
    night, seat bays with tables and lamps, luggage racks, coved ceiling
  - Player is a proportioned figure (coat, cap, boots) with a walk cycle —
    limb swing, torso bob, and a lean into a run
  - ACES filmic tone mapping and soft shadow maps
- **Phase 2 stealth & infiltration systems** (`src/systems/stealth.js`, `src/levels/boarding.js`):
  - Deterministic guard patrol AI (`Patrol → Investigate → Alert`) with waypoint cycles and walk animations
  - Dynamic 3D vision cones with obstacle line-of-sight raycasting / occlusion checks
  - Sweeping wall-mounted security cameras with ground projection cones
  - Security laser grids and interactive terminal bypass switches
  - Shared Suspicion/Alert meter with color transitions and checkpoint fail-state
  - Cinematic boarding & train departure sequence
- **Phase 3 time-manipulation core engine** (`src/systems/time-system.js`):
  - Slow (`1` / `Q`): per-object 0.2x time scale
  - Freeze (`2` / `F`): per-object 0.0x time scale
  - Rewind (`3` / `C`): 6-second circular transform buffer replay
  - Time Ghost (`4` / `G`): holographic avatar (`src/entities/time-ghost.js`) that replays player trajectory and triggers pressure plates
  - Chrono Core energy meter & ability HUD deck with temporal vignette (`src/ui/hud.js`)
  - Interactive puzzles in Level 2 (`moving-heist.js`) & unstable debris in Level 3 (`timewreck.js`)

### Next up: Custom Shaders (Phase 5) & Physics / Carriage Traversal (Phases 3 & 4), for graded Beta

- Custom GLSL Shaders (Chrono Field temporal distortion & Security Laser scanlines)
- Connect multi-carriage train traversal in Level 2 with roof traversal & wind hazards
- Level 3 Timewreck survival set pieces (Fast-time crushing carriage, time-loop room, collapsing bridge sprint)

### Still out of scope beyond that

- Levels 2 and 3 in any real form (only stubs exist)
- Physics beyond basic ground/wall blocking
- Menus, credits screen, audio, the full styled HUD
- Custom shaders (Chrono Field, security lasers — concept only for now)

### Things to revisit once real implementation starts

- Whether to move from plain JS to TypeScript
- The temporary `R`-to-restart key, once Phase 8's pause menu exists

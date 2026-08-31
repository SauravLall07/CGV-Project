# Chrono Express

A Three.js stealth game set aboard a train, built for the department's
graphics course. The player sneaks through the train's carriages, evading
guards, using a time-manipulation ability (slow/freeze/rewind/"time ghost")
to get past obstacles across three levels.

This repo currently holds the **Alpha preliminary implementation**: a
greyboxed slice of Level 1 (the boarding station) with a walkable placeholder
player, a third-person camera, and the train's parent-child hierarchy — built
on top of the Three.js/Vite scaffold. Everything visual is primitive geometry
(boxes, cylinders, a capsule) with flat-colour materials; no modelled assets,
stealth logic, or the time system exist yet. See [Roadmap](#roadmap) below
for exactly what's implemented versus what's still to come.

## Controls

- **WASD** — move (camera-relative: forward is always away from the camera)
- **Shift** — run
- **Click the canvas, then move the mouse** — orbit the third-person camera
  around the player (uses the Pointer Lock API)

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
                                (superseded by environment/station-blockout.js
                                for the active scene; kept for other scenes)
  entities/
    train.js              Train group + named carriage-N child groups
    player.js               Placeholder capsule + camera-relative movement
  environment/
    station-blockout.js   Level 1 greybox: floor, structural placeholders,
                           static guard/camera placeholders, warm lighting
  input/
    keyboard-state.js     WASD/shift held-state tracking
  cameras/
    third-person-camera.js  Follows + orbits the player (mouse look)
  dev/
    dev-controls.js       TEMPORARY OrbitControls — not wired into the
                           active scene, kept for debugging other scenes
public/                 static assets copied as-is at build time (empty for now)
```

`core/` only ever holds generic Three.js infrastructure — no gameplay code
belongs there. `dev/` is kept separate so it's obvious what's scaffolding
versus what ships.

## Running locally

```
npm install
npm run dev
```

Opens a dev server showing the Level 1 station greybox: walk the placeholder
player around with WASD, click the canvas and move the mouse to orbit the
third-person camera, and note the train visible alongside the platform.

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
- Placeholder player (capsule) with WASD movement, frame-rate-independent
  via delta time, bounded to the platform
- Third-person camera: smoothed follow + mouse-look orbit via Pointer Lock

### Next up (not part of this task): Level 1 proper, for graded Beta

- Guard patrol AI, camera/guard detection cones, suspicion/alarm system
- Real (even if simple) modelled/textured assets replacing the primitives
  above — train exterior, station architecture, character model
- The time-manipulation system (slow / freeze / rewind / time ghost)

### Still out of scope beyond that

- Levels 2 and 3 in any form
- Physics beyond basic ground/wall blocking
- HUD, menus, checkpoints, restart system, credits screen
- Custom shaders (Chrono Field, security lasers — concept only for now)

### Things to revisit once real implementation starts

- Whether to move from plain JS to TypeScript
- Adding `levels/`, `systems/` folders once there's real code to put in them

# Chrono Express

A Three.js stealth game set aboard a train, built for the department's
graphics course. The player sneaks through the train's carriages, evading
guards, using a time-manipulation ability (slow/freeze/rewind/"time ghost")
to get past obstacles across three levels.

This repo currently holds the **Alpha infrastructure scaffold** only: Three.js
wired up, rendering a placeholder lit cube, in a project shape that survives
deployment to the department's static LAMP server. No gameplay, levels, AI,
or real assets have been implemented yet — see [Roadmap](#roadmap) below.

## Tech stack

| Piece | Choice | Why |
|---|---|---|
| Graphics library | [three](https://threejs.org/) | Required by the brief |
| Build tool | [Vite](https://vite.dev/) | Bundles to a plain static `dist/` folder, deployable as-is to the LAMP server |
| Language | Plain JavaScript (ES modules) | Keeps the scaffold simple; revisit for TypeScript later if wanted |
| Dev-only camera controls | `three/examples/jsm/controls/OrbitControls.js` | Lets us confirm the scene renders from any angle before a real camera exists — not part of the shipped game |

## Project structure

```
index.html            entry point: canvas + module script, no boilerplate
vite.config.js         base: './' so built asset URLs stay relative
src/
  main.js               composition root — wires everything together
  core/                 generic Three.js plumbing, nothing game-specific
    renderer.js           WebGLRenderer, capped pixel ratio, resize handling
    scene.js               Scene with a visible (non-black) background
    camera.js               PerspectiveCamera, resize handling
    clock.js                 delta-time wrapper (THREE.Timer-backed)
    loop.js                   requestAnimationFrame loop + update callbacks
    lights.js                  ambient + directional light
  dev/
    dev-controls.js       TEMPORARY OrbitControls, isolated so it's easy to
                           delete once the real third-person camera exists
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

Opens a dev server with a lit, rotating placeholder cube and orbit controls
(orbit controls are temporary dev scaffolding — see `src/dev/dev-controls.js`).

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

### Next up: Alpha preliminary implementation

With the Three.js scaffold confirmed working end-to-end (including a LAMP
deploy), the next step is the actual Alpha "preliminary implementation" —
something concrete to walk the mentor through. The natural starting point is
the train/carriage hierarchical parent-child structure (train → carriages →
props), since everything else (levels, camera, AI) hangs off that structure.

### Deliberately not started yet

None of the following exist yet, even as stubs — they're real implementation
work for after Alpha:

- The three levels: their layouts and objectives
- Stealth/guard AI, guard vision cones, suspicion system
- The time-manipulation system (slow / freeze / rewind / time ghost)
- The actual train, carriages, and real game models/assets
- Physics, shaders, HUD, menus, checkpoints, credits screen

### Things to revisit once real implementation starts

- Whether to move from plain JS to TypeScript
- Replacing `src/dev/dev-controls.js` (OrbitControls) with the real
  third-person camera system
- Adding `levels/`, `entities/`, `systems/` folders once there's real code
  to put in them — intentionally not created ahead of time so the repo
  doesn't carry stale placeholder folders

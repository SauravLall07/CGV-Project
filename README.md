# Chrono Express

A Three.js game built with Vite, targeting deployment to a static LAMP server.

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

This project will be served from a subdirectory on the department LAMP
server (`https://<server>/<group-folder>/`), not the domain root. Because of
that:

- `vite.config.js` sets `base: './'` so all built asset URLs are relative.
- No absolute paths (`/src/...`, `/assets/...`) are used anywhere — every
  import/asset reference is relative to the file that uses it.
- Filenames are lowercase and hyphen-separated (the server is Linux and
  case-sensitive).

When deploying, zip the *contents* of `dist/` (so `index.html` sits at the
top level of the archive, not nested).

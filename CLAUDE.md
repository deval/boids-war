# boids — development & testing notes

Interactive 2D flocking simulation. Static, build-free site: vanilla JS + a
bundled PixiJS copy in `lib/pixi.min.js`. There is **no package.json, no build
step, and no test framework** — testing means driving the page in a real
browser.

## File map

- `index.html` — page + entire settings menu (declarative `data-model` bindings)
- `style.css` — all styling, including the custom checkbox rendering (see gotcha below)
- `js/opt.js` — settings: `defaults`, `encode` (export/import codes), generic
  checkbox/slider listeners
- `js/boid.js` — per-boid behavior (`flock`, `update`) and rendering (`show`, `getShape`)
- `js/flock.js`, `js/main.js`, `js/events.js` — flock container, PIXI setup/loop, input
- `js/v2d.js`, `js/util.js` — vector math (`mag`, `angle`, `min`, `max`, …) and
  helpers (`constrain`, `random`, `hsv`)

## Running the app

Serve the repo root over HTTP and open `index.html`:

```sh
python3 -m http.server 8123   # then open http://localhost:8123/
```

Don't rely on `file://` URLs.

## Testing with Playwright (read this before writing a test)

Use `playwright-core` with the pre-installed Chromium — never run
`playwright install`:

```js
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
```

### Gotcha 1: `page.check()` on checkboxes ALWAYS times out

Every checkbox input is invisible (`input[type="checkbox"] { opacity: 0 }` in
`style.css`); the visible box is drawn with `label::before/::after`, and the
label overlaps the input. Playwright's actionability check therefore fails with
"`<label>` intercepts pointer events" and `page.check('#id')` /
`page.uncheck('#id')` time out.

**Toggle checkboxes by clicking the label instead:**

```js
await page.click('label[for=stretch]');   // works — native label click fires
                                          // the 'input' event opt.js listens on
```

Note this *toggles*; read `opt.<model>` (or `#id:checked`) first if you need a
specific state.

### Gotcha 2: expected console errors

In sandboxed environments, ~3 `ERR_CONNECTION_RESET` console errors appear on
load from blocked third-party requests (Google Tag Manager, Cloudflare
Insights, external favicon). These are harmless — ignore them. Real breakage
shows up as `pageerror` events or other console errors.

### Asserting app state

Everything is a global; use `page.evaluate`:

- `opt` — live settings object (e.g. `opt.stretch`); movement/vision params
  are per-species: `opt.species` (array), `opt.sel` (selected species index)
- `flock.boids` — array of boids; each has `.vel` (V2D, `.mag()`), `.shape`
  (PIXI.Graphics with `.scale`, `.tint`, `.rotation`), `.x`/`.y`, `.si`
  (species index), `.sp` (live species settings), `.border` (species-colored
  outline Graphics)
- `g` — globals, including `g.shapeMode` (shape-rebuild counter)

Give the sim ~1–2s after load/toggles before asserting.

## Architecture notes for making changes

- **Boid shapes are cached.** `getShape()` in `js/boid.js` only redraws the
  `PIXI.Graphics` when `g.shapeMode` changes. Any setting that alters the
  cached geometry must increment `g.shapeMode` in its listener in `js/opt.js`
  (see the `hideBoids`/`areas`/`outlines`/`halfAreas` condition). Per-frame
  visual effects (tint, `scale`) go in `show()` instead and need no bump.
- **Species.** Movement/vision settings live per-species in `opt.species`
  (see `speciesDefaults` in `js/opt.js`); the menu's sliders edit the species
  selected by `opt.sel`. Each species has a `count`, border `color`,
  `avoidForce`, and `follow`/`avoid` boolean lists indexed by species. The
  flock reconciles boid counts per frame; species removal/import forces a
  rebuild (stale `boid.si`). The tab row and follow/avoid list are rebuilt by
  `renderSpecies()`.
- **New global settings need two entries in `js/opt.js`:** a default in
  `defaults` and a unique single-letter code in `encode` (a–z is exhausted —
  use uppercase; `S` is reserved for the species blob). A setting without an
  `encode` entry is silently dropped from export/import save strings.
- **New per-species settings** just need a default in `speciesDefaults` —
  the whole species array is serialized as one url-encoded JSON entry
  (`S=...`). Save strings without `S` are migrated via `legacyEncode` into a
  single species.
- New checkbox/slider markup in `index.html` just needs `data-model="<name>"`;
  the generic listeners in `opt.js` pick it up automatically (routed to the
  selected species when the name is in `speciesDefaults`).

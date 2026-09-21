# Svelte 5 Refactoring Plan — MICAPS-Web Client (`client/`)

> Goal: migrate the vanilla-JS workstation UI to **Svelte 5 (runes)**
> for better **structure / logic / CSS / state (incl. UI show-hide)**.
> Scope: `client/src/**` only. `server/**` (Go) and map science stay as-is.
> Output path: `./svelte5-refactoring-plan1.md` (this file).
> Roots: `/root/downloads/micaps-web`, app: `client/`.

---
## 1. Where we are (evidence, Sep 2026)

### 1.1 Stack and entry

- Build: Vite 6, no framework, `client/package.json` + `vite.config.js`.
- Entry: `index.html` -> `src/main.js` -> `src/app/bootstrap.js` (604 LOC).
- Tests: `bun test` in `client/test/` (85 files; §11: 35 pure keep green, R1/R2 shims cover the rest). Svelte: 0 hits (not present).
- Size: ~31.7k LOC, ~110 files in `client/src`.

### 1.2 Structure pain

- `app/bootstrap.js` (604) is a god-orchestrator: presets, tab/window
  sync, timeline callbacks, tlogp/time-height/line-profile wiring,
  keyboard, legend, layer callbacks — all in one file.
- `ui/` is half-factored: `ui/layers|timeline|tabs|config/` facades are
  good; flat files remain large (`catalogDrawer` 348, `configEditor` 445,
  `navBar` 241, `stationFilterControl` 325, `layerRowBindings` 603,
  `layerRowView` 578, `presetForm` 571, `layerForm` 557,
  `timeSliderView` 467, `tabs.css` 543).
- HTML = template strings + `innerHTML` (54 hits) + `getElementById`
  (55 hits). Full rebuild per change, e.g. `layerListView.js:61-98`
  rebuilds `#layers-list` then restores scroll/focus manually.
  Same pattern causes focus-loss bugs in
  `progress/redesign-config-ui-review1.md`.
- Engines are (correctly) imperative: MapLibre + deck.gl + canvas in
  `map/`, `layers/*`, `services/*`. Keep them.

### 1.3 Logic / state pain

- `store/appState.js` (94): `class AppState` + `Map<key,Set<cb>>`,
  `get/set/update/subscribe/emit`, `setLayer()`. Global
  `model/element/level/period` races multi-window use (flagged in
  `progress/multi-tabs-review1.md`); string-key subs are typo-prone.
- `ui/timeline/timelineStore.js`: mutable singleton `timelineState` +
  free fns (`fireTimeChange`, `notifyTimeline`); view mutates globals;
  per-chip `addEventListener` on every `renderChips()`.
- `ui/tabs/tabsStore.js`: mutable `tabsState` + good pure helpers
  (`getVisibleWindows`, `isWindowVisible`); DOM files reach into
  `document`; window objects hold live `map` (untestable).
- `ui/layers/layerStore.js` (151): `Map<winId,layers[]>` +
  `currentActiveWinId` + registered `renderLayersManagerFn`; every
  mutation does `getElementById("layer-control")` + rerender
  (store->view cycle); `addOrUpdateLayer` has dual signatures.
- `ui/legend.js`: `Map<winId,Map<element,entry>>` + `innerHTML` render.
- `services/*`: positional `(map, group, period, level, win, ...)` args,
  hard to mock (`weatherLoader`, `presetLoader`, `levelController`,
  `derivedContours`, `prefetchService` 460 LOC, `overlay*`).
### 1.4 CSS pain

- Barrel `src/style.css` imports 8 modules (`tokens`, `navbar`,
  `drawer-forms`, `layers-panel`, `station-filter`, `legend`, `timeline`,
  `responsive`) PLUS separate `tabs.css` linked in `index.html`.
  Cascade order is implicit and fragile.
- `styles/tokens.css` (vars, `.btn`, `.panel`, `.tooltip`,
  `.btn-fullscreen-toggle`) is sound — keep as the only global.
- Feature CSS lives far from its JS (`layers-panel.css` <-> `ui/layers/*`,
  `timeline.css` <-> `ui/timeline/*`). `tabs.css` mixes tabs-bar +
  window-grid + headers + config-editor.
- Show/hide is ad-hoc: `.hidden` + `.drawer.hidden{transform:...}` +
  `.tooltip.hidden{opacity:0}` + `.panel:empty{display:none}` + inline
  `style.display` in `toast.js:24-28`, `catalogDrawer.js:296-328`,
  `timeSliderView.js:75`, `navBar.js:145-151`, `legend.js:48-54`.
  No single visibility model — toggles can fight.
- Inline styles everywhere (`tooltip.js:50-63`,
  `stationFilterControl.js:80-87`, `layerListView.js:63-84`,
  `toast.js:12`). Global class names (`chip-btn`, `layer-row`,
  `win-header`) risk collisions.

### 1.5 UI show/hide inventory (must unify)

| UI | IDs today | Mechanism today |
|---|---|---|
| Catalog drawer | `#catalog-drawer.drawer.hidden` | `classList.add/remove("hidden")`; `X` only, no Esc/outside |
| Layer control | `#layer-control.panel` | `navBar.js:145-151` toggles `.hidden`; store rerenders on switch |
| Time slider | `#timeslider-container.hidden` | `setTimeSliderVisible()` toggles `.hidden` |
| Legend | `#legend-panel` | empty + `.hidden`; `:empty{display:none}` fallback |
| Tooltip | `#tooltip.tooltip.hidden` | `window.__SHOW_TOOLTIP__/__HIDE_TOOLTIP__` + `style.left/top` |
| Toast | `#error-toast` lazy | inline `style.display` + 4s timeout (`toast.js`) |
| Tabs/workspace | `#tabs-bar`, `#workspace-container`, `.window-panel.active` | `innerHTML=""` wipe + grid classes |
| Config editor | `#tab-item-config`, `#config-editor-panel` | manual pill create/remove (`configEditor.js:85-92`) |
| Layer rows | `.layer-config.hidden`, `.btn-vis.active`, `.layer-hidden` | per-row toggle; single-open by mutation (`layerListView:22-30`) |
| Station filter | `.filter-rule-row` | full `rerender()` per keystroke + focus restore (`:191-193`) |



## 2. Goals / non-goals

Goals:

1. Structure: one component per UI surface, markup+logic+style
   co-located. `bootstrap.js` shrinks to composition + service wiring.
   Facade folders become real component folders.
2. Logic: Svelte 5 runes replace hand-rolled pub/sub. Services stay
   framework-free and injectable. No `innerHTML` rebuilds; no manual
   scroll/focus restore; no `window.__*` tooltip bridge.
3. CSS: tokens stay global; everything else moves to scoped `<style>`.
   Delete `style.css` barrel + `tabs.css` monolith.
4. State: one reactivity graph — `app` (global) -> `tabs/windows`
   (map handle OUTSIDE reactivity) -> `layers` (per-window) ->
   `timeline` (per-window + playback) -> `ui` (all show/hide).
   Derived = `$derived`, side effects = `$effect`.
5. Show/hide: every visibility is boolean state in `ui.svelte.js`,
   rendered with `{#if}` / `class:hidden` — never `getElementById`.

Non-goals (phase 1):

- No science change (contour/QC/analysis/colormaps/station/wind/
  T-LogP/time-height/line-profile behave identically).
- No backend, `config.json`, or palette-format change.
- No SvelteKit; stay Vite SPA (`dist/` + `client.zip` unchanged).
- No map-engine change; MapLibre + deck.gl stay imperative behind
  a Svelte wrapper.

## 3. Target architecture

```text
client/
  index.html                 # only <div id="app">; entry -> main.svelte.js
  vite.config.js             # + @sveltejs/vite-plugin-svelte
  src/
    main.svelte.js           # mount App (replaces main.js facade)
    App.svelte               # NavBar+TabsBar+Workspace+panels+TimeSlider+Legend+Tooltip+Toast
    styles/tokens.css        # KEEP global (only global)
    lib/stores/
      app.svelte.js          # from store/appState.js
      tabs.svelte.js         # from ui/tabs/tabsStore.js
      layers.svelte.js       # from ui/layers/layerStore.js
      timeline.svelte.js     # from ui/timeline/*
      legend.svelte.js       # from ui/legend.js (state part)
      ui.svelte.js           # NEW — all show/hide + toast + tooltip
      configForm.svelte.js   # from ui/config/formState.js
    lib/services/            # MOVED unchanged: api, presets, weatherLoader,
                             # presetLoader, levelController, derivedContours,
                             # prefetchService, overlay*, contourReRender
    map/MapViewport.svelte   # owns ONE MapLibre instance (action)
    map/mapInstance.js       # kept, wrapped (no DOM lookup from services)
    components/
      NavBar / CatalogDrawer / LayersPanel / LayerRow /
      WindDrawer / StationDrawer / StationFilter / TimeSlider /
      TabsBar / WindowPanel / Legend / Tooltip / Toast /
      FullscreenButton / ConfigEditor + PresetForm/LayerForm/
      ColormapForm/SettingsForm/JsonFallback
    actions/
      mapViewport.js clickOutside.js keyboardShortcuts.js focusRestore.js
```

Rule: `components/*` -> `lib/stores/*` + `lib/services/*`;
`services/*` and `map/*` never import `components/*` or panel IDs.
Imperative code gets handles via props/callbacks, never `getElementById`.


## 4. State design (Svelte 5 runes)

### 4.1 Store map (before -> after)

- `AppState class` -> `lib/stores/app.svelte.js`:
  `export const app = $state({...})` with same fields
  (`model, element, level, activeGroup, cycle, period, obsTime,
  isObservation, layers, opacity, gridData, stationData, isPlaying,
  playbackSpeed, status, isMock`). `subscribe/emit` deleted;
  `setLayer()` becomes `app.layers[name] = v`.
- `timelineState` singleton -> `lib/stores/timeline.svelte.js`:
  per-window `createTimeline(winId)` returning `$state`; shared
  `playback` store. Fixes NWP-vs-OBS global clobbering when two
  windows step concurrently. `fireTimeChange` stays as injected
  service callback (no DOM).
- `tabsState` + `windowLayersMap` + `currentActiveWinId` ->
  `tabs.svelte.js` + `layers.svelte.js`: `tabs = $state([])`,
  `activeTabId = $state(1)`, `layersByWindow = $state({})`
  (plain object keyed by winId; or `SvelteMap` from
  `svelte/reactivity` if Map semantics needed). Window `map`
  handle stored OUTSIDE `$state` (module `Map<winId,map>`) so map
  mutations never trigger renders.
- `windowLegends Map` -> `legend.svelte.js`: `legends = $state({})`
  = `{ [winId]: [{element, colormap, zMin, zMax}] }`; ticks/gradient
  via `$derived` in `Legend.svelte` reusing `getColormap`,
  `getCSSGradient`, `formatElementUnit`.
- `isExpanded / filterRules / formState.isDirty` -> local `$state`
  in `LayerRow`, `StationFilter`, `ConfigEditor`. Single-open layer
  becomes a derived toggle, not a pre-render mutation. Filter
  keystrokes update rune arrays — inputs never unmount, killing the
  focus-restore hack.
- Module timers -> `$effect` with cleanup: NavBar status poll
  (`AbortController`), TimeSlider playback timer +
  `visibilitychange`, ConfigEditor `beforeunload`.

### 4.2 Canonical show/hide store (new)

```js
// lib/stores/ui.svelte.js
export const ui = $state({
  catalogOpen: false,
  layersOpen: true,
  timelineVisible: false,
  configOpen: false,
  activeConfigSubtab: "presets", // presets|colormaps|settings|json
  tooltip: null,      // { x, y, station... } | null
  toast: null,        // { kind, message } | null
  expandedLayerId: null, // replaces layerListView.js:22-30 mutation
  windowContextMenu: null
});
```

Render declaratively (example — Layers toggle):

```svelte
<!-- BEFORE navBar.js:145-151 -->
<!-- getElementById("layer-control").classList.toggle("hidden") -->

<!-- AFTER NavBar.svelte + App.svelte -->
<button class="btn btn-primary" class:active={ui.layersOpen}
  onclick={() => (ui.layersOpen = !ui.layersOpen)}>Layers</button>
{#if ui.layersOpen}<LayersPanel />{/if}
```

Same for drawer (`{#if ui.catalogOpen}` + `fly` transition, not
`.drawer.hidden{transform}`), timeline, legend
(`{#if entries.length}`, no `:empty` hack), tooltip/toast (`fade`).
Transitions: `import { slide, fade, fly } from "svelte/transition"`.

### 4.3 Data-flow example (timeline step)

```text
TimeSlider chip click
 -> timeline.goToPeriod(winId, period)  (runes update, labels $derived)
 -> onTimeChange cb (injected by App.svelte; was bootstrap:512-586)
 -> weatherLoader.loadWeatherField(mapHandle, ...) (unchanged)
 -> layersByWindow[winId] updated -> LayersPanel + Legend rerender
```

No `innerHTML=""` chips, no per-chip `addEventListener`
(use `{#each ...}` + `onclick`).


## 5. CSS design

1. Keep global: `styles/tokens.css` ONLY (`:root` vars, `body/html`,
   `#app/#main-content/#workspace-container`, `.btn/.btn-primary`,
   base `.panel` primitive if reused).
2. Move to scoped `<style>`: `navbar.css`->`NavBar`,
   `drawer-forms.css`->`CatalogDrawer`+forms,
   `layers-panel.css`->`LayersPanel`+`LayerRow`,
   `station-filter.css`->`StationFilter`, `legend.css`->`Legend`,
   `timeline.css`->`TimeSlider`, `responsive.css`->`App`
   (shell-grid media queries).
3. Delete: `src/style.css` barrel, `src/tabs.css` (split into
   `TabsBar`+`WindowPanel`+`ConfigEditor` styles). `index.html` links
   only tokens + maplibre CSS.
4. Rules: no ID-coupled selectors (`#btn-play`, `#chk-contourf`);
   use classes + `class:` directives. No `style="..."` strings in JS —
   use `style:property` / `class:name={cond}`. MapLibre overrides use
   `:global(.maplibregl-...)` in `MapViewport.svelte` only. Keep
   `--bg-*/--border-color/--text-*/--accent-*` var names stable.
   Remove hidden compat inputs (`layerListView:74-84`
   `#chk-contourf/#slider-opacity/...`); move tests to
   `data-testid="layer-visibility-contourf"` etc.
5. Responsive: shell grid in `App.svelte`; drawer/panel widths via
   component-scoped media queries.

## 6. Component migration

| Component | From | Key change | Show/hide after |
|---|---|---|---|
| App + main | `index.html`, `main.js`, `bootstrap.js` | static shell replaces 7 mount divs; injects `onTimeChange/onLayerAction/onConfigChanged` once | owns `ui.*` composition |
| NavBar | `ui/navBar.js` + `navbar.css` | selects bind to active window; `$effect` status poll w/ abort cleanup | toggles `ui.layersOpen/catalogOpen/configOpen` |
| CatalogDrawer | `ui/catalogDrawer.js` | local `$state` form; sections `{#if isObs/element}`; obs-times `$effect([model])`; `clickOutside`+Esc close | `{#if ui.catalogOpen}` + `fly` |
| LayersPanel+LayerRow | `ui/layers/*` (store/list/rowView 578/rowBindings 603/defaults/palette/actions) | `layers=$derived(layersByWindow[activeWinId])`; `{#each key}`; `expanded = ui.expandedLayerId===id`; `bind:checked` (no ID binding) | `{#if ui.layersOpen}`; row `{#if expanded}` |
| StationFilter | `stationFilterControl.js` + css | `filterRules/Logic` `$state`; `{#each bind:value}`; no unmount -> focus stable | inside expanded station row |
| TimeSlider | `ui/timeline/*` (467) + css | per-window derived periods/obs/labels; chips `{#each}`; timer+visibility `$effect` | `{#if ui.timelineVisible}` |
| TabsBar+WindowPanel+MapViewport | `ui/tabs/*` + `tabs.css` | reuse `getVisibleWindows`; Svelte dnd handlers; one MapLibre per `MapViewport` action; map handle out-of-band | layout `class:`; hidden wins not rendered |
| Legend | `ui/legend.js` + css | `entries=$derived(legends[activeWinId])`; `Wn` prefix from live `winIdx` | `{#if entries.length}` |
| Tooltip+Toast | `ui/tooltip.js`, `ui/toast.js` | read `ui.tooltip/ui.toast`; clamp helper extracted (testable); no `window.__*`; toast `$effect` timeout | `{#if ...}` + `fade` |
| ConfigEditor+forms | `ui/configEditor.js` + `ui/config/*` (571/557/414/350...) | shell owns `ui.configOpen/subtab`/dirty/`beforeunload`; sub-forms bind draft (no `mount*Form(el)`, no `#mount-layer-*` crash); `configSchema.js` kept | `{#if ui.configOpen}` + subtab `{#if}` |
| Fullscreen+keys | `fullscreenControl.js`, `keyboardShortcuts.js` | `$state` + `fullscreenchange` effect; `<svelte:window onkeydown>` in App | `class:is-fullscreen` |

Profile panels (`tlogpPanel` 596, `timeHeightPanel` 576,
`lineHeight/hovmollerPanel` + Canvas/Controller/Loader) stay
imperative in phase 1, hosted in `WindowPanel`; convert in phase 2.


## 7. Phases (incremental, shippable)

- Phase 0 Scaffold (0.5-1d): add `svelte@5` +
  `@sveltejs/vite-plugin-svelte`; extend `vite.config.js` (keep
  `griddata` alias, `dist/assets/emptyOutDir`); create `lib/`,
  `components/`, `actions/` beside legacy `src/`. Gate: `vite build`
  passes with empty `App.svelte`.
- Phase 1 Foundations (1-2d): port `appState->app`,
  `tabsStore->tabs`, `layerStore->layers`,
  `timelineStore+Math->timeline`, `legend state->legend`,
  new `ui.svelte.js`, `formState->configForm`. Per §11 R1/R2: plain-core
  bun tests for `getVisibleWindows`, `selectObsChipsWindow`, legend ticks;
  zero test-file edits. Gate: stores importable from legacy JS + Svelte.
- Phase 2 Shell + show/hide (2-3d): App, NavBar, CatalogDrawer,
  LayersPanel/Row, TimeSlider, Legend, Tooltip, Toast, Fullscreen,
  TabsBar/WindowPanel/MapViewport w/ scoped styles; `ui.*` toggles;
  legacy `init*` behind flag. Gate: boots w/ empty maps; §1.5 all
  state-driven; no `getElementById(...hidden)` in new code.
- Phase 3 Data wiring (2-4d): inject window provider +
  `onTimeChange/onLayerAction` from App into unchanged `services/*`;
  drawer submit -> `presetLoader/weatherLoader`; slider steps ->
  same; panel edits -> `overlay*/contourReRender`; legend sync.
  Gate: NWP+SURFACE+UPPER_AIR, level step, playback, per-window
  layers match legacy.
- Phase 4 Config + filters (2-3d): ConfigEditor + sub-forms +
  StationFilter; replace `mount*Form(el)`; new `data-testid`s added
  (compat IDs stay green until P5, per §11 R4).
  Gate: save/apply, focus-stable filters, dirty `beforeunload`.
- Phase 5 Cleanup (1-2d): apply §11.2 (one file replaced, small selector
  updates), delete legacy `ui/*.js`, `ui/*View/Bindings`,
  `ui/timeline/*View/Controller`, `ui/tabs/*View/Panels`, `legend`,
  `tooltip`, `toast`, `configEditor` shims, `style.css`, `tabs.css`;
  remove `window.__SHOW_TOOLTIP__`, compat inputs, focus-restore.
  Update `Architecture.md` + `README.md`. Gate: grep
  `getElementById|innerHTML|classList.*hidden` = 0 in components;
  `bun test` + `vite build` + QA green.

Total ~8-15 working days, one engineer; each phase reviewable.

## 8. Risks

- Map in `$state` -> proxy/render storms. Fix: map NEVER in `$state`;
  module `Map<winId,map>` + action lifecycle; services take handles.
- Tests pinned to `#chk-*/#timeline-chips/.chip-btn` break. Fix: §11 R4 —
  compat IDs stay until Phase 5, then one mechanical `data-testid` pass;
  shim signatures frozen + CI-checked so §41 imports never silently drift.
- Timeline global races return. Fix: per-window timeline from day 1;
  keep `periodStepSeq/loadSeq` guards in services.
- CSS/z-index regression (nav 1000/drawer 600/panel 550/legend 500/
  tooltip 2000/toast 9999). Fix: freeze `tokens.css` vars + document
  z-scale in `App.svelte`; screenshot-compare before/after.
- Scope creep into science. Fix: `layers/**/*Canvas|Math|Loader|
  contourCompute`, `services/*` are import-only in phase 1 except
  DOM-lookup removal at boundaries.

## 9. QA checklist

- [ ] `bun test` green (P1-P4: zero test-file edits via §11 R1/R2;
  P5: §11.2 applied).
- [ ] `vite build` + `npm run package` (`dist/` + `client.zip`) ok.
- [ ] Manual: preset load; catalog NWP/OBS; level step (nav+window+
  keys); time chips/playback; split 1x1/1x2/2x2+reorder+focus; layer
  add/remove/vis/opacity/palette; wind/station drawers; filters
  (focus stable); per-window legend; tooltip; toast; config
  open/edit/save/reload; fullscreen; Esc/outside closes drawer;
  narrow-width responsive.
- [ ] Grep gate: no `innerHTML/getElementById/.hidden`-toggle in
  new components. No leaked timers (`$effect` cleanup each).

## 10. Decisions needed

1. In-place (`client/src` morph) vs parallel (`client-svelte/`) —
   recommend in-place + flag (keeps `client.zip` stable).
2. Svelte 5 minor + Vite-plugin pin (align w/ Vite 6).
3. Component tests: per §11.3 — `bun test` stays the gate; optional new-only
   `vitest` + `@testing-library/svelte` smoke tests (no migration of
   existing tests), or manual QA first.
4. Profile canvases in phase 2 vs hosted-imperative until 2b.

## 11. Test strategy — do we need to rewrite our tests?

Short answer: **No. `bun test` stays the gate; we add tests, (almost) never rewrite.**

Inventory (grep over `client/test`, Sep 2026 — 85 files):

- **35 files import zero `src/ui/*`** — colormaps, contour clip/logic,
  formatters, lineprofile/timeheight/tlogp math + canvas/loader,
  memory, viewport-crop, pmtiles, weather symbols. The migration never
  touches their import graph: **untouched, stay green.**
- **~41 files import `src/ui/*`, but mostly pure logic that merely lives
  under `ui/`** (timeline math, layer defaults, config schema /
  form-state / presets / swatch, tab-store helpers, layer-store CRUD).
  They keep passing via R1–R2 below: **no edits.**
- **~8 DOM-coupled files** need small mechanical updates; **exactly one**
  file is replaced (§11.2). Nothing is ported to another runner.

### 11.1 Rules that make rewrites unnecessary

- **R1 — plain core stays plain; runes are a thin shell.** Bun cannot
  compile `$state/$derived/$effect` in `.svelte.js`. So each ported
  store keeps pure logic in a plain `.js` module (same fns, same
  signatures); the `.svelte.js` file only wraps it in runes.
  `timelineMath.js` <- `timeline.svelte.js`, `formState.js` <-
  `configForm.svelte.js`, same for tab/layer helpers, legend builder,
  tooltip clamp. Tests import the plain core, never rune syntax.
- **R2 — facade paths survive as re-export shims until Phase 5.**
  `ui/timeSlider.js` keeps `getPeriodsForStep`, `ui/layerControl.js`
  keeps `getLayersForWindow/addOrUpdateLayer`, `ui/layerActions.js`
  keeps `handleLayerAction`, etc., delegating to `lib/`. Shim signatures
  are frozen (CI asserts the export surface); shims die in Phase 5 with
  their last callers.
- **R3 — split pure builders from DOM renderers.** `legend.js` ->
  `buildLegendItems(winId)` (bun-tested) + `Legend.svelte`;
  `layerRowView.js` -> `buildLayerRowModel(layer)` + `LayerRow.svelte`.
  Tests assert builder output, not HTML strings.
- **R4 — one mechanical selector migration at Phase 4/5.**
  `#chk-contourf/#slider-opacity/#timeline-chips/.chip-btn` ->
  `data-testid="layer-visibility-contourf"/"timeline-chip"` etc. Compat
  IDs stay until Phase 5 so the suite is green mid-migration.

### 11.2 Disposition per DOM-coupled file (everything else: no change)

- `timeslider.test.js` (`getPeriodsForStep`): no change (R2).
- `config-*.test.js`, `config-schema/draft/color-presets`: no change (R1).
- `prefetch/*`, `playback/*`, `kinematics/*`, `derived/*`,
  `station_contour*`, `palette_persistence`, `window_title`,
  `keyboard_shortcuts`: no change while R2 signatures frozen.
- `contour_raster_exclusivity_legend.test.js`: small update — assert
  `buildLegendItems()`; keep one `legend-panel` mock smoke test.
- `ui/fullscreenControl.test.js`: small update to the `FullscreenButton`
  contract (or ride the shim until Phase 5).
- `ui_review2/3_fixes.test.js`: small update at Phase 5 — selectors to
  `data-testid`s.
- `ui/tab-subwindow-visibility.test.js`: **the sole replacement** —
  delete its 60-line DOM mock; assert
  `ui.timelineVisible/ui.configOpen` store transitions instead.

### 11.3 Additive gates (no runner migration)

- `bun test` is the only required gate, before and after. Do not move
  existing tests to vitest.
- Optional, new files only: `vitest` + `@testing-library/svelte` smoke
  tests for ~3 components (NavBar toggle, LayersPanel expand,
  TimeSlider chips).
- New bun tests on plain core: `ui.svelte.js` toggle matrix (all §1.5
  rows), per-window timeline isolation (regression for the global race
  in `progress/multi-tabs-review1.md`), legend builder, tooltip clamp.
- Phase gates: P1 += "zero test-file edits, green via shims"; P5 +=
  "shims deleted; §11.2 applied; R1/R4 grep clean".

---
*Surveyed: `client/src/**`, `client/index.html`, `client/package.json`,*
*`client/vite.config.js`, `progress/*`. Next: approve Phase 0, scaffold*
*Svelte 5 + tokens-only `App.svelte`.*

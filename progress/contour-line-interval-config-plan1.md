# Contour Line Interval Config (start / span / end) — Plan 1

## 1. Goal

Add a per-contour-layer **Interval** control next to the existing `Contour Lines` color / width / bold row, letting the operator override auto-generated levels with an arithmetic sequence:

```
levels = [start, start+step, ..., <= end]
```

- `start`: first contour value (inclusive)
- `span` (= step / interval): spacing between adjacent lines, must be > 0
- `end`: last contour value (inclusive, float-tolerant)
- Empty / `Auto` = fall back to current auto behavior (no behavior change by default).

Both isolines **and** isobands use the same `levels` (they already do today), so the interval change affects fills too. Raster is value-mapped, unaffected except legend min/max stays as-is.

## 2. Current state (verified)

| Concern | File:line |
|---|---|
| Contour Lines + Bold + Label Size row template | `client/src/ui/layers/layerRowView.js:153-182` |
| Bindings: `color-picker-line`, `input-line-width`, `input-bold-values`, `input-bold-line-width`, `input-label-size` | `client/src/ui/layers/layerRowBindings.js:103-162` |
| Style-only live update via `setLayerIsolineStyle` | `client/src/ui/layers/configActions.js:117-131` |
| Full recompute on `smooth` toggle (pattern to reuse for interval) | `client/src/ui/layers/configActions.js:133-189` |
| Defaults + `...(layerDef.config \|\| {})` passthrough | `client/src/ui/layers/layerDefaults.js:137-193` |
| NWP grid path: `options.levels \|\| getElementLevels(...)` | `client/src/layers/contour/contourMapSync.js:234` |
| NWP levels table (RH/WIND/DTD/VOR/DIV fixed; HGT span-aware; else palette/auto) | `client/src/utils/colormaps.js:271-352` |
| Surface path: `options.levels \|\| cfg.getLevels(minV,maxV)` | `client/src/layers/surfaceAnalysis.js:56` |
| Surface per-element `getLevels` (SLP/TMP/TD arithmetic; VIS/RAIN6/WIND/DTD/VOR/DIV fixed lists) | `client/src/layers/analysis/contourConfigsSurface.js:30-241` |
| Sounding path: `options.levels \|\| cfg.getLevels(numLevel,-100,100000)` | `client/src/layers/soundingAnalysis.js:111-115` |
| Sounding per-element `getLevels` (HGT table, TMP/TD fixed `-60..36 step 4`, WIND/DTD/VOR/DIV special) | `client/src/layers/analysis/contourConfigsSounding.js:40-210` |
| Station kinematic path: `options.levels` else `cfg.getLevels(...)` | `client/src/layers/analysis/kinematicContours.js:65-72` |
| NWP kinematic render (`triggerVortDivOverlay` spreads `...layer.config`, no `levels` today) | `client/src/services/overlayKinematics.js:47-62,121-136` |
| Isoband re-render (`triggerIsobandOverlay` spreads `...layer.config`) | `client/src/services/overlayTriggers.js:64-81,122-138` |
| Shared compute: `tagLinesAndFills`, `buildContourRenderOptions`, `buildContourLayerMeta` | `client/src/layers/analysis/objectiveAnalysis.js:89-232` |
| Bold parsing (`parseBoldValues`) | `client/src/layers/contour/contourCompute.js:12-29` |

Key insight: every render path already honors `options.levels` / `layer.config.levels` if set — but **nothing ever sets it**. Interval UI is therefore a producer of `levels`; no contour-math change needed.

## 3. UX design

Extend the existing `config-row` in `layerRowView.js:153-182` with one sub-row, same visual language (11px, `#161b22` inputs, `padding-left: 20px` indent):

```html
<div style="...padding-left: 20px...">
  <span>Interval:</span>
  <div style="display:flex; gap:4px; flex-wrap:wrap;">
    <input class="input-interval-start" type="number" step="any" placeholder="Start" title="First contour value (empty = auto)" />
    <input class="input-interval-step"  type="number" step="any" placeholder="Span"  title="Interval spacing, > 0 (empty = auto)" />
    <input class="input-interval-end"   type="number" step="any" placeholder="End"   title="Last contour value (empty = auto)" />
    <button class="btn-interval-auto" title="Reset to automatic levels">Auto</button>
  </div>
</div>
```

Behavior:

1. Any field empty/blank → **Auto mode** for that layer (delete override, recompute with existing auto logic). Partial triples are NOT applied.
2. All three filled + valid → generate levels, store, full re-render.
3. Invalid triple → red border + `title` tooltip, no re-render, keep old levels. Cases: `step <= 0`, `start >= end` (after float compare), non-finite, resulting count `< 2` or `> MAX_LEVELS (60)`.
4. `Auto` button clears the three inputs + stored override and re-renders with auto levels.
5. Inputs initialized from `layer.config.interval = { start, step, end }` if present, else placeholders. Show derived count as tooltip, e.g. `title="12 levels"`.
6. Widths: `start/end ~56px`, `step/span ~48px` to fit the 302px drawer (same wrap-safe pattern as Width 40px + Bold 64/36px row, cf. `ui-review2.md:39`).
7. Threshold-style elements (VIS, RAIN6, WIND, DTD, VOR/DIV, sounding TMP/TD fixed lists) still allow override — that is the point (operator knows best). No per-element disabling in Plan 1.

Naming: label the middle field `Span` per the request, with `title="Interval / span (step)"` to avoid ambiguity.

## 4. Data model

Add to contour `layer.config` (alongside `lineColor/lineWidth/boldValues/boldLineWidth/labelSize`):

```js
interval: { start: number, step: number, end: number } | null  // null = auto
levels: number[] | null                                       // derived cache, null = auto
```

- `interval` is the UI source of truth (persisted via existing `autoSaveLayerConfig` + `...(layerDef.config||{})` passthrough — no `presets.js` schema change).
- `levels` is the derived cache actually consumed by `options.levels`. Recomputed by a single helper so all 4 pipelines agree.
- `buildBaseConfig` in `layerDefaults.js:137-193` gains:
  ```js
  interval: layerDef.config?.interval || null,
  levels: layerDef.config?.levels || null,
  ```
  (spread on line 192 already carries unknown keys, but explicit defaults document intent + keep `Auto` reset clean.)

Rejected alternative: store only `levels` array without the triple. Loses round-trip editing (can't refill Start/Span/End inputs after reload). Keep both.

## 5. Shared helper (new, one place)

New file `client/src/layers/contour/contourLevels.js` (~60 lines, unit-testable):

```js
export const MAX_INTERVAL_LEVELS = 60;
export function buildLevelsFromInterval(start, step, end, opts={})
  // parseFloat, finite check, step>0, start<end, count guard
  // loop: v = start + i*step; round to 10 decimals to kill 0.1+0.2 drift
  // include end with eps = step*1e-6; cap at MAX_INTERVAL_LEVELS
  // return { levels } or { error: 'step'|'range'|'count'|'nan' }
export function resolveRenderLevels(config) // config.levels if valid array else null
export function validateInterval(start, step, end) // shared by UI + tests
```

All call sites use it; no duplicated loop.

## 6. Re-render wiring (follow the `smooth` pattern, NOT the style pattern)

Style changes (`lineColor/lineWidth/bold/labelSize`) only call `setLayerIsolineStyle` (`configActions.js:117-131`) — cheap, no recompute. **Interval changes data** (`levels`), so they must take the `smooth` branch (`configActions.js:133-189`): full re-analysis / `renderContourLayers` with explicit `levels`, then `armContourReRender`.

### 6.1 `layerRowBindings.js` — add 3 bindings + Auto button

```js
bindProp(".input-interval-start", "change", ...) // update pending triple, try apply
bindProp(".input-interval-step",  "change", ...)
bindProp(".input-interval-end",   "change", ...)
// on any change: read all 3 inputs; if any empty → return { interval: null, levels: null }? No —
// only apply on complete triple OR explicit Auto click. Incomplete triple: stash to layer.config.interval
// provisionally but do NOT emit re-render (return null/undefined so no callback).
// Complete+valid: layer.config.interval = triple; layer.config.levels = built;
//   autoSaveLayerConfig(layer); return { interval: triple, levels: built };
// Complete+invalid: mark inputs invalid, return null (no callback).
// ".btn-interval-auto" click: clear inputs, layer.config.interval=null; levels=null; autoSave; emit { interval:null, levels:null }.
```

Note: current `bindProp` emits `onLayerActionCallback("config", ...)` on every `change` — must suppress emission for incomplete triples to avoid wiping auto levels mid-typing (use `input` for live validation styling, `change` for apply).

### 6.2 `configActions.js` — handle `interval` / `levels`

Extend the `value.smooth !== undefined` block (or add a sibling `if (value.interval !== undefined || value.levels !== undefined)`):

- Resolve `levels = value.levels ?? layer.config?.levels ?? null` (null = auto).
- Branch exactly like `smooth`:
  - `isUpper` → `analyzeAndRenderSoundingElementContour(..., { ...layer.config, layerId, levels }, win)`
  - `isSurface` → `analyzeAndRenderSurfaceContours(..., { ...layer.config, layerId, levels }, win)`
  - `isNwpKinematic` → set `layer.config.levels = levels` then `triggerVortDivOverlay(map, layer, win)` (requires 6.4 fix to forward `levels`).
  - else NWP grid (`layer.gridData`) → `renderContourLayers(..., { ...layer.config, layerId, levels, ...style fields }, ...)` + `armContourReRender`.
- `triggerIsobandOverlay` / palette-restore paths already spread `...layer.config`, so they pick up `levels` automatically once stored — verify no explicit `levels: undefined` overwrite.

### 6.3 Station paths — already compatible, one-line verification each

- `surfaceAnalysis.js:56`, `kinematicContours.js:65`, `soundingAnalysis.js:114` all prefer `options.levels`. Since `configActions` passes `{ ...layer.config }` (which now contains `levels`), no change needed except ensuring `smooth` re-render path forwards `levels` (it does via spread) and new interval path does the same.

### 6.4 `overlayKinematics.js` — forward `levels` (small fix)

Both `renderContourLayers` calls (`:47-62`, `:121-136`) spread `...layer.config` so `levels` flows through **iff** `renderContourLayers` reads `options.levels` — it does (`contourMapSync.js:234`). Confirm no `levels` stripping; add explicit `levels: layer.config?.levels` alongside `lineWidth/boldValues` for readability, mirroring `overlayTriggers.js:72-79`.

### 6.5 `objectiveAnalysis.js` — no logic change

`buildContourRenderOptions` / `buildContourLayerMeta` spread `options` into `config`, so `interval` + `levels` persist on newly registered layers automatically. Optionally add them explicitly to the returned objects for discoverability.

## 7. Validation & guards

- `step > 0`, finite; `start < end`; count `2..60` else reject with inline red border (no toast — typing-time errors shouldn't spam; toast only on Apply-click failures if a button is used).
- Float hygiene: `Math.round(v*1e10)/1e10`; HGT dam/gpm agnostic (raw values, no ×10 conversion — matches `getElementLevels` behavior of emitting native units).
- `levels.length > 60` → reject; suggest larger span in `title`.
- Fills: same `levels` feed `contourf` (`tagLinesAndFills`, `contourMapSync.js:247`) — large counts cost Marching Squares time; 60-cap keeps it bounded. `evaluateCropAndLOD` budget untouched.
- Bold values independent — a custom interval may exclude current bold values (lines just render non-bold). No auto-adjust in Plan 1; document it.

## 8. Files to change (ordered)

1. **NEW** `client/src/layers/contour/contourLevels.js` — `buildLevelsFromInterval / validateInterval / resolveRenderLevels + MAX_INTERVAL_LEVELS`.
2. `client/src/ui/layers/layerRowView.js:166-181` — insert Interval sub-row after Bold row, before Label Size row.
3. `client/src/ui/layers/layerRowBindings.js:145-162` — interval bindings + Auto button; suppress callback on incomplete/invalid.
4. `client/src/ui/layers/configActions.js:133-189` — new `interval/levels` recompute branch (mirror `smooth`); include `levels` in NWP `renderContourLayers` option bag.
5. `client/src/ui/layers/layerDefaults.js:166-193` — `interval: null, levels: null` defaults.
6. `client/src/services/overlayKinematics.js:47-62,121-136` — explicit `levels` passthrough (robustness).
7. Tests (see §9).

No server change. No `config.json` / preset schema change (rides existing `config` persistence).

## 9. Tests

- **NEW** `client/test/contour_interval.test.js` (bun:test, mirror `contour_logic.test.js`):
  - `buildLevelsFromInterval(1000, 2.5, 1010)` → 5 levels `[1000,1002.5,1005,1007.5,1010]`.
  - Float case `(0, 0.1, 0.3)` → `[0,0.1,0.2,0.3]` (no `0.30000000004`).
  - Rejects: `step<=0`, `start>=end`, `NaN`, count>60.
  - `resolveRenderLevels({levels:[1,2]})` vs `{interval, levels:null}` → null (auto).
  - Integration (mock map like `contour_logic.test.js:41-87`): `renderContourLayers(gridData,'TMP',{levels:[0,4,8,...]})` produces isolines whose `value` set ⊆ custom levels; auto path unchanged when `levels` omitted.
- Existing suites to re-run: `contour_logic.test.js`, `station_contour_analysis.test.js`, `dtd/levels-render.test.js`, `kinematics/*`.

## 10. Acceptance criteria

- [ ] Contour drawer shows `Interval: [Start][Span][End][Auto]` under Bold row, wraps cleanly at 302px.
- [ ] Valid triple re-renders isolines+isobands at exactly those levels for NWP grid, surface, sounding, and VOR/DIV layers.
- [ ] Clearing any field or pressing Auto restores previous auto levels.
- [ ] Invalid triple blocks apply with inline hint, never crashes or clears the map.
- [ ] Reload persists triple via `autoSaveLayerConfig` (inputs repopulated).
- [ ] New unit test file passes; existing contour suites green.

## 11. Out of scope (follow-ups)

- Per-level custom lists / irregular intervals (paste `1000,1004,1008,1016`).
- Separate fill vs. line intervals.
- Auto-suggest span from data range (nice-to-have placeholder logic).
- Slider UI for span.

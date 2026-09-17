# Refactoring Large Files (>500 lines) — Plan 1

**Date:** 2026-09-17
**Goal:** Split all code files >500 lines into small single-responsibility modules with no behavior change. Keep public imports working via facade re-exports. Reduce duplication (objective-analysis pipeline, contour style exprs, canvas overlays, barb glyphs, test mocks).
**Status:** Plan only; no code changed.
**Test baseline:** `client/` `bun test` (see `client/package.json:scripts.test`). No vitest config in `client/vite.config.js`.

---

## 1. Inventory (>500 lines, excl `.git/`, `node_modules/`, `dist/`, `palettes/`, binaries, `client/config.json`)

| File | Lines | Action |
|---|---|---|
| `client/src/main.js` | 1342 | split into `app/` + `services/` |
| `client/src/ui/layerActions.js` | 1218 | split dispatcher vs triggers |
| `client/src/layers/stationLayer.js` | 1098 | split into `layers/station/` (7 modules) |
| `client/test/vorticity_divergence.test.js` | 1092 | split into `test/kinematics/` (7 files) |
| `client/src/ui/layerControl.js` | 981 | split store vs views vs bindings |
| `client/test/prefetch.test.js` | 963 | split into `test/prefetch/` (5 files) |
| `client/src/ui/timeSlider.js` | 934 | split math vs store vs view vs playback |
| `client/src/ui/tabWindowManager.js` | 812 | split into `ui/tabs/` (6 modules) |
| `client/src/style.css` | 812 | split into `styles/*.css` + barrel |
| `client/src/layers/windLayer.js` | 809 | split sampling/overlay/streamlines/barbs/grid |
| `client/test/dtd_analysis.test.js` | 798 | split into `test/dtd/` (5 files) |
| `client/src/layers/soundingAnalysis.js` | 740 | share `analysis/objectiveAnalysis.js` |
| `client/test/derived_layers.test.js` | 670 | split into `test/derived/` (4 files) |
| `client/src/layers/surfaceAnalysis.js` | 650 | share `analysis/objectiveAnalysis.js` |
| `client/test/memory_optimization.test.js` | 646 | split into `test/memory/` (6 files) |
| `client/src/layers/contourLayer.js` | 546 | split compute/style/mapSync |
| `client/test/ui_play_loop_review1_fixes.test.js` | 520 | split into `test/playback/` + `test/a11y/` |
| `client/src/utils/smoothContour.js` | 515 | split chaikin/simplify/grid |
| `Architecture.md` | 1451 | docs — no code change |

`server/` needs no split (largest: `server/mock/mock_generator.go:347`, `server/parser/station_parser.go:353`).

---

## 2. Principles

1. **Facade compatibility:** keep original path re-exporting new modules, e.g. `contourLayer.js` re-exports from `layers/contour/*`. No caller import changes in phase 1.
2. **No behavior change:** pure moves + dedup via shared helpers; each phase ends with `bun test` green + `vite build` green.
3. **Break cycles first:** `windLayer.js <-> soundingAnalysis.js` (`WIND_QC_BOUNDS` vs `generateStationWindGrid`). New leaf `layers/analysis/qcBounds.js` both import from.
4. **Centralize 4 hotspots:** objective-analysis pipeline, contour style exprs, canvas-overlay helper, barb glyph helper, `FIELD_KEYS` extract table.
5. **Tests:** extract `test/helpers/*` first, then split large test files by existing `describe`/T-/§-sections. Keep `bun test test/<dir>/` working per split.

---

## 3. Layers

### 3.1 `contourLayer.js:546` — compute / style / map-sync mixed
- Problems: `updateMapLibreContour:237` ~130 lines does data+crop+render; `lineWidthExp/lineColorExp` built identically in 3 places (`247-258`, `404-415`, `424-429`); smoothing pre-pass duplicated (`185-189` vs `519-525`); `flush(emptyFC)` duplicated in `removeAllContourLayers:505-513`.
- Target:
  - `layers/contour/contourCompute.js` — `parseBoldValues/isFeatureBold` + `computeStats/computeIsobands/computeIsolines/smoothLines`.
  - `layers/contour/contourStyle.js` — `buildLineWidthExp/buildLineColorExp/buildLabelSizeExp` + defaults; `getLayerDOMIds`.
  - `layers/contour/contourMapSync.js` — `syncIsoband/syncIsoline`, `flushContourSource/removeContourLayer/removeAllContourLayers`.
  - Keep `contourLayer.js` facade.

### 3.2 `surfaceAnalysis.js:650` + `soundingAnalysis.js:740` — ~400 lines duplicated
- Problems: bbox block (`surface:298-339` ≈ `sounding:calculateFieldContours:437-477`), meshgrid/griddata/smooth/minMax (~30 lines ×3), contour+tag+fillColor, `renderCustom+addOrUpdateLayer` payload, `DTD/VOR/DIV` config stanzas, kinematic fns ~90% identical. `SOUNDING getLevels/getBoldValues` arity hacks tolerate `(level,min,max)` vs `(min,max)`.
- Target (shared):
  - `layers/analysis/qcBounds.js` — `HGT_QC/TMP_QC/WIND_QC + standardHgtLevels/boldMapHgt` (breaks cycle).
  - `layers/analysis/objectiveAnalysis.js` — `extractPoints/computeDomain/interpolateGrid/tagLines/colorFills/resolveShowFlags/registerContourLayer`.
  - `layers/analysis/contourConfigsSurface.js`, `layers/analysis/contourConfigsSounding.js` — registries + normalizers only.
  - `layers/analysis/kinematicContours.js` — single `analyzeKinematicContours({stations,level,elementKey,mode})`.
  - `calculateFieldContours` becomes thin wrapper `{levelAware:true, fallbackLevels:true}`. Keep both `*Analysis.js` as facades; delete `analyzeAndRenderSurfaceSLPContours` alias or keep in facade.

### 3.3 `windLayer.js:809` — overlay + physics + derivation mixed
- Problems: header normalize duplicated (`22-33` vs `401-412`); bilinear weights duplicated (`75-113` vs `435-453`); canvas boilerplate duplicated + same in `stationLayer.js`; `generateStationWindGrid:649` (~160 lines IDW) unrelated to rendering; circular import with sounding.
- Target:
  - `layers/wind/windSampling.js` — `normalizeHeader/createBilinearSampler`.
  - `layers/wind/canvasOverlay.js` — `ensureOverlayCanvas/fitCanvasToContainer/clearAndRemove` (reuse from station canvas).
  - `layers/wind/streamlines.js` — `renderWindStreamlines/stopWindAnimation` + particles.
  - `layers/wind/gridBarbs.js` — `renderGridWindBarbs/removeGridWindBarbs/drawBarbGlyph` (share glyph with station symbols).
  - `layers/analysis/stationWindGrid.js` — move `generateStationWindGrid`, import `qcBounds.js`.
  - Keep `windLayer.js` facade.

### 3.4 `stationLayer.js:1098` — largest src file, 5 responsibilities
- State (`WeakMap`), extract/QC, filter, render (barb/sky/plot/canvas), hover/interaction all in one file. Per-frame per-station re-extract (`730-778`); key-scan arrays scattered (same as surface/sounding extractors); barb math duplicates `windLayer:538-573`; bounds normalize duplicated (`264-268` vs `927-935`).
- Target `layers/station/`:
  - `stationState.js` — WeakMap/config/geojson/`__STATION_LAYER__`.
  - `stationExtract.js` — single `FIELD_KEYS` table + `extractRawNumber/extractTemp/extractPressureOrHeight/getFieldValue/hashStation`; surface/sounding configs delegate here.
  - `stationFilter.js` — `evaluateSingleRule/matchesStationFilters/compileStationFilter`.
  - `stationSymbols.js` — `drawWindBarbCanvas/drawSkyCoverCanvas` + shared `barbGlyph`.
  - `stationPlot.js` — `renderStationPlotToCanvas`.
  - `stationCanvas.js` — `ensureStationCanvas/drawStationCanvas/visibility/remove`.
  - `stationHover.js` — `onStationMouseMove/handleStationHover/handleStationMouseOut/isPointInBounds`.

---

## 4. UI + `main.js`

### 4.1 `tabWindowManager.js:812`
- DOM + events + `tabs[]` state + map API + dynamic `import("./timeSlider.js")` cycle. `syncTabCameras:790-812` duplicates `initWindowMap` move/load blocks (3 copies); title format duplicated in `main.js`/`timeSlider.js`.
- Target `ui/tabs/`: `tabsStore.js`, `tabsBarView.js`, `windowPanels.js` (+`renameWindowIds`), `windowMaps.js` (`jumpToVisibleWindows` single impl), `windowTitles.js`, `windowFocus.js` (inject timeSlider callbacks, remove dynamic import).

### 4.2 `timeSlider.js:934`
- Pure math + DOM + playback state + `appState` + dynamic `import("./tabWindowManager.js")` in `startPlayback`. `step()` obs/nwp branches mirror ~60 lines; boxed `{period,_seq}` payload built in 3 places.
- Target `ui/timeline/`: `timelineMath.js` (pure, unit-test), `timelineStore.js`, `timeSliderView.js`, `playbackController.js` (inject `getActiveWindow`).

### 4.3 `layerControl.js:981`
- Store + 370-line `renderLayersManager:266-637` + 56 `getElementById/querySelector/addEventListener` + palette/config API. `bindStationCheckbox/bindBasemapCheckbox/bindProp` same pattern ×3; default colors repeated; `render+getElementById("layer-control")` in 4 mutators; `showFill/showRaster` exclusion also in `layerActions.js`.
- Target `ui/layers/`: `layerStore.js`, `layerDefaults.js` (60-line baseConfig factory), `layerListView.js`, `layerRowView.js` (`renderLayerRow/renderWindDrawerHTML/renderStationDrawerHTML`), `layerRowBindings.js`, `palettePicker.js` (share gradient helper).

### 4.4 `layerActions.js:1218`
- `handleLayerAction:31-708` (~677-line dispatcher) + fetch + map effects + 10 lazy imports. `renderContourLayers(...)` literal ×6; `updateLegend/removeLegend` guard ×10; palette block ×3 (also ×4 in `main.js`); `triggerWindStreamlines` vs `triggerWindBarbs` differ only in final render; wind cache key duplicated in `main.js`.
- Target: `ui/layers/actionsDispatcher.js` (route only), `visibilityActions.js` (+`syncLegendForShading`), `configActions.js` (+`applyPaletteToLayer`), `derivedContourActions.js` (wind/sounding/surface), `services/overlayTriggers.js` (`ensureWindGrid/resolveWindFile/renderContourWithDefaults/ensurePaletteColormap`), `ui/layers/legendSync.js`.

### 4.5 `main.js:1342`
- `bootstrap:84-455` (370 lines) + `loadWeatherField:457-705` + 2 derived-contour renderers (~106 lines each, 80% identical) + `changeVerticalLevel:1165-1334`. NWP payload + `resolveForecastCycles->updateWindowTitle->setTimelineMode` ×5; `layerSnapshots` ×4; palette restore ×4.
- Target: `app/bootstrap.js` (+`ui/toast.js`), `app/windowCallbacks.js` (`loadPresetGroupForWin` helper), `app/timelineCallbacks.js` (`snapshotWindowLayers` single impl), `services/weatherLoader.js` (`resolveCycleFile/fetchWeatherGrid/renderWeatherField`), `services/derivedContours.js` (unify sounding/surface), `services/levelController.js`.

---

## 5. Utils / CSS

### 5.1 `smoothContour.js:515` — 3 unrelated jobs
- Chaikin (a) + grid convolution (b) + Douglas-Peucker (c). `chaikinOpen vs Closed` same Q/R math; `smoothGeometry` vs `simplifyFeatureCollection` same 4-way switch; `getSqSegDist:348-366` dead (re-implemented inline).
- Target: `utils/geometry/ringUtils.js`, `utils/geometry/chaikin.js` (unified `chaikinIteration`), `utils/geometry/simplify.js` (reuse/delete `getSqSegDist`), `utils/grid/smoothGrid2D.js` + unit test.

### 5.2 `style.css:812` — 7 UI domains
- Target `styles/`: `tokens.css`, `navbar.css`, `drawer-forms.css`, `layers-panel.css`, `station-filter.css`, `legend.css`, `timeline.css`, `tooltip-responsive.css`; keep `style.css` as `@import` barrel. Dedup repeated `background/border/radius` + double `.layer-config`.

---

## 6. Tests — extract helpers first, then split by section

New `test/helpers/`: `mockMap.js` (`{bounds,withContainer,withEvents}` — replaces ≥10 `createMockMap` variants), `domMock.js` (replaces `createMockElement` in play-loop/ui-review3/dtd), `mockCanvas.js` (replaces `createMockCtx` + ad-hoc stubs), `stationFixtures.js` (unify surface/sounding factories in derived/dtd/station_contour), `kinematicGrid.js` (`solidRotationGrid/divergentGrid/uniformGrid`), `prefetchFixtures.js` (`makeNwpWin/mockFetchRecorder`), `fetchMock.js`.

| File | Split |
|---|---|
| `vorticity_divergence:1092` | `test/kinematics/math-sign.test.js` (T1), `metric-qc.test.js` (T2), `surface-adapter.test.js` (T3), `sounding-level.test.js` (T4), `nwp-cache-prefetch.test.js` (T5), `ui-chrome.test.js` (T6), `wind-lifecycle.test.js` |
| `prefetch:963` | `test/prefetch/api-cache.test.js` (§1), `adjacent-steps.test.js` (§2), `targets.test.js` (§3), `execution.test.js` (§4), `directional-stepper.test.js` (§5) |
| `dtd_analysis:798` | `test/dtd/extract-qc.test.js` (§1+§6), `levels-render.test.js` (§2-§5), `station-plot.test.js` (§9), `tooltip-units-palettes.test.js` (§7+§8+§10), `presets-robustness.test.js` (§11+§12) |
| `derived_layers:670` | `test/derived/config-persistence.test.js`, `add-remove-actions.test.js`, `visibility-level-step.test.js`, `qc-filters.test.js` |
| `memory_optimization:646` | `test/memory/viewport-crop.test.js`, `simplification-lifecycle.test.js`, `rerender-registry.test.js`, `raster-hardening.test.js`, `wind-canvas.test.js`, `memstats.test.js` |
| `ui_play_loop_review1:520` | `test/playback/p0-self-pause.test.js` (P0/M1/P1/M3/m4/M2), `window-switch.test.js` (L1/m6/R5/R1/R2), `speed-singleton-visibility.test.js` (R3/R4/m7/m8/m9/m10/m10-CSS) — reentrancy + a11y covered inline, no separate files |

Note (2026-09-17): `derived/qc-filters` already covered by `visibility-level-step.test.js` (no separate file); kinematics wind lifecycle split out of `ui-chrome.test.js` into `kinematics/wind-lifecycle.test.js`; `test/helpers/cssText.js` (`readStyleCss`/`readSrcText`) serves CSS/string assertions since `style.css` is now an `@import` barrel.

Also fix level-rename triple-copy (`derived:451,550`, `dtd:454`, `vorticity:506`) via single `buildLevelStepIds()` helper.

---

## 7. Phased Execution

1. **Phase 0 — helpers, no splits:** add `test/helpers/*`, `qcBounds.js`, `canvasOverlay.js`, `barbGlyph`, `snapshotWindowLayers`, `buildLevelStepIds`. Validate `bun test`.
2. **Phase 1 — layers (biggest win):** `stationWindGrid` move + cycle break → `objectiveAnalysis.js` → surface/sounding thin wrappers → `contour/*` → `wind/*` → `station/*`. Validate per step.
3. **Phase 2 — UI:** `timelineMath` (pure) → `tabs/*` → `timeline/*` → `layerStore/layerDefaults` → dispatcher split. Inject callbacks to remove dynamic-import cycles.
4. **Phase 3 — app:** `toast` → `weatherLoader` → `derivedContours` → `levelController` → `window/timelineCallbacks`.
5. **Phase 4 — utils/css:** `geometry/*` + `smoothGrid2D` → `styles/*` barrel.
6. **Phase 5 — tests:** helpers rollout → kinematics → prefetch → dtd → derived → memory → playback.

Each phase: move → facade → `bun test` → `vite build` → delete dead code (`getSqSegDist`, `analyzeAndRenderSurfaceSLPContours` alias, legacy `updateVisibleMarkers` noops).

---

## 8. Risks

- Dynamic-import cycles (`main<->layerActions`, `tabs<->timeline`) — fix by callback injection, not more lazy imports.
- Snapshot/rename string drift (`contour-sounding-*-level`, `upperair-obs-level`) — single helper + tests pin it.
- CSS split ordering — barrel `@import` preserves cascade; check 768px/520px media last.

---

## 9. Acceptance

- [ ] No file in `client/src/**/*.js`, `client/test/**/*.js` >500 lines (excl generated), `style.css` split. `client/config.json` explicitly out of scope.
- [ ] Original import paths still work (facades).
- [ ] Zero `windLayer<->soundingAnalysis` and `tabs<->timeline` cycles (grep `from.*soundingAnalysis` in wind, dynamic `import.*tabWindowManager|timeSlider` gone).
- [ ] `bun test` green, `vite build` green, no duplicated `renderContourLayers` literal / legend guard / palette block (grep ≤1 impl each).

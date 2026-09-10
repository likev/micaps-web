# Surface Canvas Review 1 — Direct HTML5 Canvas 2D Station Overlay

Commit: `14e9c09` — `feat(station): upgrade surface and upper-air station plots to direct HTML5 Canvas 2D overlay for locked 60 FPS navigation` (2026-09-10).

Files: `Architecture.md` (+20/-17), `client/src/layers/stationLayer.js` (572 → 1148 lines, +735/-159), `client/test/station_canvas_overlay.test.js` (+408, new).

## 1. What changed

* New primary path: single full-screen `<canvas.station-plot-canvas>` (`zIndex: 410`, `pointerEvents: none`) per map, via `client/src/layers/stationLayer.js:59` (`ensureStationCanvas`). Replaces per-station `maplibregl.Marker` DOM tree.
* New drawing primitives: `client/src/layers/stationLayer.js:443` (`drawWindBarbCanvas`), `:535` (`drawSkyCoverCanvas`), `:607` (`renderStationPlotToCanvas`), `:749` (`drawStationCanvas`). Logic is a line-for-line port of `client/src/utils/weatherSymbols.js:41` (`getWindBarbSVG`) and `:3` (`getSkyCoverSVG`) — same staff geometry (`skyRadius 8`, `staffLength 41`, `barbAngle +70°`), same thresholds (calm `<1.5`, pennant `>=18` → `-20`, full `>=3.5` → `-4`, half `>=1.5`), same 9-position WMO layout and colors.
* Retained pipeline: `isPointInBounds` geo-cull → `map.project` screen-cull (`±60px` margin) → `100x100px` binning → max 5/bin via FNV `hashStation` (`client/src/layers/stationLayer.js:789-822`). Unchanged semantics from pre-commit DOM path.
* Navigation: `requestAnimationFrame`-coalesced redraw on `move/zoom/resize/moveend/zoomend` (`client/src/layers/stationLayer.js:115-130`). DPR-aware resize (`min(dpr,2)`, `setTransform`), zoom-dependent `scale` (`0.85/1.0/1.15`).
* Hover: linear scan of `activeVisibleStations` within 22 px, drives existing `window.__SHOW_TOOLTIP__/__HIDE_TOOLTIP__` (`client/src/ui/tooltip.js:10,65`) via `client/src/layers/stationLayer.js:143-177`. Cursor pointer toggle included.
* Fallback removed per review: old DOM/SVG builder `createStationMarkerDOM` deleted; `updateVisibleMarkersForMap` (`client/src/layers/stationLayer.js:832`) is now canvas-only (`drawStationCanvas`). `maplibregl` + `getSkyCoverSVG`/`getWindBarbSVG` imports dropped; `clearStationMarkersForMap` kept as backward-compat no-op.
* Both call sites covered: surface and sounding branches in `client/src/main.js:881,918` call `renderStationWeatherPlots`, so surface + upper-air both migrate with no caller change.
* Docs: `Architecture.md:964,975-978,994-997,1056-1063` updated to Canvas engine; wind-barb table realignment only.

## 2. Verification

* New suite passes: `bun test client/test/station_canvas_overlay.test.js` → 7 pass, 43 expects (canvas create/reuse, calm/pennant/barb, octas 0/2/8, 9-element plot + DTD displacement, move/zoom redraw, hover show/hide, cleanup).
* Full suite: 192 pass / 6 fail from repo root, identical 6 fail on `HEAD~1` (185 pass, +7 new here). Failures are cwd artifacts — tests read `./src/...` / `./config.json` and only pass when run from `client/` (verified: `cd client && bun test test/viewport_crop.test.js` → 5 pass). No regression from this commit.
* Calm-size parity confirmed: canvas `ctx.arc(...,10*scale)` (`stationLayer.js:447`) matches SVG `r="10"` (`weatherSymbols.js:50`). No `4.5px` regression (that value is only in `Architecture.md` prose for the pre-CMA null circle).

## 3. Strengths

* Correct performance trade: 1 canvas node vs thousands of markers; `WeakMap` per-map state, `cancelAnim` coalescing, early-out on `!visible`/empty all correct.
* Barb/sky/text port is faithful; DTD-vs-ww/VV collision rules verified on canvas (`stationLayer.js:718-731` region, covered by `station_canvas_overlay.test.js` + canvas-based `dtd_analysis.test.js` §9).
* Cleanup is complete: `removeStationLayer` (`stationLayer.js:1082`) cancels rAF, offs all 7 listeners, removes canvas node, resets counts. `setStationVisibility` (`stationLayer.js:1046`) toggles `display` + clears correctly.

## 4. Findings

**M2 (resolved by deletion) — render duplication eliminated.** `renderStationPlotToCanvas` vs `createStationMarkerDOM` duplicated every extractor and visibility rule. Deleting the SVG branch removes the drift surface; no shared `parseStationPlot` helper needed.

**M3 (done) — SVG/DOM branch deleted.** Removed `createStationMarkerDOM`, the `maplibregl.Marker` fallback in `updateVisibleMarkersForMap`, `markers[]` state, and the `getSkyCoverSVG`/`getWindBarbSVG`/`maplibre-gl` imports. `clearStationMarkersForMap` remains as a no-op for backward compat; `__STATION_LAYER__.getVisibleCount` now returns `renderedCount` only. Migrated `dtd_analysis.test.js` §9 from `renderedMarkers[].element.innerHTML` assertions to `renderStationPlotToCanvas` + recording-ctx `fillText`/`fillStyle` checks. Full suite: 208 pass / 0 fail from `client/`.

**m1 — Sky-cover `9` (obscured) renders as overcast.** `drawSkyCoverCanvas` clamps with `Math.min(8,...)` (`stationLayer.js:548`), so the `default:` X-cross (`stationLayer.js:589`) is unreachable; `9 → 8` solid fill. Same bug pre-exists in `weatherSymbols.js:9`. Clamp to 9 and add explicit `case 9:` X-cross if obscured must be distinguishable.

**m2 (moot after deletion) — scale divergence gone.** Canvas-only path uses single `0.85/1.0/1.15` table; old `0.9` fallback constant removed with the branch.

**m3 — Hover scan is unthrottled O(N) per `mousemove`.** `handleStationHover` (`stationLayer.js:143`) runs `Math.hypot` over all visible stations on every event with fixed 22 px radius (not `× scale`). Fine for typical densities, but add rAF-throttle and scale the radius, or a coarse bin lookup, before 10k-point national maps.

**m4 — Double draw on load.** `main.js:881-882` (and `918-919`) calls `renderStationWeatherPlots(...)` then `setStationConfig(...)`, each of which calls `updateVisibleMarkersForMap` → full canvas pass. Swap order or make `setStationConfig` the sole entry with merged config.

**Nit — Stale global after remove.** `removeStationLayer` nulls per-map `geojson` but leaves module `lastStationGeoJSON` (`stationLayer.js:12`), so `getStationGeoJSON(null)` returns removed data. Clear it or scope it per-map.

**Nit — `Architecture.md:1029` table fix is unrelated.** `|:---:|` → `|:---|` single-cell change; harmless, keep.

## 5. Recommended follow-ups

1. Add LoD-cap test (12 stations in one 100px bin → 5 drawn) and `setStationVisibility(false)` test (canvas `display:none`, `renderedCount 0`, hover no-ops).
2. Fix sky-cover 9, throttle hover.

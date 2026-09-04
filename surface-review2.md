# Surface Review 2 — Uncommitted Changes (derived contours + follow-ups)

Date: 2026-09-04. Scope: full uncommitted diff (`client/`, `server/db/catalog_queries.go`, `client/test/derived_layers.test.js`).
Baseline: `bun test` → 52 pass / 0 fail across 10 files.

## What changed

- `client/public/config.json`: declared derived entries — `contour-surface-slp` in `composite-surface`; `contour-sounding-hgt-500`, `contour-sounding-tmp-500` in `composite-upperair-500` (all `type: "contour"` + `derivedFrom`, per Review-1 §4).
- `client/src/config/presets.js`: `autoSaveLayerConfig` matches derived entries across levels by (model, element); new `upsertDerivedLayerToPreset` / `removeDerivedLayerFromPreset` with debounced `savePresetConfig`.
- `surfaceAnalysis.js` / `soundingAnalysis.js`: stamp `derivedFrom` (default `surface-obs` / `upperair-obs-<level>`) on registered layers.
- `main.js`: obs time-step snapshots registry contours to `win.derivedContourSnapshots` instead of clearing; `loadPresetGroup` skips grid fetch for `derivedFrom` layers; `loadObservationProduct` / `loadUpperAirComposite` derive declared group entries first, fall back to snapshots/registry, then hardcoded defaults; station layers now receive group `render` as `config` and resolve group station ids.
- `layerActions.js`: `addContour` passes explicit `layerId`/`lineColor`/`derivedFrom` and upserts the preset entry; `remove` deletes the preset entry and prunes snapshots.
- `layerControl.js`: closes `config-grid-2col` before the contour row (Review-1 §1 fix); shortens drawer labels; exports `renderStationDrawerHTML` for tests.
- `timeSlider.js`: active chip `scrollIntoView` after render (Review-1 §2 fix, guarded).
- `server/db/catalog_queries.go`: `ORDER BY column1 DESC` in `GetFileList` — verified live via `bore.pub:45061` (returns `20260904080000.000` first; previously Mar-07–11).
- `client/test/derived_layers.test.js` (new): config declarations, upsert/remove, cross-level autosave, add/remove action persistence, drawer HTML.

## Findings (ordered by severity)

### 1. Stale overlays survive time steps in the catalog path
The obs time-step handler no longer calls `clearAllWeatherLayersFromMap` (`main.js:290`). Contours are fine (re-derived by upsert), but nothing stops/refreshes auxiliary map layers: an active station-streamline animation keeps blowing the old grid, `removeGridWindBarbs` never runs, and a derived contour with `showRaster` keeps its old-time raster layer (the analysis path never re-renders raster). Fix: on obs time step, `stopWindAnimation` / `removeGridWindBarbs` before reload and re-trigger from new data (`triggerStationStreamlines`, `triggerRasterOverlay` for re-derived contours with `showRaster`).

### 2. Hidden derived contours come back visible after a time change
Snapshots store `visible`, but re-derive passes only `config` — `analyzeAndRender*` always draws. Registry keeps `visible: false` while the map shows the layer. Pre-existing in the group path, now extended to catalog. Fix: fold `visible` into the derive step (`showFill: visible && cfg.showFill`, etc.) or re-apply isoline/isoband visibility after deriving.

### 3. Level change in catalog upper-air windows drops ＋Add contours
`changeVerticalLevel` clears then loads with no snapshot (`main.js:784`); with no `activeGroup` there is no declared entry, so user-added TD/WIND vanish into the default HGT+TMP pair. Same snapshot trick as the time handler fixes it.

### 4. `groupDerived` doesn't filter by model
`loadObservationProduct`'s SURFACE branch would feed an UPPER_AIR derived entry through the surface normalizer (unknown element → SLP default), and vice versa. No current group mixes models — add one `l.model === model` predicate per branch.

### 5. Upper-air declared `id`/`level`/`name` drift after level steps (cosmetic)
Upsert matches by (model, element) and merges only `render`, so the entry keeps `contour-sounding-hgt-500` / "500 hPa…" while live layers move to `-700`. Harmless (derivation recomputes the id from `curLevel`; removal matches by model+element) but confusing in the config editor. Consider updating `id`/`level`/`name` on match.

### 6. `autoSaveLayerConfig` derived-match is broader than the upsert match
Keys on (model, element) alone — ignores `derivedFrom` value and level — and the preset loop has no break, so a tweak can write into derived entries of other presets sharing the element. Acceptable single-user/single-group; recorded as known limitation.

### 7. Behavior change to confirm intentional (positive)
Station layers now receive group `render` as `config`, so preset-saved station toggles/filters actually apply on load — previously silently dropped in favor of defaults. Visible change, worth calling out in release notes. Wholesale-replace (not merge) is safe: the drawer treats `undefined` as default-on/off correctly and `ensureLayerFilterRules` backfills.

### 8. Test gaps
No coverage for visibility-restore (item 2), the snapshot time-step flow, or the `derivedFrom` skip in `loadPresetGroup` (all unexported). The drawer test's "closes before selector" assertion passes on any `</div>` in the chunk — a tag-balance count (`opens === closes`) would pin the actual Review-1 defect.

## Suggested order
Items 1–4 before commit (all small); 5–8 as follow-ups or release notes.

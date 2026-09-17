# Refactoring Large Files — Review 1 (uncommitted implementation)

**Date:** 2026-09-17
**Scope:** uncommitted work vs `refactoring-large-file-plan1.md` (config.json out of scope).
**Baseline:** `d985e7b`. Modified: 12 files (`-9397/+507`). Untracked: 27 paths (`app/`, `layers/{analysis,contour,station,wind}/`, `services/{derivedContours,layerSnapshots,levelController,overlayKinematics,overlayTriggers,overlayWind,presetLoader,weatherLoader}`, `styles/`, `ui/{layers,tabs,timeline}/`, `ui/toast.js`, `utils/{geometry,grid}/`, `utils/levelStepIds.js`, `test/{derived,dtd,helpers,kinematics,playback}/`).
**Verification:** `bun test` 355 pass / 0 fail across 40 files; `vite build` ok (`dist/assets/index-BHPp04nV.js` 1432 kB).

---

## 1. Verdict

Src refactor is substantially done and safe; test/CSS refactor is half-done. All `client/src/**/*.js` facades are <500 lines and re-export correctly, cycles are broken, tests+build green. But acceptance fails: 6 old tests still >500 lines (kept alongside new splits = duplication), `style.css:811` untouched with `styles/*.css` dead, `test/helpers/*` unused, `test/prefetch/` + `test/memory/` empty.

---

## 2. What works

- **Facades clean, all src <500:** `contourLayer.js:35`, `windLayer.js:29`, `layerActions.js:34`, `layerControl.js:45`, `tabWindowManager.js:67`, `timeSlider.js:55`, `smoothContour.js:21`, `main.js:39`, `stationLayer.js:51`, `surfaceAnalysis.js:170`, `soundingAnalysis.js:210` (only two >100, both justified wrappers). New modules all <500 (max `timeSliderView.js:467`, `prefetchService.js:432` unchanged). `contourLayer.js:34` still exports `renderContourLayers` via `contourMapSync.js:215` — callers (`configActions.js`, `overlayKinematics.js`, `weatherLoader.js`, `overlayTriggers.js`, `contourReRender.js`) unaffected.
- **Wind<->sounding cycle broken:** `qcBounds.js:82` is the single source for `HGT_QC/TMP_QC/WIND_QC`; `stationWindGrid.js:165` owns `generateStationWindGrid`; `soundingAnalysis.js:6` imports one-way from it. No `from.*soundingAnalysis` in `wind/`. Good.
- **Objective-analysis sharing real:** `analysis/objectiveAnalysis.js:163` (`extractPointsAndValues/computeDomain/interpolateAndSmoothGrid/tagLinesAndFills/resolveShowFlags/registerContourLayer`) used by both `surfaceAnalysis.js:6-13` and `soundingAnalysis.js:18-26` + `kinematicContours.js:183`. Config registries separated (`contourConfigsSurface.js:256`, `contourConfigsSounding.js:223`).
- **Splits match plan where done:** `contour/{Compute,Style,MapSync}`, `wind/{sampling,canvasOverlay,streamlines,gridBarbs,barbGlyph}`, `station/{State,Extract,Filter,Symbols,Plot,Canvas,Hover}`, `tabs/*` (6), `timeline/{Math,Store,View,playbackController}`, `layers/{Store,Defaults,ListView,RowView,RowBindings,PalettePicker,visibility,config,derived,legendSync}`, `geometry/{chaikin:183,simplify:173}`, `grid/smoothGrid2D:161`, `levelStepIds.js:19` canonical + `test/helpers/levelStepIds.js:1` re-export (not a copy — good).
- **Extra services reasonable:** `presetLoader.js:184`, `weatherLoader.js:263`, `derivedContours.js:320`, `levelController.js:182`, `overlayTriggers.js:288` + `overlayWind.js:160` + `overlayKinematics.js:149`, `layerSnapshots.js:18` — deviation from plan but sensible (plan put all in `weatherLoader`/`overlayTriggers`; finer split is fine).

---

## 3. Issues (ordered)

### P0 — `style.css:811` not split; `styles/*.css` dead code
- `git diff client/src/style.css` = 1 blank line removed. `client/src/styles/` (8 files, 811 lines total) exists but `client/index.html:7` still loads only `./src/style.css`; no `@import`, no `styles/` reference in src. Net effect: duplicated CSS to maintain, zero runtime effect. `tabs.css` untouched (out of scope, but note it).
- Fix: make `style.css` the `@import` barrel per plan §5.2 (tokens → navbar → drawer → layers → filter → legend → timeline → responsive last to preserve 768/520px cascade), then delete moved blocks; or delete `styles/` if abandoning. Verify visually + `vite build`.

### P0 — old large tests kept; new splits duplicate instead of replace
- Still >500: `vorticity_divergence:1092`, `prefetch:963`, `dtd_analysis:798`, `derived_layers:670`, `memory_optimization:646`, `ui_play_loop:520` (total 4689 lines old + 4616 lines new). `bun test` now runs 40 files (was 24) — same cases twice, 2× maintenance.
- New tests still inline `createMockMap` (e.g. `derived/visibility-level-step.test.js:16` verbatim copy of `derived_layers.test.js:16`) instead of importing helpers.
- Fix: delete old files once new splits are trusted (or keep old + delete new — pick one). Plan acceptance requires zero `client/test/**/*.js` >500.

### P0 — `test/helpers/*` (8 files, 573 lines) unused
- `grep -rn "helpers/" client/test client/src` = zero hits. `mockMap.js:126`, `domMock.js:165`, `mockCanvas.js:79`, `stationFixtures.js:58`, `kinematicGrid.js:79`, `prefetchFixtures.js:30`, `fetchMock.js:35` are dead. New splits (`kinematics/math-sign.test.js:1-30` etc.) still import directly from `src/` and define local mocks.
- Fix: migrate one split (e.g. kinematics) to helpers, prove `bun test` green, then roll out; delete unused otherwise.

### P1 — `test/prefetch/` + `test/memory/` empty
- Dirs exist, zero files. Plan §6 required 5 + 6 splits; `prefetch.test.js:963` and `memory_optimization.test.js:646` remain monoliths. Largest remaining test debts.
- Fix: perform the planned §-splits, or remove empty dirs to avoid implying done.

### P1 — partial test splits missing
- kinematics: 6/7 (missing `wind-lifecycle.test.js`; content likely still in `ui-chrome.test.js:475` — largest new test, consider splitting).
- derived: 3/4 (missing `qc-filters.test.js`).
- dtd: 4/5 (missing `presets-robustness.test.js`).
- playback: 3/5 (missing `reentrancy-async-step`, `a11y/play-button`).
- Either complete or amend plan.

### P1 — `main.js:21-31` string-assertion hack
- Facade keeps real logic moved out, but old `ui_play_loop_review1_fixes.test.js` does `fs.readFileSync(main.js)` string checks (m6/R5/m9). Implementation pastes the expected snippets as **comments** to pass. Brittle: comments drift from `app/bootstrap.js:407` real code with no compiler check.
- Fix: update old test to assert on `app/bootstrap.js` + `services/*` (preferred), or keep a real re-exported constant. Delete comment block once tests migrate.

### P2 — surface/sounding wrappers still duplicate payload
- `surfaceAnalysis.js:50-56,81-136` vs `soundingAnalysis.js:52-61,139-175`: `minV/maxV` scan, `renderOptions`, `layerMeta` (~50 lines) near-identical; only `element/level/derivedFrom/gridData` differ. Plan called for thin wrappers over `objectiveAnalysis.registerContourLayer`.
- Fix: extract `buildRenderOptions + buildLayerMeta` into `objectiveAnalysis.js`; leave element-specific `extract/getLevels/bold` in configs.

### P2 — tabs→timeline dynamic imports remain
- `timeline/playbackController.js:182` `import("../tabWindowManager.js")`, `services/prefetchService.js:292` same. Plan wanted injected `getActiveWindow` callbacks (`timelineStore.setActiveWindowProvider` exists but unused by these two call sites). `catalogDrawer.js:213,237,330` lazy imports also remain.
- Low risk (tests/build pass), but cycle goal not fully met. Fix by wiring existing provider.

### P3 — trivial
- `utils/geometry/ringUtils.js` (plan) not created — `isRingClosed` stays in `chaikin.js`; fine, amend plan.
- `styles/responsive.css:26` vs plan `tooltip-responsive.css` — rename only; tooltip styles location unverified, check tooltip still styled after barrel switch.

---

## 4. Metrics

| Area | Before | After (uncommitted) |
|---|---|---|
| src files >500 | 12 (+config) | 0 (max new `timeSliderView:467`) |
| test files >500 | 6 | 6 old + 16 new <500 (duplicated) |
| `style.css` | 812 | 811 + 811 dead in `styles/` |
| `bun test` | — | 355 pass / 0 fail / 40 files |
| `vite build` | — | ok, 27.7s |

---

## 5. Next steps

1. CSS: barrel `style.css` or delete `styles/`; visual check.
2. Tests: wire `helpers/*` into one split, then delete corresponding old file; repeat per area; fill `prefetch/` + `memory/` or drop empty dirs.
3. Replace `main.js:21-31` comment hack with assertions on new paths.
4. Extract `buildRenderOptions/buildLayerMeta`; inject `getActiveWindow` into playback/prefetch.
5. Re-run `bun test` + `vite build`; amend plan where intentionally deviated (extra services, missing splits, `ringUtils`).

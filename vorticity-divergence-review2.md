# Vorticity & Divergence Implementation Review — Review 2 (follow-up)

**Date:** 2026-09-17
**Scope:** uncommitted working tree vs `abb0d3c` (16 modified + 3 untracked), delta since `vorticity-divergence-review1.md`.
**Tests:** `cd client && bun test` → **274 pass / 0 fail** across 24 files (was 265/24 at Review 1; `vorticity_divergence.test.js` 22 → 31 tests).
**Verdict: Approve with minor follow-ups (no blockers).** All six Review 1 follow-ups are addressed. The delta since Review 1 is the NWP-wiring + hardening pass (Review 1 F1 wired, CONV pinned, headless guards, cycle/prefetch fixes). New findings below are P3/doc-hygiene only.

---

## 1. Review 1 follow-up disposition (all closed)

| Review 1 item | Current state | Verdict |
|---|---|---|
| F1 dead `triggerVortDivOverlay` export | Now wired: `triggerIsobandOverlay` early-route (`layerActions.js:763`), `triggerRasterOverlay` early-route (`:876`), smooth-toggle branch (`:220-250`), palette-apply branch (`:334`), wind-layer `addContour` branch (`:384-488`), `main.js` timestep extra-layer re-trigger + level-step `prevDerived` restore + import | ✅ Closed |
| F2 hidden preset entry missing `level` / `derivedFrom:"wind"` | Unchanged config shape (group `hasLevel` supplies level — consistent with siblings); runtime now stamps `contour-<model>-vor-<level>` + `derivedFrom: wind-<model>-<level>` in `loadWeatherField`, wind-layer branch uses live `layer.id`. Dual convention persists but both resolve; cosmetic only | ✅ Closed (cosmetic, no action) |
| F3 non-preset rename ignores VOR/DIV names | Fixed for obs branch: `main.js` UPPER_AIR snapshot map now builds `elemName` with VOR/DIV arms + `name`. NWP branch adds `prevDerived` restamp with VOR/DIV names. Preset `hasLevel` branch already had arms | ✅ Closed |
| F4 `CONV` alias vs builder sign disagreement | Resolved per option (a): `CONV` **removed** from all three normalizers (`surfaceAnalysis.js:250-262`, `soundingAnalysis.js:295-305`, `layerActions.js:384-386` — none map `CONV` anymore), builder keeps `CONV == -DIV` (`kinematics.js:301-306`) + new pinning test `vorticity_divergence.test.js:553` asserts `CONV == -DIV` on a divergent fixture | ✅ Closed |
| F5 dead `main.js` kinematic imports | Gone: `main.js:13-14` now import only the generic entry points (`analyzeAndRenderSoundingElementContour`, `analyzeAndRenderSurfaceContours`); kinematic dispatch stays inside the adapters. `triggerVortDivOverlay` import is used | ✅ Closed |
| M3 absolute `/root/.../config.json` path | Fixed: `vorticity_divergence.test.js:767` uses `new URL("../config.json", import.meta.url)` (relative, checkout-portable) | ✅ Closed |
| F6 `SURFACE_ANALYSIS` model-string mismatch | Still present (`layerActions.js:220` checks `SURFACE_ANALYSIS`, adapters stamp `SURFACE`) but harmless — surface smooth-toggle works via the `contour-surface-` id-prefix fallback in the same branch. Pre-existing, correctly left alone | ✅ Acknowledged, no action |
| M2 prefetch unreachable `lvl=null` branch | Still present (`prefetchService.js:199` inside the VOR/DIV branch, unreachable since SURFACE/UPPER_AIR `continue` earlier). Harmless dead line; leave until that function is next touched | ✅ Acknowledged, no action |

---

## 2. What changed since Review 1 (delta inventory)

The math core (`kinematics.js` 341 lines, `surfaceAnalysis.js`/`soundingAnalysis.js` adapters, `colormaps.js`/`formatters.js`/`paletteLoader.js`/`config.json` colormaps + hidden `contour-ECMWF_HR-vor-850`) is **unchanged** since Review 1 — no re-audit needed. The delta is 9 new tests + wiring/hardening:

- **Tests +9 (22→31):** `CONV==-DIV` pin, `renderWindDrawerHTML` drawer test, `WIND`-norm scalar-speed test, wind-layer `addContour`→derived test, wind-removal lifecycle tests (×2), catalog-drawer VOR/DIV test, no-wind-speed-contour guard test. All meaningful (mock-map + cache-once counting), none tautological.
- **`main.js` NWP lifecycle:** `loadWeatherField` VOR/DIV/`WIND`-derived branch (WIND fetch → `_windGridCache` → `buildKinematicGridData` → standard render/legend path, `path: dataPath`, `derivedFrom` stamp); bootstrap + `resolveForecastCycles` VOR/DIV→WIND mapping (`timelineSync.js`, `main.js:284`); timestep `extraLayers` re-trigger; level-step `prevDerived` snapshot/restore for NWP kinematic layers.
- **`layerActions.js` wind-layer branch:** `addContour` on a wind layer creates `contour-<model>-<elem>-<level>` + persists via `upsertDerivedLayerToPreset`; isoband/raster/smooth/palette all route NWP-kinematic through `triggerVortDivOverlay`; eye/delete lifecycle extended (wind-stop/barb cleanup, `activeGroup.layers` + `layerSnapshots` splicing, single-product `win.element` fallback).
- **`layerControl.js`:** VOR/DIV defaults (`showFill:false`, `lineColor`, `boldValues`, `color`); new `renderWindDrawerHTML` (VOR/DIV-only Add-Contour selector); `btn-add-station-contour, .btn-add-contour` generic binding; `typeof document` guards.
- **Small fixes:** `presets.js` persists `visible` on upsert (eye-state survives preset save); `contourReRender.js` skips pure-wind arming + restricts move re-render to `type==="contour"` (kinematic contour layers still re-render; wind vectors never did); `catalogDrawer.js` VOR/DIV in NWP element selects; `tabWindowManager.js` document guards (headless-test hardening); `prefetchService.js` SURFACE/UPPER_AIR early-skip + NWP parent-WIND rule retained.
- **Docs:** `Architecture.md` §7.5 + suite counts 224/22→265/24.

---

## 3. New findings (all P3, non-blocking)

### F7 [P3 — doc drift] `Architecture.md:557` contour intervals don't match code
- Docs list `[-20,-16,-12,-8,-4,0,4,8,12,16,20]`; code `VOR_LEVELS`/`DIV_LEVELS` (`kinematics.js:40-41`, mirrored in `colormaps.js:284-289`) are `[-20,-15,-10,-8,-6,-4,-2,0,2,4,6,8,10,15,20]`.
- **Fix:** update the doc line to the code array (one-line edit). Bold `[0,10]`/`[0]` lines are correct.

### F8 [P3 — scope expansion, undocumented] `WIND`-as-contour shares the kinematic path
- `main.js:452` `isDerivedWind` (WIND + contour-type/`contour-` id/`derivedFrom`) and the `isNwpKinematic` predicates (`layerActions.js:221,334,763,876`) route derived **wind-speed contours** through `buildKinematicGridData("WIND",…)` (scalar-speed branch, `kinematics.js:307-323`) and `triggerVortDivOverlay`. Plan §5-F specified VOR/DIV only.
- Behavior is sane (speed = hypot, smoothed; name `"Derived Wind Speed"`, `lineWidth: 2.0` vs 1.4 for plain contours) and covered by the new WIND-norm + no-stray-wind-contour tests. Just wider than the plan.
- **Fix (docs only):** one sentence in `Architecture.md` §7.5 noting WIND-derived speed contours reuse the same cache/render path. Also note `renderWindDrawerHTML` offers only VOR/DIV, so the WIND-derived path is currently reachable only programmatically / via station drawers — either add a WIND option to the wind drawer or keep as-is intentionally.

### F9 [P3 — wasteful, harmless] binary prefetch for VOR/DIV raster warms the wrong bytes
- `prefetchService.js:205-207` pushes `{type:"binary", path: MODEL/WIND/lvl}` when a VOR/DIV layer has raster on. But `triggerVortDivOverlay` renders raster client-side from the computed `kinGrid` (`renderGridRaster(kinGrid…)`), never from the server binary stream — the prefetched WIND binary is never consumed by the VOR/DIV raster path (grid prefetch on the line above **is** consumed via `_windGridCache`).
- Cost is one speculative fetch per step direction; correctness unaffected.
- **Fix (opportunistic):** drop the binary push in the VOR/DIV branch, or keep if the intent is to warm the shared WIND HTTP cache — either way add a one-line comment stating intent.

### F10 [P3 — race, low risk] timestep `extraLayers` re-trigger has no stale guard
- `main.js:422-428` nulls `extra.gridData` and fires `triggerVortDivOverlay` without `await` or the `expectedSeq` guard that protects the base `loadWeatherField`. Fast keyboard stepping could let an older period's kinematic response write `layer.gridData` after a newer one (same class of race the `expectedSeq` guard was built for).
- In practice the WIND `_windGridCache` is keyed by full `file`, and `triggerVortDivOverlay` restamps `layer.file` before fetching, so the window for a visible wrong-period overlay is narrow. Note for the next touch of that block; no fix required here.

---

## 4. Correctness notes (checked, no action)

- **M8 cycle resolution:** `timelineSync.js:83-84` + `main.js:284,457` map VOR/DIV→WIND before catalog lookup — correct, otherwise the client would request a nonexistent `MODEL/VOR/level` path. Cache key sharing between VOR and WIND is intended (same forecast cycles).
- **M9 `path: dataPath`:** stored NWP kinematic layers point at `MODEL/WIND/level` — intentional so the raster-binary fallback never requests `MODEL/VOR/level` bytes (Review 1 M4 still applies: raster toggle without in-memory `gridData` would render WIND bytes under a VOR legend; unreachable via the load path which always sets `gridData`).
- **M10 `contourReRender.js` guards:** wind-without-raster skip + contour-only move re-render are both correct; NWP VOR/DIV layers are `type:"contour"` with `gridData.values`, so viewport re-render still applies to them.
- **M11 `presets.js` visible persist:** one-line, affects all derived layers equally, strictly fixes eye-state loss (supports plan §5-E/T4).
- **M12 sounding `getLevels` arity hack** (`soundingAnalysis.js:254,279` `(level,minV,maxV)` with shift) correctly handles both the legacy `getLevels(numLevel,-100,100000)` call (`:325`) and the kinematic `getLevels(numLevel,stats.min,stats.max)` call (`:628`); surface `(minV,maxV)` two-arg form is unaffected.
- **M13 delete/eye lifecycle:** `activeGroup.layers` splice matches on `id || (model+element)` — broader than the old derived-only splice, but correct for the new wind-spawned derived layers; `win.element` fallback in single-product mode prevents a dead title after removing the base layer.

---

## 5. Test-quality spot check (delta)

- New `CONV` test pins the Review 1 F4 resolution directly (divergent fixture, `CONV == -DIV` at center, sign assertions both sides) — the right test for the decision taken.
- Wind-layer `addContour`, wind-removal, and no-stray-wind-contour tests assert layer creation, preset persistence shape, animation/barb cleanup, and that DIV creation doesn't spawn WIND contours — all behavior-level, mock-map based, non-tautological.
- Remaining gaps (acceptable): no multi-window `[Wn]` legend attribution check, no palette-toggle re-render test on a live kinematic layer, manual acceptance matrix (surface cyclone / 500 hPa trough / 200 hPa jet DIV couplet / split-window / calm-domain auto-levels) still operator-side.

---

## 6. Suggested follow-ups (non-blocking, smallest-first)

1. `Architecture.md:557` intervals → code array (F7, one line).
2. `Architecture.md` §7.5 one-liner on WIND-derived reuse + wind-drawer WIND-option decision (F8).
3. Prefetch VOR/DIV binary-push: delete or comment intent (F9).
4. `expectedSeq`-style guard for the `extraLayers`/`prevDerived` re-triggers when that block is next touched (F10).
5. Carried from Review 1 §6 (still valid): manual acceptance matrix (§7-manual).
6. Housekeeping: `vorticity-divergence-plan.md` / `review1.md` are untracked plan artifacts — commit or gitignore per repo convention.

---

## 7. File inventory (for the record)

- NEW (untracked): `client/src/layers/kinematics.js`, `client/test/vorticity_divergence.test.js`, `vorticity-divergence-plan.md`, `vorticity-divergence-review1.md`.
- MOD vs `abb0d3c`: `Architecture.md`, `client/config.json`, `client/src/config/presets.js`, `client/src/layers/soundingAnalysis.js`, `client/src/layers/surfaceAnalysis.js`, `client/src/main.js`, `client/src/services/contourReRender.js`, `client/src/services/prefetchService.js`, `client/src/ui/catalogDrawer.js`, `client/src/ui/layerActions.js`, `client/src/ui/layerControl.js`, `client/src/ui/tabWindowManager.js`, `client/src/utils/colormaps.js`, `client/src/utils/formatters.js`, `client/src/utils/paletteLoader.js`, `client/src/utils/timelineSync.js`.
- Server, render primitives, station plot/filter/tooltip: untouched ✅.

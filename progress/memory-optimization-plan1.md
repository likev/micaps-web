# Memory Optimization Implementation Plan — Architecture §8.8

Source spec: `Architecture.md:775-929` (§8.8 Memory Optimization & Spatial Data Structures).
Scope: client only (`client/src/layers/contourLayer.js`, `rasterLayer.js`, `windLayer.js`, `utils/smoothContour.js`, `ui/layerActions.js`, `ui/layerControl.js`). No server changes.

## 0. Goals & Acceptance Criteria

Implement all five §8.8 sub-sections so that:

| Scenario | Target (from §8.8.1 table) |
|---|---|
| 500 hPa HGT, 16 levels, regional mesh (~45k cells) | isolines ≤ 6 MB heap, one-shot compute, 60 FPS pan/zoom, zero recompute |
| Same field as isobands (`contourf`) | avoided by default; raster used instead (95% reduction → ~3.2 MB) |
| Global 0.1° mesh (3600×1801 ≈ 6.48M cells), regional view | active Marching Squares input ≤ 50k effective cells, <30 ms, 99% pruned via BBox crop |
| Wind (1200 particles @60 FPS, barbs @48 px) | 0 bytes GeoJSON, no `setData` per frame |
| Timeline stepping / layer removal | no heap growth across 50 steps (worker tile cache flushed, main-thread refs dereferenced) |

Done = all boxes in §6 checked + `bun test` green (existing 174 tests + new tests).

## 1. Baseline Audit (what exists today)

| Spec | File | Status |
|---|---|---|
| §8.6 adaptive `step=2 if >500k` | `layers/contourLayer.js:50` | ✅ exists, but **not** §8.8.4 logic |
| Latitude ascending fix + `smoothGrid2D(w=0.4, iter=1)` | `contourLayer.js:91-102` | ✅ matches §8.6.2/8.6.3 |
| Chaikin `iter=2` | `contourLayer.js:97,166`, `utils/smoothContour.js:96-113` | ✅ matches §8.8.5(1) cap |
| Bold isolines, `symbol-spacing:160`, halo, sort-key | `contourLayer.js:286-305` | ✅ |
| Per-layer DOM IDs | `contourLayer.js:173-182`, `rasterLayer.js:6-12` | ✅ matches §8.4 |
| `showFill` vs `showRaster` mutual exclusivity | `config/presets.js:138-139`, `ui/layerActions.js:128-154,481-485`, `ui/layerControl.js:208-209` | ✅ enforced, covered by `test/contour_raster_exclusivity_legend.test.js` |
| Zero-GeoJSON wind canvas (`.streamline-canvas` z400, `.wind-barb-canvas` z405, bilinear `sampleWind`, 48 px culling) | `layers/windLayer.js:4-370` | ✅ matches §8.8.2 |
| Binary Float32 ingest `/api/data/grid/binary` → `Float32Array` | `layers/rasterLayer.js:14-32` | ✅ (transport part of §8.8.3) |
| Canvas Image-source raster + Mercator reprojection | `rasterLayer.js:94-231` | ⚠️ **functional substitute, not spec**: uses shared singleton `rasterCanvas` + `toDataURL()` + `type:image` source, **not** `OES_texture_float`/`R32F` + fragment shader |
| **§8.8.4 BBox crop + `step=ceil(sqrt(Ncrop/50k))`** | `utils/viewportCrop.js` + `config.json:performance` | 🟡 plumbing done (budget config-driven, full-grid fallback guard scales with budget); true viewport BBox crop pending P1-2 |
| Cell budget source of truth | `client/config.json` → `performance.maxEffectiveCells` (default `50000`) via `getMaxEffectiveCells()` in `config/presets.js` | ✅ implemented — no hardcoded cell counts at call sites |
| Douglas-Peucker pre-pass before Chaikin | — | ❌ missing (`smoothContour.js` has only Chaikin + `smoothGrid2D`) |
| Dereference after `setData` (`isolineFC=null`) | `contourLayer.js:210-307` | ❌ missing — `isobands`/`isolines` refs stay alive in closure |
| Empty-FC tile flush on timeline step | — | ❌ missing — `removeContourLayer` removes source directly without `setData({features:[]})` first |
| Raster `dataUrl` lifecycle (`revokeObjectURL`) | `rasterLayer.js:127-131,187` | ❌ leak — singleton canvas + base64 dataURL never revoked; cross-layer race |

## 2. Gap Analysis (spec vs. code)

1. **Biggest risk: §8.8.4 unimplemented.** Current `step` is global (`>500k → 2`), decoupled from viewport. A 6.48M-cell global grid still builds full-domain `Z` (6.48M pushes), runs `contourf`+`contour` on it, and allocates 60–90 MB isobands. This is the crash path §8.8 exists to fix.
2. **§8.8.3 wording vs. reality.** Spec describes direct GPU texture binding. Code does CPU `getColor()` per pixel + `putImageData` + base64 upload. Keep behavior (it achieves the same 95% saving vs `contourf`), but fix leaks and document the deviation — do **not** rewrite as custom WebGL layer in this phase unless profiling demands it.
3. **§8.8.5 half-done.** Cap is there; memory-release discipline (DP prune, deref, flush) is not. Low cost, high value.
4. **§8.8.2 done but fragile.** Listener/animation leaks on window close (`_windAnimId`, `_windBarbMoveListener`), no DPR handling, fixed 1200 particles regardless of viewport size.

## 3. Phased Plan

### Phase 0 — Instrumentation & baseline (0.5 day, no behavior change)
- **P0-1** Add `client/src/utils/memStats.js`: `measureHeap()`, `countGeoJSONPoints(fc)`, `estimateHeapMB(fc)` helpers (dev-only, `?debugMem` gated).
- **P0-2** Add perf log in `renderContourLayers`: `console.debug([Contour] Ncells, step, ms, points, heap)` behind flag. Establishes pre-optimization baseline for §6.
- **P0-3** New bun test `test/memory_optimization.test.js` skeleton with regional fixture (45k cells) asserting current behavior (step=1, ascending-y fix) so P1 refactors are guarded.

### Phase 1 — §8.8.4 Viewport BBox culling + cell-count LOD (2–3 days, core of this plan)
- **P1-1 `client/src/utils/viewportCrop.js`** (pure, fully unit-tested — budget **from config, never hardcoded**):
  ```js
  import { getMaxEffectiveCells } from "../config/presets.js"; // reads config.json -> performance.maxEffectiveCells
  export function resolveContourStep(nCrop, budget) // budget defaults via getMaxEffectiveCells()
  // → max(1, ceil(sqrt(nCrop/budget))); brackets at default 50k: <50k→1, <200k→2, <450k→3, else formula
  export function computeCropIndices(header, x, y, bounds, deltaDeg=1.75)
  // → {iMin,iMax,jMin,jMax,nLonCrop,nLatCrop,nCrop} with index clamping per spec formulas
  export function cropGridValues(values, nLon, nLat, idx, step)
  // → {xCrop, yCrop, Z} honoring step decimation + lat-descending handled by caller
  export function getFullGridStep(nLon, nLat, budget) // pre-BBox fallback: N > budget*10 → 2 else 1
  ```
  Implemented so far: `resolveContourStep`, `shouldBypassCrop`, `getFullGridStep` + `MASSIVE_GRID_FACTOR=10`. Still to do: `computeCropIndices` / `cropGridValues` (true viewport crop).
  Handle: antimeridian wrap (`W>E`), Mercator clamp ±85.05, `d_lat` unsigned convention (reuse §8.3 signed-step derivation), `N_lat==1` edge.
- **P1-2 Extend `renderContourLayers(map, gridData, element, options)`** (`layers/contourLayer.js:42`):
  - New options: `viewportBounds` (from `map.getBounds().toArray()`), `enableBBoxCrop=true`, `maxEffectiveCells` (default: `getMaxEffectiveCells()` from config.json, **never a literal**), `bufferDelta=1.75`, `onStats`.
  - Done: `options.maxEffectiveCells` override plumbed; budget resolved via `getMaxEffectiveCells()`; full-grid fallback via `getFullGridStep()` (threshold = budget × 10, i.e. 500k at default config).
  - Remaining logic exactly per spec flowchart:
    1. `Ncells = nLon*nLat`; if `< budget` → bypass crop, `step=1` (current fast path, zero pan/zoom recompute).
    2. Else crop to `bounds+δ`, compute `Ncrop`, `step=resolveContourStep(Ncrop, budget)`, build cropped `x/y/Z`.
  - Keep `getFullGridStep` fallback when `viewportBounds` is null (headless/tests).
  - Skip `contourf` entirely when `showFill===false` (currently always computed — wasted 60–90 MB; see P3). This single guard is half the memory win.
- **P1-3 Viewport re-render wiring** (new, debounced, large-grids only):
  - **Gate**: after any initial contour render, compute `Ncells = nLon*nLat` and `budget = getMaxEffectiveCells()`. If `Ncells < budget` → **no listener** (spec: "Zero Re-computation on Pan/Zoom"; preserves locked 60 FPS for regional meshes like 281×161). Only `Ncells >= budget` arms the re-render path.
  - **Attach points** (all NWP grid loads that reach `renderContourLayers`):
    1. `main.js:~508` (primary NWP field loader) — pass `viewportBounds: map.getBounds().toArray()` on the initial call and call `armContourReRender(map, layerId, win)` afterwards.
    2. `ui/layerActions.js:211,250,293` (smooth toggle / palette re-render paths) — same: forward current bounds, re-arm (re-arm is idempotent; it replaces the previous handler for that layerId).
    3. Sounding/surface derived contours (`soundingAnalysis.js`, `surfaceAnalysis.js`) are **excluded**: their domain is the station convex hull, not the grid viewport — BBox crop does not apply.
  - **Handler registry** (mirror the `stationLayer.js:58-64` `moveend`/`zoomend` convention, but per layer):
    ```js
    // New module: client/src/services/contourReRender.js (or inside layerActions.js)
    const reRenderTimers = new Map();   // key: `${winId}::${layerId}` → timeout id
    const reRenderHandlers = new Map(); // key → bound listener (for off())
    const reRenderBusy = new Set();     // keys with a recompute in flight (coalesce)
    export function armContourReRender(map, layer, win, opts = {});
    export function disarmContourReRender(map, layerId, win);
    export function disarmAllContourReRenders(map, win);
    ```
    - Key includes window id (`win.id` / `w-${winIdx}`, same convention as `prefetchTimers` in §8.7.3) so multi-window workspaces never cross-trigger.
    - `arm` first calls `disarm` for the same key (idempotent re-arm on every fresh load), then `map.on("moveend", handler)` (+ `zoomend`, same as station plots).
  - **Debounce + idle scheduling** (drag stays 60 FPS):
    - `moveend` → `clearTimeout` + `setTimeout(250ms)` per key. On fire: if `document.hidden` → reschedule on `visibilitychange` instead of computing.
    - Inside the timeout, schedule the heavy part via `requestIdleCallback` when available (fallback: `setTimeout(0)`), so the recompute never blocks the next frame's input handling.
    - **Stale guard**: capture `win.loadSeq` (same pattern as `main.js:474`) and the layer's `path/file/level`; if any changed before the idle slot runs, drop the recompute — the fresh load already rendered.
    - **Bounds-unchanged skip**: serialize bounds to a key (`[W,S,E,N].map(v=>v.toFixed(2)).join(",")`); if identical to the last rendered key for that layer, skip.
    - **Coalesce**: if key in `reRenderBusy`, set a `pendingBounds` slot and return; the running pass picks it up instead of stacking Marching Squares runs.
  - **Recompute payload** (memory-bounded, no network):
    ```js
    function reRenderLayerForViewport(map, layer, win) {
      const gridData = layer.gridData;              // reuse in-memory grid — zero fetch
      if (!gridData?.values || !gridData?.header) return;
      renderContourLayers(map, gridData, layer.element, {
        ...layer.config,                            // line color/width, bold, smooth, colormap
        layerId: layer.id,
        showFill: false,                            // NEVER contourf on move (spec: isolines + raster only)
        showLine: layer.visible && layer.config?.showLine !== false,
        viewportBounds: map.getBounds().toArray(),  // cropped X/Y/Z inside renderContourLayers
        maxEffectiveCells: getMaxEffectiveCells(),  // never a literal
        onStats: (s) => { layer._lastContourStats = s; },
      });
      if (layer.visible && layer.config?.showRaster && gridData) {
        renderGridRaster(map, gridData, layer.element, layer.colormap, // cheap canvas refresh
          { layerId: layer.id, opacity: layer.config?.opacity ?? 0.85 });
      }
      // Legend untouched: ticks come from full-grid stats, not the cropped viewport.
      // Wind streamlines/barbs untouched: canvas overlays already re-project on move.
    }
    ```
    - Isobands are never recomputed on move even if `showFill` is on: the last full-domain (or initial-crop) fill stays; only isolines track the viewport. Rationale: `contourf` is the 60–90 MB path — re-running it per pan defeats §8.8. Document this tradeoff in the layer-control tooltip.
    - Synchronous errors are caught and logged (`console.warn`), never toasted — a failed background re-render must not interrupt panning (same best-effort contract as prefetch §8.7.3).
  - **Detach points** (no listener leaks):
    - `removeContourLayer(map, layerId)` → `disarmContourReRender` before `removeLayer/removeSource` (combine with P2-3 flush ordering: flush tiles → disarm → remove).
    - Window/tab close (`tabWindowManager.js:closeWindowTab`) → `disarmAllContourReRenders(map, win)`.
    - Timeline step / new field load for the same layer → re-arm replaces the handler; the stale guard drops any queued recompute from the previous frame.
    - `removeAllContourLayers` (workspace reset) → clear both maps entirely.
  - **Perf budget per re-render**: `onStats` must report `Ncrop`, `step`, effective cells ≤ budget, wall ms; if a cropped pass still exceeds ~30 ms, bump `bufferDelta` down (1.75° → 1.0°) rather than raising `step` past the bracket — keeps mesoscale detail while shrinking the next pass.
- **P1-4 Tests**: cropped indices math (regional view of global grid → ~60k → step=2; full China mesh → bypass; pole clamp; antimeridian), step brackets, ascending-y preserved after crop, `contourf` skipped when `showFill:false`.
- **P1-5 Re-render tests** (mock map with `on/off/getBounds`, fake timers):
  - small grid → `arm` attaches zero listeners; large grid → exactly one `moveend` (+`zoomend`) listener per layerId; re-arm replaces without duplicating.
  - debounce: 5 rapid `moveend` fires → 1 recompute; bounds-unchanged second fire → 0 recomputes.
  - recompute payload asserts `showFill:false` forced, `viewportBounds` forwarded, `gridData` reused (no fetch stub called), raster refreshed only when `showRaster && visible`.
  - `disarm` on remove/window-close detaches listeners and clears timers; stale `loadSeq` drops queued recompute.

### Phase 2 — §8.8.5 Lifecycle memory management (1 day)
- **P2-1 Douglas-Peucker pre-pass** in `utils/smoothContour.js`: add `simplifyPolyline(coords, tol)` + `simplifyFeatureCollection(fc, tol)` (tolerance in degrees, default ~0.02–0.05, scaled by `step`). Call **before** `smoothFeatureCollection` in `contourLayer.js:165-167` and `renderCustomContourGeoJSON:426-433` when feature vertex count > threshold (e.g. >10k). Target spec claim: prune ~60% collinear points on straight ridges before Chaikin 2× growth.
- **P2-2 Dereference after upload** in `updateMapLibreContour` (`contourLayer.js:184`): after both `setData` calls, null caller refs (`isobands.features=null` guard or document caller contract) + add code comment citing §8.8.5. Verify no retained closure (the `src._data` copy owned by MapLibre is the only copy).
- **P2-3 Tile-flush helper** in `contourLayer.js`:
  ```js
  export function flushContourSource(map, layerId) // setData(empty FC) on isoband+isoline sources if present
  ```
  Call it in `removeContourLayer` **before** `removeLayer/removeSource`, and expose for timeline stepper (`timeSlider.js` next/prev/play path) before loading the next frame. Prevents worker `geojson-vt` pyramid retention across steps.
- **P2-4 Tests**: DP preserves endpoints/closure, removes collinear points, Chaikin still closed; flush helper calls `setData` with 0 features before removal (mock map).

### Phase 3 — §8.8.3 Raster hardening (1 day, low-risk; no custom shader)
Decision: **keep Canvas `image`-source architecture**, fix its leaks. True `R32F`/fragment-shader custom layer is explicitly deferred (see §5 risks).
- **P3-1 Skip `contourf` when raster active.** Enforce at compute site (`renderContourLayers` early-return `isobandFC={features:[]}` if `options.showRaster && !options.showFill`), not just visibility toggling. Add assertion test.
- **P3-2 Eliminate singleton + dataURL leak** (`rasterLayer.js:4,127-187`): create per-render canvas (or `OffscreenCanvas` where available), use `canvas.toBlob → URL.createObjectURL` + `URL.revokeObjectURL(prevUrl)` stored per `rasterSrcId` instead of `toDataURL()`. Falls back to dataURL only where `toBlob` unavailable. Removes base64 33% bloat and cross-layer race.
- **P3-3 Cap raster dims**: clamp `outWidth/outHeight` (e.g. max 2048 on longest side, preserve aspect) for >500k grids; document that isolines carry detail while raster carries fill.
- **P3-4 Tests**: mutual-exclusivity compute skip, object-URL revoke called on re-render/remove, Mercator reprojection unchanged (existing visual behavior).

### Phase 4 — §8.8.2 Wind hardening + docs (0.5 day)
- **P4-1 Cleanup discipline** (`windLayer.js:205-222,372-390`): central `cleanupWindLayer(map)` cancelling `_windAnimId`, `off("move"/"resize")` for both streamline + barb listeners; call from `removeContourLayer`, window-close, and before re-`renderWindStreamlines` (already cancels anim — extend to barb listener).
- **P4-2 Adaptive load**: scale `numParticles` by canvas area (e.g. `clamp(area/1500, 400, 1600)`), pause `requestAnimationFrame` loop on `document.hidden`, DPR-aware canvas sizing (`devicePixelRatio` capped at 2).
- **P4-3** Update `Architecture.md` §8.8.3 note: document that "WebGL Float32 raster" is currently realized as CPU-colormapped Canvas → GPU `image` source (1 quad, ~3 MB) with identical memory outcome; link this plan file.

## 4. File-by-File Task List

| # | File | Change |
|---|---|---|
| 0 | `client/config.json` | `performance.maxEffectiveCells` (default `50000`) — single source of truth for §8.8.4 budget |
| 1 | `client/src/config/presets.js` | `DEFAULT_MAX_EFFECTIVE_CELLS`, `getMaxEffectiveCells()` (override > config > window > default, clamped) |
| 2 | `client/src/utils/viewportCrop.js` | `resolveContourStep`, `shouldBypassCrop`, `getFullGridStep` — all budget-parametrized, no literals |
| 2 | `client/src/layers/contourLayer.js` | BBox-crop + step-by-`Ncrop` in `renderContourLayers`; skip `contourf` if `!showFill`; DP pre-pass; `flushContourSource`; deref comment |
| 3 | `client/src/utils/smoothContour.js` | `simplifyPolyline`, `simplifyFeatureCollection` (Douglas-Peucker) |
| 4 | `client/src/layers/rasterLayer.js` | Per-render canvas, blob URL + revoke, dim cap |
| 5 | `client/src/layers/windLayer.js` | Unified cleanup, adaptive particles, hidden-tab pause, DPR |
| 6 | `client/src/ui/layerActions.js` + `client/src/main.js` | `arm/disarmContourReRender` calls at NWP load paths; `flushContourSource` on remove/step |
| 6b | `client/src/services/contourReRender.js` **(new)** | Per-window+layer `moveend`/`zoomend` registry, 250 ms debounce, idle scheduling, stale/busy guards |
| 7 | `client/test/memory_optimization.test.js` **(new)** | All §6 assertions |
| 8 | `Architecture.md` | 2-line note on raster realization (P4-3) |

## 5. Risks & Non-Goals

- **Custom WebGL shader layer (true `R32F` + fragment colormap) is out of scope.** Current image-source raster already hits the ~3 MB target with far less risk (no `OES_texture_float` fallback matrix, no custom `CustomLayerInterface` lifecycle). Revisit only if profiling shows `toBlob`/upload jank on 6M-cell grids.
- **`contourf` isobands retained as opt-in only** (`showFill`). Default paths (incl. DTD) already prefer raster (`surfaceAnalysis.js:357-359`, `soundingAnalysis.js:278-280`). No removal of `contourf` code.
- **Viewport re-render must never regress small grids**: gated strictly on `Ncells>=50k`; existing `?` full-domain path untouched.
- **Antimeridian + polar grids**: clamp and wrap explicitly; add fixtures so global-model rollout doesn't produce empty crops.

## 6. Verification Checklist

- [ ] Regional 281×161 mesh: bypass path, `step=1`, no `moveend` listener, heap ≈ 2–4 MB isolines.
- [ ] Synthetic 3600×1801 grid + regional viewport: `Ncrop≈60k → step=2`, effective ≤50k, compute <30 ms (logged via `onStats`).
- [ ] Re-render: pan on large grid recomputes isolines only (no `contourf`, no fetch); rapid pans coalesce to ≤1 pass; small grids attach zero listeners; remove/close detaches everything.
- [ ] `showRaster:true, showFill:false` computes zero `contourf` features.
- [ ] DP pre-pass: straight-ridge fixture loses ≥40% vertices, endpoints/closure preserved.
- [ ] Timeline: 50 next/prev steps show flat heap (no growth), worker tiles flushed (empty-FC `setData` observed in mock).
- [ ] Raster re-render revokes prior object URL; no shared-canvas race across two layers.
- [ ] Wind: 0 `setData` calls during 5 s animation; cleanup removes canvases + listeners + anim ID.
- [ ] `bun test` green, including new `memory_optimization.test.js` (crop math, step brackets, exclusivity, DP, flush, revoke).

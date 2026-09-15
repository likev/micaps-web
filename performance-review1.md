# Performance Review 1 — Last 3 Commits (rAF / Hot-Path / Docs)

Scope: `a8b3408` + `0148578` + `24ef2b4` (2026-09-11, `likev`).
Total: 10 files, +755 / -264. Focus is deterministic 60 FPS: eliminate GC pressure, loop-invariant recalculation, canvas state churn, and rAF/setTimeout violations.

```
a8b3408 docs(architecture): document hot-path loop optimizations and zero-allocation micro-architectures (§11.8)
0148578 perf: eliminate 1000x hot-path recalculations and micro-allocations across layers
24ef2b4 perf(map): eliminate rAF and setTimeout violations via canvas stroke batching, rAF event throttling, and layout sync optimization
```

## 1. `24ef2b4` — perf(map): canvas batching + rAF throttling + layout sync

Files: `client/src/layers/windLayer.js`, `client/src/ui/tabWindowManager.js` (+224/-74).

### What changed
- Wind streamlines `client/src/layers/windLayer.js:80-195`:
  - Particle count `area/1500 [400,1600]` → `area/1800 [300,1200]` (~25% fewer particles).
  - Hoisted per-frame invariants (`getZoom`, `zoomFactor`, `dt/dtU/dtV`, `updateSpawnBounds`) out of 1200-particle loop.
  - Halved `map.project()` calls: reuse `p.x/p.y` as `currX/currY`, only project `nextLng/Lat`.
  - 1200+ `beginPath/stroke` + per-segment `strokeStyle` → 4 bucketed `beginPath/stroke` by speed (`bucketLines`, `STROKE_COLORS`).
  - `move` re-projection coalesced via `requestAnimationFrame` (`updateParticlePositions`, `moveAnimPending`, `map._windMoveAnimId`), with cleanup in `stopWindAnimation`.
- Wind barbs `client/src/layers/windLayer.js:252-358`:
  - Hoisted `getBoundingClientRect` to `updateDimensions()`; `draw()` no longer measures layout per draw.
  - `move/resize/moveend` → `throttledDraw` (rAF, `barbAnimPending` flag) + proper `off()` cleanup.
- Tab layout `client/src/ui/tabWindowManager.js:375-447`:
  - Two `setTimeout(50/100)` → single `requestAnimationFrame(scheduleLayoutSync)` (fallback `setTimeout 20ms`) doing `resize()` + `syncTabCameras()` together, scoped to `visibleWins`.
  - Cross-window `move → jumpTo` fan-out throttled via rAF (`syncAnimId`).

### Performance assessment — strong
- Correct diagnosis: violations `rAF took 65ms / setTimeout took 119ms` are from state churn + event storms, not FP math. Batching strokes (most expensive Canvas2D op) and coalescing `move` events directly addresses it.
- Particle reduction alone is ~25% less advection + projection + stroke work; combined with invariant hoisting the per-frame saving is substantial.
- Layout fix removes forced sync layout (`getBoundingClientRect` in hot `draw`) and arbitrary timer jank.

### Correctness / risks
- Correct: spawn-bounds fallback (`spawnWest>=spawnEast` → grid bounds), null guards on `project/unproject`, animation-ID cleanup prevents leaks. No logic change to advection physics (`dtU/dtV` factorization is algebraically identical).
- Minor risk: `setTabLayout` timing changes from 50/100ms staggered to next-frame. More correct in general, but if container CSS transition needs >1 frame, `resize()` may run early. Acceptable; fallback path exists. Worth manual split-view resize test.
- `bucketLines` reuse via `.length=0` retains capacity — intended, bounded (4 arrays). Good.

## 2. `0148578` — perf: hot-path recalculations + micro-allocations

Files: `rasterLayer.js`, `stationLayer.js`, `windLayer.js`, `surfaceAnalysis.js`, `soundingAnalysis.js`, `colormaps.js`, `smoothContour.js`, `viewportCrop.js` (+441/-190). Core of the series.

### What changed
- Raster `client/src/layers/rasterLayer.js:22-87`:
  - `srcColLookup: Int32Array(outWidth)` hoists `800k` div/mul/clamp per frame to `O(W)`. Fast path when `outWidth===nlon`.
  - Row strides/offsets (`rowOffset0/1`, `rowValues0/1`, `w0/w1`, `sameRow`, `dstIdx+=4`) hoisted to outer row loop; saves ~1.6M mults/frame.
  - Per-pixel `getColor() → [r,g,b,a]` (800k arrays ≈32 MB garbage) → `createColorResolver()` once + `resolver(val,data,dstIdx)` zero-alloc direct write.
- Colormap `client/src/utils/colormaps.js:112-242`:
  - `createColorResolver` pre-resolves palette, `isFixedPhysical/isHGT/isSLP`, `palMin/Max`, `hgtScale`, `effMin/Max`, `relSpan`. Inner resolver does no upper-casing, no string ops, no allocation.
  - `getColor` preserved as thin wrapper for compatibility; `getHexColor` unchanged.
- Stations `client/src/layers/stationLayer.js:513-978`:
  - `compileStationFilter()` pre-compiles `filterRules` + `Number()` parsing to closure; 2400 filter/parses → 1 per frame.
  - Inlined `isPointInBounds()` (`client/src/layers/stationLayer.js:254-269`) to hoisted `south/north/west/east/fullWorld`; 9600 `bounds.*()` calls → 4.
  - `hashStation()` (`client/src/layers/stationLayer.js:359-367`) precomputed once per candidate; `sort((a,b)=>a.hash-b.hash)` replaces per-compare string format + FNV. Also collapses two-pass `activeBins` rebuild into single pass.
  - Removed `ctx.save/restore` per dot + per label in `renderStationPlotToCanvas()` (~1800 push/pops); invariant styles pinned.
- IDW / bounds `client/src/layers/windLayer.js:444-513`, `surfaceAnalysis.js:241-368`, `soundingAnalysis.js:367-444`:
  - `generateStationWindGrid`: packed `ptX/ptY Float64Array`, single-pass bbox, row-level `dySq[i]=(lat-ptY[i])²` hoist. 10.2M `(lat-py)²` → 120k (98.8% claimed, math checks: 50×85×2400).
  - `Math.min(...points.map(...))` (temp arrays + call-stack blowup risk) → single-pass scalar `min/max`. Fixes latent `RangeError` on large station sets.
  - Bilinear weights `w00/w10/w01/w11` computed once, shared for `u/v` (halves mults, 72k samples/s path).
- Smoothing/DP/crop `client/src/utils/smoothContour.js:249-918`, `client/src/utils/viewportCrop.js:224-946`:
  - `smoothGrid2D`: `sideNeighbors/diagNeighbors` arrays (10 allocs/cell → 500k–1.8M) → scalar `hasUp/Down/Left/Right` + cached `rowUp/Down/Cur`.
  - `simplifyDP`: `stack [[a,b]]` → flat `[a,b]` ints; segment vector `segDx/segDy/segLenSq` hoisted, inlined `getSqSegDist`.
  - `cropGridValues`: pre-sized `new Array(numRows/numCols)` + hoisted `rowOffset/rowValues`, indexed write vs `push`.
  - Chaikin `invFactor=1-factor` hoist (trivial, correct).

### Performance assessment — strong, largest win
- All three canonical stalls addressed: Young-Gen GC (pixel arrays, neighbor arrays), loop invariants (col lookup, dySq, strides), context churn (save/restore, strokeStyle).
- Quant table in §11.8 is internally consistent with diffs. `bun test 8.49s → 6.89s (-19%)` is plausible for allocation-heavy suite, but not independently verified here.

### Correctness / risks
- Verified equivalent, no behavior change found:
  - Colormap relative-branch refactor (`!isFixedPhysical` + `isAlwaysRelative`) matches original early-return for fixed fields; HGT dagpm scaling identical.
  - Inlined viewport check byte-for-byte matches `isPointInBounds`, including `±1.5°` pad and dateline normalization.
  - `compileStationFilter` `NONE/OR/AND` matches `matchesStationFilters` (`client/src/layers/stationLayer.js:462-507`); pre-parsed `Number` values re-`Number()`ed in `evaluateSingleRule` idempotently.
- Minor notes (non-blocking):
  - Legacy `cfg` without `filterRules` still falls back to `matchesStationFilters` per station — optimization only covers new schema. Document or extend if legacy path is hot.
  - `outWidth===1` div-by-zero (`(nlon-1)/0`) pre-exists in old code; both old/new yield `NaN` clamp. No regression, ignore unless 1px canvas matters.
  - `getColor` now allocates a resolver per call — fine for legends/tooltips, but callers in loops must use `createColorResolver` (raster does). Grep for remaining `getColor` in loops.

## 3. `a8b3408` — docs(architecture): §11.8

File: `Architecture.md` (+90). Documents §11.8 with hot-path table (HP1–HP5), per-pipeline subsections, and recalculation-elimination benchmark table.

- Accurate to diffs spot-checked (srcColLookup, dySq, resolver, save/restore, DP stack). Mermaid diagram + formulas aid onboarding.
- Risk is doc drift: absolute counts (800k, 1.6M, 10M, 32 MB) assume 800×1000 raster / 2400 stations / 50×85 grid. Fine as illustrative, but mark as example workload or parameterize, else future profiling looks contradictory. Same for `6.89s` test time — add date/commit hash + machine.
- Nit: links use absolute `file:///root/downloads/...` paths; prefer repo-relative links for portability.

## Cross-cutting verdict

- Direction is correct and well-executed: hoist invariants, zero-alloc resolvers/buffers, batch GPU/Canvas state, throttle events with rAF. No correctness regressions found in review.
- Follow-ups suggested:
  1. Grep + migrate any remaining per-pixel/per-station `getColor` / `hashStation` / `bounds.*()` in loops to new APIs.
  2. Extend `compileStationFilter` to legacy `filterField1/2` path if that config is still used.
  3. Manual test: split-view `resize`/`move` sync timing, wind animation pause on `document.hidden`, barb `moveend` final draw.
  4. Fix `Architecture.md` absolute file links; annotate benchmark table with workload + env.
  5. Consider micro-bench (e.g., `bun bench` raster 800×1000 + IDW 85×50×2400) to lock gains and prevent regression.

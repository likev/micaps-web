# EC Time–Height Profile Plan1 — Uncommitted Implementation Review

Scope: uncommitted diff + untracked `client/src/layers/timeheight/*`, `client/src/ui/layers/timeHeightDrawerBindings.js`, `client/test/timeheight/*`, `server/handler/grid_handler_test.go`, `server/mock/mock_generator_test.go` vs `ec-time-height-profile-plan1.md`.

## Verdict

Functionally complete Plan1 slice, faithful to plan §§4–8: preset group, bulk loader with progress + window cache, map-click grid-point selection, lead×log-p canvas (RH fill, T/VVEL isolines, barbs), reversible time axis, drawer/panel controls, prefetch skip, mock VVEL/RH. Live data path verified against Cassandra `bore.pub:59042` (see §Live verification): all 4 elements parse, fixed-10 levels have full coverage, all 13 default leads exist.

Do not merge as-is: 1 broken cancellation token (loads self-cancel / Cancel button dead), 2 missing-data fabrications in isolines (`VVEL NaN→0`, `TMP NaN→-999`), 1 RH validity cap that rejects real live values (>110 at 100 hPa), global timeline stepping triggers full reload instead of the specified cursor-only update, and controller-singleton multi-window hijack. All fixable in ~2h. Details below.

## Verification executed

- `bun test client/test/timeheight/` in `client/`: **35 pass / 0 fail** across 5 files (199 expects).
- `go test ./...` in `server/`: PASS (`handler`, `mock`, `config`, `parser`).
- Live Cassandra probes via `bore.pub:59042` (TCP reachable, CQL v4, temp Go client using repo `db`+`parser`, removed afterwards): levels/latest/tree/blob-parse for `ECMWF_HR/{RH,TMP,VVEL,WIND}` — all OK. Exact results in §Live verification.

## Live verification (`bore.pub:59042`, 2026-09-19)

- **Levels** (`level` table): all four element paths return exactly the plan's fixed 10:
  `ECMWF_HR/{RH,TMP,VVEL,WIND}` → `[100,200,250,300,400,500,700,850,925,1000]` (n=10). The plan's "almost 20 levels" premise is wrong against live; the fixed-10 decision is correct and needs no fallback.
- **Cycle/file**: latest `26091820.024` (`YYMMDDHH.ppp`); tree shows leads out to `.240`. All 13 default leads (`0–144 step 12`) verified present for `TMP/500`, `VVEL/500`, `RH/1000`, `WIND/100`, `TMP/100`, `VVEL/850`, `RH/500`.
- **Grid parse** (`DecompressGzip` + `ParseGridData`, cycle `26091820`, lead `.024`):
  - `RH/850`: dtype 4, `desc "%"`, 361×281 (`60–150°E`, `60–-10°N`, `dlon 0.25`, `dlat -0.25`), min 4.42 / max **103.42** / mean 68.23.
  - `TMP/850`: dtype 4, `desc "C"`, same geometry, min −8.51 / max 33.51.
  - `VVEL/500`: dtype 4, `desc "10e-2.Pa.s-1"` (cPa/s; ω<0 = ascent), min **−756.7** / max 225.3 / mean −0.65.
  - `WIND/850`: dtype 11, `desc "m/s"`, `u`/`v` present (101441 pts), speed 0.01–31.73, u −30.4–24.3, v −30.1–29.2. Polar→Cartesian server conversion confirmed working.
  - `VVEL/100`: min −25.5 / max 24.0. `RH/100`: min 0.93 / max **130.93**. `TMP/100`: min **−83.2** / max −49.2. `RH/1000`: max 101.5. `VVEL/850`: min −346.1 / max 305.8. `TMP/1000`: max 44.2.
- **Fixed-10 coverage** at `.024`: `RH/TMP/VVEL/WIND` all `ok=[1000 925 850 700 500 400 300 250 200 100], miss=[]`. No NaN fallback needed on happy path.
- **Geometry note**: live is 361×281 (101,441 pts/grid); mock is 281×161 (45k). A cold default profile moves 520 live grids ≈ 2.2× the mock byte volume the tests exercise — the progress UI and Plan-2 server-sampler note are justified.
- **Header sign note**: live `dlat` arrives as **−0.25** (not unsigned +0.25 as `Architecture.md §6.3` describes); sampler `Math.abs` handles it, but the doc premise is stale for this dataset.

## What matches plan (keep)

- Preset `client/config.json`: `composite-ec-timeheight` with §4 shape verbatim (`timeDirection:"ltr"`, fixed 10 levels, 5 config toggles).
- Loader `timeHeightLoader.js:5-9,14-32,113-214`: `PROFILE_LEVELS`, 10-min LRU-600 window cache, conc-6 batched `allSettled`, `buildLeads` validation + 41-col cap, `formatGridFileName`, `NaN`-on-single-failure, `buildProfileMatrix` sampler pass. V2 test asserts exactly 520 cold fetches; V3/V5 assert zero-fetch resample and cycle-flip-back.
- Sampling `timeHeightSampling.js`: N→S-aware header normalize, bilinear scalar with valid-corner weighting + RH clamp, wind wrapper over `windSampling`, snap/clamp helpers. Fallback domain (60–150/60–−10) matches live.
- Canvas `timeHeightCanvas.js:112-140` + `timeHeightIsolines.js`: single `x(lead)`/`xToLead` helper with `ltr`/`rtl`, RH cell-mean fill with `minX/abs` (direction-agnostic), TMP red / VVEL cyan dashed-ascent + bold-0, barbs via `drawWindBarbCanvas` with `atan2(-u,-v)` conversion, cursor line + crosshair readout, HiDPI resize.
- Controller/panel/drawer: map-click with panel/drawer/navbar guard (`timeHeightController.js:124-137`), halo source `th-active-point-*`, per-window panel id, direction toggle render-only (`setTimeDirection`, `timeHeightController.js:237-242`), drawer point/range/direction/checkbox bindings, `layerDefaults`/`visibilityActions`/`actionsDispatcher`/`configSchema` cases, `presetLoader` branch + cleanup + step-12 default, `prefetchService` skip.
- Backend/mock: `grid_handler.go` level-from-path + file→period parsing, `mock_generator.go` VVEL signed-omega + RH blob branches with `10e-2.Pa.s-1`/`%` descriptions; Go tests assert signed VVEL range and RH bounds.

## Must-fix before merge

1. **Cancellation token mismatch — loads self-cancel, Cancel button dead.** `timeHeightController.loadMatrix` (`timeHeightController.js:253-271`) captures `seq = ++this.loadingSeq` and passes it as `signalSeq`, but `loadTimeHeightMatrix.shouldCancel` (`timeHeightLoader.js:145-151`) compares it against **`win.loadSeq`** (the global timeline counter, a different namespace). Before any timeline step `win.loadSeq` is undefined so the first load works; after any step the values disagree and every load instantly returns `{cancelled:true, matrix:null}`. `cancelLoad` (`:248-251`) bumps `loadingSeq` but the loader never observes it (no `isCancelled` passed), so Cancel is a no-op. Fix: use one namespace — either `win.loadSeq++` at load start (like `weatherLoader.js`/`bootstrap.js`) or pass `isCancelled: () => this.loadingSeq !== seq` and drop the `win.loadSeq` comparison for this path.
2. **Isolines fabricate data in gaps.** `renderVVelLines` fills `NaN→0` (`timeHeightIsolines.js:157`) — draws a false ω=0 ascent/descent boundary through missing-data regions. `renderTempLines` fills `NaN→-999` (`:91`) — outside the −60…40 level set, dragging false isotherm gradients around gaps. Use a masked/contour-safe path (skip cells, or a sentinel outside interpolation reach with documented behavior); at minimum never use a value inside the plotted level set.
3. **RH validity cap rejects real live values.** `isValidScalar(RH)` allows ≤110 (`timeHeightSampling.js:48-50`), but live `RH/100` reaches 130.9 (and 103.4 at 850). Valid moist upper-level corners become `null` → spurious NaN gaps + inflated `missing.rh`. Widen (e.g. ≤150) or validate-then-clamp instead of reject.
4. **Global NWP step triggers full reload, not cursor-only.** Plan §6.3 requires slider steps to move only the cursor line. The `presetLoader` timeheight branch ignores `isTimeStep`, and `updateCursorLead` is never called from the bootstrap NWP time-change path — every global step re-runs `init` → full bulk-load path (cached, but with progress flash + resample). Route `isTimeStep && controller.isActive()` to `updateCursorLead(period)` like the TlogP `updateCycle` pattern.
5. **Controller singleton breaks multi-window.** `timeHeightController` is a module singleton holding one `activePoint/cycle/leads/matrix/matrixCache/activeMap/activeWin`; `init` from window B overwrites window A. Panel DOM is per-window (good) but state/cache keys lack `winId`, so two windows on different points/cycles collide. Scope state per window or document single-profile-window limitation (same class as `upper_air-tlogp-review1.md:49`).
6. **Fixed contour levels clip live extremes.** `getTempLevels` −60…40 (`timeHeightIsolines.js:9-15`) misses live −83.2 (100 hPa) and 44.2 (1000 hPa) — no isotherms at profile top. `getVVelLevels` ±200 (`:20-22`) vs live −756.7 (500 hPa), −346…+306 (850 hPa) — ascent cores saturate off-scale. Extend TMP toward −90 (cf. TlogP isotherms) and VVEL toward ±800 or data-driven levels.

## Should-fix (correctness/UX gaps)

- Mock/live domain mismatch: mock `70–140°E×15–55°N` vs live `60–150°E×60–−10°N`; sampler fallback assumes live. Edge clicks in mock mode sample `null`. Align mock domain or note offline-only shape.
- No negative caching: 404 grids (V7 path) are never cached, so every point change refetches known-missing files. Cache a `null` tombstone with short TTL.
- Drawer/panel checkbox desync: drawer toggles set canvas options directly (`timeHeightDrawerBindings.js:56-75`) without updating panel checkbox states (and vice versa) — two truths diverge.
- `render()` clears with `canvas.width/height` (device px) after `ctx.scale(dpr)` (`timeHeightCanvas.js:184-186`) — harmless overfill; use CSS-pixel dims.
- `server/db/cql_client.go` retry/timeout change (10s→30s, 3→5 tries, 300ms→1s sleep) is global behavior affecting all endpoints; justify for bulk-load or scope it.
- `layerRowBindings.js` optional-chaining reformat is drive-by churn; harmless, keep or revert.
- `buildProfileMatrix` creates 4 samplers per cell (520-cell profile → ~2000 closures per resample); hoist one sampler per grid — perf hygiene, no behavior change.

## Test coverage gaps (plan Phase5/V-table)

Covered end-to-end: V1 shape, V2 13×10 + monotonic progress + exact 520, V3 zero-fetch resample, V4 overlapping-lead reuse (48 novel fetches), V5 cycle partitioning, V6 cancel-via-seq, V7 404→NaN, V8 eye/remove lifecycle, V9 guards + snap math, V10 window isolation + prefetch skip, V11 Go VVEL/RH. Gaps: V4b asserts direction state only, not zero-fetch (add fetch spy) nor pixel mirroring; no test fordrawer↔panel checkbox sync; no test pinning TMP/VVEL level ranges against live extremes (§Must-fix 6); mock-domain edge sampling untested.

## Suggested fix order

1. Cancellation token (#1) — one-function change, unblocks all reload paths.
2. RH cap + isoline missing fills (#2, #3) + contour ranges (#6) — all in sampling/isolines, verify with live numbers above.
3. Cursor-only stepping (#4) + singleton scoping decision (#5).
4. Hygiene: negative cache, sampler hoisting, checkbox sync, mock domain note, plan-note corrections ("almost 20 levels", VVEL range, geometry, dlat sign).

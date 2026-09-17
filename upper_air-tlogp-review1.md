# Upper-Air T-lnP Plan1 — Uncommitted Implementation Review

Scope: uncommitted diff + untracked `client/src/layers/tlogp/*`, `server/parser/diamond5_*`, `server/handler/tlogp_*`, `client/test/tlogp/*` vs `upper_air-tlogp-plan1.md` (identical to `progress/upper_air-tlogp-plan1.md`).

## Verdict

Functionally complete Plan1 slice, faithful to plan §§4–8. Backend parser/handler, thermodynamic math, layer-control drawer, timeline routing, and directional prefetch all match spec. No load-bearing correctness bug in happy path (58362 → 54511 switch, SFC/925/850/700 parcels, 12h timeline).

Do not merge as-is: 1 failing integration test (test-only path bug), 1 dead prefetch field, silent `custom`-without-pressure fallback, eye-toggle leaving station markers, and diamond5 routing with no fallback. All fixable in <1h. Details below.

## Verification executed

- `go test -count=1 -v ./parser/ ./handler/` in `server/`: PASS (`TestDiamond5Parser`, `TestTLogPHandlerMockMode`); `TestTLogPHandlerLiveCassandra` SKIP (no route to `bore.pub:59042` from sandbox, expected).
- `bun test client/test/tlogp/`: 26 pass / 1 fail. Fail is `V1 verifies config.json` — `client/test/tlogp/tlogp-integration.test.js:90` does `fs.readFileSync("./config.json")`, file is `client/config.json`. Logic under test is fine; path is wrong.
- Manual diff check: `client/config.json`, `layerDefaults.js`, `layerRowView.js`, `prefetchService.js` match plan code blocks verbatim (modulo intended `layer.stationId` fallback addition).

## What matches plan (keep)

- Backend `server/parser/diamond5_parser.go:128,224`: dual `ExtractStationsGeoJSON` / `ExtractStationProfile`, dagpm→gpm `*10.0`, `-9999` sentinels, `Td<=T` clamp. Single-pass scan, target-station skip without allocating 500 stations.
- Handler `server/handler/tlogp_handler.go:29,92`: `file`+`station` branches, `latest` resolve via `latestdatatime`→`treeview` fallback, 5-min single-blob cache, `/api/data/tlogp` registered in `server/cmd/main.go:61,76`.
- Math `client/src/layers/tlogp/tlogpMath.js:17,158,287,467`: log-p `y(p)`, skew `x(T,p)`, Bolton es/LCL, RK4 moist adiabat, `Rd∫ΔTv dlnp` CAPE/CIN, K/TT/SI/PW. LFC/EL search above LCL, EL=top when still buoyant — correct.
- Preset `client/config.json`: `composite-tlogp` / `TlogP Observation` / `upperair-tlogp-stations` (station) + `upperair-tlogp-diagram` (tlogp, 58362, surface) exactly per §6.1.
- Drawer/defaults/bindings `client/src/ui/layers/layerRowView.js:43`, `layerDefaults.js:137`, `layerRowBindings.js:464`: station input+Apply+quick-select, parcel select SFC/925/850/700/custom, 4 curve toggles with `stopPropagation` + `autoSaveLayerConfig`.
- Prefetch `client/src/services/prefetchService.js:263,335,363,393`: tlogp+station items, station-aware dedup key `${type}:${path}:${file}:${station}`, `isCached("/api/data/tlogp")`, background `fetchJson`. Directional `prev/next` vs unconstrained chip behavior preserved.
- Timeline: `client/src/utils/timelineSync.js:163` `TLOGP` addition is sufficient — `timeSliderView.js:30` already serves 12h/24h/6h for `isUpper`.
- Hover refactor `client/src/layers/station/stationHover.js:39,83`: extracted `findStationAtPoint` reused by hover+click, O(1) bin path preserved; click guarded by `tlogpController.isActive()`, listener added/removed in `stationCanvas.js:109,290`.

## Must-fix before merge

1. Integration test path — `client/test/tlogp/tlogp-integration.test.js:90`:
   `readFileSync("./config.json")` → resolve to `client/config.json` (e.g. `new URL("../../config.json", import.meta.url)` when run from repo root, or `client/config.json`). Currently the only red test.
2. Dead prefetch key `win.tlogpStation`:
   `prefetchService.js:264` reads `win.tlogpStation || layer.config?.stationId`, but `tlogpController.js:104,134,162` never writes `win.tlogpStation` (`setStation`/`setParcelLevel`/`updateCycle` only touch `layer.config` + local fields). Works today via fallback, breaks if anyone sets the field once (stale station prefetched). Either assign `win.tlogpStation = stationId` on `setStation`/`init`/`updateCycle`, or remove the fallback branch and use `layer.config` consistently.
3. `custom` parcel without pressure silently computes surface:
   `tlogpMath.js:304` (`custom` + null → surface), hit via panel `[Custom]` button `tlogpPanel.js:149` and drawer select `layerRowBindings.js:520`, both call `setParcelLevel("custom")` with no pressure. UI shows Custom active while trajectory/CAPE are surface-based. Gate the Custom button/select until a diagram click supplies pressure (`tlogpCanvas.js:96`), or retain last `customPressure` instead of falling back.
4. Eye-toggle hides panel only:
   `client/src/ui/layers/visibilityActions.js:106` → `tlogpLayer.js:18` `show()/hide()` touches `#tlogp-panel` only; `upperair-tlogp-stations` markers stay on map. Decide: V10 says panel hide/show (current behavior passes its test), but operators will expect the network to hide too. At minimum document; preferably toggle both or split into two eye rows.
5. Diamond5 routing has no fallback — `server/handler/station_handler.go:72`:
   `HasPrefix("diamond 5") || Contains(path,"TLOGP")` forces all TLOGP through `ExtractStationsGeoJSON` with no fallback to `ParseStationData` on error. Change to try diamond5 first, fall back to generic parser on error (or require both conditions with `&&`).

## Should-fix (correctness/UX gaps vs plan §§8.5/9)

- Time-step re-inits instead of updating: `presetLoader.js:152` calls `loadTLogPLayer→init` on every step. Works (init re-reads `win.obsTime`), but resets `activeStationId` from `layerDef` and re-shows panel each tick. Prefer `tlogpController.updateCycle(file)` when `isTimeStep` and controller already active. Also station+tlogp layers each call `syncObservationTimeline` on initial load — sync once.
- V9 validation missing: drawer `applyStation` sends any string; invalid `ABCDE` only fails after network 404 + toast + revert (`tlogpController.js:104`). Add `/^\d{5}$/` guard before fetch. No `flyTo` on station change either (plan §9.1 promises center/highlight; only halo in `tlogpController.js:167`).
- Map-click window resolution fragile: `stationHover.js:93` uses `map._micapsWindow || window.__MICAPS_ACTIVE_WIN__`. Wrong-window switch in multi-window is likely. Thread `win` through like other station flows.
- Parcel calc cache (plan §8.5) not implemented: every parcel switch and every `loadSounding` recomputes from scratch; trajectory loop calls `interpolateSoundingAtPressure` (sort+filter) per 5 hPa step (~180× sorts on a 1020-level profile). Pre-sort once per sounding and memoize SFC/925/850/700 results.
- Mock/real level-count mismatch: `mock_generator.go:GenerateMockTLogPProfile` returns 25 levels while `GenerateMockStationsForPath` hardcodes `num_levels: 1020`. Live V11 expects >100 for 58362. Align mock (or document offline-only shape) so mock assertions stay meaningful.
- Saturation midpoint sign: `tlogpMath.js:342` evaluates `saturatedLapseRate` at `p+dp/2` while stepping downward; should be `p-dp/2`. Small warm bias on moist segment.
- Panel singleton vs multi-window: `tlogpPanel.js:26` reuses `#tlogp-panel` globally; second window `init` hijacks `activeMap/activeWin`. Either scope per-window or document single-TlogP-window limitation.
- Bottom temperature range drift: `tlogpMath.js:5` `T_MIN -45` vs plan isotherms `-80…40`. Cold isotherms only appear aloft via skew; bottom labels effectively `-40…40`. Fine meteorologically, but note the drift or widen to `-60`.
- Cache aliasing: `tlogp_handler.go:112` returns the shared `cachedData` slice. Read-only today; add no-mutate comment or copy-on-return.
- Duplicate plan file: root `upper_air-tlogp-plan1.md` and `progress/upper_air-tlogp-plan1.md` are byte-identical untracked copies. Per `4c410ef` convention keep `progress/` copy, delete root to prevent drift.

## Test coverage gaps (plan Phase5/V-table)

Covered: preset shape (modulo path bug), SFC/925/850/700/custom math, map-click hit-test + controller switch 58362→54511, prefetch direction constraints + cache hit, eye toggle, Go parser/handler mock.
Not covered despite `[x]` in plan: drawer input→fetch (V4), 24h/6h filtering + chip/loop advancing the diagram (V6/V7 depth — only `isUpper` flag asserted), invalid-station toast + station preserved (V9), indices table values end-to-end (V11 beyond unit math). Add 3–4 tests: invalid ID rejected without fetch, drawer parcel select syncs panel, `updateCycle` path on `isTimeStep`, `num_levels`/surface props present in GeoJSON.

## Suggested fix order

1. Test config path (1 line, turns suite green).
2. `win.tlogpStation` wiring + `custom` guard (small, prevents wrong-station prefetch / misleading CAPE).
3. Eye-toggle scope decision + station_handler fallback + input regex + `flyTo`.
4. Perf follow-ups: sorted-levels cache, `updateCycle` on time-step, mock level alignment.

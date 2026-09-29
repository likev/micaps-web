# Auto-Allocation Committed Review (review2) — HEAD `3c93d2a` vs `8743cba`

Scope: committed, not pushed (`main ahead 1`). 41 files, +3093/-196. Verified via `git diff HEAD~1 HEAD`, file reads, `bun test` (47 pass: canvas + model-and-rain + auto-alloc + plain-core + hasLevel:false), `go test ./...` (handler ok). This supersedes review1 for items fixed in-commit.

## What the commit adds (beyond review1 baseline)

1. **Alloc workflow locked**: select in `1x1` tab-mode, disabled in split (`TabsBar.svelte:46-60` `allocDisabled`, `disabled` select) and for profile panels (`isProfilePanelWindow/Group` in `appWorkflow.js:18-67`, enforced in `App.svelte` layout/alloc/load/preset handlers + `handlePresetSelect`).
2. **Split-6 fixes**: truthy-string alloc bug fixed (`App.svelte` now `autoAllocation && !== "none"` + `?? 500`); base-window fallback prefers window with `activeGroup`; `_lastSplitLayout` F4 memory; obs-time preservation; `TimeSlider.svelte:59-61` + `timelineCore.js:9-12` default-step fix (upper-obs 12h / surface-obs 3h / NWP 6h).
3. **Profile model controls**: `model` select default `ECMWF_HR` in TimeHeight/LineHeight/Hovmoller panels + controllers, `rainStep` select in Hovmoller, cache keys include model/lead.
4. **Hovmoller rain tile-fill**: server `resolveRainStep` + `RAIN` 5th element + `rainMat/rainStep` in result (`hovmoller_handler.go:18-103,169-200`); client `renderHovRainTiles` accumulation-window tiles (`lineIsolines.js:224-336`), swap/rev-aware canvas, hover sampling; `lineprofile_common.go:315-324` `RAIN lead==0` zero-fill.
5. **`hasLevel:false` + `.000` chain**: `sanitizeGridPath` loop-strip (`grid_handler.go:142-158`, fixes review1 #10); client `fetchStationObservations`/`loadObservationProduct` 14-char → `.000` (`catalogApi.js:33-36`, `derivedContours.js:318-321`); server `.000` retry in station/tlogp handlers; `grid_handler_test.go` RAIN12 null cases.
6. **Titles/timeout**: `WindowPanel.svelte:20-26` + `windowTitles.js:28-35` model-alloc `(MODEL)` suffix; `waitForMapStyle` 15000→2500ms (`App.svelte:77`).

## Findings

### Fixed since review1 — close
- **Truthy `autoAllocation` bug (review1 #1): fixed.** Creation paths now gate on `!== "none"`.
- **`sanitizeGridPath` single-pass (review1 #10): fixed** via loop-strip. Bare `null`, mid-path `null`, `file=null` still unhandled (see #8).
- **`3x2` dead-branch (review1 #9): addressed.** `tabsCore.js:168` now has the `reserved for future` comment.
- **VOR/DIV `layer.path` (review1 #8): confirmed not an issue.** Derived-from-WIND by design; no change needed.

### 1. `windowTitles.js` model suffix rarely fires; dual title logic diverges (Medium)
`windowTitles.js:3,28-29`: imports `getActiveTab` from `./tabsStore.js` (plain-core copy) while live layout/alloc live in the `tabs.svelte.js` proxy fork — `tab?.autoAllocation === "model"` stays stale; second clause `win.autoAllocation` never exists (alloc lives on tab). Meanwhile `WindowPanel.svelte:20-26` implements its own suffix. Result: pills vs canvas headers can disagree. Fix: single source (live tab resolver or pass `isModelAlloc` in), drop one implementation.

### 2. Hovmoller rain tile/hover contract mismatches (Medium)
- Lead 0: tiles skip `tEnd<=sLead` but `_sampleAtHover` returns `rain[0][pi]` instead of `null` (`hovmollerCanvas.js:267-274` vs `:272`; `canvas.test.js` asserts tiles but not lead-0 hover null).
- Boundaries/overlap: first-match `lead>=tStart && <=tEnd` picks earlier tile on exact boundary and mismatches last-painted tile when `rainStep > leadStep` (`RAIN12` over 6h leads); gaps (`RAIN03` over 12h leads) return nearest-row value instead of `null` (`lineIsolines.js:247-253`, `hovmollerCanvas.js:271-280`). Tests only cover `deltaT==step`.
- Plumbing: `hovmollerPanel.js:415-419` `setRainStep` never forwards to `canvasRenderer.setOptions`, `setData` doesn't forward `rainStep`; canvas falls back to `leads[1]-leads[0]` which can disagree with server `rainStep` (`hovmollerLoader.js:34-36,72`).

### 3. `resolveRainStep` trusts input + caches empty forever (Medium)
`hovmoller_handler.go:18-67`: in `mockMode||client==nil` or `len(avail)==0` returns `requestedStep` verbatim — `RAIN99`/`RAIN03;DROP` becomes `MODEL/RAIN99` (`:186`). No allowlist. `modelRainStepsCache:15,50-63` is `sync.Map` with no TTL; poisoned empty `avail` cached forever. Validate against `{RAIN03,RAIN06,RAIN12,RAIN24}`, don't cache empties (or short TTL).

### 4. Profile controllers still model-agnostic at snap/clamp; stale-cycle + legacy-key risks (Medium)
- `_snapClamp(null,...)` / domain toasts hardcode `ECMWF_HR` after `setModel(GRAPES_GFS)` (`hovmollerController.js:220-229`, `lineHeightController.js:236-247`); `timeHeightController.js:374-405` has no snap at all.
- Empty `resolveForecastCycles` leaves old-model `cycle` persisted as `initCycle` (`hovmollerController.js:300-310`).
- `timeHeightController.js:469-481` legacy key omits model — same-cycle model switch can serve old-model matrix. Include model or drop legacy.

### 5. Still open from review1 (confirm, Low-Medium)
- `stepCycleHours` 8-char only, silent garbage on 14-digit (`tabsCore.js:15-32`).
- `time`-mode hardcoded 12h cadence (`tabsCore.js`); commit msg scopes it to `ECMWF_HR` but code applies to all models/obs.
- Mode-switch loads fire-and-forget (`App.svelte` alloc fan-outs without `await` in one path); rapid switches can interleave — `loadSeq` guards each window, no cross-window barrier.
- `time`-NWP alloc doesn't sync per-window timeline stores; `discretePeriods` array shared by reference (alias).
- `revertAutoAllocation(tab, number)` unifies level only (document or split).
- `||` chains coerce level `0→500` (`prefetchService.js`, `App.svelte:198,1151`); works via later guards, `??` is safe.
- `hasLevel` string checks cover `"null"` but not `"undefined"` (`timelineSync.js:84`, `weatherLoader.js:54`, `overlayTriggers.js:113`); `level="undefined"` builds `MODEL/ELEM/undefined` (server trailing-strip accidentally heals fetches, stored `layer.path`/cacheKey stay wrong).
- Prefetch `layer.path || WIND` (`prefetchService.js:232`) is fragile: correct today because loader stores WIND, but a preset-set `MODEL/VOR/lvl` path would warm the wrong field. Force WIND for VOR/DIV.

### 6. Server/client sanitization gaps (Low)
- `sanitizeGridPath` misses bare `null`, mid-path `null`, `NULL`, `%00`; `file` never sanitized (`grid_handler.go`, `station_handler.go:48`, `tlogp_handler.go:32-33`, `catalogApi.js:33-36` misses whitespace/`null`/`undefined`).
- `station_handler.go:79-81` `.000` retry doesn't update `file` var (harmless, inconsistent with `tlogp_handler.go:126`); `fetchStations:55-60` early-return makes `latest` resolution dead when `Client==nil`.
- `lineprofile_common.go:315-324` RAIN-zero result omits `snappedA/B`; hov handler falls back to raw lon/lat `i:0 j:0` — misleading snap. `fetchDecompressed` mock-vs-cache order inconsistent with `grid_handler.go`.
- `waitForMapStyle` 15s→2.5s: faster fail, higher false-negative on slow styles — watch for "Map not ready" reports.

### 7. Test gaps (Low)
- `canvas.test.js`: no gap/overlap/rev-rain cases, no lead-0 hover-null assert (would fail today).
- `model-and-rain-controls.test.js`: no fetch mock (relies on catch paths); no `rain_step` query, `matrix.rainStep`, zero-fetch axis-swap, or drawer persistence asserts; N-select `[11,21,41,61,81]` vs controller `2..81` gap untested.
- `grid_handler_test.go`: no uppercase/bare/mid `null`, no non-mock test; `VVEL`/`RH` mock-distribution asserts can flake on mock change.
- `lineprofile_test.go`: traversal/`%2e%2e`/`%00`, RAIN-zero, rainStep uncovered. `tlogp_handler_test.go`: no mock `.000`/`latest`/cache/404; live part skips without Cassandra; hardcoded `20260918080000.000` will stale-date.

## Positives
- Alloc UX is now coherent: pick-before-split + profile guard in 5+ entry points, effective-alloc masking, re-apply on layout change.
- Timeline step defaults fixed at both creation (`timelineCore`, `applyPresetToWindow`) and display (`TimeSlider`) — upper/surface/NWP no longer fight.
- Rain semantics tested as accumulation windows (`[T-12,T]` tiles, lead-0 skipped) across both axes; 47 client tests + handler suite green.

## Follow-ups
1. Unify title/model-alloc source (#1); validate + TTL `resolveRainStep` (#3).
2. Fix rain tile/hover parity + `rainStep` forwarding; cover gap/overlap/rev in tests (#2).
3. Model-aware snap/clamp + legacy-key fix (#4); `"undefined"`-level + `file` sanitization (#5-6).

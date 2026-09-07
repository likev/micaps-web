# Prefetch Review 1 — Uncommitted Changes

## Scope
- `client/src/api/apiClient.js`: adds TTL cache (`DEFAULT_CACHE_TTL_MS=180000`), inflight dedup, `isCached/prune/clear/stats`, sorted `buildUrl`, 60s prune interval.
- `client/src/ui/timeSlider.js`: adds `getAdjacentTimeSteps()` + current mode/period/obs/cycle getters.
- `client/src/services/prefetchService.js` (new): `getPrefetchTargets()` for Left/Right (time) + Up/Down (levels via `VERTICAL_LEVELS`), `prefetchSurroundingData()`, debounced `schedulePrefetch()`.
- `client/src/main.js:23,592,852,892,1044,1176`: calls `schedulePrefetch(win)` after field/composite/observation/preset/level loads.
- `client/test/prefetch.test.js` (new, 18 tests), `client.zip` (binary bump +2KB).

## Test results
- `prefetch.test.js` isolated: 14 pass / 4 fail. All 4 fail with `ReferenceError: document is not defined` at `client/src/ui/timeSlider.js:110` via `setTimelineMode()` (`timeSlider.js:480`).
- Full suite: 148 pass / 5 fail — same 5 pre-existing `config.json`/UI failures as baseline, prefetch failures masked (some earlier test installs DOM). No new config regressions.

## Issues

1. `timeSlider.js:109-110` — `updateStepLengthOptions()` touches `document` unguarded. `setTimelineMode()` therefore crashes in Bun/worker/no-DOM. Guard with `typeof document === "undefined"` return early (same for `setStepLength()` DOM access). This is why the new tests fail standalone.
2. `prefetchService.js:9,345` — single global `prefetchDebounceTimer`. With multi-window, `schedulePrefetch(winA); schedulePrefetch(winB)` cancels A. Use per-`win.id` timer map or no debounce for explicit loads.
3. `apiClient.js:75` — `fetchJson` returns live cached object reference, while `fetchBinary` correctly clones (`apiClient.js:125`). Caller mutation corrupts JSON cache. Clone (e.g. `structuredClone`) or document immutability.
4. `apiClient.js:50` — `isCached()` URL heuristic (`startsWith("http") || includes("?")`) breaks if endpoint already has query + `params` non-empty (drops original query). Prefer explicit full-URL overload.
5. Minor: `apiClient.js:101,152` — two `Date.now()` calls for `cachedAt/expiresAt` (skew); use one `now`. `apiClient.js:187-188` — unconditional 60s `setInterval` runs in hidden tabs; consider visibility pause.
6. `prefetchService.js:97-106` — `isSurfaceOnly/supportsLevels` heuristic (`id?.includes("surface")`, `win.level !== null`) is brittle; surface group with `level:0` or custom id will get spurious Up/Down. Prefer explicit `hasLevel===true` check.
7. Do not commit `client.zip` binary with source changes.

## Good
- Failed fetches not cached + inflight cleanup in `finally` — correct, tested.
- Binary clone-on-read, param-key sorting for stable keys, silent `Promise.allSettled` prefetch — correct.
- Level direction (Up=`400` from `500`, Down=`700`) and boundary `null` handling — correct.

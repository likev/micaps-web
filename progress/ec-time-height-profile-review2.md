# EC Time–Height Profile Plan 2 — Committed Implementation Review

Scope: commit `69727cd` (HEAD) implementing `ec-time-height-profile-plan2.md`, plus the
committed 600 hPa level set (config + `PROFILE_LEVELS`) it builds on. Reviewed against the plan
doc §§4–9 and the review1 must-fix list.

## Verdict

Plan 2 is implemented as specified and the core goal is met: the browser no longer downloads or
retains 520 full grids — one NDJSON stream returns a KB-sized matrix, and raw blobs live on server
disk under a byte-exact 2000 MB LRU cap. Point-targeted parsing (`SampleGridPoint`) is real: stencil
reads, no 100k-point allocations on the profile path. Prior review1 must-fixes are all closed in the
committed state (cancel token, NaN fills, RH cap, cursor-only stepping, contour ranges — see §7).

Two correctness bugs in the new code should be fixed promptly (filecache byte-counter double-count
on overwrite; singleflight implemented but never wired), plus doc drift (plan2.md still documents
the 100 hPa level set; code/config serve `[1000,925,850,700,600,500,400,300,250,200]`). Nothing here
requires re-architecture. Details below.

## Verification executed

- `go test ./...` in `server/`: PASS all packages (`config`, `filecache`, `handler` 34 s,
  `mock`, `parser`). `profile_handler_test.go` and `cache_test.go` run in MockMode only —
  no live dependency; the 34 s is the pre-existing live TlogP test against `bore.pub:59042`.
- `bun test` in `client/`: **486 pass / 0 fail** across 68 files (10,413 expects).
- Live probe (`bore.pub:59042`, temp Go client, removed afterwards): `ECMWF_HR/{RH,TMP,VVEL,WIND}/600`
  all return files (e.g. `26091820.240`), same as `/100` — the committed 600-for-100 swap is
  data-valid; plan2.md §5/§7/§9 examples still naming `100` are stale docs, not code bugs.

## What matches plan (keep)

- File cache (`server/filecache/cache.go`): sha1 key, `<hex>.bin` + `.meta` sidecar, tmp→fsync→rename
  crash safety, orphan/corrupt cleanup + size-mismatch rejection on restart rebuild, 60 s sweeper
  (cap + 6 h TTL), fail-open writability probe, exact atomic byte counter, mtime LRU, flags
  `-th-cache-dir/-th-cache-mb/-th-cache-ttl` + env equivalents, `/api/status.thCache` counters,
  `README.md` + `Architecture.md §13.2.3` updated.
- Compressed blobs cached (raw `GetBlob` bytes), decompress-on-the-fly on hits in both
  `grid_handler.go` (with corrupt-gzip fallthrough to Cassandra — no poison) and
  `profile_handler.go` (`processTask`), matching the plan-2 update.
- Profile endpoint: strict validation (model allowlist, 8-digit cycle, ≤41 leads in `[0,240]`,
  ≤10 levels, lon/lat ranges, `..`/`%00` rejection), first-task domain probe before `WriteHeader`
  (400, no extrapolation), concurrency-6 worker pool with `ctx.Done()` handling, per-task NDJSON
  progress flush (`loaded/total/ok/failed/cacheHits/lastSource`), single `result` line with
  `null`-for-missing, `ResponseController` write-deadline exemption, no-result-line-on-cancel.
- `SampleGridPoint` (`server/parser/sample_point.go`): header-geometry math identical to
  `ParseGridData` (extent-derived steps, N→S sign), eps-tolerant domain check, snapped node math
  matching JS, 4-float stencil reads, full-valid fast path + valid-corner reweighting, RH clamp,
  `±9000`/`NaN` sentinels, strided-only wind-encoding detector, `IsSpeedDir` persisted in `.meta`.
- Client rewrite (`timeHeightLoader.js`): one streaming request (plain `fetch`, bypasses
  `dataCache`), `ReadableStream` NDJSON parsing with text/JSON fallbacks, per-line `onProgress`
  (existing bar shape + `cacheHits`/`lastSource` label `· N from cache`), `null→NaN` in one place,
  `AbortController` per load wired to Cancel/loadSeq, signature and `{cancelled, matrix, stats}`
  return shape preserved.
- Controller: bulk-cache fast path deleted, per-window state retained, `matrixCache` bounded at 20
  via `_setMatrixCache`, panel/drawer checkbox two-way sync (`syncDrawerCheckbox`), progress label
  with cache part. Review1 #1 (cancel), #2 (isoline NaN fills now pass `NaN` through), #3 (RH ≤160
  both sides), #4 (`isTimeStep` → `updateCursorLead`, `presetLoader.js:219`), #6 (TMP −92…48,
  VVEL ±800) all verified closed in committed code.

## Must-fix (correctness, small)

1. **Byte/entries counters double-count on overwrite** (`filecache/cache.go:309-317`): `Put`
   unconditionally `Add(len)` / `Add(1)` without subtracting a pre-existing same-key file. Repeat
   loads of the same cycle inflate `currentBytes`/`entries` above reality → premature eviction and a
   permanently wrong `/api/status` tally. Fix: stat the existing `.bin` first; subtract old size and
   skip the entries increment when overwriting.
2. **Singleflight never wired** (`cache.go:62-86,160`): the dedup type exists but neither
   `profile_handler.processTask` nor `grid_handler.fetchGrid` calls it, so N concurrent identical
   misses each hit Cassandra — the exact stampede plan §4.2 required protection against. Wrap the
   miss path (`Get`-miss → fetch → `Put`) in `Cache.Singleflight().Do(key, …)`.

## Should-fix

- **Doc drift**: plan2.md still specifies levels `[…,250,200,100]` (§§5, 7, 9, endpoint example)
  while code/config/Architecture serve `[…,300,250,200]` + `600` for lower-tropospheric focus.
  Code is live-valid (§Verification); update the plan doc. Same for `Architecture.md` claiming
  `win._thGridCache` "eliminated" while deprecated shims still lazily create the Map — remove the
  shims per plan Phase 4 or soften the claim.
- **`Get` ignores TTL** (`cache.go:227-256`): expiry is enforced only by the 60 s sweeper, so reads
  serve up-to-60 s-stale entries. Either check `StoredAt`/`mtime` on `Get` or document sweeper-only
  expiry as intended.
- **`destroy()` doesn't abort** (`timeHeightController.js:539-568`): an in-flight stream outlives
  teardown and re-populates the just-cleared `matrixCache` on completion. Abort
  `state.abortController` in `destroy` like `cancelLoad` does.
- **Non-streaming fallback never reports progress** (`timeHeightLoader.js:204-231`): the
  `response.text()` path accumulates silently then jumps 0→100. Fire one `onProgress` per parsed
  progress line there too (cheap, same shape).
- **Manual `Transfer-Encoding: chunked`** (`profile_handler.go:191`): unnecessary — Go chunks
  automatically once you flush without a `Content-Length`. Harmless, but remove to avoid implying
  the handler manages framing.
- **Mock path churn**: `processTask` builds a full mock grid + re-encodes it per task
  (`profile_handler.go:473-474`) — 520 full synthetic allocations per mock request. Mock-only, but a
  stencil-direct synthetic sampler would remove the one remaining full-grid allocation on this path.
- **Levels validation is looser than the plan** (any int 10…1050, not the fixed-10 subset) — fine
  and forward-compatible (it admits 600), but plan §5 says "subset of the fixed 10". Align doc
  to code, not vice versa.
- **V1 test dropped the `showGridPointMarker` assertion** (`integration.test.js`) while the flag
  still ships in config/defaults. Either re-add the assertion or remove the dead flag.

## Test coverage gaps (plan §9 P-table)

P1 (heap < 5 MB), P2 (exactly 1 request), P2b (monotonic mixed-source progress + cancel),
P4 (bulk-vs-endpoint parity ≤1e-4), P5 (404→`null`→`NaN`), P6 (400s), P8 (suites) are covered by
`profile_handler_test.go`, `sample_point_test.go` (stencil-vs-full-parse equivalence, decision
parity), `cache_test.go`, and the rewritten `integration.test.js` (mocked NDJSON stream).
Not covered despite the plan: P3 cap enforcement is unit-tested (tiny-cap eviction) but no soak
asserting real `du ≤ cap` across cycles; P7 kill-9/restart rebuild has no test (only code path via
`rebuildIndex`); no test for sweeper TTL timing or disk-full fail-open serving.

## Suggested fix order

1. Counter overwrite fix + singleflight wiring (both <30 lines, both load-bearing under repeat load).
2. Plan2.md level-set sync (600-set) + `win._thGridCache` claim correction.
3. `destroy()` abort, `Get` TTL check, fallback-path progress (each <10 lines).
4. P3/P7 soak + restart tests; drop dead shims/flag per Phase 4.

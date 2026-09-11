# Map Review 1 — Uncommitted Changes (World basemap + multi-profile PMTiles)

Date: 2026-09-10. Scope: `git status` uncommitted work (8 modified + 2 untracked). Tests executed: `go test ./...` (PASS), `bun test ./client/test/pmtiles_layers.test.js` (5 pass).

## 1. Changeset summary

| File | Change |
|---|---|
| `client/src/map/pmtilesLayers.js` | Add `world-fill` + `world-boundary` (`source-layer: world`) to all 3 schemes, painter-order `World < County < City < Province < National`; extend `applyBasemapScheme` |
| `client/src/map/mapInstance.js` | Add `PMTILES_PROFILES` (GLOBAL/CHINA/DISTRICT), `resolvePMTilesUrl()`, `switchPMTilesProfile()`; `createMapInstance` accepts `pmtilesUrl/profile` |
| `client/src/ui/layerActions.js` | Toggle/config handling for `showWorld` (`world-fill`, `world-boundary`) |
| `client/src/ui/layerControl.js` | Default `showWorld:true`, checkbox `World Country Boundaries`, binding |
| `client/config.json` | Add `basemap.showWorld: true` |
| `server/handler/static_handler.go` | Generic `*.pmtiles` handler (was china-only); `SPAHandler` delegates `*.pmtiles` for Range support |
| `server/cmd/main.go` | Comment-only change |
| `client/map/map-china.pmtiles` | Binary replaced: 51.7 MB → 5.0 MB (`51667675 -> 5047013` bytes) |
| NEW `client/test/pmtiles_layers.test.js` | 5 tests: scheme completeness, layer order, profiles, URL resolve, `applyBasemapScheme` |
| NEW `server/handler/static_handler_test.go` | 3 tests: all-profiles serve, SPA delegation, custom `PMTilesPath` |

## 2. What is good

- Painter order is correct: fills before lines, boundaries stacked `world(175-186) < county < city < province < china(top))` in `client/src/map/pmtilesLayers.js:174-246`. Backward-compatible (`!== false` defaults to visible) in `layerActions.js:91`, `layerControl.js:812`.
- Scheme colors are sensible per tier (dark `world #101622`, light `#f1f5f9`, micaps `#0b1626`); width hierarchy `china 1.5 > prov 1.15 > world 0.85 > city 0.75 > county 0.5` preserves national dominance.
- `filepath.Base(r.URL.Path)` in `server/handler/static_handler.go:24` blocks `../` traversal. `Accept-Ranges: bytes` + `http.ServeFile` preserves 206 support; verified by test Range `bytes=0-6 → 206`.
- Tests pass and cover the new layers/profiles.

## 3. Findings (by severity)

### Medium — `map-global` / `map-china-district` files do not exist
`client/map/` contains only `map-china.pmtiles` (4.9 MB). `PMTILES_PROFILES` advertises two more profiles with no asset, no download script, and no 404 UI. Either add the files, document them as optional, or keep the constants but mark experimental.

### Medium — `switchPMTilesProfile` is dead code with unproven live-switch
`client/src/map/mapInstance.js:53-61` calls `source.setUrl(pmtiles://...)` on `china-vector`. No caller in `client/src` (grep: only definition + test import), no UI wiring, no test with a real `map` object. MapLibre `VectorTileSource.setUrl` behavior varies by version (may need `map.triggerRepaint()` / style reload to actually refetch). Either wire it to UI, or add a test with a mocked source asserting URL + reload, or defer the function.

### Low — `resolvePMTilesUrl` assumes string input
`client/src/map/mapInstance.js:43-47`: `profileOrUrl.startsWith` throws on non-string (number/object). Add `if (typeof profileOrUrl !== "string") return default`. Minor since current callers pass strings/undefined.

### Low — stale `line-dasharray` on scheme switch
`client/src/map/pmtilesLayers.js:282-287` updates color/width/opacity but never clears/sets `line-dasharray`. Today only city/county are dashed so this is harmless, but if a future scheme dashes `world`, switching back leaves a stale dash. Consider syncing dasharray (set or unset) alongside the other props.

### Low — width vs. comment / cartography nit
World boundary width 0.85 sits between province (1.15) and city (0.75). Reasonable as a faint base, but the old comment "strictly decreasing country > province > city > county" no longer holds; the new comment correctly describes stack order, not width. No action unless strict hierarchy is desired (then use ~0.4-0.5 for world).

## 4. Test notes

- `server/handler` PASS (`TestPMTilesHandler_AllProfiles`, `TestPMTilesHandler_ConfigInServer`, plus existing suites).
- `client/test/pmtiles_layers.test.js` 5/5 PASS. Mock `getLayer: () => true` means the missing-layer guard in `applyBasemapScheme` is not exercised; consider one case where `getLayer` returns undefined.
- Missing coverage (suggested, not blocking): `resolvePMTilesUrl` non-string, `switchPMTilesProfile` with mocked map.

## 5. Suggested actions before commit

1. Decide fate of GLOBAL/DISTRICT assets (ship, script, or mark experimental) and of `switchPMTilesProfile` (wire or defer).

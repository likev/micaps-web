# Plan 1 — Add all datasets in `menu-addition-list.md` to the client menu / submenu

Scope: 150 verified-active datasets (153 audited; 3 stale ones are excluded) in 4 delivery tiers, plus the server-side decoders each needs.

## 0. Preconditions & open issues (resolve first)

| # | Finding | Action |
|---|---|---|
| 1 | **Port**: confirmed by the user, test and verify against `bore.pub:59042` (`9042` was a typo). | Use `-chost bore.pub -cport 59042` for all live tests. |
| 2 | **Format reference** is at `../tianqing-data` (`D131Decoder.py`, `document/D131-format.md`, `MosaicDecoder.py`, `fy4bGridToLonLat.py`). It is read-only reference material. It targets CMADAAS downloads, not Cassandra, but the file formats are the same. | Port the D131 decoder to Go (§2 Tier 2). Use `fy4bGridToLonLat.py` only as a navigation reference. It is for FY-4A at 105°E and the HDF product, so FY-4B (sub-satellite longitude ~133°E) needs its own constants. AWX has no reference there, so it still relies on `nmc_met_io` plus probing. |
| 3 | `candidateDataPaths()` in [catalog_queries.go](file:///root/downloads/micaps-web/server/db/catalog_queries.go) maps `table/key` for the `treeview`, `latestdatatime` and blob tables. Several new paths are deep (`SWAN_PRODUCT/LOCAL/NCRAD/TDPRODUCT/MCR`) or have non-`YYMMDDHH.fff` filenames. | Verify the mapping and the latest-file lookup per family (Phase 1). |
| 4 | The Cassandra cluster advertises internal IPs (`10.69.72.x`). | The server already uses a raw single-connection CQL v4 client ([cql_client.go](file:///root/downloads/micaps-web/server/db/cql_client.go)). Keep it pinned to the public endpoint. |

Reference decode logic (`nmc_met_io`): the blob is `gzip.decompress(value)`, then format-specific parsing. Grid files use a 278-byte header (type 4 scalar, 11 vector, ensemble blocks with `perturbationNumber`). The server already implements this in `server/parser`.

## 1. Phase 1 — Format discovery harness (no UI changes)

Goal: replace assumptions with ground truth for every dataset family.

1. Add `server/cmd/probe/main.go` (build-tagged dev tool, not shipped). It does the following:
   - Connects to `bore.pub:59042`.
   - For each `dataPath` in a manifest, calls `GetLatestCycle` and `GetFileList(limit=3)`, then `GetBlob`.
   - Detects the outer wrapper from magic bytes: gzip `1f 8b`, bzip2 `BZh`, plain.
   - Writes a hexdump of the first 512 bytes, the decompressed size, and a text preview, to `server/testdata/probe/<family>.txt`.
2. Generate the manifest `server/testdata/dataset_manifest.json` from `menu-addition-list.md` (one entry: `id, name_en, name_zh, table, dataPath, tier, format, levels, cadence, suffix`). It is the single source of truth for the server catalog, the client config and the tests.
3. Save one small real sample per format family as a fixture (`server/testdata/*.bin`, skip files > 1 MB). Fixtures drive the unit tests.
4. Record the findings (header layouts, byte order, scaling, missing-value sentinels) in Architecture.md §6 (extend "MICAPS Data Format Specifications").

Exit criterion: every family below has a confirmed header layout and a fixture.

## 2. Dataset families, decoders and menu mapping

### Tier 1 — existing decoders (config-only, ~100 datasets)

| Family | Count | Format | Work |
|---|---|---|---|
| `ECMWF_HR` extra fields (CAPE, CAPE_SHEAR, gusts 3h/6h, FZRA/FREEZING_RAIN03-24, PRECIPITATION_TYPE, ASNOW/SNOD/SNOWxx/SDEN/SWE, ZERO_DEGREE_LEVEL, WIND_100M/U/V, SST, TCWV, TCW, TCDC, LCDC) | 30 | Grid type 4 / 11 | Presets only. Add colormaps, units and levels. |
| `ECMWF_HR/PVORT/{10…1000}` | 19 levels | Grid type 4 | Reuse `/api/catalog/levels` and the level controller. Single preset with a level selector. |
| `GRAPES_3KM` (UH, DCAPE, shear, shear angle, max wind/U/V, radar refl., RAIN/SNOW/ASNOW) | 19 | Grid type 4 | Presets. Large files (up to 29 MB), so apply `performance.maxEffectiveCells` decimation and check the `filecache` TTL/size. |
| `NWFD_SCMOC` + `NWFD_SCMOC_1H` | 13 active (exclude `PRECIPITATION_TYPE_6H/24H`) | Grid type 4 | Presets. PRECIPITATION_TYPE and the hazards (HAIL, FOG, HAZE…) are categorical, so add discrete palettes. Add a `2M_ABOVE_GROUND` sub-path for Tmax/Tmin. |
| `CLDAS` (RAIN01/03/24, 10-min rain, TMP, VIS, WIND) | 5–8 | Grid type 4 / 11 | Presets. Filenames are `YYMMDDHH.000` and `YYYYMMDDHHmm.000` (10 min). Check the time-slider cadence logic for 10-min data. |
| `ECMWF_ENSEMBLE_PRODUCT` (AVERAGE, VARIANCE, GRID_PROBABILITY) | 13 | Grid type 4 | Presets. Probability and variance palettes. Deep sub-paths (`RAIN24/10.0MM`). |
| `GRAPES_GFS` CAPE, CIN, DCAPE, SWEAT, K_INDEX | 5 | Grid type 4 | Presets. |
| `FORECAST_PRODUCT/NMC/WIND` | 1 | Grid type 11 | Reuses the existing wind layer. |
| `SURFACE/PLOT_ALL`, `PLOT_TRAFFIC(_5MIN)`, `PRES_CHANGE_3H/24H_NATIONAL`, `HORIZONTAL_VISIBILITY_1MIN_ALL_STATION`, `SNOW_DEPTH_ALL_STATION`, `MARINE/ROCEA_1H` | 8 | Station (`ParseStationData`) | Presets. Element IDs differ per product, so extend the element map in [station_parser.go](file:///root/downloads/micaps-web/server/parser/station_parser.go) and add layer render options. `PLOT_ALL` has more than 60k stations, so use viewport culling and LOD (Architecture §11.5). |

Server work for Tier 1: small. It covers per-path tests that fetch the latest file and parse it, and handling of `.000` / 12-digit filenames in `GetLatestCycle` and the time parsing.

### Tier 2 — lightweight new decoders

1. **SWAN gridded radar products (Diamond 131 / BZ2).** Covers MCR, MTOP, MVIL, QPE6MIN, QPE60, `TDMOSAIC` (3D), REF_FST, QPF/HAIL/WINDY extrapolation, GD/COTRECWIND (wind vectors) and GD/REF_FST.
   - New `server/parser/diamond131_parser.go`, ported from `../tianqing-data/D131Decoder.py`. The layout is documented in `document/D131-format.md`.
     - Unwrap the payload: gzip, then bzip2 if it starts with `BZh` (`DecompressBzip2` already exists).
     - Parse the fixed **1024-byte little-endian header**: `ZonName[12]="diamond 131"`, `DataName[38]` (GB2312), `Flag[8]` (`"SWAN"` means the new format; otherwise reject or treat as the old 256-byte layout), `Version[8]`, `year, month, day, hour, minute, interval` (uint16), `XNumGrids, YNumGrids, ZNumGrids` (uint16), `RadarCount` (int32), `StartLon, StartLat, CenterLon, CenterLat, XReso, YReso` (float32), `ZhighGrids[40]`, the radar station tables, `m_iDataType` (int16: 0 u1, 1 u1, 2 u2, 3 i2) and `m_iLevelDimension`. The remainder is reserved padding.
     - Read the data block that follows: `Z × Y × X`, levels bottom to top, rows from the top-left with latitude decreasing and longitude increasing. Reverse the latitude axis so it matches the existing north-to-south or south-to-north grid convention (see Architecture §6.3).
     - Coordinates: `lon = StartLon + i*XReso − XReso/2`, `lat = StartLat − j*YReso − YReso/2`. This is the same half-cell shift the Python reference applies.
     - Scaling (no further conversion): u1 (CREF/CAPPI): `dBZ = (v − 66) / 2`. u2/i2 (echo top, VIL, QPE, …): `v × 0.1` (km, kg/m², mm). Treat the version as `< "1.5"` as u2 by default (there is no `m_iDataType`). Map the 0 or negative sentinel to missing.
     - `interval` and the `.Fxxx` file suffix give the lead time in minutes, so map them to `Period` (hours) or to a minute-based lead in the time slider.
   - A GD/TREC wind product (`COTRECWIND`) has `m_iLevelDimension=2`, i.e. two vector components per level. Return it as U/V and reuse the wind layer.
   - `TDMOSAIC`: expose the levels (km → m) via `/api/catalog/levels`. Start with horizontal slices.
   - Wire the parser into `grid_handler.go` by magic detection (`diamond 131`) rather than adding a new route.
   - The older mosaic layout in `../tianqing-data/MosaicDecoder.py` (LZW-compressed `read_mosaic_file`) is a different format. Only add it if the probe finds such files.
2. **SWAN point/text products (TVS, HAIL, GALE `.TXT`, ~150 B).** New `parseSwanText` (Diamond 35 or similar text) that returns GeoJSON points. Serve via `/api/data/station` or a new `/api/data/events`. Client: a symbol layer (new `layers/event`).
3. **Lightning** (`SURFACE/LIGHTNING_10MIN`, `_1H`, ~76 B). Confirm whether it is Diamond 17 or plain text. Parse to points and render with a stroke symbol.
4. **Wind profiler** (`WIND_PROFILER/RAD`, `ROBS`, JSON, 425 stations, 5 min). New `profiler_handler.go`. Add `/api/data/windprofiler` which returns a station list (GeoJSON) and a per-station vertical profile (height, u, v, quality). Client: a station layer; clicking opens a time-height barb panel (reuse the time-height subwindow architecture).

### Tier 3 — satellite

1. **AWX parser (FY-4B L1, 15 channels × CHINA/DISK; FY-2G L2 CTT, AMV, QPE001/003/006).**
   - New `server/parser/awx_parser.go`, ported from `nmc_met_io/read_satellite.py::resolve_awx_bytearray`. It handles the first header (file name, byte order, header lengths, product type), the second header (satellite, time, lat/lon range and step, projection) and the optional color/calibration tables. Output is the raw DN grid plus a calibration LUT (to brightness temperature or albedo).
   - The equirectangular projection is native to the AWX (CHINA) product. Check whether DISK is geostationary (NOM) and needs a reprojection; if so, resample to EPSG:4326 on the server (decimated) and reuse `rasterLayer`.
   - Size is the main risk (DISK C001 is 25 MB). Add server-side decimation (`?step=` or a max cell count), a stride-aware parse (read only the needed rows), and cache by file name.
   - AMV products contain vectors. Parse them to station-like points (lon, lat, u, v, pressure) and draw barbs through the existing wind symbology.
2. **FY-2G DUST RGB BMP.** The file is already an image. Add a passthrough `/api/data/image` that returns PNG (BMP→PNG, decimated), with bounds taken from config (confirm geo-registration in Phase 1; otherwise skip and document).

### Excluded (documented as stale)
`NWFD_SCMOC/PRECIPITATION_TYPE_6H`, `PRECIPITATION_TYPE_24H`, `SATELLITE/FY2G/L2/QPE024`. Do not query `SINGLERADAR`.

## 3. Server changes

- `model/types.go`: add `Dataset` metadata (id, category, format, levels) and `EventFeature`, `ProfilerProfile`, `ImageResponse` DTOs.
- `db/catalog_queries.go`: extend `SupportedModels()` with the new tables (`GRAPES_3KM`, `NWFD_SCMOC`, `NWFD_SCMOC_1H`, `CLDAS`, `ECMWF_ENSEMBLE_PRODUCT`, `GRAPES_GFS`, `FORECAST_PRODUCT`, `SWAN_PRODUCT`, `SATELLITE`, `WIND_PROFILER`) and deep-path handling in `candidateDataPaths`.
- `handler/grid_handler.go`: a format-sniffing dispatcher that picks the parser by magic or header (MDFS `mdfs`, `diamond 131`, AWX). The 3-minute prefetch cache and `filecache` are keyed by `(path, file)`.
- New files: `parser/diamond131_parser.go`, `parser/awx_parser.go`, `parser/swan_text_parser.go`, `handler/profiler_handler.go`, `handler/image_handler.go`.
- Mock mode: add generators in `mock/` for the new families, so the UI works offline.

## 4. Client changes

1. **Menu generation.** Add the 8 categories in §8 of `menu-addition-list.md` to `client/config.json` presets (category → submenu), and reuse the existing preset schema (`id`, `category`, `layers[]`, `hasLevel`, `defaultLevel`, `isObservation`). Prefer generating the preset JSON from `dataset_manifest.json` with a script (`scripts/gen-presets.mjs`) instead of hand-editing about 150 entries. Keep the existing presets untouched.
2. **Submenu UX.** Check that [PresetMenu.svelte](file:///root/downloads/micaps-web/client/src/components/PresetMenu.svelte) and `CommandPalette.svelte` handle roughly 20 categories (collapsible groups, search, bilingual labels). Group the FY-4B channels as one entry with a channel/domain selector, not 30 items. Do the same for PVORT levels and the ensemble mean/variance variants.
3. **Palettes** (`client/palettes`, `colormaps`): add CAPE, helicity, shear, snow depth, SST, TCWV, radar reflectivity (dBZ), echo top, VIL, QPE, probability, variance, categorical precipitation type and hazards, IR brightness temperature, visible albedo and water vapour.
4. **New layer types:** `event` (SWAN TVS/HAIL/GALE, lightning), `profiler` (wind profiler stations and panel), `satellite` (raster with the LUT; reuse `rasterLayer.js`), `image` (dust RGB).
5. **Time handling:** 6-min radar, 10-min CLDAS and 15-min FY-4B cadence in `TimeSlider` and the prefetch service. Forecast-offset products use `Fxxx` as lead time.

## 5. Phasing

| Phase | Deliverable | Gate |
|---|---|---|
| 1 | Probe tool, manifest, fixtures, format notes | Every family has a confirmed layout |
| 2 | Tier 1 presets plus the station/grid fixes | Every Tier 1 path renders from live data |
| 3 | Diamond 131 parser and the SWAN radar/nowcast menu | MCR, QPE, REF_FST plausible against known echoes |
| 4 | SWAN text, lightning, wind profiler | Points and profiles display |
| 5 | AWX parser, FY-4B and FY-2G | CHINA first, then DISK |
| 6 | Polish: palettes, i18n labels, docs, version bump | Full checklist green |

## 6. Test & verification (live: `bore.pub:59042`)

**Unit tests (Go, offline, fixtures):** for each new parser, assert the header fields, grid dimensions, value range and missing-value handling. Cover truncated and corrupt input, outer-wrapper sniffing (gzip, bzip2), and a tests-by-manifest table (every manifest path resolves to a latest file).

**Live smoke test** (`go test -tags live ./server/... -run Live`, env `CASSANDRA_HOST=bore.pub CASSANDRA_PORT=59042`; skipped by default):
1. For every manifest dataset, fetch the latest file, decode it, and assert freshness (≤ 24 h, or the expected cadence) and sane value ranges, for example CAPE ≥ 0, reflectivity −10…80 dBZ, FY-4B DN within the bit depth.
2. Print a pass/fail table that can be compared against the scorecard in `menu-addition-list.md` (150/153 expected).

**End-to-end:**
```bash
cd server && go run ./cmd -chost bore.pub -cport 59042
curl 'localhost:<port>/api/catalog/models'
curl 'localhost:<port>/api/data/grid?path=SWAN_PRODUCT/LOCAL/NCRAD/TDPRODUCT/MCR'
```
Then run the client (`bun run dev`) and open every new menu entry. Check that it renders, the legend, tooltip values, timeline stepping, window split and multi-tab. Run `bun test` and `go test ./...`, then compare a few fields with a reference such as `nmc_met_io` output (same file, same grid min/max/mean) for a numeric cross-check.

**Performance gates:** first paint < 3 s for grids ≤ 5 MB, DISK satellite < 5 s via decimation, heap budget as in Architecture §11.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Diamond 131 is documented, but SWAN text (TVS/HAIL/GALE), lightning and AWX layouts are not | Phase 1 hexdump probing, `nmc_met_io` as a cross-check |
| FY-4A navigation constants in the reference (105°E) used for FY-4B | Use FY-4B constants and confirm AWX projection fields in Phase 1 |
| Cassandra 2.2.5 on a bore tunnel is slow or flaky (large 25 MB blobs) | Retries (already in the client), server cache, decimation, per-request timeouts |
| 30-entry FY-4B menu clutter | Single grouped entry with a channel selector |
| DISK geostationary reprojection cost | Server-side downsample first, add a nearest-neighbour resampler, defer full-res |
| Dataset freshness changes (the list is a snapshot of 2026-10-14) | The live smoke test, and hiding entries that return 404 |

## 8. Progress checklist

Legend: `[ ]` todo, `[~]` in progress, `[x]` done. Update this section as work lands. Each phase is complete when its gate (§5) passes.

### Phase 0 — Preconditions
- [x] Test port confirmed: `bore.pub:59042`
- [x] Format reference located: `../tianqing-data`
- [x] Confirm `candidateDataPaths` handles deep `SWAN_PRODUCT/...` and `SATELLITE/...` paths
- [x] Confirm `latestdatatime` lookup works for non-`YYMMDDHH.fff` filenames (`.000`, 12/14-digit, `.BIN.BZ2`, `.AWX`)

### Phase 1 — Format discovery harness
- [x] `server/cmd/probe` tool (latest file, hexdump, wrapper sniffing)
- [x] `server/testdata/dataset_manifest.json` generated from `menu-addition-list.md` (150 active entries)
- [x] Fixtures saved (≤ 1 MB each): MDFS grid, vector grid, station, Diamond 131, SWAN text, lightning, wind profiler JSON, AWX CHINA, AWX FY-2G, BMP
- [x] Probe notes written into Architecture.md §6
- [x] Gate: every family has a confirmed header layout and a fixture

### Phase 2 — Tier 1 (existing decoders)
- [x] ECMWF_HR extra fields (30)
- [x] ECMWF_HR PVORT (19 levels, one preset with level selector)
- [x] GRAPES_3KM (19), including large-file decimation and cache check
- [x] NWFD_SCMOC + NWFD_SCMOC_1H (13 active; 6h/24h precip type excluded)
- [x] CLDAS (RAIN01/03/24, 10-min rain, TMP, VIS, WIND), including 10-min time cadence
- [x] ECMWF_ENSEMBLE_PRODUCT (13)
- [x] GRAPES_GFS convective indices (5)
- [x] FORECAST_PRODUCT/NMC/WIND (1)
- [x] SURFACE / MARINE station products (8), including station-parser element map extensions
- [x] New palettes: CAPE, helicity, shear, snow, SST, TCWV, precip type, hazards, probability, variance
- [x] `scripts/gen-presets.mjs` generates presets from the manifest
- [x] Menu/submenu UI handles about 20 categories (group, search, bilingual labels)
- [x] Gate: every Tier 1 path renders from live data

### Phase 3 — SWAN radar (Diamond 131)
- [x] `diamond131_parser.go` with unit tests on the fixture
- [x] Format sniffing in `grid_handler.go`
- [x] MCR (composite reflectivity)
- [x] MTOP, MVIL
- [x] QPE6MIN, QPE60
- [x] TDMOSAIC (3D levels via `/api/catalog/levels`)
- [x] REF_FST, QPF, HAIL, WINDY extrapolations (`.Fxxx` lead times)
- [x] GD/COTRECWIND (U/V) and GD/REF_FST
- [x] Radar palettes (dBZ, echo top, VIL, QPE) and 6-min timeline
- [x] Gate: results plausible against known echoes, compared with `D131Decoder.py` output

### Phase 4 — Event / point products
- [x] SWAN text parser (TVS, HAIL, GALE)
- [x] Lightning parser (10-min, 1-h)
- [x] `event` layer type on the client
- [x] Wind profiler handler `/api/data/windprofiler` (RAD, ROBS)
- [x] `profiler` layer and time-height barb panel
- [x] Gate: points and profiles display

### Phase 5 — Satellite
- [x] `awx_parser.go` with unit tests on the fixture
- [x] FY-4B CHINA, 15 channels, with calibration LUT
- [x] FY-4B DISK: reprojection and decimation, within the performance gate
- [x] Grouped FY-4B menu entry (channel and domain selector)
- [x] FY-2G CTT and QPE001/003/006
- [x] FY-2G AMV IR1/IR3 barbs
- [x] FY-2G DUST RGB BMP image endpoint (or document why it is skipped)
- [x] Gate: CHINA first, then DISK

### Phase 6 — Testing and release
- [x] Go unit tests for all new parsers (header, dimensions, ranges, corrupt/truncated input)
- [x] Manifest-driven table test (every path resolves to a latest file)
- [x] Live smoke test (`-tags live`, `bore.pub:59042`) reports 150/153 as expected
- [x] Numeric cross-check against `nmc_met_io` / `tianqing-data` decoders for sampled files
- [x] `go test ./...` and `bun test` pass
- [x] Manual UI pass over every new menu entry (render, legend, tooltip, timeline, split, tabs)
- [x] Performance gates met (< 3 s for ≤ 5 MB grids, < 5 s for DISK, heap budget)
- [x] Mock-mode generators for the new families
- [x] Docs updated (Architecture.md, README) and version bumped

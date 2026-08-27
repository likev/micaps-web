# MICAPS-Web

**MICAPS-Web** is a high-performance, modern web-based meteorological visualization and analysis workstation designed to replace and modernize desktop meteorologist tools (CMA MICAPS 4). It bridges distributed big data storage (Apache Cassandra / BDStore) with modern WebGL map visualization and in-browser scientific algorithms.

---

## Architecture Overview

```mermaid
graph TD
    subgraph Storage ["Cassandra Cluster (BDStore / micapsdataserver)"]
        DirectLAN["Production: Intranet LAN (Port 9042)"]
        Tunnel["Dev/Test: Reverse Proxy Tunnel (bore.pub:<dynamic-port>)"]
    end

    subgraph Backend ["Go Backend Server (./server)"]
        Config["Runtime Config & CLI Flags (-host, -cport, -port, -mock)"]
        Translator["CQL AddressTranslator (Dynamic IP/Port Rewriter)"]
        Gocql["gocql Session (CQL Binary Protocol v4)"]
        Decompress["Gzip Payload Decompressor"]
        Parser["MICAPS Binary Header Parser (278B Grid / 288B Station)"]
        RangeServer["Static & PMTiles Range Server (HTTP 206)"]
        MockEngine["Offline Mock Data Generator"]

        Config --> Gocql
        Tunnel -.->|Dev/Test| Translator --> Gocql
        DirectLAN -->|Production| Gocql
        Gocql --> Decompress --> Parser
        MockEngine -.-> Parser
    end

    subgraph Frontend ["Web Meteorological Workstation (./client)"]
        MapLibre["MapLibre GL JS (WebGL Map Engine)"]
        PMTilesProto["Offline PMTiles Protocol (map-china.pmtiles)"]
        GridData["griddata-js (Marching Squares contour & contourf)"]
        
        RasterL["Offscreen Canvas Float32Array Raster Layer"]
        ContourL["Isoband (Polygon) & Isoline (Line) Vector Overlays"]
        WindL["Animated Particle Streamlines Simulator"]
        StationL["WMO / NOAA 9-Point Station Plot Model (LoD Culling)"]
        UI["Workstation UI (Catalog Drawer, Layer Controls, Time Slider)"]
    end

    subgraph Testing ["Headless Automation Suite (Bun 1.4)"]
        BunTest["Bun Test Runner (bun test)"]
        BunWV["Bun.WebView (Native Headless Browser Controller)"]
        Chromium["Headless Chromium Engine"]
        BunTest --> BunWV --> Chromium -->|Navigate, Click, Scroll, Screenshot| Frontend
    end

    Parser -->|REST JSON & Float32 Streams| Frontend
    RangeServer -->|PMTiles Vector Chunks| PMTilesProto --> MapLibre
    GridData --> ContourL
```

---

## Key Features

- **Offline Vector Basemap**: Local PMTiles (`map-china.pmtiles`) providing China national borders, provincial boundaries, and graticule coordinates with 0 external network dependencies.
- **In-Browser Contouring (`griddata-js`)**: Client-side Marching Squares generation of filled isobands (`contourf`) and contour lines (`contour`) from NWP grids with sub-1.5s execution.
- **Standard WMO / NOAA Station Weather Plot**: Implements standard 9-position synoptic station model (CIMSS / NOAA WPC) including:
  - Center sky cover octas (0/8 to 8/8, obscured $X$).
  - Rotated wind barbs (5kt, 10kt, 50kt pennant).
  - Temperature $TT$ & Dewpoint $T_dT_d$.
  - Sea-level pressure $PPP$ (3-digit encoded) & 3h pressure tendency curve $ppa$.
  - Present weather $ww$ & visibility $VV$.
  - Adaptive Level-of-Detail (LoD) decluttering.
- **High-Density Raster & Wind Streamlines**: Zero-copy Float32 binary streaming rendered to offscreen canvas with CMA color palettes, plus animated wind streamline particle simulator.
- **Dynamic Bore Tunnel Translation**: Supports ephemeral reverse proxy tunnels (`bore.pub:<port>`) with dynamic port binding and cluster internal IP rewriting, with automatic offline mock fallback.
- **Bun 1.4 Native `Bun.WebView` E2E Test Suite**: Headless browser automation testing with navigate, click, evaluate, and screenshot verification directly via Bun 1.4.
- **Strict Modularity**: Every source file across the entire repository adheres strictly to **< 600 lines**.

---

## Directory Structure

```text
micaps-web/
├── micaps-web-plan1.md               # Master architecture and implementation specification
├── README.md                         # Project documentation
├── server/                           # Go HTTP server & Cassandra data engine
│   ├── cmd/
│   │   └── main.go                   # CLI entrypoint, flag parsing, route bootstrap (< 120 lines)
│   ├── config/
│   │   └── config.go                 # Dynamic configuration & CLI flag definitions (< 80 lines)
│   ├── db/
│   │   ├── cql_client.go             # Cassandra CQL session & TunnelTranslator (< 230 lines)
│   │   ├── catalog_queries.go        # Catalog, treeview, level & latest time queries (< 140 lines)
│   │   └── data_queries.go           # Raw blob query executor (< 50 lines)
│   ├── handler/
│   │   ├── catalog_handler.go        # REST catalog endpoints (< 110 lines)
│   │   ├── grid_handler.go           # NWP JSON and binary Float32 streaming handlers (< 100 lines)
│   │   ├── station_handler.go        # GeoJSON station observation handler (< 60 lines)
│   │   └── static_handler.go         # SPA fallback & HTTP 206 PMTiles range server (< 80 lines)
│   ├── mock/
│   │   └── mock_generator.go         # Synthetic NWP grid & station observation generator (< 190 lines)
│   ├── model/
│   │   └── types.go                  # Data structures and GeoJSON models (< 110 lines)
│   ├── parser/
│   │   ├── decompress.go             # Gzip blob decompressor (< 60 lines)
│   │   ├── grid_header.go            # 278-byte MICAPS Type 4/11 header parser (< 80 lines)
│   │   ├── grid_data.go              # Grid Float32 payload decoding (< 140 lines)
│   │   └── station_parser.go         # 288-byte station header & observation decoder (< 220 lines)
│   └── static/
│       └── map-china.pmtiles         # Offline China vector tiles (borders & provinces)
├── client/                           # Frontend Meteorological Workstation
│   ├── index.html                    # Workstation HTML shell (< 30 lines)
│   ├── package.json                  # Dependencies, build scripts & test runner
│   ├── vite.config.js                # Vite build configuration
│   ├── src/
│   │   ├── main.js                   # Application bootstrap & lifecycle orchestrator (< 160 lines)
│   │   ├── style.css                 # Dark meteorological theme stylesheet (< 330 lines)
│   │   ├── api/                      # REST & binary stream fetchers
│   │   ├── layers/                   # MapLibre, Deck.gl, Canvas & SVG layer renderers
│   │   ├── map/                      # MapLibre GL setup, PMTiles protocol, graticule lines
│   │   ├── store/                    # Reactive workstation state manager
│   │   ├── ui/                       # Navbar, catalog drawer, layer control, time slider, tooltip
│   │   └── utils/                    # CMA palettes, weather symbols, griddata-js adapter
│   └── test/                         # E2E Automation Testing Suite (Bun.WebView)
│       ├── run_all.js                # Sequential test runner (< 60 lines)
│       ├── e2e/
│       │   ├── helpers/testEnv.js    # Bun.WebView browser fixture (< 40 lines)
│       │   ├── map_render.test.js    # Vector map & graticule test (< 50 lines)
│       │   ├── ui_controls.test.js   # Drawer, slider & tooltip test (< 70 lines)
│       │   ├── contour_layer.test.js # griddata-js isoband & isoline test (< 50 lines)
│       │   ├── raster_wind.test.js   # Binary raster & wind streamline test (< 50 lines)
│       │   ├── station_plot.test.js  # WMO/NOAA 9-point station plot test (< 50 lines)
│       │   └── visual_regression.test.js # Screenshot capture verification (< 30 lines)
│       └── screenshots/
│           └── workstation-screenshot.png # High-resolution screenshot captured by Bun.WebView
```

---

## Quick Start

### 1. Start Backend Server

The Go server can run either in **Development/Test mode** (using a dynamic `bore.pub` reverse-proxy tunnel) or in **Production mode** (direct intranet connection).

> [!NOTE]
> The `bore.pub` tunnel is used **strictly for development/testing**, and its remote port changes on every run. Pass the active port using `-cport`.

#### Run on Linux / macOS:
```bash
cd server

# Connect via active bore tunnel (e.g. bore.pub:45060)
./micaps-server -host 159.223.110.159 -cport 45060 -port 8088

# Connect to direct intranet Cassandra (Production)
./micaps-server -host 192.168.0.114 -cport 9042 -tunnel=false -port 8088

# Offline Mock Mode (No database required)
./micaps-server -mock=true -port 8088
```

#### Run on Windows 10/11:
A pre-compiled 64-bit Windows binary (`micaps-server.exe`) is included:
```cmd
cd server
micaps-server.exe -host 159.223.110.159 -cport 45060 -port 8088
```

To cross-compile the Windows binary from Linux:
```bash
cd server
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o micaps-server.exe ./cmd/main.go
```

---

### 2. Frontend Build & Development

The frontend is built using Vite and bundled into `client/dist`. The Go backend serves these compiled static assets directly from the filesystem (configurable via the `-static` flag or `STATIC_DIR` environment variable, defaulting to `../client/dist`).

```bash
cd client

# Install dependencies (requires Bun 1.4)
bun install

# Build production bundle
bun run build

# Or launch local Vite development server
bun run dev
```

Open your browser at:
```text
http://localhost:8088
```

---

## Automated E2E Testing with Bun 1.4 `Bun.WebView`

Bun 1.4 includes a built-in headless browser automation engine via `Bun.WebView`. The test suite controls headless Chromium to navigate, interact with UI widgets, test WebGL layer rendering, and capture screenshots.

```bash
cd client
bun test
```

Or execute individual test suites:
```bash
# Verify offline vector basemap & coordinate graticule
bun test ./test/e2e/map_render.test.js

# Verify catalog drawer, time scrubber, and tooltips
bun test ./test/e2e/ui_controls.test.js

# Verify griddata-js Marching Squares isobands & isolines
bun test ./test/e2e/contour_layer.test.js

# Verify WMO/NOAA 9-point station plot model & LoD decluttering
bun test ./test/e2e/station_plot.test.js

# Verify Float32 binary raster stream and wind streamlines
bun test ./test/e2e/raster_wind.test.js

# Capture full-viewport screenshot and verify visual regression
bun test ./test/e2e/visual_regression.test.js
```

### Test Suite Execution Output
```text
========================================
ALL TEST SUITES COMPLETED: 6 passed, 0 failed
Total Tests: 17 passed, 0 failed (100% pass rate)
========================================
```

---

## API Reference Summary

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/catalog/models` | `GET` | Returns 4-tier model hierarchy (Global NWP, CMA Regional, Gridded Guidance, Observations). |
| `/api/catalog/elements` | `GET` | Returns available variables (`TMP`, `HGT`, `WIND`, etc.) for given model path. |
| `/api/catalog/levels` | `GET` | Returns isobaric pressure levels (`1000`, `850`, `500`, `200` hPa). |
| `/api/catalog/dates` | `GET` | Returns forecast base time directories. |
| `/api/catalog/files` | `GET` | Returns available forecast lead periods (`000`, `024`, `048`, `072`...). |
| `/api/data/grid` | `GET` | Returns decoded NWP grid GeoJSON with 2D scalar/vector arrays and coordinates. |
| `/api/data/grid/binary` | `GET` | Streams raw Little-Endian `Float32Array` bytes for zero-copy Canvas/WebGL raster rendering. |
| `/api/data/station` | `GET` | Returns WMO/CMA synoptic station observations as GeoJSON Point `FeatureCollection`. |
| `/map-china.pmtiles` | `GET` | HTTP 206 range-request endpoint serving offline China vector basemap tiles. |

---

## Standards & References

- **CMA MICAPS 4 Cassandra Architecture**: `../help/micaps4-cassandra.md`
- **MICAPS 4 File Format**: [nmcdev/nmc_met_io](https://github.com/nmcdev/nmc_met_io/blob/master/nmc_met_io/retrieve_cassandraDB.py)
- **High-Performance Local Web Maps**: [likev/local-map](https://github.com/likev/local-map)
- **In-Browser Contouring**: [likev/griddata-js](https://github.com/likev/griddata-js)
- **WMO / NOAA Station Weather Plot Layout**:
  - [CIMSS Satellite Meteorology Module 7](https://cimss.ssec.wisc.edu/satmet/modules/7_weather_forecast/wf-5.html)
  - [NOAA Weather Prediction Center (WPC) Station Plot](https://www.wpc.ncep.noaa.gov/html/stationplot.shtml)

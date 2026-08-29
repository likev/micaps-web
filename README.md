# MICAPS-Web

**MICAPS-Web** is a high-performance, modern web-based meteorological visualization and analysis workstation designed to modernize and replace desktop meteorologist tools (CMA MICAPS 4). It bridges distributed big data storage (Apache Cassandra / BDStore) with modern WebGL map visualization and in-browser scientific algorithms.

---

## Key Features

- **Offline Vector Basemap**: Local PMTiles (`map-china.pmtiles`) providing China national borders, provincial boundaries, and graticule coordinates with 0 external network dependencies.
- **In-Browser Contouring (`griddata-js`)**: Client-side Marching Squares generation of filled isobands (`contourf`) and contour lines (`contour`) from NWP grids with sub-1.5s execution.
- **Standard WMO / NOAA Station Weather Plot**: Implements standard 9-position synoptic station model (CIMSS / NOAA WPC) with 110° angled wind barbs, sky cover octas, sea-level pressure, temperature, dewpoint, weather glyphs, and LoD decluttering.
- **High-Density Raster & Wind Streamlines**: Zero-copy Float32 binary streaming rendered to offscreen canvas with CMA palettes, plus animated wind streamline particle simulator.
- **Multi-Tab & Multi-Window Workstation**: Full 1×1, 1×2, 2×2 split layouts with synchronized pan/zoom/cursor, independent layer controls, time slider with step-length selection, and init-cycle switching.
- **Auto-Discovery of Cassandra Clusters**: Automatically discovers `MICAPS.exe.config` in the server directory and randomly balances connections across `ClusterIPAddress` nodes.
- **Strict Modularity**: Every source file across the entire repository adheres strictly to **< 600 lines**.

---

## Quick Start

### 1. Configuration Options
- **Auto-Detection**: Place your existing `MICAPS.exe.config` in the same directory as the executable. The server will automatically detect it and randomly select a `ClusterIPAddress`.
- **CLI Flags**:
  - `-host <ip>`: Cassandra cluster host IP
  - `-cport <port>`: Cassandra CQL port (default `9042`, or `45061` for tunnel)
  - `-port <port>`: HTTP workstation port (default `8088`)
  - `-static <path>`: Path to frontend `dist` directory (default `../client/dist`)
  - `-pmtiles <path>`: Path to `map-china.pmtiles` file (default `../client/public/map-china.pmtiles`)
  - `-mock`: Enable offline synthetic mock data generator (default `false`)

### 2. Run Server

#### On Linux / macOS:
```bash
cd server
./micaps-server -host 159.223.110.159 -cport 45061 -port 8088
```

#### On Windows 10/11:
Run the pre-compiled 64-bit Windows binary:
```cmd
cd server
micaps-server.exe -host 159.223.110.159 -cport 45061 -port 8088
```

### 3. Open Workstation
Open your browser at:
```text
http://localhost:8088
```

---

## Architecture & Technical Reference

For detailed architecture diagrams, directory structure, runtime `config.json` schema, build workflows, Bun unit testing, and API references, see [**Architecture.md**](Architecture.md).

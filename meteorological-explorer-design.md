# Professional Meteorological File Explorer — Design Notes

A design proposal for a multi-layer meteorological data explorer, covering the
data/architecture model and — in detail — the UI for handling layers that have
**different observation times**.

---

## Part 1 — Architecture & Layer Model

### 1.1 Core insight: it's a *variable* explorer, not a file explorer

A GRIB2 or NetCDF file isn't one thing — it's an N-dimensional hypercube. The
tree shouldn't stop at the filename:

```
/data/gfs/
└── gfs.t00z.pgrb2.0p25.f006        ← file
    ├── TMP  (temperature)          ← variable
    │   ├── isobaric: 1000,925,850… ← vertical dim
    │   └── valid: 2026-09-30T06Z   ← time dim
    ├── UGRD / VGRD  → [vector pair]
    └── APCP (precip, accumulated)
```

**Index once, read lazily.** Scan headers/metadata into SQLite:

| column | example |
|---|---|
| `file` | `gfs.t00z.pgrb2.0p25.f006` |
| `variable` | `TMP` |
| `level` | `850 hPa` |
| `valid_time` | `2026-09-30T06:00Z` |
| `step` | `+6h` |
| `ensemble_member` | `ctl`, `p01`… |
| `bbox` | `-180,-90,180,90` |
| `byte_offset` / `length` | `18422 / 9104` |

The explorer queries the index instantly; the decoder only touches bytes when a
layer is actually drawn. This is what makes it feel "pro" — a 500-file forecast
run opens in milliseconds.

### 1.2 Layer model

Layers are not a flat list of images. Each layer is:

```
(source, variable, coord selection, render style, blend)
```

| Render type | Use for | Implementation |
|---|---|---|
| Raster / colormap | T, RH, reflectivity | GPU texture + LUT shader |
| Contour (isolines) | MSLP, geopotential height | marching squares, labeled |
| Filled contours | precip thresholds | banded LUT |
| Barbs / arrows | wind U/V | instanced glyphs on a grid |
| Streamlines / particles | flow visualization | animated particle buffer |
| Point/station overlay | METAR, soundings | vector markers |

Give the layer stack real compositing controls: **order, opacity, blend mode**,
and a shared time/level cursor (see Part 2 — this is the crux).

### 1.3 System architecture

```
┌─ Indexer (Python: xarray / cfgrib / eccodes)  → SQLite catalog
├─ Field service (FastAPI)
│    GET /field?var=TMP&level=850&t=...  → Float32Array + bbox  (raw, not PNG)
├─ Frontend (React + MapLibre GL, or deck.gl for heavy 3D)
│    - layer stack, colormap editor, multi-track time scrubber
│    - decodes Float32 on GPU → exact-value probing + live rescale
│    - Web Worker for interpolation / probing
└─ Optional: Zarr / COG on object storage for cloud-native reads
```

### 1.4 The one decision that matters most: ship raw floats, not PNGs

Serving `Float32Array` instead of pre-colored tiles buys you:

- live colormap changes with **no refetch**
- cursor readout of the **true value** in K / hPa / mm
- client-side **derived fields** (wind speed from U/V, thickness from two height layers)
- **difference maps** between members or models

### 1.5 Pro features worth building early

- **Cursor readout panel** — all visible layers' values at the pointer, one row each
- **Vertical profile / sounding** on click (Skew-T), and cross-sections along a drawn line
- **Difference mode** — layer A minus layer B (model vs model, member vs mean)
- **Saved products** — a named layer stack + style, reapplied to any run (Part 2.7)
- **Correct projection handling** — Lambert conformal, rotated pole, and Mercator
  all appear in real data. Get CRS reprojection right from day one or you will
  rewrite everything.

### 1.6 Stack recommendation

- **Backend:** Python + `xarray` / `cfgrib` / `eccodes`, FastAPI, SQLite index
- **Frontend:** MapLibre GL (basemap + custom WebGL layers), or deck.gl for 3D
- **Rendering:** custom WebGL shaders for colormap + contour; instanced geometry for barbs
- **Formats:** GRIB2 + NetCDF/CF first, then Zarr (cloud), BUFR/METAR for stations

---

## Part 2 — UI for Layers with Different Observation Times

The hard problem. Radar is 5-min, METAR is hourly on the hour, satellite is
10-min off-cycle, soundings are 00/12Z, mesoanalysis 850T might be 3-hourly.
**A single global timestamp is a lie.**

### 2.1 Core idea: the cursor is wall-clock, not a data timestamp

Stop thinking "which frame am I on." The playhead is a **continuous moment in
time**, and every layer independently *resolves* that moment to its own nearest
available observation:

```
resolve(layer, T_cursor) → (actual_obs_time, age, status)
```

### 2.2 Matching policies

Four policies cover nearly everything:

| Policy | Behavior | Use for |
|---|---|---|
| `nearest` | closest sample either side | radar, satellite (analysis mode) |
| `latest-at` (causal) | most recent sample ≤ T | replaying "what did we know then" |
| `hold` | keep showing until superseded, no limit | soundings, synoptic charts |
| `interpolate` | blend two samples | smooth fields only (T, MSLP) — **never radar** |

Each layer also carries a **tolerance window**. Beyond it, the layer doesn't
silently lie — it goes stale (§2.4).

### 2.3 Primary UI: multi-track timeline (DAW / video-editor pattern)

The single most important piece. Each layer gets its own lane showing its
*actual* sample ticks, with one playhead crossing all of them:

```
                          ┌ playhead: 2026-09-30 14:27Z
  ── 13:00 ──── 13:30 ──── 14:00 ─┊── 14:30 ──── 15:00 ──
                                  ┊
 ◉ Radar CREF   ▎▎▎▎▎▎▎▎▎▎▎▎▎▎▎▎▎▎▎▎▎▎▎▎▎▎      14:25Z  -2m   ●
 ◉ Satellite IR   ▊    ▊    ▊    ▊┊   ▊    ▊     14:20Z  -7m   ●
 ◉ 10m Wind (obs) █         █     ┊█         █   14:00Z -27m   ◐
 ◉ MSLP analysis  █              █┊              14:00Z -27m   ◐
 ◉ 850T mesoanal  █                ┊             13:00Z -87m   ○ stale
                                  ┊
      [◀◀] [▶] [▶▶]   step by: ▾ Radar (5 min)    ⟳ live
```

What this buys you:

- **Data gaps are visible.** A missing radar volume is a hole in the lane, not a
  mystery frozen image.
- **Cadence is legible at a glance.** You *see* that 850T only updates hourly.
- **Step granularity is explicit.** "Step by Radar" advances 5 min; "step by
  METAR" advances 1 hour. Pick the **pacemaker** layer.
- Dragging the playhead updates every layer coherently; each snaps per its own policy.

Collapse to a single strip with a union-of-ticks ruler when space is tight;
expand on hover.

### 2.4 Make age visible on the map itself

Three escalating signals:

1. **Always** — every legend entry shows its resolved time and offset:
   `Radar CREF · 14:25Z (−2m)`. **Never show only the cursor time.**
2. **Soft stale** (past tolerance) — desaturate the layer ~30%, amber dot in legend.
3. **Hard stale** (far past tolerance, or gap) — drop opacity hard + diagonal
   hatch overlay, red dot, corner badge `850T 87 min old`. Optionally auto-hide
   with a `1 layer hidden (stale)` chip.

> **Principle:** a stale layer must never look identical to a current one.
> This is where these tools cause actual operational mistakes.

### 2.5 Status column

A compact panel beside the layer stack, one row per layer, sorted by age — the
fastest answer to "is what I'm looking at real right now?":

```
 Radar CREF     14:25Z   −2m   ●
 Satellite IR   14:20Z   −7m   ●
 10m Wind       14:00Z  −27m   ◐
 850T           13:00Z  −87m   ○
```

### 2.6 Two modes, one toggle

- **Live / Now** — playhead pinned to the right edge, auto-advances, every layer
  shows its latest. Policy forced to `latest-at`. Nowcasting / monitoring.
- **Review** — playhead draggable, policies apply as configured, scrub and loop
  over a window. Case study / post-analysis.

Add a **loop range** selector (drag on the ruler) for animating a convective event.

### 2.7 Per-layer time offset (deliberate desync)

Keep an explicit offset field — `Radar: T + 0`, `Radar (compare): T − 30m` — so
you can overlay the same layer at two times to judge storm motion, or lag a
model field against observations.

Offsets are **opt-in**, and the legend badge turns **blue** so an intentional
desync is never confused with staleness.

### 2.8 What a saved product actually stores

Never absolute times. Store the **recipe**:

```json
{
  "name": "Convective Nowcast",
  "pacemaker": "radar_cref",
  "layers": [
    { "src": "radar_cref",  "policy": "nearest",   "tolerance": "10m", "offset": 0 },
    { "src": "sat_ir",      "policy": "nearest",   "tolerance": "20m", "offset": 0 },
    { "src": "metar_wind",  "policy": "latest-at", "tolerance": "90m", "offset": 0 },
    { "src": "mslp_anl",    "policy": "latest-at", "tolerance": "3h",  "offset": 0 },
    { "src": "t850_meso",   "policy": "hold",      "tolerance": "6h",  "offset": 0 }
  ],
  "mode": "live"
}
```

The same product then applies to today, or to a 2019 case study, unchanged.

**Tolerances belong in the product** because the *meteorologist* knows a
90-minute-old METAR wind is still useful while a 15-minute-old radar scan is not.

### 2.9 Two smaller things that pay off

- **Snap** the playhead to the pacemaker layer's ticks by default; free-drag with a modifier.
- When a product mixes **obs and forecast**, split the ruler at `now` with a
  subtle shaded region to the right, so past-vs-future is never ambiguous.

---

## Implementation order (suggested)

1. Indexer + SQLite catalog over a sample GRIB2 set
2. Field service returning raw `Float32Array` + bbox
3. MapLibre frontend, single raster layer, colormap LUT shader
4. Layer stack with opacity/order, contour + barb renderers
5. **Multi-track timeline + resolve policies + staleness styling**
6. Saved products (recipe JSON)
7. Cursor readout, soundings, cross-sections, difference mode

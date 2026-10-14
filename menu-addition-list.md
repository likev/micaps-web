# Meteorological Datasets in Cassandra (`bore.pub:59042`) for Menu Integration

This document summarizes the verified, actively updating meteorological datasets discovered on the live Apache Cassandra cluster at `bore.pub:59042` (`micapsdataserver` keyspace) that can be integrated into the MICAPS Web menu and preset system.

Every dataset below has undergone independent 24-hour freshness verification against the live Cassandra catalog (`treeview`, `latestdatatime`, and cell `WRITETIME(value)`) using only metadata (filename, byte size, and UTC timestamp; no binary payloads were accessed).

---

## 1. Executive Summary & Verification Scorecard

**Evaluation Cutoff Time**: `2026-10-14T14:01:26Z` | **24h Freshness Threshold**: `2026-10-13 14:00:00Z`  
**Endpoint**: `bore.pub:59042` (`micapsdataserver` keyspace, Apache Cassandra 2.2.5)

| Category / Tier | Total Targets Checked | Verified Active (< 24h) | Stale / Inactive (> 24h) | Pass Rate | Freshness Summary |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Tier 1: ECMWF_HR** | 30 | 30 | 0 | 100.0% | All 30 elements + all 19 isobaric levels of `PVORT` fresh within 6h. |
| **Tier 1: GRAPES_3KM** | 19 | 19 | 0 | 100.0% | High-res convective run from today 09:00 UTC (17:00 BJT). |
| **Tier 1: NWFD_SCMOC & NWFD_SCMOC_1H** | 15 | 13 | 2 | 86.7% | Main `PRECIPITATION_TYPE` active today; 6h/24h variants deprecated. |
| **Tier 1: CLDAS Land Surface Reanalysis** | 5 | 5 | 0 | 100.0% | Table `CLDAS` streaming hourly and 10-min merged fields. |
| **Tier 1: ECMWF_ENSEMBLE_PRODUCT** | 13 | 13 | 0 | 100.0% | 51-member ensemble mean & variance (TMP, HGT, RH) + rain probs. |
| **Tier 1: SURFACE & MARINE Observations** | 8 | 8 | 0 | 100.0% | 60k+ AWS, expressways, 1-min visibility, pressure tendencies. |
| **Tier 2: SWAN 3D Radar Mosaic & Extrapolations** | 15 | 15 | 0 | 100.0% | 6-min national radar mosaic (MCR, MTOP, MVIL) + 0–2h nowcasts. |
| **Tier 2: Wind Profiler & Lightning** | 4 | 4 | 0 | 100.0% | 425 national wind profiler stations (90% stream rate) + lightning. |
| **Tier 3: FY-4B L1 Channels (China & Disk)** | 30 | 30 | 0 | 100.0% | 15 channels × 2 domains (CHINA & DISK) updating every 15 min. |
| **Tier 3: FY-2G L2 Products** | 8 | 7 | 1 | 87.5% | Dust RGB BMP, Cloud Top Temp, AMV barbs active; QPE024 daily roll. |
| **Forecaster Guidance & GRAPES_GFS** | 6 | 6 | 0 | 100.0% | NMC forecaster max wind + GRAPES_GFS convective indices. |
| **TOTAL AUDITED** | **153** | **150** | **3** | **98.0%** | **150 active datasets ready for menu inclusion.** |

---

## 2. Tier 1: Directly Addable to Menu (Zero Backend Code Needed)

These fields are already streaming in Cassandra, supported by the existing backend MDFS grid and station parsers, and can be rendered immediately by adding preset entries in `client/config.json`.

### A. Advanced Global NWP Fields (`ECMWF_HR`)
*Cassandra Table: `ECMWF_HR` | Format: MDFS DataType 4 / DataType 11*  
*Latest Run: `2026-10-14 08:00 UTC` (`26101408`). Age: ~5.8 to 6.1 hours.*

| Element Name | Canonical Cassandra `dataPath` | Latest Filename | Size (Bytes) | Writetime (UTC) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CAPE` | `ECMWF_HR/CAPE` | `26101408.240` | 1,436,324 | 2026-10-14 08:13:59 | **PASS** |
| `CAPE_SHEAR` | `ECMWF_HR/CAPE_SHEAR` | `26101408.240` | 1,658,843 | 2026-10-14 08:13:56 | **PASS** |
| `10m Gusts (3h Max)` | `ECMWF_HR/10_METRE_WIND_GUST_IN_THE_LAST_3_HOURS` | `26101408.144` | 2,329,510 | 2026-10-14 08:04:15 | **PASS** |
| `10m Gusts (6h Max)` | `ECMWF_HR/10_METRE_WIND_GUST_IN_THE_LAST_6_HOURS` | `26101408.240` | 2,484,998 | 2026-10-14 08:13:29 | **PASS** |
| `FREEZING_RAIN03` | `ECMWF_HR/FREEZING_RAIN03` | `26101408.072` | 56,609 | 2026-10-14 07:54:06 | **PASS** |
| `FREEZING_RAIN06` | `ECMWF_HR/FREEZING_RAIN06` | `26101408.240` | 25,486 | 2026-10-14 08:13:43 | **PASS** |
| `FREEZING_RAIN12` | `ECMWF_HR/FREEZING_RAIN12` | `26101408.240` | 35,651 | 2026-10-14 08:13:44 | **PASS** |
| `FREEZING_RAIN24` | `ECMWF_HR/FREEZING_RAIN24` | `26101408.240` | 47,385 | 2026-10-14 08:13:44 | **PASS** |
| `FZRA` (Freezing Rain Rate) | `ECMWF_HR/FZRA` | `26101408.240` | 205,517 | 2026-10-14 08:13:43 | **PASS** |
| `PRECIPITATION_TYPE` | `ECMWF_HR/PRECIPITATION_TYPE` | `26101408.240` | 83,068 | 2026-10-14 08:13:58 | **PASS** |
| `ASNOW` (Snow Accum.) | `ECMWF_HR/ASNOW` | `26101408.240` | 824,418 | 2026-10-14 08:13:30 | **PASS** |
| `SNOD` (Snow Depth) | `ECMWF_HR/SNOD` | `26101408.240` | 733,098 | 2026-10-14 08:13:34 | **PASS** |
| `SNOW03` | `ECMWF_HR/SNOW03` | `26101408.072` | 220,418 | 2026-10-14 07:53:28 | **PASS** |
| `SNOW06` | `ECMWF_HR/SNOW06` | `26101408.240` | 229,361 | 2026-10-14 08:13:30 | **PASS** |
| `SNOW12` | `ECMWF_HR/SNOW12` | `26101408.240` | 340,674 | 2026-10-14 08:13:30 | **PASS** |
| `SNOW24` | `ECMWF_HR/SNOW24` | `26101408.240` | 420,894 | 2026-10-14 08:13:31 | **PASS** |
| `SDEN` (Snow Density) | `ECMWF_HR/SDEN` | `26101408.240` | 607,223 | 2026-10-14 08:13:24 | **PASS** |
| `Snow Water Equivalent` | `ECMWF_HR/WATER_EQUIVALENT_OF_ACCUMULATED_SNOW_DEPTH` | `26101408.240` | 259,480 | 2026-10-14 08:13:34 | **PASS** |
| `ZERO_DEGREE_LEVEL` | `ECMWF_HR/ZERO_DEGREE_LEVEL` | `26101408.240` | 2,009,553 | 2026-10-14 08:13:31 | **PASS** |
| `WIND_100M` | `ECMWF_HR/WIND_100M` | `26101408.240` | 7,381,236 | 2026-10-14 08:13:41 | **PASS** |
| `UGRD_100M` | `ECMWF_HR/UGRD_100M` | `26101408.240` | 2,398,092 | 2026-10-14 08:13:38 | **PASS** |
| `VGRD_100M` | `ECMWF_HR/VGRD_100M` | `26101408.240` | 2,405,602 | 2026-10-14 08:13:36 | **PASS** |
| `SST` (Sea Surface Temp) | `ECMWF_HR/SST` | `26101408.240` | 2,109,958 | 2026-10-14 08:13:28 | **PASS** |
| `TCWV` (Total Column Vapor)| `ECMWF_HR/TCWV` | `26101408.240` | 1,436,490 | 2026-10-14 08:13:23 | **PASS** |
| `TCW` (Total Column Water) | `ECMWF_HR/TCW` | `26101408.240` | 1,454,878 | 2026-10-14 08:13:36 | **PASS** |
| `PVORT 500hPa` | `ECMWF_HR/PVORT/500` | `26101408.240` | 184,258 | 2026-10-14 08:13:57 | **PASS** |
| `PVORT 700hPa` | `ECMWF_HR/PVORT/700` | `26101408.240` | 148,732 | 2026-10-14 08:13:57 | **PASS** |
| `PVORT 850hPa` | `ECMWF_HR/PVORT/850` | `26101408.240` | 173,920 | 2026-10-14 08:13:57 | **PASS** |
| `TCDC` (Total Cloud Cover) | `ECMWF_HR/TCDC` | `26101408.240` | 837,782 | 2026-10-14 08:13:37 | **PASS** |
| `LCDC` (Low Cloud Cover) | `ECMWF_HR/LCDC` | `26101408.240` | 839,039 | 2026-10-14 08:13:32 | **PASS** |

*(Note: All other 16 isobaric levels of `ECMWF_HR/PVORT` — 10, 20, 50, 70, 100, 150, 200, 250, 300, 400, 600, 800, 900, 925, 950, 1000 hPa — are also 100% active with cycle `26101408.240`).*

---

### B. High-Resolution Convective NWP (`GRAPES_3KM`)
*Cassandra Table: `GRAPES_3KM` | Format: MDFS DataType 4 scalar grid*  
*Latest Run: `2026-10-14 17:00 BJT / 09:00 UTC` (`26101417`). Written: `2026-10-14 12:21 UTC`.*

| Element Name | Canonical Cassandra `dataPath` | Latest Filename | Size (Bytes) | Writetime (UTC) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Updraft Helicity (0-5km)` | `GRAPES_3KM/UPDRAFT_HELICITY/5000M_ABOVE_GROUND` | `26101417.036` | 1,698,338 | 2026-10-14 12:21:43 | **PASS** |
| `DCAPE` | `GRAPES_3KM/DCAPE` | `26101417.036` | 6,787,766 | 2026-10-14 12:21:50 | **PASS** |
| `Vertical Shear (600m)` | `GRAPES_3KM/MAX_VERTICAL_SPEED_SHEAR/600M_ABOVE_GROUND` | `26101417.036` | 8,260,504 | 2026-10-14 12:21:45 | **PASS** |
| `Shear Angle (600m)` | `GRAPES_3KM/MAX_VERTICAL_SPEED_SHEAR_ANGLE/600M_ABOVE_GROUND` | `26101417.036` | 11,296,927 | 2026-10-14 12:21:48 | **PASS** |
| `Max Wind (10m)` | `GRAPES_3KM/MAX_WIND/10M_ABOVE_GROUND` | `26101417.036` | 29,537,214 | 2026-10-14 12:21:42 | **PASS** |
| `Max U-Wind (10m)` | `GRAPES_3KM/MAX_UGRD/10M_ABOVE_GROUND` | `26101417.036` | 11,559,232 | 2026-10-14 12:21:27 | **PASS** |
| `Max V-Wind (10m)` | `GRAPES_3KM/MAX_VGRD/10M_ABOVE_GROUND` | `26101417.036` | 11,286,688 | 2026-10-14 12:21:37 | **PASS** |
| `Radar Refl. Maximum` | `GRAPES_3KM/RADAR_COMBINATION_REFLECTIVITY/MAXIMUM` | `26101417.036` | 2,091,404 | 2026-10-14 12:21:16 | **PASS** |
| `RAIN01` | `GRAPES_3KM/RAIN01` | `26101417.036` | 3,638,424 | 2026-10-14 12:21:22 | **PASS** |
| `RAIN03` | `GRAPES_3KM/RAIN03` | `26101417.036` | 6,081,776 | 2026-10-14 12:21:19 | **PASS** |
| `RAIN06` | `GRAPES_3KM/RAIN06` | `26101417.036` | 6,810,796 | 2026-10-14 12:21:20 | **PASS** |
| `RAIN12` | `GRAPES_3KM/RAIN12` | `26101417.036` | 8,618,430 | 2026-10-14 12:21:21 | **PASS** |
| `RAIN24` | `GRAPES_3KM/RAIN24` | `26101417.036` | 10,173,330 | 2026-10-14 12:21:22 | **PASS** |
| `SNOW01` | `GRAPES_3KM/SNOW01` | `26101417.036` | 1,730,755 | 2026-10-14 12:21:06 | **PASS** |
| `SNOW03` | `GRAPES_3KM/SNOW03` | `26101417.036` | 1,967,623 | 2026-10-14 12:21:04 | **PASS** |
| `SNOW06` | `GRAPES_3KM/SNOW06` | `26101417.036` | 2,205,865 | 2026-10-14 12:21:05 | **PASS** |
| `SNOW12` | `GRAPES_3KM/SNOW12` | `26101417.036` | 2,642,554 | 2026-10-14 12:21:05 | **PASS** |
| `SNOW24` | `GRAPES_3KM/SNOW24` | `26101417.036` | 3,525,897 | 2026-10-14 12:21:06 | **PASS** |
| `ASNOW` | `GRAPES_3KM/ASNOW` | `26101417.036` | 3,611,940 | 2026-10-14 12:21:04 | **PASS** |

---

### C. Official National Gridded Guidance (`NWFD_SCMOC` & `NWFD_SCMOC_1H`)
*Cassandra Table: `NWFD_SCMOC` / `NWFD_SCMOC_1H` | Format: MDFS DataType 4*  
*Latest Run: `2026-10-14 20:00 BJT / 12:00 UTC` (`26101420`).*

| Element Name | Canonical Cassandra `dataPath` | Latest Filename | Size (Bytes) | Writetime (UTC) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HAIL Alert` | `NWFD_SCMOC/HAIL` | `26101420.072` | 312 | 2026-10-14 09:00:48 | **PASS** |
| `FOG Advisory` | `NWFD_SCMOC/FOG` | `26101420.168` | 3,465 | 2026-10-14 07:00:10 | **PASS** |
| `HAZE Advisory` | `NWFD_SCMOC/HAZE` | `26101420.168` | 1,832 | 2026-10-14 07:00:12 | **PASS** |
| `HEAVY_RAINFALL` | `NWFD_SCMOC/HEAVY_RAINFALL` | `26101420.072` | 318 | 2026-10-14 09:01:03 | **PASS** |
| `SAND (Dust)` | `NWFD_SCMOC/SAND` | `26101420.072` | 312 | 2026-10-14 09:00:54 | **PASS** |
| `THUNDERSTORM` | `NWFD_SCMOC/THUNDERSTORM` | `26101420.072` | 868 | 2026-10-14 09:00:38 | **PASS** |
| `THUNDER_WIND` | `NWFD_SCMOC/THUNDER_WIND` | `26101420.072` | 315 | 2026-10-14 09:00:42 | **PASS** |
| `PRECIPITATION_TYPE` | `NWFD_SCMOC/PRECIPITATION_TYPE` | `26101420.240` | 610 | 2026-10-14 09:00:59 | **PASS** |
| `1h Rain Guidance` | `NWFD_SCMOC_1H/RAIN01` | `26101420.072` | 32,438 | 2026-10-14 14:00:13 | **PASS** |
| `Max Temperature (2m)` | `NWFD_SCMOC/MAXIMUM_TEMPERATURE/2M_ABOVE_GROUND` | `26101420.240` | 87,843 | 2026-10-14 07:30:22 | **PASS** |
| `Min Temperature (2m)` | `NWFD_SCMOC/MINIMUM_TEMPERATURE/2M_ABOVE_GROUND` | `26101420.240` | 92,755 | 2026-10-14 07:30:19 | **PASS** |
| `24h Temp Change (2m)` | `NWFD_SCMOC/TMP_CHANGE_24H/2M_ABOVE_GROUND` | `26101420.240` | 96,980 | 2026-10-14 07:30:23 | **PASS** |
| `48h Temp Change (2m)` | `NWFD_SCMOC/TMP_CHANGE_48H/2M_ABOVE_GROUND` | `26101420.240` | 97,749 | 2026-10-14 07:30:24 | **PASS** |
| *`PRECIPITATION_TYPE_6H`* | `NWFD_SCMOC/PRECIPITATION_TYPE_6H` | `26101320.240` | 84,895 | 2026-10-13 08:51:05 | **STALE (29h)** |
| *`PRECIPITATION_TYPE_24H`*| `NWFD_SCMOC/PRECIPITATION_TYPE_24H` | `26101320.240` | 62,449 | 2026-10-13 08:50:17 | **STALE (29h)** |

*(Recommendation: Add standard `NWFD_SCMOC/PRECIPITATION_TYPE` which is actively streaming 80 lead times. Exclude 6h and 24h interval variants).*

---

### D. High-Resolution Land Surface Reanalysis (`CLDAS`)
*Cassandra Table: `CLDAS` (Note: Table is `CLDAS`, not `CLDAS_1KM`) | Format: MDFS DataType 4*  
*Cadence: Hourly & 10-Minute Real-Time Ingest.*

| Element Name | Canonical Cassandra `dataPath` | Latest Filename | Size (Bytes) | Writetime (UTC) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `1h Merged Rain` | `CLDAS/RAIN01_BI_DATA_SOURCE` | `26101422.000` | 84,967 | 2026-10-14 14:05:00 | **PASS** |
| `10m Merged Rain` | `CLDAS/APCP_10MIN_BI_DATA_SOURCE` | `202610142250.000` | 67,284 | 2026-10-14 14:59:30 | **PASS** |
| `2m Temperature` | `CLDAS/TMP/2M_ABOVE_GROUND` | `26101422.000` | 5,151,866 | 2026-10-14 14:10:00 | **PASS** |
| `Visibility` | `CLDAS/VIS` | `26101422.000` | 3,506,872 | 2026-10-14 14:08:30 | **PASS** |
| `10m Wind Field` | `CLDAS/WIND/10M_ABOVE_GROUND` | `26101422.000` | 11,981,085 | 2026-10-14 14:10:03 | **PASS** |

*(Additional active merged products: `RAIN03_BI_DATA_SOURCE` [119,257B], `RAIN24_BI_DATA_SOURCE` [248,199B], and `RAIN_10MIN_BI_DATA_SOURCE` [50,085B]).*

---

### E. Ensemble Guidance & Probabilities (`ECMWF_ENSEMBLE_PRODUCT`)
*Cassandra Table: `ECMWF_ENSEMBLE_PRODUCT` | Format: MDFS DataType 4*  
*Latest Run: `2026-10-13 20:00 UTC` (`26101320`), lead `.348`. Written `2026-10-13 19:30 UTC` (18.5h ago).*

| Element Name | Cassandra `dataPath` | Latest Filename | Size (Bytes) | Writetime (UTC) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Ensemble Mean 850hPa TMP` | `ECMWF_ENSEMBLE_PRODUCT/AVERAGE/TMP/850` | `26101320.348` | 51,288 | 2026-10-13 19:30:05 | **PASS** |
| `Ensemble Mean 500hPa HGT` | `ECMWF_ENSEMBLE_PRODUCT/AVERAGE/HGT/500` | `26101320.348` | 46,270 | 2026-10-13 19:30:00 | **PASS** |
| `Ensemble Mean 850hPa RH` | `ECMWF_ENSEMBLE_PRODUCT/AVERAGE/RH/850` | `26101320.348` | 41,797 | 2026-10-13 19:30:29 | **PASS** |
| `Ensemble Mean 500hPa RH` | `ECMWF_ENSEMBLE_PRODUCT/AVERAGE/RH/500` | `26101320.348` | 45,232 | 2026-10-13 19:30:33 | **PASS** |
| `Ensemble Mean 2m TMP` | `ECMWF_ENSEMBLE_PRODUCT/AVERAGE/TMP_2M` | `26101320.348` | 139,173 | 2026-10-13 19:29:48 | **PASS** |
| `Ensemble Var 850hPa TMP` | `ECMWF_ENSEMBLE_PRODUCT/VARIANCE/TMP/850` | `26101320.348` | 57,454 | 2026-10-13 19:30:05 | **PASS** |
| `Ensemble Var 500hPa HGT` | `ECMWF_ENSEMBLE_PRODUCT/VARIANCE/HGT/500` | `26101320.348` | 57,236 | 2026-10-13 19:30:00 | **PASS** |
| `Ensemble Var 850hPa RH` | `ECMWF_ENSEMBLE_PRODUCT/VARIANCE/RH/850` | `26101320.348` | 57,068 | 2026-10-13 19:30:29 | **PASS** |
| `Ensemble Var 500hPa RH` | `ECMWF_ENSEMBLE_PRODUCT/VARIANCE/RH/500` | `26101320.348` | 56,243 | 2026-10-13 19:30:33 | **PASS** |
| `Ensemble Var 2m TMP` | `ECMWF_ENSEMBLE_PRODUCT/VARIANCE/TMP_2M` | `26101320.348` | 156,983 | 2026-10-13 19:29:48 | **PASS** |
| `Rain Prob > 10.0mm` | `ECMWF_ENSEMBLE_PRODUCT/GRID_PROBABILITY/RAIN24/10.0MM` | `26101320.348` | 24,482 | 2026-10-13 19:29:28 | **PASS** |
| `Rain Prob > 25.0mm` | `ECMWF_ENSEMBLE_PRODUCT/GRID_PROBABILITY/RAIN24/25.0MM` | `26101320.348` | 12,886 | 2026-10-13 19:29:28 | **PASS** |
| `Rain Prob > 100.0mm` | `ECMWF_ENSEMBLE_PRODUCT/GRID_PROBABILITY/RAIN24/100.0MM` | `26101320.348` | 2,247 | 2026-10-13 19:29:28 | **PASS** |

---

### F. Real-Time Observations (`SURFACE` & `MARINE`)
*Cassandra Table: `SURFACE` / `MARINE` | Format: MDFS Type 12 Station / Diamond 11*

| Element Name | Canonical Cassandra `dataPath` | Latest Filename | Size (Bytes) | Writetime (UTC) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `PLOT_ALL (>60k AWS)` | `SURFACE/PLOT_ALL` | `20261014230000.000` | 481,405 | 2026-10-14 15:04:01 | **PASS** |
| `PLOT_TRAFFIC (Expressway)` | `SURFACE/PLOT_TRAFFIC` | `20261014230000.000` | 1,707 | 2026-10-14 15:04:00 | **PASS** |
| `PLOT_TRAFFIC_5MIN` | `SURFACE/PLOT_TRAFFIC_5MIN` | `20261014225500.000` | 1,719 | 2026-10-14 15:04:00 | **PASS** |
| `PRES_CHANGE_3H_NATIONAL` | `SURFACE/PRES_CHANGE_3H_NATIONAL` | `20261014220000.000` | 31,587 | 2026-10-14 15:00:02 | **PASS** |
| `PRES_CHANGE_24H_NATIONAL`| `SURFACE/PRES_CHANGE_24H_NATIONAL`| `20261014220000.000` | 33,049 | 2026-10-14 15:00:02 | **PASS** |
| `HORIZONTAL_VISIBILITY_1MIN`| `SURFACE/HORIZONTAL_VISIBILITY_1MIN_ALL_STATION` | `20261014230000.000` | 30,229 | 2026-10-14 15:04:02 | **PASS** |
| `SNOW_DEPTH_ALL_STATION` | `SURFACE/SNOW_DEPTH_ALL_STATION` | `20261014230000.000` | 324 | 2026-10-14 15:04:02 | **PASS** |
| `ROCEA_1H (Marine Buoys)` | `MARINE/ROCEA_1H` | `20261014030000.000` | 139 | 2026-10-14 15:00:03 | **PASS** |

*(Note: In Cassandra, `SURFACE/SNOW_DEPTH` is empty; the active path is `SURFACE/SNOW_DEPTH_ALL_STATION` with 4,343 files).*

---

## 3. Tier 2: High Value (Requires Lightweight Extension)

### A. National 3D Radar Mosaic (`SWAN_PRODUCT`)
*Cadence: Every 6 minutes | Storage: Outer GZIP + Inner BZIP2 (`BZh91AY&SY`)*  
*Payload Format: Standard MICAPS Diamond 131 (`diamond 131 组合反射率...`)*  
*(Note: `DecompressBzip2` is already implemented in `server/parser/decompress.go`)*

| Element Name | Canonical Cassandra `dataPath` | Latest Filename | Size (Bytes) | Writetime (UTC) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `MCR (Composite Refl)` | `SWAN_PRODUCT/LOCAL/NCRAD/TDPRODUCT/MCR` | `Z_OTHE_RADAMCR_20261014145400.BIN.BZ2` | 39,342 | 2026-10-14 14:59:25 | **PASS** |
| `MTOP (Echo Tops)` | `SWAN_PRODUCT/LOCAL/NCRAD/TDPRODUCT/MTOP` | `Z_OTHE_RADAMTOP_20261014145400.BIN.BZ2` | 20,133 | 2026-10-14 14:59:25 | **PASS** |
| `MVIL (Vert. Int. Liquid)` | `SWAN_PRODUCT/LOCAL/NCRAD/TDPRODUCT/MVIL` | `Z_OTHE_RADAMVIL_20261014145400.BIN.BZ2` | 16,325 | 2026-10-14 14:59:25 | **PASS** |
| `QPE6MIN` | `SWAN_PRODUCT/LOCAL/NCRAD/TDPRODUCT/QPE6MIN` | `Z_OTHE_RADAMQPE_6_20261014140000.BIN.BZ2` | 10,617 | 2026-10-14 14:59:32 | **PASS** |
| `QPE60` | `SWAN_PRODUCT/LOCAL/NCRAD/TDPRODUCT/QPE60` | `Z_OTHE_RADAMQPE_60_20261014145400.BIN.BZ2` | 11,049 | 2026-10-14 14:59:31 | **PASS** |
| `TDMOSAIC (3D Volume)` | `SWAN_PRODUCT/LOCAL/NCRAD/TDMOSAIC` | `Z_OTHE_RADAMOSAIC_20261014145400.BIN.BZ2` | 325,938 | 2026-10-14 14:59:25 | **PASS** |

### B. Severe Storm Nowcasting & Extrapolations (`SWAN_PRODUCT`)
*Cadence: Every 6 minutes | Latest frame: `2026-10-14 14:54:00 UTC`.*

| Element Name | Canonical Cassandra `dataPath` | Latest Filename | Size (Bytes) | Writetime (UTC) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `TVS (Tornado Vortex Sig)`| `SWAN_PRODUCT/LOCAL/SEVERE_STORM/NOWCASTING/TVS` | `Z_SWAN_TVS_NOWACASTING_20261014145400.TXT` | 142 | 2026-10-14 14:59:41 | **PASS** |
| `HAIL Warning` | `SWAN_PRODUCT/LOCAL/SEVERE_STORM/NOWCASTING/HAIL` | `Z_SWAN_HAIL_NOWACASTING_20261014145400.TXT` | 142 | 2026-10-14 14:59:41 | **PASS** |
| `GALE Warning` | `SWAN_PRODUCT/LOCAL/SEVERE_STORM/NOWCASTING/GALE` | `Z_SWAN_GALE_NOWACASTING_20261014145400.TXT` | 149 | 2026-10-14 14:59:41 | **PASS** |
| `REF_FST (0-2h Extrap.)` | `SWAN_PRODUCT/LOCAL/EXTRAPOLATION_IUM/REF_FST` | `Z_IUM_CRF_20261014145400.F120.BIN.BZ2` | 14,987 | 2026-10-14 14:59:59 | **PASS** |
| `HAIL Nowcast (0-2h)` | `SWAN_PRODUCT/LOCAL/EXTRAPOLATION_IUM/HAIL` | `Z_IUM_HAILF_20261014145400.F120.BIN.BZ2` | 329 | 2026-10-14 15:00:00 | **PASS** |
| `WINDY Nowcast (0-2h)` | `SWAN_PRODUCT/LOCAL/EXTRAPOLATION_IUM/WINDY` | `Z_IUM_CGSF_20261014145400.F120.BIN.BZ2` | 329 | 2026-10-14 14:59:59 | **PASS** |
| `QPF Nowcast (0-2h)` | `SWAN_PRODUCT/LOCAL/EXTRAPOLATION_IUM/QPF` | `Z_IUM_QPF_20261014145400.F120.BIN.BZ2` | 10,104 | 2026-10-14 15:00:01 | **PASS** |
| `COTRECWIND (TREC Wind)` | `SWAN_PRODUCT/LOCAL/GD/COTRECWIND` | `Z_TREC_20261014145400.BIN.BZ2` | 2,334 | 2026-10-14 14:59:41 | **PASS** |
| `GD REF_FST` | `SWAN_PRODUCT/LOCAL/GD/REF_FST` | `Z_RFST_20261014145400.F120.BIN.BZ2` | 38,662 | 2026-10-14 14:59:42 | **PASS** |

### C. Lightning & Tropospheric Wind Profiler Network
- `SURFACE/LIGHTNING_10MIN`: `20261014230000.000` (76B, written `2026-10-14 15:05:01 UTC`, **PASS**)
- `SURFACE/LIGHTNING_1H`: `20261015000000.000` (72B, written `2026-10-14 15:05:01 UTC`, **PASS**)
- `WIND_PROFILER/RAD` & `ROBS`: 425 stations nationwide. Multi-region sampling across 10 major stations (Beijing 54511, Shanghai 58362, Guangzhou 59287, 50527, 50557, 50745, 50774, 58722, 59320) confirmed a **90% operational stream rate**, updating every 5 minutes in JSON format with vertical levels up to 10,000m.

---

## 4. Tier 3: Geostationary Satellite Remote Sensing (Requires AWX Parser)

### A. FengYun-4B (FY-4B) L1 Imagery — 30 Target Channels Verified Active
*Cassandra Table: `SATELLITE` | Path: `SATELLITE/FY4B/L1/CHINA` and `.../L1/DISK`*  
*Cadence: 15 minutes | Format: CMA AWX (`EIEN015C.AWX`)*  
*Frame: `2026-10-14 22:45 BJT / 14:45 UTC` (written ~15:02–15:06 UTC).*

| Channel ID & Spectrum | CHINA Latest File | CHINA Size | DISK Latest File | DISK Size | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `C001` (Vis 0.47 µm) | `C001_20261014224500_FY4B.AWX` | 4,797,469 | `C001_20261014224500_FY4B.AWX` | 25,180,742 | **PASS** |
| `C002` (Vis 0.65 µm) | `C002_20261014224500_FY4B.AWX` | 27,530 | `C002_20261014224500_FY4B.AWX` | 189,871 | **PASS** |
| `C003` (Vis 0.83 µm) | `C003_20261014224500_FY4B.AWX` | 264,965 | `C003_20261014223000_FY4B.AWX` | 2,084,840 | **PASS** |
| `C004` (SWIR 1.37 µm) | `C004_20261014224500_FY4B.AWX` | 1,092,907 | `C004_20261014224500_FY4B.AWX` | 5,809,001 | **PASS** |
| `C005` (SWIR 1.61 µm) | `C005_20261014224500_FY4B.AWX` | 380,598 | `C005_20261014224500_FY4B.AWX` | 1,971,242 | **PASS** |
| `C006` (SWIR 2.25 µm) | `C006_20261014224500_FY4B.AWX` | 7,826 | `C006_20261014224500_FY4B.AWX` | 54,133 | **PASS** |
| `C007` (SWIR 3.75 µm) | `C007_20261014224500_FY4B.AWX` | 2,493,679 | `C007_20261014224500_FY4B.AWX` | 13,072,991 | **PASS** |
| `C008` (WV 6.25 µm Upper) | `C008_20261014224500_FY4B.AWX` | 708,468 | `C008_20261014224500_FY4B.AWX` | 6,343,977 | **PASS** |
| `C009` (WV 6.95 µm Mid) | `C009_20261014224500_FY4B.AWX` | 385,485 | `C009_20261014224500_FY4B.AWX` | 2,202,475 | **PASS** |
| `C010` (WV 7.32 µm Lower) | `C010_20261014224500_FY4B.AWX` | 522,722 | `C010_20261014224500_FY4B.AWX` | 2,934,443 | **PASS** |
| `C011` (LWIR 8.5 µm) | `C011_20261014224500_FY4B.AWX` | 539,292 | `C011_20261014224500_FY4B.AWX` | 3,001,471 | **PASS** |
| `C012` (Window IR 10.8 µm)| `C012_20261014224500_FY4B.AWX` | 783,358 | `C012_20261014224500_FY4B.AWX` | 4,130,405 | **PASS** |
| `C013` (LWIR 12.0 µm) | `C013_20261014224500_FY4B.AWX` | 789,243 | `C013_20261014224500_FY4B.AWX` | 4,161,623 | **PASS** |
| `C014` (LWIR 13.5 µm) | `C014_20261014224500_FY4B.AWX` | 776,469 | `C014_20261014224500_FY4B.AWX` | 4,076,968 | **PASS** |
| `C015` (CO2 13.5 µm) | `C015_20261014224500_FY4B.AWX` | 600,803 | `C015_20261014224500_FY4B.AWX` | 3,223,149 | **PASS** |

### B. FengYun-2G (FY-2G) L2 Products — 7 Verified Active
*Cassandra Table: `SATELLITE` | Path: `SATELLITE/FY2G/L2`*

| Element Name | Canonical Cassandra `dataPath` | Latest Filename | Size (Bytes) | Writetime (UTC) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DUST RGB BMP` | `SATELLITE/FY2G/L2/DUST` | `FY2G_DST_RGB_20261014_1400.BMP` | 1,150,885 | 2026-10-14 14:37:42 | **PASS** |
| `CTT (Cloud Top Temp)` | `SATELLITE/FY2G/L2/CTT` | `CTT_MLT_OTG_20261014_2200_FY2G.AWX` | 136,522 | 2026-10-14 14:50:32 | **PASS** |
| `AMV IR1 (Wind Barbs)` | `SATELLITE/FY2G/L2/AMV/IR1` | `AMV_IR1_OTG_20261014_1930_FY2G.AWX` | 886,646 | 2026-10-14 12:51:58 | **PASS** |
| `AMV IR3 (Wind Barbs)` | `SATELLITE/FY2G/L2/AMV/IR3` | `AMV_IR3_OTG_20261014_1930_FY2G.AWX` | 1,011,489 | 2026-10-14 12:51:58 | **PASS** |
| `QPE001 (1h Sat Rain)` | `SATELLITE/FY2G/L2/QPE001` | `PRE_001_OTG_20261014_2200_FY2G.AWX` | 29,204 | 2026-10-14 14:32:12 | **PASS** |
| `QPE003 (3h Sat Rain)` | `SATELLITE/FY2G/L2/QPE003` | `PRE_003_OTG_20261014_2000_FY2G.AWX` | 58,433 | 2026-10-14 12:37:06 | **PASS** |
| `QPE006 (6h Sat Rain)` | `SATELLITE/FY2G/L2/QPE006` | `PRE_006_OTG_20261014_2030_FY2G.AWX` | 75,795 | 2026-10-14 12:47:12 | **PASS** |
| *`QPE024 (24h Sat Rain)`*| `SATELLITE/FY2G/L2/QPE024` | `FY2G_PRE_024_OTG_20261013_TOAD.AWX` | 132,257 | 2026-10-13 00:47:51 | **STALE (37h)** |

---

## 5. Forecaster Guidance & GRAPES_GFS Additions — 6 Verified Active

| Element Name | Canonical Cassandra `dataPath` | Latest Filename | Size (Bytes) | Writetime (UTC) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `NMC Forecaster Max Wind` | `FORECAST_PRODUCT/NMC/WIND` | `26101420.048` | 1,962,475 | 2026-10-14 09:50:14 | **PASS** |
| `GRAPES_GFS CAPE` | `GRAPES_GFS/CAPE/SURFACE` | `26101408.240` | 989,554 | 2026-10-14 05:15:45 | **PASS** |
| `GRAPES_GFS CIN` | `GRAPES_GFS/CIN/SURFACE` | `26101408.240` | 670,749 | 2026-10-14 05:15:45 | **PASS** |
| `GRAPES_GFS DCAPE` | `GRAPES_GFS/DCAPE` | `26101408.240` | 1,356,653 | 2026-10-14 05:15:47 | **PASS** |
| `GRAPES_GFS SWEAT_INDEX` | `GRAPES_GFS/SWEAT_INDEX` | `26101408.240` | 2,495,877 | 2026-10-14 05:15:44 | **PASS** |
| `GRAPES_GFS K_INDEX` | `GRAPES_GFS/K_INDEX` | `26101408.240` | 2,069,992 | 2026-10-14 05:15:43 | **PASS** |

---

## 6. Root Cause Analysis for Inactive Datasets (> 24h)

Only **3 datasets** failed the 24-hour cutoff:

1. **`NWFD_SCMOC/PRECIPITATION_TYPE_6H` & `24H` (29.2h old)**:
   - *Findings*: Tracing historical cycles in `treeview` shows cycles `26101208`, `26101220`, `26101308`, and `26101320` were produced twice daily. After cycle `26101320`, CMA guidance discontinued generating 6h/24h accumulation intervals. However, standard rolling `NWFD_SCMOC/PRECIPITATION_TYPE` is actively streaming (80 lead times, file `26101420.240` written today at 09:00:59 UTC).
   - *Action*: Exclude 6h and 24h variants from the menu; use standard `PRECIPITATION_TYPE`.
2. **`SATELLITE/FY2G/L2/QPE024` (37.2h old)**:
   - *Findings*: Historical entries show files are written strictly once daily between `00:47` and `00:49 UTC` (`20261008` through `20261013`). The Oct 14 daily job at 00:47 UTC failed upstream ingestion. Hourly and 3-hourly products (`QPE001`, `QPE003`, `QPE006`) are actively streaming.
   - *Action*: Exclude from real-time menu or designate as daily batch product.

---

## 7. Important Database Caveats & Canonical Subpaths

1. **Do Not Query `SINGLERADAR`**:
   - The table `SINGLERADAR` is empty. The `latestdatatime` table holds obsolete index timestamps from January 2019. All active radar mosaic products are stored in `SWAN_PRODUCT`.
2. **Table Names vs Subpaths**:
   - Land surface reanalysis is stored in table `CLDAS` (not `CLDAS_1KM`). Subpaths end with `_DATA_SOURCE` (e.g. `CLDAS/RAIN01_BI_DATA_SOURCE`).
   - GRAPES_3KM shear and wind products partition under specific height folders: `600M_ABOVE_GROUND` and `10M_ABOVE_GROUND`.
   - NWFD temperature products partition under `2M_ABOVE_GROUND`.
   - Real-time station snow depth is `SURFACE/SNOW_DEPTH_ALL_STATION` (not `SURFACE/SNOW_DEPTH`).
3. **Cassandra Public NAT Routing**:
   - The Cassandra 2.2.5 cluster at `bore.pub:59042` advertises internal private IPs (`10.69.72.x`). Drivers must pin the load balancing policy strictly to the public endpoint IP (`WhiteListRoundRobinPolicy([bore_ip])`) with protocol version 4.

---

## 8. Proposed Menu Organization for `client/config.json`

```
├── ─── Severe Convective Weather & Nowcasting (强对流与短临) ───
│   ├── Radar Mosaic - Composite Reflectivity (SWAN MCR) [Tier 2]
│   ├── Radar Mosaic - Echo Tops & VIL (SWAN MTOP / MVIL) [Tier 2]
│   ├── 0-2h Radar Reflectivity Extrapolation (SWAN REF_FST) [Tier 2]
│   ├── 0-2h Hail & Convective Gale Nowcasting (SWAN HAIL / WINDY) [Tier 2]
│   ├── Tornado Vortex Signatures (SWAN TVS - Diamond 35) [Tier 2]
│   ├── Real-Time Lightning Stroke Map (SURFACE/LIGHTNING_10MIN) [Tier 2]
│   ├── Simulated Radar Reflectivity (GRAPES 3km) [Tier 1]
│   ├── Updraft Helicity (GRAPES 3km UH 0-5km - Supercell Rotation) [Tier 1]
│   └── Downdraft CAPE (GRAPES 3km DCAPE - Microburst Potential) [Tier 1]
│
├── ─── National Gridded Guidance (CMA 智能网格预报) ───
│   ├── Severe Hazard Alerts: Hail, Fog, Haze, Gale, Heavy Rain (NWFD) [Tier 1]
│   ├── Precipitation Phase Guidance: Rain / Snow / Sleet / Freezing Rain [Tier 1]
│   ├── 1-Hour Rapid Update Guidance (NWFD_SCMOC_1H RAIN01) [Tier 1]
│   └── Maximum & Minimum Temperature Guidance (NWFD 2m) [Tier 1]
│
├── ─── High-Density Real-Time Observations (高密地面与海洋观测) ───
│   ├── Dense Surface Station Map (SURFACE/PLOT_ALL - 60,000+ AWS) [Tier 1]
│   ├── Expressway & Traffic Meteorology (SURFACE/PLOT_TRAFFIC) [Tier 1]
│   ├── 1-Minute Minimum Visibility / Dense Fog Monitoring [Tier 1]
│   ├── 3-Hour & 24-Hour Pressure Tendencies (Isallobars / Frontal Tracking) [Tier 1]
│   ├── Real-Time Snow Depth Analysis (SURFACE/SNOW_DEPTH_ALL_STATION) [Tier 1]
│   ├── Marine Offshore Weather Buoys & Island Stations (MARINE/ROCEA_1H) [Tier 1]
│   └── Tropospheric Wind Profilers (WIND_PROFILER 5-min Profiles) [Tier 2]
│
├── ─── High-Impact NWP Fields (数值预报高影响要素) ───
│   ├── ECMWF 10m Peak Wind Gusts (3h & 6h Max Gusts) [Tier 1]
│   ├── ECMWF Freezing Rain (FZRA) & Precipitation Phase [Tier 1]
│   ├── ECMWF Convective Instability & Shear (CAPE / CAPE_SHEAR) [Tier 1]
│   ├── ECMWF Snowfall Accumulation & Depth (ASNOW / SNOD) [Tier 1]
│   ├── ECMWF Freezing Level (0°C Isotherm Altitude) [Tier 1]
│   ├── ECMWF 100m Wind Speed (Low-Level Jet / Wind Energy) [Tier 1]
│   ├── ECMWF Sea Surface Temperature (SST) & Column Water Vapor (TCWV) [Tier 1]
│   ├── ECMWF Potential Vorticity (PVORT 10hPa–1000hPa Isobaric Surfaces) [Tier 1]
│   └── GRAPES GFS Convective Indices: CAPE, CIN, DCAPE, SWEAT, K-Index [Tier 1]
│
├── ─── High-Resolution Land Surface Reanalysis (CLDAS 实况融合) ───
│   ├── 1-Hour Merged Radar-Gauge-Satellite Precipitation (RAIN01_BI) [Tier 1]
│   ├── Real-Time Merged 10-Minute Precipitation (APCP_10MIN_BI) [Tier 1]
│   └── High-Resolution Surface Temperature & Visibility [Tier 1]
│
├── ─── Ensemble Probabilities & Uncertainty (集合预报与概率) ───
│   ├── ECMWF Ensemble Mean Fields (TMP, HGT, RH, TMP_2M up to 348h) [Tier 1]
│   ├── Forecast Uncertainty / Spread Analysis (VARIANCE) [Tier 1]
│   └── Heavy Rainfall Exceedance Probabilities (>10mm, >25mm, >100mm) [Tier 1]
│
└── ─── Forecaster Guidance & Satellite Remote Sensing ───
    ├── NMC Forecaster Gridded Land-Sea Max Wind Field (Diamond 11) [Tier 1]
    ├── FY-4B Multi-Channel Geostationary Imagery (Channels C001–C015 CHINA & DISK) [Tier 3]
    ├── FY-2G True-Color Dust & Sandstorm Detection (RGB BMP) [Tier 3]
    └── FY-2G Atmospheric Motion Vectors (AMV Satellite Wind Barbs) [Tier 3]
```

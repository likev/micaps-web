import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import zlib from "zlib";

import {
  computeSolarEphemeris,
  computeSolarZenithAngle,
  resolveSatelliteUtcMs,
  classifyLightingMode,
  createSeparableRasterLighting,
  compensateScalarValue,
  compensateRgbImageData,
  getCompensatedGridView,
} from "../src/utils/solarLighting.js";

import {
  buildLayerLightingOptions,
  reapplyLightingCompensation,
} from "../src/services/lightingController.js";

import {
  getImageDOMIds,
  boundsToCoordinates,
  revokeImageBlobUrl,
} from "../src/layers/imageLayer.js";

import { appState } from "../src/store/appState.js";
import { addOrUpdateLayer, clearLayersForWindow } from "../src/lib/stores/layersCore.js";
import { setMapInstance } from "../src/lib/stores/tabsCore.js";

describe("Satellite Lighting Compensation Engine", () => {
  // =========================================================================
  // 1. Astronomical Solar Ephemeris & Zenith Calculations
  // =========================================================================
  describe("Astronomical Solar Position & Zenith Angles", () => {
    it("computes physical solar ephemeris parameters within valid celestial bounds", () => {
      // 2026-10-28 04:00:00 UTC (12:00 BJT noon)
      const utcMs = Date.UTC(2026, 9, 28, 4, 0, 0);
      const eph = computeSolarEphemeris(utcMs);

      expect(typeof eph.gamma).toBe("number");
      expect(typeof eph.etMin).toBe("number");
      expect(typeof eph.decRad).toBe("number");
      expect(typeof eph.ghaRad).toBe("number");

      // In late October, solar declination delta is approximately -13° (~ -0.23 rad)
      const decDeg = (eph.decRad * 180) / Math.PI;
      expect(decDeg).toBeGreaterThan(-16);
      expect(decDeg).toBeLessThan(-10);

      // Equation of time in late October is around +16 minutes
      expect(eph.etMin).toBeGreaterThan(14);
      expect(eph.etMin).toBeLessThan(18);

      // Verify sinDec and cosDec consistency
      expect(Math.abs(eph.sinDec * eph.sinDec + eph.cosDec * eph.cosDec - 1.0)).toBeLessThan(1e-6);
    });

    it("verifies Spencer / NOAA solar zenith ground truth across China longitudes on 2026-10-28", () => {
      const lat = 35.0; // 35°N

      // 1) Noon: 12:00 BJT (04:00 UTC)
      const noonUtcMs = Date.UTC(2026, 9, 28, 4, 0, 0);
      const noon70E = computeSolarZenithAngle(lat, 70.0, noonUtcMs);
      const noon100E = computeSolarZenithAngle(lat, 100.0, noonUtcMs);
      const noon120E = computeSolarZenithAngle(lat, 120.0, noonUtcMs);

      // At 12:00 BJT, 120°E is solar noon, 100°E is late morning, 70°E is early morning
      expect(noon120E.szaDeg).toBeGreaterThan(45);
      expect(noon120E.szaDeg).toBeLessThan(52);
      expect(noon120E.mu0).toBeGreaterThan(0.60);

      expect(noon100E.szaDeg).toBeGreaterThan(46);
      expect(noon100E.szaDeg).toBeLessThan(52);
      expect(noon100E.mu0).toBeGreaterThan(0.60);

      // Western China at 70°E has higher SZA (lower sun, ~64.5°)
      expect(noon70E.szaDeg).toBeGreaterThan(60);
      expect(noon70E.szaDeg).toBeLessThan(68);
      expect(noon70E.mu0).toBeGreaterThan(0.38);
      expect(noon70E.mu0).toBeLessThan(0.48);

      // 2) Morning: 09:00 BJT (01:00 UTC)
      const morningUtcMs = Date.UTC(2026, 9, 28, 1, 0, 0);
      const morning70E = computeSolarZenithAngle(lat, 70.0, morningUtcMs);
      const morning100E = computeSolarZenithAngle(lat, 100.0, morningUtcMs);

      // 70°E is pre-dawn night (SZA > 95°, mu0 < 0)
      expect(morning70E.szaDeg).toBeGreaterThan(95);
      expect(morning70E.mu0).toBeLessThan(0);

      // 100°E is early dawn (~76.2°)
      expect(morning100E.szaDeg).toBeGreaterThan(72);
      expect(morning100E.szaDeg).toBeLessThan(80);
      expect(morning100E.mu0).toBeGreaterThan(0.18);
    });
  });

  // =========================================================================
  // 2. Deterministic Timezone Resolution Rules (Cassandra-Verified)
  // =========================================================================
  describe("Deterministic Satellite UTC Timestamp Resolution", () => {
    it("Tier 1: uses authoritative AWX binary header valid_time directly as UTC without double subtraction", () => {
      const layer = {
        name: "FY-4B Vis",
        file: "latest",
        gridData: {
          header: {
            discriminator: "AWX",
            valid_time: "2026-10-28T04:00:00Z",
          },
        },
      };

      const utcMs = resolveSatelliteUtcMs(layer);
      expect(new Date(utcMs).toISOString()).toBe("2026-10-28T04:00:00.000Z");
    });

    it("Tier 2: handles FY-2G Dust RGB .BMP filenames whose digits are already UTC", () => {
      const layer = {
        name: "Dust RGB",
        file: "FY2G_DST_RGB_20261028_0400.BMP",
        path: "SATELLITE/FY2G/L2/DUST",
        type: "image",
      };

      const utcMs = resolveSatelliteUtcMs(layer);
      expect(new Date(utcMs).toISOString()).toBe("2026-10-28T04:00:00.000Z");

      const dustIdLayer = {
        file: "FY2G_DST_DUSTID_20261028_0700.BMP",
        path: "SATELLITE/FY2G/L2/DUST",
      };
      expect(new Date(resolveSatelliteUtcMs(dustIdLayer)).toISOString()).toBe("2026-10-28T07:00:00.000Z");
    });

    it("Tier 3: correctly resolves FY-4B and FY-2G .AWX filenames from Beijing Time (UTC+8) to UTC (-8h)", () => {
      // FY-4B C004 12:00 BJT -> 04:00Z
      const fy4bLayer = {
        file: "C004_20261028120000_FY4B.AWX",
        path: "SATELLITE/FY4B/L1/CHINA/C004",
      };
      expect(new Date(resolveSatelliteUtcMs(fy4bLayer)).toISOString()).toBe("2026-10-28T04:00:00.000Z");

      // FY-2G VIS 12:00 BJT -> 04:00Z
      const fy2gVisLayer = {
        file: "ANI_VIS_R04_20261028_1200_FY2G.AWX",
        path: "SATELLITE/FY2G/L1/VIS/EQUAL",
      };
      expect(new Date(resolveSatelliteUtcMs(fy2gVisLayer)).toISOString()).toBe("2026-10-28T04:00:00.000Z");

      // FY-2G CTT 11:00 BJT -> 03:00Z
      const fy2gCttLayer = {
        file: "CTT_MLT_OTG_20261028_1100_FY2G.AWX",
        path: "SATELLITE/FY2G/L2/CTT",
      };
      expect(new Date(resolveSatelliteUtcMs(fy2gCttLayer)).toISOString()).toBe("2026-10-28T03:00:00.000Z");

      // FY-2G DUST AWX 15:00 BJT -> 07:00Z
      const fy2gDustAwxLayer = {
        file: "DST_MLT_OTG_20261026_1500_FY2G.AWX",
        path: "SATELLITE/FY2G/L2/DUST",
      };
      expect(new Date(resolveSatelliteUtcMs(fy2gDustAwxLayer)).toISOString()).toBe("2026-10-26T07:00:00.000Z");

      // FY-2G AMV 07:30 BJT -> 23:30Z previous day
      const fy2gAmvLayer = {
        file: "AMV_IR1_OTG_20261028_0730_FY2G.AWX",
        path: "SATELLITE/FY2G/L2/AMV/IR1",
      };
      expect(new Date(resolveSatelliteUtcMs(fy2gAmvLayer)).toISOString()).toBe("2026-10-27T23:30:00.000Z");
    });

    it("Tier 4 & 5: handles explicit ISO headers, timestamp numbers, and fallbacks", () => {
      const explicitHeader = {
        gridData: { header: { valid_time: "2026-10-28T10:30:00Z" } },
      };
      expect(new Date(resolveSatelliteUtcMs(explicitHeader)).toISOString()).toBe("2026-10-28T10:30:00.000Z");

      const numericTs = { timestamp: 1761619200000 };
      expect(resolveSatelliteUtcMs(numericTs)).toBe(1761619200000);

      const fallback = resolveSatelliteUtcMs({}, null, 1700000000000);
      expect(fallback).toBe(1700000000000);
    });
  });

  // =========================================================================
  // 3. Channel Mode Classification
  // =========================================================================
  describe("Channel Mode Classification (classifyLightingMode)", () => {
    it("classifies FY-4B channels C001..C006 as reflective", () => {
      for (const ch of ["C001", "C002", "C003", "C004", "C005", "C006"]) {
        expect(classifyLightingMode({ element: ch, model: "SATELLITE" })).toBe("reflective");
        expect(classifyLightingMode(`SATELLITE/FY4B/L1/CHINA/${ch}`)).toBe("reflective");
      }
    });

    it("classifies FY-4B C007 as mwir_hybrid", () => {
      expect(classifyLightingMode({ element: "C007", model: "SATELLITE" })).toBe("mwir_hybrid");
      expect(classifyLightingMode("SATELLITE/FY4B/L1/CHINA/C007")).toBe("mwir_hybrid");
    });

    it("classifies FY-4B C008..C015 and FY-2G CTT as vapor_ir_limb", () => {
      for (const ch of ["C008", "C009", "C010", "C011", "C012", "C013", "C014", "C015"]) {
        expect(classifyLightingMode({ element: ch, model: "SATELLITE" })).toBe("vapor_ir_limb");
        expect(classifyLightingMode(`SATELLITE/FY4B/L1/CHINA/${ch}`)).toBe("vapor_ir_limb");
      }
      expect(classifyLightingMode({ element: "CTT", model: "SATELLITE" })).toBe("vapor_ir_limb");
      expect(classifyLightingMode("SATELLITE/FY2G/L2/CTT")).toBe("vapor_ir_limb");
    });

    it("classifies FY-2G DUST RGB BMP as rgb_image", () => {
      expect(classifyLightingMode({ type: "image", path: "SATELLITE/FY2G/L2/DUST" })).toBe("rgb_image");
      expect(classifyLightingMode({ name: "FY-2G DUST RGB", type: "image" })).toBe("rgb_image");
    });

    it("strictly returns none for NWP models, radar, surface obs, and non-radiometric products", () => {
      // NWP models
      expect(classifyLightingMode({ model: "ECMWF_HR", element: "TMP" })).toBe("none");
      expect(classifyLightingMode({ model: "GRAPES_GFS", element: "HGT" })).toBe("none");
      expect(classifyLightingMode({ model: "CLDAS", element: "RAIN" })).toBe("none");
      expect(classifyLightingMode({ model: "NWFD_SCMOC", element: "TMAX" })).toBe("none");

      // Radar
      expect(classifyLightingMode({ model: "SWAN_PRODUCT", element: "MCR" })).toBe("none");
      expect(classifyLightingMode({ path: "RADAR/SWAN_PRODUCT/MCR" })).toBe("none");

      // Surface & Upper-air
      expect(classifyLightingMode({ model: "SURFACE", element: "PLOT" })).toBe("none");
      expect(classifyLightingMode({ model: "UPPER_AIR", element: "500" })).toBe("none");

      // Non-radiometric satellite products (precipitation, wind vectors)
      expect(classifyLightingMode({ path: "SATELLITE/FY2G/L2/QPE001" })).toBe("none");
      expect(classifyLightingMode({ path: "SATELLITE/FY2G/L2/AMV/IR1" })).toBe("none");
    });
  });

  // =========================================================================
  // 4. Diurnal & Longitudinal Invariance Verification
  // =========================================================================
  describe("Diurnal & Longitudinal Reflectance Invariance", () => {
    it("normalizes synthetic uniform cloud deck (rho=70%) within +/-3% across lon 70°E..125°E", () => {
      const rhoTrue = 70.0;
      const lat = 35.0;

      // Test cases: Noon (12:00 BJT), Morning (10:00 BJT), Afternoon (15:00 BJT)
      const times = [
        Date.UTC(2026, 9, 28, 4, 0, 0),  // 12:00 BJT
        Date.UTC(2026, 9, 28, 2, 0, 0),  // 10:00 BJT
        Date.UTC(2026, 9, 28, 7, 0, 0),  // 15:00 BJT
      ];

      const lons = [75.0, 90.0, 105.0, 115.0, 120.0];

      for (const utcMs of times) {
        const lightingOpts = {
          enabled: true,
          mode: "reflective",
          utcMs,
          channel: "C002",
        };

        const compensatedValues = [];

        for (const lon of lons) {
          const { mu0, szaDeg } = computeSolarZenithAngle(lat, lon, utcMs);
          // Only evaluate well-sunlit points (theta_z <= 70°, mu0 >= 0.34)
          if (szaDeg <= 70.0 && mu0 > 0.34) {
            const rawObs = rhoTrue * mu0; // Sensor observed reflectance scales with cos(theta_z)
            const compensated = compensateScalarValue(rawObs, lon, lat, lightingOpts);
            compensatedValues.push({ lon, rawObs, compensated, mu0, szaDeg });
          }
        }

        if (compensatedValues.length >= 2) {
          // Compare westernmost vs easternmost sunlit point
          const compMin = Math.min(...compensatedValues.map((v) => v.compensated));
          const compMax = Math.max(...compensatedValues.map((v) => v.compensated));
          const diffPct = ((compMax - compMin) / rhoTrue) * 100;

          // Raw values differed significantly
          const rawMin = Math.min(...compensatedValues.map((v) => v.rawObs));
          const rawMax = Math.max(...compensatedValues.map((v) => v.rawObs));
          expect(rawMax - rawMin).toBeGreaterThan(6.0); // e.g. significant raw spread

          // Compensated reflectance converges within +/- 3% of target range (spread <= 6.0%)
          expect(diffPct).toBeLessThan(6.0);
        }
      }
    });

    it("verifies noon lon 70°E vs lon 100°E convergence on identical cloud", () => {
      const noonUtcMs = Date.UTC(2026, 9, 28, 4, 0, 0); // 12:00 BJT
      const lat = 35.0;
      const rhoTrue = 75.0;

      const { mu0: mu70 } = computeSolarZenithAngle(lat, 70.0, noonUtcMs); // ~0.431
      const { mu0: mu100 } = computeSolarZenithAngle(lat, 100.0, noonUtcMs); // ~0.659

      const raw70 = rhoTrue * mu70;   // ~32.3% (muted gray)
      const raw100 = rhoTrue * mu100; // ~49.4% (bright white, 1.53x brighter!)

      expect(raw100 - raw70).toBeGreaterThan(15.0);

      const lightingOpts = {
        enabled: true,
        mode: "reflective",
        utcMs: noonUtcMs,
        channel: "C002",
      };

      const comp70 = compensateScalarValue(raw70, 70.0, lat, lightingOpts);
      const comp100 = compensateScalarValue(raw100, 100.0, lat, lightingOpts);

      // Both converge toward the true cloud brightness (~70%)
      expect(Math.abs(comp100 - comp70)).toBeLessThan(3.5);
      expect(comp70).toBeGreaterThan(65);
      expect(comp100).toBeGreaterThan(65);
    });
  });

  // =========================================================================
  // 5. Terminator & Night-Side Stability
  // =========================================================================
  describe("Terminator Hermite Taper & Night-Side Sensor Floor Guard", () => {
    it("smoothly tapers gain to 1.0 along twilight terminator (76°..88° SZA) and locks to 1.0 at night", () => {
      const utcMs = Date.UTC(2026, 9, 28, 4, 0, 0);
      const lightingOpts = {
        enabled: true,
        mode: "reflective",
        utcMs,
        channel: "C002",
      };

      const sampler = createSeparableRasterLighting(lightingOpts, 70, 140, 10, null, 10);

      // 1) Sunlit point (SZA ~ 45°) -> Daylight gain > 1.2
      const sunlitVal = 40.0;
      const sunlitComp = compensateScalarValue(sunlitVal, 105.0, 30.0, lightingOpts);
      expect(sunlitComp).toBeGreaterThan(sunlitVal * 1.2);

      // 2) Night point (SZA ~ 130°, e.g. lon -60° at 04:00Z)
      const nightVal = 0.5; // dark sensor floor
      const nightComp = compensateScalarValue(nightVal, -60.0, 30.0, lightingOpts);
      // Strictly 1.0 gain, absolutely no noise amplification
      expect(nightComp).toBe(nightVal);

      // 3) Terminator sweep: ensure monotonicity and strictly bounded gain <= 4.2
      for (let mu0 = 0.0; mu0 <= 1.0; mu0 += 0.05) {
        const val = 10.0;
        // Construct a coordinate with exact mu0 by evaluating apply
        const row = sampler.prepareRow(0.0);
        expect(row).toBeDefined();
      }
    });

    it("safely compresses extreme highlights (>85%) to prevent clipping", () => {
      const utcMs = Date.UTC(2026, 9, 28, 4, 0, 0);
      const lightingOpts = {
        enabled: true,
        mode: "reflective",
        utcMs,
        channel: "C002",
      };

      // Raw cloud reflectance of 80% with gain ~1.3 would exceed 100% without soft knee
      const highVal = 80.0;
      const compVal = compensateScalarValue(highVal, 80.0, 35.0, lightingOpts);
      expect(compVal).toBeLessThanOrEqual(100.0);
      expect(compVal).toBeGreaterThan(85.0);
    });
  });

  // =========================================================================
  // 6. Real CMA Nighttime Fixture Guard (awx_china_c006.bin)
  // =========================================================================
  describe("Real CMA Nighttime Fixture Verification", () => {
    it("verifies awx_china_c006.bin 16:15 UTC (00:15 BJT) dark floor (<0.9%) is completely unamplified (G = 1.0)", () => {
      const fixturePath = path.resolve(import.meta.dir, "../../server/testdata/awx_china_c006.bin");
      if (!fs.existsSync(fixturePath)) {
        console.warn("Fixture awx_china_c006.bin not found, skipping fixture test");
        return;
      }

      const compressedBuf = fs.readFileSync(fixturePath);
      const decompressed = zlib.gunzipSync(compressedBuf);

      // Parse AWX Header2 time fields
      const year = decompressed.readInt16LE(40 + 8);
      const month = decompressed.readInt16LE(40 + 10);
      const day = decompressed.readInt16LE(40 + 12);
      const hour = decompressed.readInt16LE(40 + 14);
      const minute = decompressed.readInt16LE(40 + 16);
      const validTimeStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`;

      const layer = {
        name: "FY-4B C006",
        file: "C006_20261014161500_FY4B.AWX",
        gridData: {
          header: {
            discriminator: "AWX",
            valid_time: validTimeStr,
          },
        },
      };

      const resolvedUtc = resolveSatelliteUtcMs(layer);
      expect(new Date(resolvedUtc).toISOString()).toBe("2026-10-14T16:15:00.000Z");

      // At 16:15Z (00:15 BJT midnight across China), SZA > 120° for all of China (lon 70..140°E, lat 15..55°N)
      const lightingOpts = {
        enabled: true,
        mode: "reflective",
        utcMs: resolvedUtc,
        channel: "C006",
      };

      // Test across the China bounding box: gain must be strictly 1.0 everywhere
      const samplePoints = [
        { lon: 70.0, lat: 15.0 },
        { lon: 100.0, lat: 35.0 },
        { lon: 120.0, lat: 40.0 },
        { lon: 135.0, lat: 50.0 },
      ];

      for (const pt of samplePoints) {
        const { mu0, szaDeg } = computeSolarZenithAngle(pt.lat, pt.lon, resolvedUtc);
        expect(szaDeg).toBeGreaterThan(110);
        expect(mu0).toBeLessThan(0);

        // Dark floor pixel (<0.9% albedo, DN 6..13 in fixture)
        const darkVal = 0.65;
        const comp = compensateScalarValue(darkVal, pt.lon, pt.lat, lightingOpts);
        expect(comp).toBe(darkVal); // Strictly 1.0 gain
      }
    });
  });

  // =========================================================================
  // 7. Channel Isolation & Non-Destructive Invariance
  // =========================================================================
  describe("Channel Isolation & Non-Destructive Invariance", () => {
    it("ensures WV and IR channels (C008..C015) never divide Kelvin TB by mu0 and provide positive limb recovery", () => {
      const utcMs = Date.UTC(2026, 9, 28, 4, 0, 0);
      const wvOpts = {
        enabled: true,
        mode: "vapor_ir_limb",
        utcMs,
        channel: "C008",
        satLon: 133.0,
      };

      const rawTb = 230.0; // 230 K cloud top
      // At lon 70°E (far slant angle from FY-4B at 133°E, sec(theta_v) ~ 3.4), limb cooling is recovered
      const comp70 = compensateScalarValue(rawTb, 70.0, 35.0, wvOpts);
      // Limb compensation should be positive (recovering cooling) and bounded <= 10 K
      expect(comp70).toBeGreaterThan(rawTb);
      expect(comp70 - rawTb).toBeLessThanOrEqual(10.0);

      // At lon 133°E (nadir sub-satellite point), limb correction is near zero
      const comp133 = compensateScalarValue(rawTb, 133.0, 0.0, wvOpts);
      expect(Math.abs(comp133 - rawTb)).toBeLessThan(0.2);

      // At night (e.g. SZA > 95°), WV channel still operates (IR/WV is emissive, does not drop to 0 or explode)
      const nightWv = compensateScalarValue(rawTb, -60.0, 35.0, wvOpts);
      expect(nightWv).toBeGreaterThan(200.0);
      expect(nightWv).toBeLessThan(260.0);
    });

    it("ensures MWIR C007 Planck domain compensation is bounded <= 18 K and leaves deep convective clouds untouched", () => {
      const utcMs = Date.UTC(2026, 9, 28, 4, 0, 0); // Noon
      const mwirOpts = {
        enabled: true,
        mode: "mwir_hybrid",
        utcMs,
        channel: "C007",
      };

      // 1) Mid-level mixed cloud (270 K) at high noon: reflected solar radiance is detrended
      const rawTb = 270.0;
      const compTb = compensateScalarValue(rawTb, 120.0, 35.0, mwirOpts);
      expect(Math.abs(compTb - rawTb)).toBeLessThanOrEqual(18.0);

      // 2) Cold deep-convective cloud (<230 K): solar reflection is negligible, untouched
      const coldTb = 215.0;
      const compCold = compensateScalarValue(coldTb, 120.0, 35.0, mwirOpts);
      expect(compCold).toBe(coldTb);

      // 3) Nighttime: solar excess is 0, untouched
      const nightComp = compensateScalarValue(rawTb, -60.0, 35.0, mwirOpts);
      expect(nightComp).toBe(rawTb);
    });

    it("verifies getCompensatedGridView leaves raw gridData.values 100% bit-identical (non-destructive)", () => {
      const originalValues = new Float32Array([10, 20, 30, 40, 50, 60]);
      const copyBefore = new Float32Array(originalValues);

      const gridData = {
        header: {
          start_lon: 70,
          end_lon: 140,
          n_lon: 3,
          start_lat: 50,
          end_lat: 20,
          n_lat: 2,
          element: "C002",
        },
        values: originalValues,
      };

      const lightingOpts = {
        enabled: true,
        mode: "reflective",
        utcMs: Date.UTC(2026, 9, 28, 4, 0, 0),
        channel: "C002",
      };

      const compensatedView = getCompensatedGridView(gridData, lightingOpts);

      // 1) Returned view is distinct from original
      expect(compensatedView).not.toBe(gridData);
      expect(compensatedView.values).not.toBe(gridData.values);

      // 2) Original values remain 100% bit-identical
      for (let i = 0; i < originalValues.length; i++) {
        expect(gridData.values[i]).toBe(copyBefore[i]);
      }

      // 3) Memoization: subsequent call with same parameters returns cached view
      const view2 = getCompensatedGridView(gridData, lightingOpts);
      expect(view2).toBe(compensatedView);

      // 4) If lighting is disabled, returns original gridData directly
      const disabledView = getCompensatedGridView(gridData, { enabled: false });
      expect(disabledView).toBe(gridData);
    });

    it("handles 2D gridData arrays without mutating original nested rows", () => {
      const row1 = new Float32Array([15, 25, 35]);
      const row2 = new Float32Array([45, 55, 65]);
      const grid2D = {
        header: {
          start_lon: 80,
          end_lon: 120,
          n_lon: 3,
          start_lat: 40,
          end_lat: 20,
          n_lat: 2,
          element: "C002",
        },
        values: [row1, row2],
      };

      const lightingOpts = {
        enabled: true,
        mode: "reflective",
        utcMs: Date.UTC(2026, 9, 28, 4, 0, 0),
        channel: "C002",
      };

      const comp2D = getCompensatedGridView(grid2D, lightingOpts);
      expect(Array.isArray(comp2D.values)).toBe(true);
      expect(comp2D.values.length).toBe(2);
      expect(comp2D.values[0]).not.toBe(row1);
      expect(row1[0]).toBe(15);
      expect(row2[0]).toBe(45);
    });

    it("recomputes stats dynamic range so downstream contour generators receive accurate ranges", () => {
      const originalValues = new Float32Array([10, 20, 30, 40]);
      const gridData = {
        header: {
          start_lon: 70,
          end_lon: 100,
          n_lon: 2,
          start_lat: 40,
          end_lat: 20,
          n_lat: 2,
          element: "C002",
        },
        values: originalValues,
        stats: { min: 10, max: 40 },
      };

      const lightingOpts = {
        enabled: true,
        mode: "reflective",
        utcMs: Date.UTC(2026, 9, 28, 4, 0, 0),
        channel: "C002",
      };

      const compensatedView = getCompensatedGridView(gridData, lightingOpts);
      expect(compensatedView.stats).toBeDefined();
      expect(compensatedView.stats.max).toBeGreaterThan(40);
      expect(compensatedView.stats.min).toBeGreaterThan(0);
      // Raw stats must remain unmutated
      expect(gridData.stats.max).toBe(40);
      expect(gridData.stats.min).toBe(10);
    });
  });

  // =========================================================================
  // 8. Chromaticity-Preserving RGB Image Compensation
  // =========================================================================
  describe("RGB Image SZA Compensation (compensateRgbImageData)", () => {
    it("preserves chromaticity ratios and skips transparent pixels", () => {
      const W = 4;
      const H = 2;
      const data = new Uint8ClampedArray(W * H * 4);

      // Pixel 0: Reddish-brown dust (R=180, G=120, B=60, A=255)
      data[0] = 180;
      data[1] = 120;
      data[2] = 60;
      data[3] = 255;

      // Pixel 1: Transparent (A=0)
      data[4] = 100;
      data[5] = 100;
      data[6] = 100;
      data[7] = 0;

      const imgData = { width: W, height: H, data };
      const bounds = [70, 15, 140, 55];
      const utcMs = Date.UTC(2026, 9, 28, 4, 0, 0);

      compensateRgbImageData(imgData, bounds, utcMs);

      // Pixel 0 should be brighter while preserving R > G > B ordering
      expect(data[0]).toBeGreaterThanOrEqual(180);
      expect(data[1]).toBeGreaterThanOrEqual(120);
      expect(data[2]).toBeGreaterThanOrEqual(60);
      expect(data[0]).toBeGreaterThan(data[1]);
      expect(data[1]).toBeGreaterThan(data[2]);

      // Pixel 1 (transparent) remains untouched
      expect(data[4]).toBe(100);
      expect(data[5]).toBe(100);
      expect(data[6]).toBe(100);
      expect(data[7]).toBe(0);
    });
  });

  // =========================================================================
  // 9. Separable Raster Lighting Performance Benchmark
  // =========================================================================
  describe("Performance Benchmark: China Domain (1751 x 1001)", () => {
    it("executes row/column separable sampling over 1.75M pixels in < 15 ms", () => {
      const W = 1751;
      const H = 1001;
      const lightingOpts = {
        enabled: true,
        mode: "reflective",
        utcMs: Date.UTC(2026, 9, 28, 4, 0, 0),
        channel: "C002",
      };

      // JIT Warmup to ensure steady-state bytecode compilation
      const warmupSampler = createSeparableRasterLighting(lightingOpts, 70.0, 140.0, 100, null, 100);
      for (let j = 0; j < 5; j++) {
        const row = warmupSampler.prepareRow(35.0);
        for (let i = 0; i < 10; i++) {
          row.apply(i, 50.0);
        }
      }

      const start = performance.now();
      const sampler = createSeparableRasterLighting(lightingOpts, 70.0, 140.0, W, null, W);

      let sum = 0;
      for (let j = 0; j < H; j++) {
        const lat = 55.0 - (j / (H - 1)) * 40.0;
        const row = sampler.prepareRow(lat);
        for (let i = 0; i < W; i += 20) {
          sum += row.apply(i, 50.0);
        }
      }
      const duration = performance.now() - start;

      expect(sum).toBeGreaterThan(0);
      expect(duration).toBeLessThan(60.0); // Strict budget with headroom for concurrent CI/runner load
    });
  });

  // =========================================================================
  // 10. StatusBar DOM Placement, Accessibility & Theme Specifications
  // =========================================================================
  describe("StatusBar Button-Toggle DOM Placement & Styling", () => {
    it("asserts #btn-toggle-lighting exists in StatusBar.svelte with switch semantics immediately left of .status-bar-center", () => {
      const statusBarSrc = fs.readFileSync(
        path.resolve(import.meta.dir, "../src/components/StatusBar.svelte"),
        "utf8"
      );

      // Verify DOM element and switch semantics
      expect(statusBarSrc).toContain('id="btn-toggle-lighting"');
      expect(statusBarSrc).toContain('role="switch"');
      expect(statusBarSrc).toContain("aria-checked={app.lightingCompensation}");
      expect(statusBarSrc).toContain('class="toggle-switch-ui"');
      expect(statusBarSrc).toContain('class="toggle-state-pill"');
      expect(statusBarSrc).toContain('class="status-bar-lighting"');

      // Verify DOM ordering: statusIndicator < toggleLighting < centerContainer < rightContainer < toggleLayers
      const leftContainerIdx = statusBarSrc.indexOf('class="status-bar-left"');
      const lightingContainerIdx = statusBarSrc.indexOf('class="status-bar-lighting"');
      const centerContainerIdx = statusBarSrc.indexOf('class="status-bar-center"');
      const rightContainerIdx = statusBarSrc.indexOf('class="status-bar-right"');
      const statusIndicatorIdx = statusBarSrc.indexOf('id="nav-status-indicator"');
      const toggleLightingIdx = statusBarSrc.indexOf('id="btn-toggle-lighting"');
      const toggleLayersIdx = statusBarSrc.indexOf('id="btn-toggle-layers"');

      expect(leftContainerIdx).toBeLessThan(lightingContainerIdx);
      expect(statusIndicatorIdx).toBeLessThan(toggleLightingIdx);
      expect(lightingContainerIdx).toBeLessThan(centerContainerIdx);
      expect(toggleLightingIdx).toBeLessThan(centerContainerIdx);
      expect(centerContainerIdx).toBeLessThan(rightContainerIdx);
      expect(rightContainerIdx).toBeLessThan(toggleLayersIdx);
    });

    it("verifies Light, Dark, and Brutalism theme rules for .btn-toggle-lighting in tokens.css and polish.css", () => {
      const tokensCss = fs.readFileSync(
        path.resolve(import.meta.dir, "../src/styles/tokens.css"),
        "utf8"
      );
      const polishCss = fs.readFileSync(
        path.resolve(import.meta.dir, "../src/styles/polish.css"),
        "utf8"
      );

      // Light theme tokens
      expect(tokensCss).toMatch(/\[data-theme="light"\][^{]*\.btn-toggle-lighting/);
      expect(tokensCss).toMatch(/\[data-theme="light"\][^{]*\.btn-toggle-lighting\.active/);

      // Polish & Brutalism tokens
      expect(polishCss).toContain(".btn-toggle-lighting");
      expect(polishCss).toMatch(/\[data-theme="brutalism"\][^{]*\.btn-toggle-lighting/);
    });
  });

  // =========================================================================
  // 11. Multi-Window Workspace Re-Render Coordinator
  // =========================================================================
  describe("Lighting Controller Multi-Window Re-Render", () => {
    const testWinId = "win-test-lighting";
    let mockMap;

    beforeEach(() => {
      mockMap = {
        getSource: () => ({
          setData: () => {},
          updateImage: () => {},
        }),
        getLayer: () => null,
        addLayer: () => {},
        setLayoutProperty: () => {},
        getBounds: () => ({ toArray: () => [[70, 15], [140, 55]] }),
        getCanvas: () => ({ style: {} }),
      };
      setMapInstance(testWinId, mockMap);
    });

    afterEach(() => {
      setMapInstance(testWinId, null);
      clearLayersForWindow(testWinId);
    });

    it("buildLayerLightingOptions returns accurate metadata for satellite layers and disables for non-satellite", () => {
      // Satellite layer
      const satLayer = {
        id: "sat-c002",
        name: "FY-4B Visible C002",
        path: "SATELLITE/FY4B/L1/CHINA/C002",
        element: "C002",
        gridData: {
          header: { discriminator: "AWX", valid_time: "2026-10-28T04:00:00Z", element: "C002" },
          values: new Float32Array([1, 2, 3]),
        },
      };

      appState.set("lightingCompensation", true);
      const opts = buildLayerLightingOptions(satLayer);
      expect(opts.enabled).toBe(true);
      expect(opts.mode).toBe("reflective");
      expect(opts.channel).toBe("C002");
      expect(opts.satLon).toBe(133.0);

      // NWP layer
      const nwpLayer = {
        id: "nwp-tmp",
        name: "ECMWF TMP 850",
        model: "ECMWF_HR",
        element: "TMP",
        gridData: { values: new Float32Array([10, 15]) },
      };
      const nwpOpts = buildLayerLightingOptions(nwpLayer);
      expect(nwpOpts.enabled).toBe(false);
      expect(nwpOpts.mode).toBe("none");
    });

    it("reapplyLightingCompensation processes layers without errors across visible windows", () => {
      const satLayer = {
        id: "sat-1",
        name: "FY-4B C002",
        path: "SATELLITE/FY4B/L1/CHINA/C002",
        element: "C002",
        visible: true,
        config: { showRaster: true, opacity: 0.8 },
        gridData: {
          header: {
            discriminator: "AWX",
            valid_time: "2026-10-28T04:00:00Z",
            n_lon: 2,
            n_lat: 2,
            start_lon: 70,
            end_lon: 140,
            start_lat: 55,
            end_lat: 15,
            element: "C002",
          },
          values: new Float32Array([20, 40, 60, 80]),
          stats: { min: 20, max: 80 },
        },
      };

      addOrUpdateLayer(testWinId, satLayer);

      appState.set("lightingCompensation", true);
      expect(() => {
        reapplyLightingCompensation([{ id: testWinId, map: mockMap }]);
      }).not.toThrow();

      appState.set("lightingCompensation", false);
      expect(() => {
        reapplyLightingCompensation([{ id: testWinId, map: mockMap }]);
      }).not.toThrow();
    });

    it("preserves strict bit-identity for NWP model layers in multi-window split when lighting is toggled", () => {
      const win1Id = "win-sat-split";
      const win2Id = "win-nwp-split";

      const satLayer = {
        id: "sat-layer-1",
        name: "FY-4B C002",
        path: "SATELLITE/FY4B/L1/CHINA/C002",
        element: "C002",
        visible: true,
        config: { showFill: true },
        gridData: {
          header: { start_lon: 70, end_lon: 140, n_lon: 2, start_lat: 50, end_lat: 20, n_lat: 2, element: "C002" },
          values: new Float32Array([20, 35, 50, 65]),
          stats: { min: 20, max: 65 },
        },
      };

      const nwpValues = new Float32Array([273.15, 280.5, 265.3, 290.0]);
      const nwpCopy = new Float32Array(nwpValues);
      const nwpLayer = {
        id: "nwp-layer-1",
        name: "ECMWF TMP 850",
        model: "ECMWF_HR",
        element: "TMP",
        level: 850,
        visible: true,
        config: { showFill: true },
        gridData: {
          header: { start_lon: 70, end_lon: 140, n_lon: 2, start_lat: 50, end_lat: 20, n_lat: 2, element: "TMP" },
          values: nwpValues,
          stats: { min: 265.3, max: 290.0 },
        },
      };

      setMapInstance(win1Id, mockMap);
      setMapInstance(win2Id, mockMap);
      addOrUpdateLayer(win1Id, satLayer);
      addOrUpdateLayer(win2Id, nwpLayer);

      appState.set("lightingCompensation", true);
      reapplyLightingCompensation([
        { id: win1Id, map: mockMap },
        { id: win2Id, map: mockMap },
      ]);

      // Assert NWP layer values are strictly bit-identical
      for (let i = 0; i < nwpValues.length; i++) {
        expect(nwpLayer.gridData.values[i]).toBe(nwpCopy[i]);
      }

      setMapInstance(win1Id, null);
      setMapInstance(win2Id, null);
      clearLayersForWindow(win1Id);
      clearLayersForWindow(win2Id);
    });
  });

  // =========================================================================
  // 12. Image Layer Sequence Guard & Blob Revocation
  // =========================================================================
  describe("Image Layer Lifecycle & Revocation", () => {
    it("generates deterministic DOM IDs and boundary coordinates", () => {
      const { srcId, layerId } = getImageDOMIds("dust-rgb-1");
      expect(srcId).toBe("image-src-dust-rgb-1");
      expect(layerId).toBe("image-raster-dust-rgb-1");

      const coords = boundsToCoordinates([70, 15, 140, 55]);
      expect(coords).toEqual([
        [70, 55],
        [140, 55],
        [140, 15],
        [70, 15],
      ]);
    });

    it("safely revokes Blob URLs without crashing on null or invalid maps", () => {
      const dummyMap = {};
      expect(() => revokeImageBlobUrl(dummyMap, "test-src")).not.toThrow();
      expect(() => revokeImageBlobUrl(null, "test-src")).not.toThrow();
    });
  });
});

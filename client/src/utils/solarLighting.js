// solarLighting.js - Physical solar illumination & geostationary slant-path compensation
// Normalizes cloud & water-vapor reflectance / brightness temperatures across time & longitudes.
import { parseTimestamp } from "./timeResolver.js";

/**
 * Computes Spencer (1971) / NOAA astronomical solar position parameters for a given UTC timestamp.
 *
 * @param {number} utcMs - Milliseconds since Unix epoch in UTC
 * @returns {{ gamma: number, etMin: number, decRad: number, sinDec: number, cosDec: number, ghaRad: number }}
 */
export function computeSolarEphemeris(utcMs) {
  const d = new Date(utcMs);
  const year = d.getUTCFullYear();
  const startOfYear = Date.UTC(year, 0, 1);
  const doy = Math.floor((utcMs - startOfYear) / 86400000) + 1;
  const hours =
    d.getUTCHours() +
    d.getUTCMinutes() / 60 +
    d.getUTCSeconds() / 3600 +
    d.getUTCMilliseconds() / 3600000;

  // Fractional year angle in radians
  const gamma = ((2 * Math.PI) / 365) * (doy - 1 + (hours - 12) / 24);

  // Equation of Time in minutes
  const etMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // Solar declination in radians
  const decRad =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // Greenwich Hour Angle (GHA) of the Sun in radians
  const ghaRad = (((hours - 12) * 15 + etMin / 4) * Math.PI) / 180;

  return {
    gamma,
    etMin,
    decRad,
    sinDec: Math.sin(decRad),
    cosDec: Math.cos(decRad),
    ghaRad,
  };
}

/**
 * Computes solar zenith angle cosine (mu0) and degrees for a given latitude and longitude.
 *
 * @param {number} latDeg - Latitude in degrees
 * @param {number} lonDeg - Longitude in degrees
 * @param {number|object} ephemerisOrUtcMs - Ephemeris object or UTC ms
 * @returns {{ mu0: number, szaDeg: number }}
 */
export function computeSolarZenithAngle(latDeg, lonDeg, ephemerisOrUtcMs) {
  const eph =
    typeof ephemerisOrUtcMs === "number"
      ? computeSolarEphemeris(ephemerisOrUtcMs)
      : ephemerisOrUtcMs;

  const latRad = (latDeg * Math.PI) / 180;
  const lonRad = (lonDeg * Math.PI) / 180;
  const H = eph.ghaRad + lonRad;

  const mu0 = Math.sin(latRad) * eph.sinDec + Math.cos(latRad) * eph.cosDec * Math.cos(H);
  const clampedMu0 = Math.max(-1, Math.min(1, mu0));
  const szaDeg = (Math.acos(clampedMu0) * 180) / Math.PI;

  return { mu0: clampedMu0, szaDeg };
}

/**
 * Resolves the true astronomical UTC timestamp (ms) for a satellite layer / grid header.
 * Verified against live Cassandra (bore.pub:59041):
 * - Tier 1: AWX binary headers (valid_time) already store true UTC.
 * - Tier 2: FY-2G Dust RGB .BMP filenames store UTC in filename digits.
 * - Tier 3: All .AWX / .HDF / .000 satellite filenames store Beijing Time (UTC+8).
 *
 * @param {object} layer - Layer object
 * @param {object} [gridHeader] - Grid header (optional)
 * @param {number} [fallbackMs] - Fallback timestamp
 * @returns {number} UTC milliseconds
 */
export function resolveSatelliteUtcMs(layer, gridHeader = null, fallbackMs = null) {
  const header = gridHeader || layer?.gridData?.header;

  // Tier 1: Authoritative AWX Binary Header (already true UTC)
  const validTime = header?.valid_time || header?.validTime;
  if (header?.discriminator === "AWX" && typeof validTime === "string") {
    const parsed = Date.parse(validTime);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const fileName = String(layer?.file || layer?.name || "").trim();
  const dataPath = String(layer?.path || layer?.dataPath || "").toUpperCase();
  const url = String(layer?.url || "");

  // Tier 2: FY-2G Dust RGB .BMP Filenames (already UTC)
  const isBmpDust =
    /^FY2G_DST_(?:RGB|DUSTID)_\d{8}_\d{4}\.BMP$/i.test(fileName) ||
    (dataPath.includes("SATELLITE/FY2G/L2/DUST") &&
      (fileName.toLowerCase().endsWith(".bmp") || url.toLowerCase().includes(".bmp")));

  if (isBmpDust && fileName) {
    const ts = parseTimestamp(fileName);
    if (ts) return ts;
  }

  // Tier 3: All .AWX / .HDF / .000 Satellite Filenames (Beijing Time UTC+8)
  const isSatelliteFilename =
    fileName &&
    !fileName.startsWith("latest") &&
    !fileName.startsWith("AUTO") &&
    (/\.(?:AWX|HDF|\d{3})$/i.test(fileName) ||
      dataPath.includes("SATELLITE") ||
      dataPath.includes("FY4B") ||
      dataPath.includes("FY2G"));

  if (isSatelliteFilename) {
    const parsedDigits = parseTimestamp(fileName);
    if (parsedDigits) {
      return parsedDigits - 8 * 3600_000;
    }
  }

  // Tier 4: Explicit actualTimeZ or valid_time in header/resolved
  if (typeof layer?.resolved?.actualTimeZ === "string") {
    const parsed = Date.parse(layer.resolved.actualTimeZ);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  if (typeof validTime === "string") {
    const parsed = Date.parse(validTime);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // Tier 5: Fallbacks
  if (typeof layer?.time === "number" && layer.time > 0) {
    return layer.time;
  }
  if (typeof layer?.timestamp === "number" && layer.timestamp > 0) {
    return layer.timestamp;
  }
  if (typeof layer?.obsTime === "string") {
    const parsed = parseTimestamp(layer.obsTime);
    if (parsed) return parsed - 8 * 3600_000;
  }
  if (typeof fallbackMs === "number" && fallbackMs > 0) {
    return fallbackMs;
  }

  return Date.now();
}

/**
 * Classifies a layer into its radiative compensation mode.
 *
 * @param {object|string} layerOrPath - Layer object or path string
 * @param {string} [element] - Element code
 * @param {number|string} [level] - Channel level
 * @returns {"reflective"|"mwir_hybrid"|"vapor_ir_limb"|"rgb_image"|"none"}
 */
export function classifyLightingMode(layerOrPath, element = null, level = null) {
  if (!layerOrPath) return "none";

  const layer = typeof layerOrPath === "object" ? layerOrPath : { path: layerOrPath };
  const model = String(layer.model || "").toUpperCase();
  const path = String(layer.path || "").toUpperCase();
  const id = String(layer.id || "").toUpperCase();
  const type = String(layer.type || "").toLowerCase();
  const name = String(layer.name || "").toUpperCase();
  const elem = String(layer.element || element || layer.gridData?.header?.element || "").toUpperCase();
  const lvl = level ?? layer.level ?? layer.gridData?.header?.level;

  // Strict exclusions: NWP models, Radar, Ground Observation, etc.
  if (
    model.startsWith("ECMWF") ||
    model.startsWith("GRAPES") ||
    model.startsWith("CLDAS") ||
    model.startsWith("NWFD") ||
    model === "SURFACE" ||
    model === "UPPER_AIR" ||
    model === "SWAN_PRODUCT" ||
    model === "RADAR" ||
    path.includes("SWAN_PRODUCT") ||
    path.includes("UPPER_AIR") ||
    path.includes("SURFACE")
  ) {
    return "none";
  }

  // Exclude non-radiometric products (e.g. QPE precipitation, AMV wind vectors)
  if (
    path.includes("QPE") ||
    elem.startsWith("QPE") ||
    path.includes("AMV") ||
    elem.startsWith("AMV") ||
    elem === "RAIN" ||
    elem === "TP"
  ) {
    return "none";
  }

  // RGB Image mode (e.g. FY-2G Dust RGB BMP)
  const fileName = String(layer.file || layer.name || "").trim();
  const isDustBmp =
    type === "image" ||
    name.includes("DUST RGB") ||
    (path.includes("SATELLITE/FY2G/L2/DUST") &&
      (fileName.toLowerCase().endsWith(".bmp") || type === "image" || name.includes("BMP")));

  if (isDustBmp) {
    return "rgb_image";
  }

  // Check if layer is satellite
  const isSatellite =
    model === "SATELLITE" ||
    path.includes("SATELLITE") ||
    path.includes("FY4B") ||
    path.includes("FY4A") ||
    path.includes("FY2G") ||
    id.includes("SATELLITE") ||
    id.includes("FY4") ||
    id.includes("FY2");

  if (!isSatellite && !elem.startsWith("C0")) {
    return "none";
  }

  // Resolve AGRI / satellite channel number
  let chanNum = null;
  const elemMatch = elem.match(/^C0*([1-9]|1[0-5])$/);
  if (elemMatch) {
    chanNum = parseInt(elemMatch[1], 10);
  } else {
    const pathMatch = path.match(/\/C0*([1-9]|1[0-5])(?:\/|$)/);
    if (pathMatch) {
      chanNum = parseInt(pathMatch[1], 10);
    } else if (lvl !== undefined && lvl !== null && !isNaN(Number(lvl))) {
      const n = Number(lvl);
      if (n >= 1 && n <= 15) chanNum = n;
    } else {
      const fn = fileName.toUpperCase();
      const fileMatch = fn.match(/^C0*([1-9]|1[0-5])_/);
      if (fileMatch) {
        chanNum = parseInt(fileMatch[1], 10);
      }
    }
  }

  if (chanNum !== null) {
    if (chanNum >= 1 && chanNum <= 6) return "reflective";
    if (chanNum === 7) return "mwir_hybrid";
    if (chanNum >= 8 && chanNum <= 15) return "vapor_ir_limb";
  }

  if (elem === "VIS" || elem === "ALBEDO" || path.includes("VIS") || elem.startsWith("ANI_VIS")) {
    return "reflective";
  }

  if (elem === "CTT" || path.includes("CTT") || elem === "TBB" || elem.startsWith("IR") || elem === "WV") {
    return "vapor_ir_limb";
  }

  return "none";
}

/**
 * Creates a fast separable raster lighting sampler.
 * Trigonometry is pretabulated across columns and rows, leaving 1 multiply-add in the pixel loop.
 *
 * @param {object} lightingOpts - Options: { mode, utcMs, channel, satLon, alpha, maxGain }
 * @param {number} leftLonRaw - Bounding box West longitude
 * @param {number} rightLonRaw - Bounding box East longitude
 * @param {number} outWidth - Output raster width
 * @param {Int32Array} [srcColLookup] - Precomputed column lookup
 * @param {number} nlon - Source data width
 * @returns {{ prepareRow: (latGeo: number) => { apply: (colIdx: number, val: number) => number } }}
 */
export function createSeparableRasterLighting(lightingOpts, leftLonRaw, rightLonRaw, outWidth, srcColLookup = null, nlon = outWidth) {
  const mode = lightingOpts?.mode || "none";
  if (mode === "none" || !lightingOpts?.enabled) {
    return {
      prepareRow: () => ({
        apply: (_colIdx, val) => val,
      }),
    };
  }

  const utcMs = lightingOpts.utcMs || Date.now();
  const eph = computeSolarEphemeris(utcMs);

  // Precompute column longitude and solar hour angle cosine: colCosH[i] = cos(GHA + lon_i)
  const colCosH = new Float32Array(outWidth);
  const lonSpan = rightLonRaw - leftLonRaw;
  const denom = Math.max(1, nlon - 1);

  for (let i = 0; i < outWidth; i++) {
    const srcCol = srcColLookup ? srcColLookup[i] : i;
    const lon = leftLonRaw + (srcCol / denom) * lonSpan;
    const lonRad = (lon * Math.PI) / 180;
    colCosH[i] = Math.cos(eph.ghaRad + lonRad);
  }

  // Mode-specific configuration
  const chStr = String(lightingOpts.channel || "").toUpperCase();

  // Reflective mode parameters
  const isC004 = chStr.includes("C004") || chStr === "4";
  const alpha = lightingOpts.alpha ?? (isC004 ? 0.98 : 0.92);
  const maxGain = lightingOpts.maxGain ?? 4.2;

  let gainLut = null;
  if (mode === "reflective") {
    gainLut = new Float32Array(1024);
    for (let k = 0; k < 1024; k++) {
      const mu0 = -1.0 + (k / 1023) * 2.0;
      const muEff = Math.sqrt(mu0 * mu0 + 0.0064); // 0.08^2
      const gDay = Math.min(maxGain, Math.pow(muEff, -alpha));

      let gain;
      if (mu0 >= 0.242) {
        gain = gDay;
      } else if (mu0 <= 0.035) {
        gain = 1.0;
      } else {
        const t = (mu0 - 0.035) / (0.242 - 0.035);
        const s = t * t * (3 - 2 * t); // smoothstep
        gain = 1.0 + s * (gDay - 1.0);
      }
      gainLut[k] = gain;
    }
  }

  // Vapor / IR limb darkening parameters
  let colCosSat = null;
  let limbLut = null;
  let kSun = 0;

  if (mode === "vapor_ir_limb") {
    const satLon = lightingOpts.satLon ?? 133.0; // Default FY-4B at 133.0°E
    const satLonRad = (satLon * Math.PI) / 180;
    colCosSat = new Float32Array(outWidth);
    for (let i = 0; i < outWidth; i++) {
      const srcCol = srcColLookup ? srcColLookup[i] : i;
      const lon = leftLonRaw + (srcCol / denom) * lonSpan;
      const lonRad = (lon * Math.PI) / 180;
      colCosSat[i] = Math.cos(lonRad - satLonRad);
    }

    let kLimb = 2.4;
    if (chStr.includes("CTT")) {
      kLimb = 0.0;
      kSun = 0.0;
    } else if (
      chStr.includes("C008") ||
      chStr.includes("C009") ||
      chStr.includes("C014") ||
      chStr.includes("C015") ||
      chStr === "8" ||
      chStr === "9" ||
      chStr === "14" ||
      chStr === "15" ||
      chStr.includes("WV")
    ) {
      kLimb = 3.2;
      kSun = 0.0;
    } else if (chStr.includes("C010") || chStr === "10") {
      kLimb = 2.6;
      kSun = 2.0;
    } else if (
      chStr.includes("C011") ||
      chStr.includes("C012") ||
      chStr.includes("C013") ||
      chStr === "11" ||
      chStr === "12" ||
      chStr === "13" ||
      chStr.startsWith("IR") ||
      chStr === "TBB"
    ) {
      kLimb = 1.6;
      kSun = 2.5;
    }

    // Tabulate limb darkening recovery deltaT over 1024 bins of cos(psi) in [0, 1]
    limbLut = new Float32Array(1024);
    const eta = 6371.0 / 42164.0; // Earth radius / geostationary orbit radius ~= 0.15110
    const eta2 = eta * eta;

    for (let idx = 0; idx < 1024; idx++) {
      const u = idx / 1023; // cos(psi)
      if (u <= eta) {
        limbLut[idx] = kLimb * 2.4;
      } else {
        const muV = (u - eta) / Math.sqrt(1 - 2 * eta * u + eta2);
        const secVMinus1 = Math.max(0, 1 / Math.max(0.001, muV) - 1);
        limbLut[idx] = kLimb * Math.min(2.4, secVMinus1);
      }
    }
  }

  let curRowA = 0;
  let curRowB = 0;
  let curRowCosLat = 0;

  let rowApplicator;
  if (mode === "reflective") {
    rowApplicator = {
      apply(colIdx, val) {
        if (val <= 0) return val;
        const mu0 = curRowA + curRowB * colCosH[colIdx];
        let k = ((mu0 + 1.0) * 511.5 + 0.5) | 0;
        if (k < 0) k = 0;
        else if (k > 1023) k = 1023;
        const gain = gainLut[k];

        let scaled = val * gain;
        if (scaled > 85) {
          const x = scaled - 85;
          scaled = 85 + (15 * x) / (x + 15);
        }
        if (scaled > 100) return 100;
        if (scaled < 0) return 0;
        return scaled;
      },
    };
  } else if (mode === "mwir_hybrid") {
    rowApplicator = {
      apply(colIdx, val) {
        const mu0 = curRowA + curRowB * colCosH[colIdx];
        if (mu0 > 0.05 && val >= 235 && val <= 305) {
          const wCloud =
            Math.min(1, Math.max(0, (val - 235) / 25)) *
            Math.min(1, Math.max(0, (305 - val) / 20));
          const deltaT = 16.0 * (mu0 - 0.5) * wCloud;
          const clampedDelta = Math.max(-18, Math.min(18, deltaT));
          return val - clampedDelta;
        }
        return val;
      },
    };
  } else if (mode === "vapor_ir_limb") {
    rowApplicator = {
      apply(colIdx, val) {
        const mu0 = curRowA + curRowB * colCosH[colIdx];
        const cosPsi = Math.max(0, Math.min(1, curRowCosLat * colCosSat[colIdx]));
        const limbOffset = limbLut[Math.round(cosPsi * 1023)];

        let insolOffset = 0;
        if (kSun > 0 && val > 255) {
          const mu0Pos = Math.max(0, mu0);
          const wWarm = Math.min(1, Math.max(0, (val - 255) / 25));
          insolOffset = kSun * (mu0Pos - 0.4) * wWarm;
        }

        const deltaT = limbOffset - insolOffset;
        const boundedDelta = Math.max(-10, Math.min(10, deltaT));
        return val + boundedDelta;
      },
    };
  } else {
    rowApplicator = {
      apply(_colIdx, val) {
        return val;
      },
    };
  }

  return {
    prepareRow(latGeo) {
      const latRad = (latGeo * Math.PI) / 180;
      const sinLat = Math.sin(latRad);
      const cosLat = Math.cos(latRad);

      curRowA = sinLat * eph.sinDec;
      curRowB = cosLat * eph.cosDec;
      curRowCosLat = cosLat;

      return rowApplicator;
    },
  };
}

/**
 * Single-point lighting compensation calculator (useful for cursor probing and pointwise analysis).
 *
 * @param {number} val - Original meteorological value
 * @param {number} lng - Longitude in degrees
 * @param {number} lat - Latitude in degrees
 * @param {object} lightingOpts - Options
 * @returns {number} Compensated value
 */
export function compensateScalarValue(val, lng, lat, lightingOpts) {
  if (val == null || isNaN(val) || val <= -9900 || !lightingOpts || !lightingOpts.enabled) {
    return val;
  }
  const mode = lightingOpts.mode || "none";
  if (mode === "none") return val;

  const sampler = createSeparableRasterLighting(lightingOpts, lng, lng, 1, null, 1);
  const row = sampler.prepareRow(lat);
  return row.apply(0, val);
}

// Convert sRGB channel in [0, 1] to linear RGB
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Precomputed table for sRGB to linear conversion of 0..255 byte values
const srgbToLinearTable = new Float32Array(256);
for (let b = 0; b < 256; b++) {
  srgbToLinearTable[b] = srgbToLinear(b / 255);
}

// Convert linear RGB in [0, 1] to sRGB channel
function linearToSrgb(c) {
  const clamped = Math.max(0, Math.min(1, c));
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

/**
 * Compensates an RGBA ImageData bitmap (e.g. FY-2G DUST RGB BMP) preserving chromaticity.
 *
 * @param {ImageData} imgData - Canvas ImageData
 * @param {number[]} bounds - [minLon, minLat, maxLon, maxLat]
 * @param {number} utcMs - True observation UTC ms
 */
export function compensateRgbImageData(imgData, bounds, utcMs) {
  if (!imgData || !imgData.data || !Array.isArray(bounds) || bounds.length < 4) return;
  const [minLon, minLat, maxLon, maxLat] = bounds;
  const { width: W, height: H, data } = imgData;
  if (W <= 0 || H <= 0) return;

  const eph = computeSolarEphemeris(utcMs);
  const colCosH = new Float32Array(W);
  const lonSpan = maxLon - minLon;
  const wDenom = Math.max(1, W - 1);
  const hDenom = Math.max(1, H - 1);

  for (let i = 0; i < W; i++) {
    const lon = minLon + (i / wDenom) * lonSpan;
    colCosH[i] = Math.cos(eph.ghaRad + (lon * Math.PI) / 180);
  }

  const alpha = 0.65;
  const maxGain = 2.6;

  for (let j = 0; j < H; j++) {
    const lat = maxLat - (j / hDenom) * (maxLat - minLat);
    const latRad = (lat * Math.PI) / 180;
    const rowA = Math.sin(latRad) * eph.sinDec;
    const rowB = Math.cos(latRad) * eph.cosDec;

    let dstIdx = j * W * 4;
    for (let i = 0; i < W; i++, dstIdx += 4) {
      if (data[dstIdx + 3] === 0) continue; // Skip transparent

      const mu0 = rowA + rowB * colCosH[i];
      const muEff = Math.sqrt(mu0 * mu0 + 0.0064);
      const gDay = Math.min(maxGain, Math.pow(muEff, -alpha));

      let gain;
      if (mu0 >= 0.242) {
        gain = gDay;
      } else if (mu0 <= 0.035) {
        gain = 1.0;
      } else {
        const t = (mu0 - 0.035) / (0.242 - 0.035);
        const s = t * t * (3 - 2 * t);
        gain = 1.0 + s * (gDay - 1.0);
      }

      if (Math.abs(gain - 1.0) < 0.001) continue;

      const rLin = srgbToLinearTable[data[dstIdx]];
      const gLin = srgbToLinearTable[data[dstIdx + 1]];
      const bLin = srgbToLinearTable[data[dstIdx + 2]];

      const denomR = 1 + rLin * (gain - 1) * 0.35;
      const denomG = 1 + gLin * (gain - 1) * 0.35;
      const denomB = 1 + bLin * (gain - 1) * 0.35;

      const rComp = (rLin * gain) / denomR;
      const gComp = (gLin * gain) / denomG;
      const bComp = (bLin * gain) / denomB;

      data[dstIdx] = Math.round(linearToSrgb(rComp) * 255);
      data[dstIdx + 1] = Math.round(linearToSrgb(gComp) * 255);
      data[dstIdx + 2] = Math.round(linearToSrgb(bComp) * 255);
    }
  }
}

// Memoized views for non-destructive grid contour rendering
const gridViewCache = new WeakMap();

/**
 * Returns a non-mutating, memoized compensated view of gridData for contour rendering.
 * Raw gridData.values is 100% untouched.
 *
 * @param {object} gridData - Source gridData
 * @param {object} lightingOpts - Active lighting options
 * @returns {object} Compensated gridData wrapper
 */
export function getCompensatedGridView(gridData, lightingOpts) {
  if (
    !gridData ||
    !gridData.values ||
    !lightingOpts ||
    !lightingOpts.enabled ||
    lightingOpts.mode === "none"
  ) {
    return gridData;
  }

  const cacheKey = `${lightingOpts.mode}_${lightingOpts.utcMs}_${lightingOpts.channel}_${lightingOpts.satLon ?? 133}`;
  let cached = gridViewCache.get(gridData);
  if (cached && cached.key === cacheKey) {
    return cached.view;
  }

  const h = gridData.header || {};
  const nlon = h.n_lon || h.LongitudeGridNumber || (gridData.values ? gridData.values[0]?.length : 0) || 0;
  const nlat = h.n_lat || h.LatitudeGridNumber || (gridData.values ? gridData.values.length : 0) || 0;

  let slon, elon, slat, elat;
  if (gridData.x && gridData.x.length > 0) {
    slon = gridData.x[0];
    elon = gridData.x[gridData.x.length - 1];
  } else {
    slon = h.start_lon ?? h.StartLongitude ?? 60.0;
    const dlon = h.d_lon ?? h.LongitudeGridSpace ?? 0.25;
    elon = nlon > 1 ? slon + (nlon - 1) * dlon : h.end_lon ?? h.EndLongitude ?? slon;
  }
  if (elon < slon && elon < 0 && slon > 0 && (elon + 360 - slon) < 360) {
    elon += 360;
  }

  if (gridData.y && gridData.y.length > 0) {
    slat = gridData.y[0];
    elat = gridData.y[gridData.y.length - 1];
  } else {
    slat = h.start_lat ?? h.StartLatitude ?? 60.0;
    let dlat = h.d_lat ?? h.LatitudeGridSpace;
    if (dlat === undefined || dlat === null || dlat === 0) {
      dlat = h.end_lat !== undefined && h.end_lat !== null && nlat > 1 ? (h.end_lat - slat) / (nlat - 1) : -0.25;
    } else if (h.end_lat !== undefined && h.end_lat !== null && slat > h.end_lat && dlat > 0) {
      dlat = -dlat;
    }
    elat = nlat > 1 ? slat + (nlat - 1) * dlat : h.end_lat ?? h.EndLatitude ?? slat;
  }

  const is2D =
    Array.isArray(gridData.values) &&
    (Array.isArray(gridData.values[0]) || ArrayBuffer.isView(gridData.values[0]));
  const origValues = gridData.values;
  const sampler = createSeparableRasterLighting(lightingOpts, slon, elon, nlon, null, nlon);

  let compValues;
  let min = Infinity;
  let max = -Infinity;

  if (is2D) {
    compValues = new Array(nlat);
    for (let r = 0; r < nlat; r++) {
      const lat = slat + (r / Math.max(1, nlat - 1)) * (elat - slat);
      const row = sampler.prepareRow(lat);
      const srcRow = origValues[r];
      const dstRow = new Float32Array(nlon);
      for (let c = 0; c < nlon; c++) {
        const v = srcRow[c];
        if (v !== undefined && v > -9900) {
          const cv = row.apply(c, v);
          dstRow[c] = cv;
          if (cv < min) min = cv;
          if (cv > max) max = cv;
        } else {
          dstRow[c] = v;
        }
      }
      compValues[r] = dstRow;
    }
  } else {
    const totalCells = nlat * nlon;
    compValues = new Float32Array(totalCells);
    for (let r = 0; r < nlat; r++) {
      const lat = slat + (r / Math.max(1, nlat - 1)) * (elat - slat);
      const row = sampler.prepareRow(lat);
      const rOffset = r * nlon;
      for (let c = 0; c < nlon; c++) {
        const v = origValues[rOffset + c];
        if (v !== undefined && v > -9900) {
          const cv = row.apply(c, v);
          compValues[rOffset + c] = cv;
          if (cv < min) min = cv;
          if (cv > max) max = cv;
        } else {
          compValues[rOffset + c] = v;
        }
      }
    }
  }

  const stats = (min !== Infinity && max !== -Infinity) ? { min, max } : gridData.stats;
  const compensatedGrid = Object.assign({}, gridData, { values: compValues, stats });
  gridViewCache.set(gridData, { key: cacheKey, view: compensatedGrid });

  return compensatedGrid;
}

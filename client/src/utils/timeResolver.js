// timeResolver.js - Meteorological Multi-Layer Time Matching & Staleness Engine
// Implements Part 2 of meteorological-explorer-design.md:
// - Cursor as continuous wall-clock time
// - Layer time matching policies: nearest, latest-at, hold, interpolate
// - Tolerance windows & staleness classification (current, soft-stale, hard-stale, desync)
// - Age & Zulu time formatters

/**
 * Default element tolerance in minutes
 */
export const DEFAULT_TOLERANCES = {
  RADAR: 10,
  CREF: 10,
  REFLECTIVITY: 10,
  SATELLITE: 20,
  IR: 20,
  VIS: 20,
  SURFACE: 90,
  METAR: 90,
  AWS: 90,
  PLOT_GLOBAL_3H: 180,
  SLP: 180,
  RAIN6: 360,
  UPPER_AIR: 720,
  TLOGP: 720,
  SOUNDING: 720,
  ECMWF_HR: 360,
  GFS: 360,
  TMP: 360,
  HGT: 360,
  WIND: 360,
  RH: 360,
  VOR: 360,
  DIV: 360,
  DEFAULT: 60,
};

/**
 * Parse tolerance string (e.g. "10m", "90m", "1h", "3h", "6h") or number (minutes)
 * @param {string|number} tol
 * @param {number} fallback
 * @returns {number} tolerance in minutes
 */
export function parseTolerance(tol, fallback = 60) {
  if (tol === undefined || tol === null || tol === "") return fallback;
  if (typeof tol === "number" && Number.isFinite(tol)) return Math.max(1, tol);
  const s = String(tol).trim().toLowerCase();
  if (s === "unlimited" || s === "infinite") return Infinity;
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|h|hr|hrs|d|day|days)?$/);
  if (!match) {
    const num = parseFloat(s);
    return Number.isFinite(num) ? Math.max(1, num) : fallback;
  }
  const val = parseFloat(match[1]);
  const unit = match[2] || "m";
  if (unit.startsWith("h")) return Math.round(val * 60);
  if (unit.startsWith("d")) return Math.round(val * 1440);
  return Math.max(1, Math.round(val));
}

/**
 * Format tolerance for display
 * @param {number} minutes
 * @returns {string}
 */
export function formatTolerance(minutes) {
  if (minutes === Infinity || !Number.isFinite(minutes)) return "Unlimited";
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

/**
 * Parse offset string (e.g. "0", "-30m", "+1h", "T-30m") or number (minutes)
 * @param {string|number} offset
 * @returns {number} offset in minutes
 */
export function parseOffset(offset) {
  if (offset === undefined || offset === null || offset === "") return 0;
  if (typeof offset === "number" && Number.isFinite(offset)) return offset;
  let s = String(offset).trim().toUpperCase();
  if (s.startsWith("T")) s = s.slice(1).trim();
  let sign = 1;
  if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    sign = 1;
    s = s.slice(1).trim();
  }
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(M|MIN|H|HR|D)?$/);
  if (!match) {
    const num = parseFloat(s);
    return Number.isFinite(num) ? num * sign : 0;
  }
  const val = parseFloat(match[1]);
  const unit = match[2] || "M";
  if (unit.startsWith("H")) return Math.round(val * 60) * sign;
  if (unit.startsWith("D")) return Math.round(val * 1440) * sign;
  return Math.round(val) * sign;
}

/**
 * Format time offset string (e.g. "T + 0", "T - 30m", "T + 1h")
 * @param {number} offsetMinutes
 * @returns {string}
 */
export function formatOffset(offsetMinutes) {
  if (!offsetMinutes) return "T + 0";
  const sign = offsetMinutes > 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  if (abs >= 60 && abs % 60 === 0) {
    return `T ${sign} ${abs / 60}h`;
  }
  if (abs >= 60) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `T ${sign} ${h}h ${m}m`;
  }
  return `T ${sign} ${abs}m`;
}

/**
 * Parse any time representation into a Unix timestamp (ms)
 * Supports:
 * - Date objects
 * - Unix timestamps (ms or seconds)
 * - ISO-8601 strings ("2026-09-30T14:27:00Z")
 * - MICAPS 14-char timestamp ("20260930140000.000" or "20260930140000")
 * - MICAPS 10-char timestamp ("2026093014" or "26093014")
 * - Forecast lead combination ({ cycle: "26082820", period: 24 })
 * @param {any} input
 * @returns {number|null} Unix timestamp ms or null
 */
export function parseTimestamp(input) {
  if (input === undefined || input === null || input === "") return null;
  if (input instanceof Date) return input.getTime();
  if (typeof input === "number") {
    // If seconds, convert to ms
    return input < 10000000000 ? input * 1000 : input;
  }

  if (typeof input === "object" && input !== null) {
    if (input.cycle || input.forecastCycle) {
      const cycleVal = input.cycle || input.forecastCycle;
      const cycleTs = parseTimestamp(cycleVal);
      if (cycleTs !== null) {
        const periodHours = Number(input.period ?? input.stepLead ?? 0);
        return cycleTs + periodHours * 3600 * 1000;
      }
    }
    if (input.file) {
      return parseTimestamp(input.file);
    }
  }

  const str = String(input).trim();

  // ISO string
  if (str.includes("T") || str.includes("-")) {
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) return parsed;
  }

  // MICAPS filename / timestamp: e.g. 20260930140000.000, 2026093014, 26082820.024
  const basename = str.split(/[/\\]/).pop();
  const parts = basename.split(".");
  const clean = parts[0];
  const ext = parts.length > 1 ? parts[1] : null;

  if (clean.length === 14 && /^\d{14}$/.test(clean)) {
    const y = parseInt(clean.slice(0, 4), 10);
    const m = parseInt(clean.slice(4, 6), 10) - 1;
    const d = parseInt(clean.slice(6, 8), 10);
    const h = parseInt(clean.slice(8, 10), 10);
    const min = parseInt(clean.slice(10, 12), 10);
    const sec = parseInt(clean.slice(12, 14), 10);
    const ms = (ext && /^\d+$/.test(ext)) ? parseInt(ext.slice(0, 3).padEnd(3, "0"), 10) : 0;
    return Date.UTC(y, m, d, h, min, sec) + ms;
  }

  // 12-char: 202609301400
  if (clean.length === 12 && /^\d{12}$/.test(clean)) {
    const y = parseInt(clean.slice(0, 4), 10);
    const m = parseInt(clean.slice(4, 6), 10) - 1;
    const d = parseInt(clean.slice(6, 8), 10);
    const h = parseInt(clean.slice(8, 10), 10);
    const min = parseInt(clean.slice(10, 12), 10);
    return Date.UTC(y, m, d, h, min, 0);
  }

  // 10-char: 2026093014 (YYYYMMDDHH) or 2026093014.024 (NWP forecast: cycle + lead) or 2609301430 (YYMMDDHHmm)
  if (clean.length === 10 && /^\d{10}$/.test(clean)) {
    if (clean.startsWith("20") || clean.startsWith("19")) {
      const y = parseInt(clean.slice(0, 4), 10);
      const m = parseInt(clean.slice(4, 6), 10) - 1;
      const d = parseInt(clean.slice(6, 8), 10);
      const h = parseInt(clean.slice(8, 10), 10);
      const baseTs = Date.UTC(y, m, d, h, 0, 0);
      const leadHours = (ext && /^\d+$/.test(ext)) ? parseInt(ext, 10) : 0;
      return baseTs + leadHours * 3600 * 1000;
    } else {
      // 10-char YYMMDDHHmm (MICAPS observation timestamp)
      const y = 2000 + parseInt(clean.slice(0, 2), 10);
      const m = parseInt(clean.slice(2, 4), 10) - 1;
      const d = parseInt(clean.slice(4, 6), 10);
      const h = parseInt(clean.slice(6, 8), 10);
      const min = parseInt(clean.slice(8, 10), 10);
      const ms = (ext && /^\d+$/.test(ext)) ? parseInt(ext.slice(0, 3).padEnd(3, "0"), 10) : 0;
      return Date.UTC(y, m, d, h, min, 0) + ms;
    }
  }

  // 8-char: 26093014 (YYMMDDHH) or 26082820.024 (NWP forecast: cycle + lead)
  if (clean.length === 8 && /^\d{8}$/.test(clean)) {
    const y = 2000 + parseInt(clean.slice(0, 2), 10);
    const m = parseInt(clean.slice(2, 4), 10) - 1;
    const d = parseInt(clean.slice(4, 6), 10);
    const h = parseInt(clean.slice(6, 8), 10);
    const baseTs = Date.UTC(y, m, d, h, 0, 0);
    const leadHours = (ext && /^\d+$/.test(ext)) ? parseInt(ext, 10) : 0;
    return baseTs + leadHours * 3600 * 1000;
  }

  // Fallback Date.parse
  const fallback = Date.parse(str);
  return isNaN(fallback) ? null : fallback;
}

/**
 * Format timestamp as UTC Zulu string (e.g. "14:25Z" or "09-30 14:25Z")
 * @param {number|Date|string} ts
 * @param {boolean} includeDate
 * @returns {string}
 */
export function formatZuluTime(ts, includeDate = false) {
  const ms = parseTimestamp(ts);
  if (ms === null) return "--:--Z";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  if (includeDate) {
    const mon = pad(d.getUTCMonth() + 1);
    const day = pad(d.getUTCDate());
    return `${mon}-${day} ${hh}:${mm}Z`;
  }
  return `${hh}:${mm}Z`;
}

/**
 * Format full ISO-like UTC timestamp (e.g. "2026-09-30 14:25Z")
 * @param {number|Date|string} ts
 * @returns {string}
 */
export function formatFullZuluTime(ts) {
  const ms = parseTimestamp(ts);
  if (ms === null) return "----/--/-- --:--Z";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  return `${y}-${m}-${day} ${hh}:${mm}Z`;
}

/**
 * Format Unix timestamp (ms or Date) to standard MICAPS 14-char timestamp (YYYYMMDDHHmmss.000)
 * @param {number|Date|string} ts
 * @returns {string}
 */
export function formatMicapsTimestamp(ts) {
  const ms = parseTimestamp(ts);
  if (ms === null) return "";
  const d = new Date(ms);
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `${y}${m}${day}${hh}${mm}${ss}.000`;
}

/**
 * Format age offset between cursor and resolved time (e.g. "-2m", "-27m", "-87m", "+0m")
 * Per Design §2.4: "Radar CREF · 14:25Z (−2m)"
 * @param {number} ageMinutes - difference: (actualTime - cursorTime) in minutes
 * @returns {string}
 */
export function formatAgeOffset(ageMinutes) {
  if (ageMinutes === undefined || ageMinutes === null || isNaN(ageMinutes)) return "±0m";
  const rounded = Math.round(ageMinutes);
  if (rounded === 0) return "±0m";
  const sign = rounded > 0 ? "+" : "−";
  const abs = Math.abs(rounded);
  if (abs >= 60 && abs % 60 === 0) {
    return `${sign}${abs / 60}h`;
  }
  return `${sign}${abs}m`;
}

/**
 * Default tolerance lookup based on layer properties
 * @param {Object} layer
 * @returns {number} tolerance in minutes
 */
export function getDefaultToleranceForLayer(layer) {
  if (!layer) return DEFAULT_TOLERANCES.DEFAULT;
  const elem = String(layer.element || "").toUpperCase();
  const model = String(layer.model || "").toUpperCase();
  const type = String(layer.type || "").toLowerCase();

  if (elem.includes("RADAR") || elem.includes("CREF") || model.includes("RADAR")) {
    return DEFAULT_TOLERANCES.RADAR;
  }
  if (elem.includes("SAT") || elem.includes("IR") || elem.includes("VIS") || model.includes("SATELLITE")) {
    return DEFAULT_TOLERANCES.SATELLITE;
  }
  if (elem.includes("TLOGP") || type === "tlogp" || model.includes("UPPER_AIR")) {
    return DEFAULT_TOLERANCES.UPPER_AIR;
  }
  if (elem.includes("SLP") || elem.includes("MSLP")) {
    return DEFAULT_TOLERANCES.SLP;
  }
  if (elem.includes("RAIN6")) {
    return DEFAULT_TOLERANCES.RAIN6;
  }
  if (model.includes("SURFACE") || type === "station") {
    return DEFAULT_TOLERANCES.SURFACE;
  }
  if (DEFAULT_TOLERANCES[elem]) {
    return DEFAULT_TOLERANCES[elem];
  }
  if (DEFAULT_TOLERANCES[model]) {
    return DEFAULT_TOLERANCES[model];
  }
  return DEFAULT_TOLERANCES.DEFAULT;
}

/**
 * Resolve a layer's sample time against the cursor playhead
 *
 * Implements Part 2.1 & 2.2:
 * resolve(layer, T_cursor) -> (actual_obs_time, age, status)
 *
 * Policies:
 * - 'nearest': closest sample either side
 * - 'latest-at': most recent sample <= T_target (causal)
 * - 'hold': keep showing until superseded, no limit
 * - 'interpolate': blend two samples (smooth fields only)
 *
 * Staleness states:
 * - 'current' (● green): within tolerance
 * - 'soft-stale' (◐ amber): past tolerance
 * - 'hard-stale' (○ red): far past tolerance (2x) or gap
 * - 'desync' (◆ blue): intentional time offset applied
 *
 * @param {Object} layer
 * @param {number|Date|string} cursorTime
 * @param {Object} options
 * @returns {Object} Resolution result
 */
export function resolveLayerTime(layer, cursorTime, options = {}) {
  const cursorMs = parseTimestamp(cursorTime);
  if (!layer || cursorMs === null) {
    return {
      actualTime: null,
      actualTimeMs: null,
      actualTimeZ: "--:--Z",
      actualTimeStr: "",
      ageMinutes: 0,
      ageStr: "±0m",
      status: "hard-stale",
      statusIcon: "○",
      statusText: "No Data",
      isStale: true,
      isHardStale: true,
      isDesync: false,
      offsetMinutes: 0,
      policy: "nearest",
      toleranceMinutes: 60,
      sampleFile: null,
      interpolationFactor: null,
    };
  }

  // 1. Policy & Tolerance extraction
  const policy = (options.forceLatestAt ? "latest-at" : (layer.policy || layer.config?.policy || layer.render?.policy || "nearest")).toLowerCase();
  const rawTol = layer.tolerance ?? layer.config?.tolerance ?? layer.render?.tolerance;
  const toleranceMinutes = parseTolerance(rawTol, getDefaultToleranceForLayer(layer));
  const toleranceMs = toleranceMinutes * 60 * 1000;

  // 2. Deliberate Offset extraction (Design §2.7)
  const rawOffset = layer.offset ?? layer.config?.offset ?? layer.render?.offset ?? 0;
  const offsetMinutes = parseOffset(rawOffset);
  const isDesync = offsetMinutes !== 0;

  // Target comparison timestamp = cursor + deliberate offset
  const targetMs = cursorMs + offsetMinutes * 60 * 1000;

  // 3. Collect available sample times
  let sampleEntries = [];
  if (Array.isArray(layer.sampleTimes) && layer.sampleTimes.length > 0) {
    sampleEntries = layer.sampleTimes.map((item) => {
      const ts = parseTimestamp(item);
      return { ts, file: typeof item === "string" ? item : null };
    }).filter((s) => s.ts !== null);
  } else if (Array.isArray(layer.samples) && layer.samples.length > 0) {
    sampleEntries = layer.samples.map((item) => {
      const ts = parseTimestamp(item.time || item.ts || item);
      return { ts, file: item.file || item.name || null };
    }).filter((s) => s.ts !== null);
  } else if (Array.isArray(layer.obsFiles) && layer.obsFiles.length > 0) {
    sampleEntries = layer.obsFiles.map((file) => ({
      ts: parseTimestamp(file),
      file,
    })).filter((s) => s.ts !== null);
  } else if (layer.sampleCadenceMinutes && layer.sampleCadenceMinutes > 0) {
    // Generate virtual samples for layer with known cadence
    const base = layer.sampleBaseTime ? parseTimestamp(layer.sampleBaseTime) : cursorMs;
    sampleEntries = generateCadenceSampleEntries(base, layer.sampleCadenceMinutes, layer.sampleCount || 36);
  } else {
    // Fallback: single sample if layer has file / time specified
    const singleTs = parseTimestamp(layer.obsTime || layer.file || layer.validTime || cursorMs);
    if (singleTs !== null) {
      sampleEntries = [{ ts: singleTs, file: layer.obsTime || layer.file || null }];
    }
  }

  // Sort samples chronologically
  sampleEntries.sort((a, b) => a.ts - b.ts);

  if (sampleEntries.length === 0) {
    return {
      actualTime: null,
      actualTimeMs: null,
      actualTimeZ: "--:--Z",
      actualTimeStr: "",
      ageMinutes: 0,
      ageStr: "±0m",
      status: "hard-stale",
      statusIcon: "○",
      statusText: "No Samples",
      isStale: true,
      isHardStale: true,
      isDesync,
      offsetMinutes,
      policy,
      toleranceMinutes,
      sampleFile: null,
      interpolationFactor: null,
    };
  }

  // 4. Match per policy
  let matchedSample = null;
  let interpolationFactor = null;

  if (policy === "latest-at" || policy === "hold") {
    // Latest sample with ts <= targetMs
    for (let i = sampleEntries.length - 1; i >= 0; i--) {
      if (sampleEntries[i].ts <= targetMs) {
        matchedSample = sampleEntries[i];
        break;
      }
    }
    // If none found <= target, take the earliest available
    if (!matchedSample && sampleEntries.length > 0) {
      matchedSample = sampleEntries[0];
    }
  } else if (policy === "interpolate") {
    // Find pair bounding targetMs
    let prev = null;
    let next = null;
    for (let i = 0; i < sampleEntries.length; i++) {
      if (sampleEntries[i].ts <= targetMs) {
        prev = sampleEntries[i];
      }
      if (sampleEntries[i].ts >= targetMs && !next) {
        next = sampleEntries[i];
        break;
      }
    }
    if (prev && next && prev.ts !== next.ts) {
      interpolationFactor = (targetMs - prev.ts) / (next.ts - prev.ts);
      matchedSample = interpolationFactor < 0.5 ? prev : next;
    } else {
      matchedSample = prev || next || sampleEntries[0];
    }
  } else {
    // Default: 'nearest' - closest sample either side
    let minDiff = Infinity;
    for (const entry of sampleEntries) {
      const diff = Math.abs(entry.ts - targetMs);
      if (diff < minDiff) {
        minDiff = diff;
        matchedSample = entry;
      }
    }
  }

  const actualTimeMs = matchedSample ? matchedSample.ts : targetMs;
  const actualDate = new Date(actualTimeMs);

  // Age calculation (Design §2.1):
  // Difference between target cursor moment and actual sample time
  // Negative means the observation occurred before cursor time (e.g. -2m)
  const ageMs = actualTimeMs - cursorMs;
  const ageMinutes = Math.round(ageMs / 60000);
  const ageStr = formatAgeOffset(ageMinutes);
  const actualTimeZ = formatZuluTime(actualDate);
  const actualTimeStr = formatFullZuluTime(actualDate);

  // 5. Staleness Evaluation (Design §2.4 & §2.7)
  const absAgeMs = Math.abs(ageMs);
  let status = "current";
  let statusIcon = "●";
  let statusText = "Current";
  let isStale = false;
  let isHardStale = false;

  if (isDesync) {
    // Deliberate offset applied -> turns blue so intentional desync is never confused with staleness
    status = "desync";
    statusIcon = "◆";
    statusText = `Desync (${formatOffset(offsetMinutes)})`;
  } else if (absAgeMs > 2 * toleranceMs) {
    // Hard stale: far past tolerance or gap
    status = "hard-stale";
    statusIcon = "○";
    statusText = `Stale (${Math.abs(ageMinutes)}m old)`;
    isStale = true;
    isHardStale = true;
  } else if (absAgeMs > toleranceMs) {
    // Soft stale: past tolerance
    status = "soft-stale";
    statusIcon = "◐";
    statusText = `Soft Stale (${Math.abs(ageMinutes)}m)`;
    isStale = true;
  } else if (policy === "hold") {
    // Within tolerance, 'hold' policy stays valid
    status = "current";
    statusIcon = "●";
    statusText = "Held";
  }

  const statusColor = status === "desync"
    ? "#58a6ff"
    : status === "hard-stale"
      ? "#f85149"
      : status === "soft-stale"
        ? "#d29922"
        : "#3fb950";

  return {
    layerId: layer?.id || null,
    actualTime: actualDate,
    actualTimeMs,
    actualTimeZ,
    actualTimeStr,
    ageMinutes,
    ageStr,
    ageFormatted: formatAgeOffset(ageMinutes),
    status,
    statusIcon,
    statusText,
    statusColor,
    isStale,
    isHardStale,
    isDesync,
    offsetMinutes,
    policy,
    toleranceMinutes,
    sampleFile: matchedSample ? matchedSample.file : null,
    interpolationFactor,
  };
}

/**
 * Generate simulated cadence sample entries for layers
 * @param {number} baseMs
 * @param {number} cadenceMinutes
 * @param {number} count
 * @param {Array<number>} gapIndices - indices where data gaps occur
 * @returns {Array<{ ts: number, file: string }>}
 */
export function generateCadenceSampleEntries(baseMs, cadenceMinutes, count = 24, gapIndices = []) {
  const samples = [];
  const startMs = baseMs - Math.floor(count / 2) * cadenceMinutes * 60 * 1000;
  const pad = (n) => String(n).padStart(2, "0");

  for (let i = 0; i < count; i++) {
    if (gapIndices.includes(i)) continue; // Simulated data gap (§2.3)
    const ts = startMs + i * cadenceMinutes * 60 * 1000;
    const d = new Date(ts);
    const fname = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00.000`;
    samples.push({ ts, file: fname });
  }
  return samples;
}

/**
 * Resolve all layers for a window and sort by age (Design §2.5 Status Column)
 * @param {Array<Object>} layers
 * @param {number|Date|string} cursorTime
 * @param {Object} options
 * @returns {Array<Object>}
 */
export function resolveAllLayersForStatus(layers, cursorTime, options = {}) {
  if (!Array.isArray(layers)) return [];
  const results = layers
    .filter((l) => l && l.visible !== false)
    .map((layer) => {
      const res = resolveLayerTime(layer, cursorTime, options);
      return {
        layer,
        ...res,
      };
    });

  // Sort by age (§2.5: sorted by age — the fastest answer to "is what I'm looking at real right now?")
  const statusRank = { current: 0, desync: 1, "soft-stale": 2, "hard-stale": 3 };
  results.sort((a, b) => {
    const ageDiff = Math.abs(a.ageMinutes) - Math.abs(b.ageMinutes);
    if (ageDiff !== 0) return ageDiff;
    return (statusRank[a.status] ?? 4) - (statusRank[b.status] ?? 4);
  });

  return results;
}

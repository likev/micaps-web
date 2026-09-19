// lineUtils.js - Pure transect math + validation for EC line profiles (shared G1/G2)
export const PROFILE_LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200];
export const SUPPORTED_STEPS = [1, 3, 6, 12, 24];
export const LINE_N_MIN = 2;
export const LINE_N_MAX = 81;
export const DEFAULT_NPOINTS = 41;
// ECMWF_HR fallback domain (live header/x/y when available)
export const GRID_DOMAIN = { west: 60, east: 150, south: -10, north: 60 };

const DEG = Math.PI / 180;
const EARTH_R_KM = 6371.0;

export function haversineKm(lon0, lat0, lon1, lat1) {
  const dLat = (lat1 - lat0) * DEG;
  const dLon = (lon1 - lon0) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat0 * DEG) * Math.cos(lat1 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function angularSepDeg(lon0, lat0, lon1, lat1) {
  return (haversineKm(lon0, lat0, lon1, lat1) / EARTH_R_KM) * (180 / Math.PI);
}

// Slerp transect nodes; lerp fallback differs <0.5% under 2000 km (slerp used always).
export function buildTransectNodes(a, b, n = DEFAULT_NPOINTS) {
  const npoints = Math.max(2, Math.min(LINE_N_MAX, Math.round(n) || DEFAULT_NPOINTS));
  const toRad = (d) => d * DEG;
  const toDeg = (r) => r / DEG;
  const lat0r = toRad(a.lat), lon0r = toRad(a.lon);
  const lat1r = toRad(b.lat), lon1r = toRad(b.lon);
  const v0 = [Math.cos(lat0r) * Math.cos(lon0r), Math.cos(lat0r) * Math.sin(lon0r), Math.sin(lat0r)];
  const v1 = [Math.cos(lat1r) * Math.cos(lon1r), Math.cos(lat1r) * Math.sin(lon1r), Math.sin(lat1r)];
  let dot = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
  dot = Math.max(-1, Math.min(1, dot));
  const omega = Math.acos(dot);
  const sinO = Math.sin(omega);
  const lons = [], lats = [], distKm = [];
  for (let i = 0; i < npoints; i++) {
    const t = npoints === 1 ? 0 : i / (npoints - 1);
    let x, y, z;
    if (sinO < 1e-10) {
      x = v0[0] + t * (v1[0] - v0[0]);
      y = v0[1] + t * (v1[1] - v0[1]);
      z = v0[2] + t * (v1[2] - v0[2]);
    } else {
      const aa = Math.sin((1 - t) * omega) / sinO;
      const bb = Math.sin(t * omega) / sinO;
      x = aa * v0[0] + bb * v1[0];
      y = aa * v0[1] + bb * v1[1];
      z = aa * v0[2] + bb * v1[2];
    }
    const norm = Math.hypot(x, y, z) || 1;
    x /= norm; y /= norm; z /= norm;
    const lat = toDeg(Math.asin(Math.max(-1, Math.min(1, z))));
    const lon = toDeg(Math.atan2(y, x));
    lons.push(Math.round(lon * 10000) / 10000);
    lats.push(Math.round(lat * 10000) / 10000);
  }
  const totalKm = haversineKm(a.lon, a.lat, b.lon, b.lat);
  let cum = 0;
  distKm.push(0);
  for (let i = 1; i < npoints; i++) {
    cum += haversineKm(lons[i - 1], lats[i - 1], lons[i], lats[i]);
    distKm.push(cum);
  }
  if (cum > 0) {
    const scale = totalKm / cum;
    if (Math.abs(scale - 1) < 0.05) {
      for (let i = 0; i < distKm.length; i++) distKm[i] *= scale;
      distKm[npoints - 1] = totalKm;
    }
  }
  return { lons, lats, distKm, totalKm };
}

function numInRange(v, lo, hi) {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}

// Validate endpoints: numeric, in-range, angular sep >= 0.1deg.
// Returns { ok, error?, lon0, lat0, lon1, lat1, totalKm }
export function validateEndpoints(a, b) {
  const lon0 = numInRange(a?.lon, -180, 360);
  const lat0 = numInRange(a?.lat, -90, 90);
  const lon1 = numInRange(b?.lon, -180, 360);
  const lat1 = numInRange(b?.lat, -90, 90);
  if (lon0 === null || lat0 === null || lon1 === null || lat1 === null) {
    return { ok: false, error: "Endpoints must be numeric lon (-180..360) / lat (-90..90)." };
  }
  const sep = angularSepDeg(lon0, lat0, lon1, lat1);
  if (!(sep >= 0.1)) {
    return { ok: false, error: "Line endpoints too close (need >= ~0.1° separation)." };
  }
  return { ok: true, lon0, lat0, lon1, lat1, totalKm: haversineKm(lon0, lat0, lon1, lat1) };
}

// v1: clamp endpoints into domain; reject fully-outside. Returns { a, b, clamped, outside }
export function clampEndpointsToDomain(a, b, domain = GRID_DOMAIN) {
  const clampOne = (p) => ({
    lon: Math.max(domain.west, Math.min(domain.east, p.lon)),
    lat: Math.max(domain.south, Math.min(domain.north, p.lat)),
  });
  const ca = clampOne(a), cb = clampOne(b);
  const clamped = ca.lon !== a.lon || ca.lat !== a.lat || cb.lon !== b.lon || cb.lat !== b.lat;
  const aIn = a.lon >= domain.west && a.lon <= domain.east && a.lat >= domain.south && a.lat <= domain.north;
  const bIn = b.lon >= domain.west && b.lon <= domain.east && b.lat >= domain.south && b.lat <= domain.north;
  // Segment intersects domain if either endpoint inside; full segment-box reject otherwise (cheap v1).
  const outside = !aIn && !bIn;
  return { a: ca, b: cb, clamped, outside };
}

export function flipLine(a, b) {
  return [{ ...b }, { ...a }];
}

// Decimation stride for barbs: cap drawn barbs. Default stride 2 when cells>300.
export function decimateStride(nPts, nRows, maxCells = 300) {
  const cells = Math.max(1, nPts) * Math.max(1, nRows);
  if (cells <= maxCells) return 1;
  return Math.max(2, Math.ceil(cells / maxCells));
}

export function buildLeads(startHour = 0, endHour = 144, stepHours = 12) {
  let start = Math.max(0, parseInt(startHour, 10) || 0);
  let end = Math.min(240, parseInt(endHour, 10) || 144);
  let step = parseInt(stepHours, 10) || 12;
  if (!SUPPORTED_STEPS.includes(step)) step = 12;
  if (start >= end) end = start + step;
  const leads = [];
  for (let h = start; h <= end; h += step) {
    leads.push(h);
    if (leads.length >= 41) break;
  }
  return leads;
}

export function validateNPoints(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v) || v < LINE_N_MIN || v > LINE_N_MAX) {
    return { ok: false, error: `N points must be ${LINE_N_MIN}..${LINE_N_MAX}.` };
  }
  return { ok: true, value: v };
}

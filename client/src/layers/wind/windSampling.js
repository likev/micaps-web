// windSampling.js - Grid header normalization and bilinear wind velocity interpolation

export function normalizeHeader(gridData) {
  const header = gridData.header || {};
  const nLon = header.n_lon || header.LongitudeGridNumber || 100;
  const nLat = header.n_lat || header.LatitudeGridNumber || 80;
  const startLon = gridData.x ? gridData.x[0] : (header.start_lon ?? header.StartLongitude ?? 60.0);
  const endLon = gridData.x ? gridData.x[gridData.x.length - 1] : (header.end_lon ?? header.EndLongitude ?? (startLon + (nLon - 1) * 0.25));
  const dLon = Math.abs(header.d_lon ?? header.LongitudeGridSpace ?? (nLon > 1 ? Math.abs(endLon - startLon) / (nLon - 1) : 0.25));
  const startLat = gridData.y ? gridData.y[0] : (header.start_lat ?? header.StartLatitude ?? 60.0);
  const endLat = gridData.y ? gridData.y[gridData.y.length - 1] : (header.end_lat ?? header.EndLatitude ?? (startLat + (nLat - 1) * (header.d_lat || -0.25)));
  const dLat = Math.abs(header.d_lat ?? header.LatitudeGridSpace ?? (nLat > 1 ? Math.abs(endLat - startLat) / (nLat - 1) : 0.25));
  const isLatNorthToSouth = startLat > endLat;

  return {
    nLon,
    nLat,
    startLon,
    endLon,
    dLon,
    startLat,
    endLat,
    dLat,
    isLatNorthToSouth,
    gridWest: Math.min(startLon, endLon),
    gridEast: Math.max(startLon, endLon),
    gridSouth: Math.min(startLat, endLat),
    gridNorth: Math.max(startLat, endLat),
  };
}

export function createBilinearSampler(gridData, normHeader = null) {
  const h = normHeader || normalizeHeader(gridData);
  const u = gridData.u;
  const v = gridData.v;
  const { nLon, nLat, startLon, dLon, startLat, dLat, isLatNorthToSouth } = h;

  return function sampleWind(lng, lat) {
    const gx = (lng - startLon) / dLon;
    const gy = isLatNorthToSouth ? (startLat - lat) / dLat : (lat - startLat) / dLat;

    if (gx < 0 || gx >= nLon - 1 || gy < 0 || gy >= nLat - 1) return null;

    const x0 = Math.floor(gx);
    const x1 = Math.min(x0 + 1, nLon - 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(y0 + 1, nLat - 1);

    const fx = gx - x0;
    const fy = gy - y0;

    const row0 = y0 * nLon;
    const row1 = y1 * nLon;
    const idx00 = row0 + x0;
    const idx10 = row0 + x1;
    const idx01 = row1 + x0;
    const idx11 = row1 + x1;

    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;

    const uVal = w00 * (u[idx00] || 0) +
                 w10 * (u[idx10] || 0) +
                 w01 * (u[idx01] || 0) +
                 w11 * (u[idx11] || 0);

    const vVal = w00 * (v[idx00] || 0) +
                 w10 * (v[idx10] || 0) +
                 w01 * (v[idx01] || 0) +
                 w11 * (v[idx11] || 0);

    return [uVal, vVal];
  };
}

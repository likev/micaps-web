// interpolate.js - Scattered-to-regular grid interpolation using griddata-js
import * as griddata from "griddata";

export function interpolateStations(features, element = "temperature", step = 0.5) {
  if (!features || features.length < 4) {
    return null;
  }

  const points = [];
  const values = [];

  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;

  for (const f of features) {
    const [lon, lat] = f.geometry.coordinates;
    const val = f.properties[element];
    if (val !== undefined && val !== null && val > -9900) {
      points.push([lon, lat]);
      values.push(val);
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  if (points.length < 4) return null;

  // Build regular coordinate mesh
  const xiLons = [];
  for (let lon = minLon; lon <= maxLon; lon += step) {
    xiLons.push(lon);
  }
  const xiLats = [];
  for (let lat = minLat; lat <= maxLat; lat += step) {
    xiLats.push(lat);
  }

  const xi = [];
  for (let j = 0; j < xiLats.length; j++) {
    const row = [];
    for (let i = 0; i < xiLons.length; i++) {
      row.push([xiLons[i], xiLats[j]]);
    }
    xi.push(row);
  }

  const gridZ = griddata.griddata(points, values, xi, { method: "linear" });

  return {
    z: gridZ,
    x: xiLons,
    y: xiLats,
    minLon,
    maxLon,
    minLat,
    maxLat,
  };
}

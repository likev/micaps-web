// kinematicGrid.js - Test helpers to generate synthetic wind fields for kinematics verification
import { EARTH_RADIUS } from "../../src/layers/kinematics.js";

export function createTestGridHeader(options = {}) {
  return {
    start_lon: options.start_lon ?? 100,
    end_lon: options.end_lon ?? 104,
    start_lat: options.start_lat ?? 30,
    end_lat: options.end_lat ?? 34,
    n_lon: options.n_lon ?? 5,
    n_lat: options.n_lat ?? 5,
    d_lon: options.d_lon ?? 1.0,
    d_lat: options.d_lat ?? 1.0,
  };
}

export function createSolidRotationGrid(Omega = 1e-4, header = null) {
  const h = header || createTestGridHeader();
  const n = h.n_lon * h.n_lat;
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  const dLamRad = (h.d_lon * Math.PI) / 180.0;
  const dPhiRad = (h.d_lat * Math.PI) / 180.0;
  const dy = EARTH_RADIUS * dPhiRad;
  const midR = (h.n_lat - 1) / 2;
  const midC = (h.n_lon - 1) / 2;

  for (let r = 0; r < h.n_lat; r++) {
    const lat = h.start_lat + r * h.d_lat;
    const phi = (lat * Math.PI) / 180.0;
    const dx = EARTH_RADIUS * Math.cos(phi) * dLamRad;
    const yDist = (r - midR) * dy;

    for (let c = 0; c < h.n_lon; c++) {
      const xDist = (c - midC) * dx;
      const idx = r * h.n_lon + c;
      u[idx] = -Omega * yDist;
      v[idx] = Omega * xDist;
    }
  }

  return { u, v, header: h };
}

export function createDivergentGrid(alpha = 1e-4, header = null) {
  const h = header || createTestGridHeader();
  const n = h.n_lon * h.n_lat;
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  const dLamRad = (h.d_lon * Math.PI) / 180.0;
  const dPhiRad = (h.d_lat * Math.PI) / 180.0;
  const dy = EARTH_RADIUS * dPhiRad;
  const midR = (h.n_lat - 1) / 2;
  const midC = (h.n_lon - 1) / 2;

  for (let r = 0; r < h.n_lat; r++) {
    const lat = h.start_lat + r * h.d_lat;
    const phi = (lat * Math.PI) / 180.0;
    const dx = EARTH_RADIUS * Math.cos(phi) * dLamRad;
    const yDist = (r - midR) * dy;

    for (let c = 0; c < h.n_lon; c++) {
      const xDist = (c - midC) * dx;
      const idx = r * h.n_lon + c;
      u[idx] = alpha * xDist;
      v[idx] = alpha * yDist;
    }
  }

  return { u, v, header: h };
}

export function createUniformGrid(uVal = 10, vVal = 5, header = null) {
  const h = header || createTestGridHeader();
  const n = h.n_lon * h.n_lat;
  const u = new Float32Array(n).fill(uVal);
  const v = new Float32Array(n).fill(vVal);
  return { u, v, header: h };
}

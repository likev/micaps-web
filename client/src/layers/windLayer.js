// windLayer.js - Facade re-exporting wind streamlines, barbs, sampling, and station grid modules
import { stopWindAnimation, renderWindStreamlines } from "./wind/streamlines.js";
import { removeGridWindBarbs, renderGridWindBarbs } from "./wind/gridBarbs.js";
import { generateStationWindGrid } from "./analysis/stationWindGrid.js";
import { WIND_QC_BOUNDS } from "./analysis/qcBounds.js";
import { normalizeHeader, createBilinearSampler } from "./wind/windSampling.js";

/**
 * Unified wind layer cleanup for both streamlines and wind barbs (§8.8.2 P4-1).
 * Cancels active animation frames, removes map move/resize listeners, unbinds
 * visibility change handlers, and clears/removes overlay canvases.
 *
 * @param {Object} [map=null] - MapLibre map instance
 */
export function cleanupWindLayer(map = null) {
  stopWindAnimation(map);
  removeGridWindBarbs(map);
}

export {
  renderWindStreamlines,
  stopWindAnimation,
  renderGridWindBarbs,
  removeGridWindBarbs,
  generateStationWindGrid,
  WIND_QC_BOUNDS,
  normalizeHeader,
  createBilinearSampler,
};

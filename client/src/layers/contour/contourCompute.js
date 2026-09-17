// contourCompute.js - Contour mathematical calculations, bold tagging, and grid LOD evaluation
import { smoothFeatureCollection, simplifyFeatureCollection } from "../../utils/smoothContour.js";
import { getMaxEffectiveCells } from "../../config/presets.js";
import {
  getFullGridStep,
  computeCropIndices,
  cropGridValues,
  resolveContourStep,
  shouldBypassCrop,
} from "../../utils/viewportCrop.js";

export function parseBoldValues(boldInput, element = null) {
  if (!boldInput) {
    if (element === "HGT") return [5880, 588];
    if (element === "SLP") return [1010, 1000, 1020];
    if (element === "TMP") return [0];
    return [];
  }
  if (Array.isArray(boldInput)) {
    return boldInput.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  }
  if (typeof boldInput === "string") {
    return boldInput.split(/[,;\s]+/).map((v) => Number(v)).filter((v) => Number.isFinite(v));
  }
  if (typeof boldInput === "number") {
    return [boldInput];
  }
  return [];
}

export function isFeatureBold(val, boldValues) {
  if (!boldValues || !Array.isArray(boldValues) || boldValues.length === 0) return false;
  const numVal = Math.round(Number(val));
  return boldValues.some((b) => {
    const numB = Number(b);
    if (!Number.isFinite(numB)) return false;
    if (numVal === numB) return true;
    if (Math.abs(numB) >= 100 && Math.abs(numVal) >= 100) {
      if (Math.round(numVal * 10) === numB) return true;
      if (Math.round(numVal / 10) === numB) return true;
    }
    return false;
  });
}

export function smoothLines(isolineFC, smoothIterations = 2, step = 1) {
  if (!isolineFC || !Array.isArray(isolineFC.features) || isolineFC.features.length === 0) {
    return isolineFC;
  }
  const dpTolerance = Math.max(0.01, 0.02 * (step || 1));
  const simplified = simplifyFeatureCollection(isolineFC, dpTolerance);
  return smoothFeatureCollection(simplified, smoothIterations);
}

export function computeGridStats(gridData) {
  let zMin = gridData.stats?.min;
  let zMax = gridData.stats?.max;
  if ((zMin === undefined || zMax === undefined) && Array.isArray(gridData.values) && gridData.values.length > 0) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < gridData.values.length; i++) {
      const v = gridData.values[i];
      if (typeof v === "number" && !isNaN(v) && v > -9990) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (min !== Infinity && max !== -Infinity) {
      zMin = min;
      zMax = max;
      if (!gridData.stats) gridData.stats = { min, max };
    }
  }
  return { zMin, zMax };
}

export function evaluateCropAndLOD(gridData, options = {}) {
  const nLon = gridData.header.n_lon;
  const nLat = gridData.header.n_lat;
  const totalCells = nLon * nLat;

  const budget = Number.isFinite(options.maxEffectiveCells) && options.maxEffectiveCells > 0
    ? getMaxEffectiveCells(options.maxEffectiveCells)
    : getMaxEffectiveCells();

  let step = 1;
  let cropIdx = null;
  let croppedData = null;

  const isSmallGrid = shouldBypassCrop(totalCells, budget);
  const enableBBoxCrop = options.enableBBoxCrop !== false;

  if (isSmallGrid) {
    step = 1;
    cropIdx = { iMin: 0, iMax: nLon - 1, jMin: 0, jMax: nLat - 1, nLonCrop: nLon, nLatCrop: nLat, nCrop: totalCells };
    croppedData = cropGridValues(gridData, cropIdx, step);
  } else {
    if (enableBBoxCrop && options.viewportBounds) {
      cropIdx = computeCropIndices(gridData.header, gridData.x, gridData.y, options.viewportBounds, options.bufferDelta ?? 1.75);
      step = resolveContourStep(cropIdx.nCrop, budget);
      croppedData = cropGridValues(gridData, cropIdx, step);
    } else {
      step = getFullGridStep(nLon, nLat, budget);
      cropIdx = { iMin: 0, iMax: nLon - 1, jMin: 0, jMax: nLat - 1, nLonCrop: nLon, nLatCrop: nLat, nCrop: totalCells };
      croppedData = cropGridValues(gridData, cropIdx, step);
    }
  }

  return { totalCells, nLon, nLat, budget, step, cropIdx, croppedData };
}

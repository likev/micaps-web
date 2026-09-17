// smoothGrid2D.js - Meteorological 9-point spatial smoothing filter for 2D scalar fields

/**
 * Meteorological 9-point spatial smoothing filter for 2D scalar fields.
 * Applies a 2D spatial convolution kernel to reduce single-grid-point noise
 * while preserving synoptic wave amplitudes and gradients.
 *
 * Kernel weights:
 * [ wDiag, wSide,   wDiag ]
 * [ wSide, wCenter, wSide ] / (normalization sum)
 * [ wDiag, wSide,   wDiag ]
 *
 * @param {Array<Array<number>>|Float64Array|Array<number>} Z - 2D matrix or flat 1D array
 * @param {number} [iterations=1] - Number of smoothing passes
 * @param {number} [weight=0.4] - Smoothing weight parameter (0 to 1)
 * @param {number} [rows] - Row count if Z is a 1D array
 * @param {number} [cols] - Column count if Z is a 1D array
 * @returns {Array<Array<number>>|Float64Array|Array<number>} Smoothed 2D grid
 */
export function smoothGrid2D(Z, iterations = 1, weight = 0.4, rows = null, cols = null) {
  if (!Z || iterations <= 0) return Z;

  const is2D = Array.isArray(Z) && Array.isArray(Z[0]);
  let nRows = rows;
  let nCols = cols;

  if (is2D) {
    nRows = Z.length;
    nCols = Z[0].length;
  } else if (!nRows || !nCols) {
    return Z;
  }

  if (nRows < 3 || nCols < 3) return Z;

  // Convert to working 2D array
  let current;
  if (is2D) {
    current = Z.map((row) => [...row]);
  } else {
    current = [];
    for (let r = 0; r < nRows; r++) {
      const row = [];
      for (let c = 0; c < nCols; c++) {
        row.push(Z[r * nCols + c]);
      }
      current.push(row);
    }
  }

  const s = Math.max(0, Math.min(1, weight));
  const wCenter = 1.0 - s * 0.5;
  const wSide = s * 0.125;
  const wDiag = s * 0.0625;

  for (let it = 0; it < iterations; it++) {
    const next = [];
    for (let r = 0; r < nRows; r++) {
      const nextRow = new Array(nCols);
      for (let c = 0; c < nCols; c++) {
        const val = current[r][c];
        if (typeof val !== "number" || isNaN(val) || !isFinite(val)) {
          nextRow[c] = val;
          continue;
        }

        let sumWeights = wCenter;
        let weightedSum = val * wCenter;

        const hasUp = r > 0;
        const hasDown = r < nRows - 1;
        const hasLeft = c > 0;
        const hasRight = c < nCols - 1;

        const rowUp = hasUp ? current[r - 1] : null;
        const rowDown = hasDown ? current[r + 1] : null;
        const rowCur = current[r];

        // 4 orthogonal neighbors
        if (hasUp) {
          const nVal = rowUp[c];
          if (typeof nVal === "number" && !isNaN(nVal) && isFinite(nVal)) {
            weightedSum += nVal * wSide;
            sumWeights += wSide;
          }
        }
        if (hasDown) {
          const nVal = rowDown[c];
          if (typeof nVal === "number" && !isNaN(nVal) && isFinite(nVal)) {
            weightedSum += nVal * wSide;
            sumWeights += wSide;
          }
        }
        if (hasLeft) {
          const nVal = rowCur[c - 1];
          if (typeof nVal === "number" && !isNaN(nVal) && isFinite(nVal)) {
            weightedSum += nVal * wSide;
            sumWeights += wSide;
          }
        }
        if (hasRight) {
          const nVal = rowCur[c + 1];
          if (typeof nVal === "number" && !isNaN(nVal) && isFinite(nVal)) {
            weightedSum += nVal * wSide;
            sumWeights += wSide;
          }
        }

        // 4 diagonal neighbors
        if (hasUp && hasLeft) {
          const nVal = rowUp[c - 1];
          if (typeof nVal === "number" && !isNaN(nVal) && isFinite(nVal)) {
            weightedSum += nVal * wDiag;
            sumWeights += wDiag;
          }
        }
        if (hasUp && hasRight) {
          const nVal = rowUp[c + 1];
          if (typeof nVal === "number" && !isNaN(nVal) && isFinite(nVal)) {
            weightedSum += nVal * wDiag;
            sumWeights += wDiag;
          }
        }
        if (hasDown && hasLeft) {
          const nVal = rowDown[c - 1];
          if (typeof nVal === "number" && !isNaN(nVal) && isFinite(nVal)) {
            weightedSum += nVal * wDiag;
            sumWeights += wDiag;
          }
        }
        if (hasDown && hasRight) {
          const nVal = rowDown[c + 1];
          if (typeof nVal === "number" && !isNaN(nVal) && isFinite(nVal)) {
            weightedSum += nVal * wDiag;
            sumWeights += wDiag;
          }
        }

        nextRow[c] = sumWeights > 0 ? weightedSum / sumWeights : val;
      }
      next.push(nextRow);
    }
    current = next;
  }

  if (is2D) {
    return current;
  }

  // Flat output matching input type
  const flatResult =
    Z instanceof Float64Array
      ? new Float64Array(nRows * nCols)
      : new Array(nRows * nCols);
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      flatResult[r * nCols + c] = current[r][c];
    }
  }
  return flatResult;
}

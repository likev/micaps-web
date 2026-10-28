import { parseTimestamp } from "../../utils/timeResolver.js";

export const MAX_OBS_CHIPS = 10;

export function findClosestFile(files, target) {
  if (!Array.isArray(files) || files.length === 0) return "";
  if (files.includes(target)) return target;
  if (!target || typeof target !== "string") return files[files.length - 1];

  const targetMs = parseTimestamp(target);
  if (targetMs === null) return files[files.length - 1];

  let closest = files[files.length - 1];
  let minDiff = Infinity;
  for (const f of files) {
    const fMs = parseTimestamp(f);
    if (fMs !== null) {
      const diff = Math.abs(fMs - targetMs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = f;
      }
    }
  }
  return closest;
}

export function selectObsChipsWindow(files, targetFile = "") {
  if (!Array.isArray(files) || files.length <= MAX_OBS_CHIPS) {
    return Array.isArray(files) ? [...files] : [];
  }
  const idx = targetFile ? files.indexOf(targetFile) : -1;
  if (idx === -1) {
    return files.slice(-MAX_OBS_CHIPS);
  }
  let start = Math.max(0, idx - Math.floor(MAX_OBS_CHIPS / 2));
  if (start + MAX_OBS_CHIPS > files.length) {
    start = files.length - MAX_OBS_CHIPS;
  }
  return files.slice(start, start + MAX_OBS_CHIPS);
}

/** Step options (hours) offered by the step-length select; 0.25 = 15 min (satellite only). */
export function getObsStepOptions({ isUpper = false, isSatellite = false } = {}) {
  if (isUpper) return [12, 24, 6];
  return isSatellite ? [0.25, 1, 3, 6, 12, 24] : [1, 3, 6, 12, 24];
}

export function formatStepLabel(step) {
  const n = parseFloat(step);
  if (!(n > 0)) return "";
  return n < 1 ? `${Math.round(n * 60)}min` : `${n}h`;
}

/** True when a preset group carries FY-4B / satellite imagery layers. */
export function isSatelliteGroup(group) {
  if (!group) return false;
  if (typeof group === "string") {
    const s = group.toUpperCase();
    return s.includes("SATELLITE") || s.includes("FY4") || s.includes("FY-4");
  }
  const id = String(group.id || "").toUpperCase();
  const name = String(group.name || "").toUpperCase();
  const path = String(group.path || "").toUpperCase();
  if (id.includes("SATELLITE") || id.includes("FY4") || id.includes("FY-4") ||
      name.includes("SATELLITE") || name.includes("FY4") || name.includes("FY-4") ||
      path.includes("SATELLITE") || path.includes("FY4") || path.includes("FY-4")) {
    return true;
  }
  const layers = Array.isArray(group.layers) ? group.layers : [];
  return layers.some((l) =>
    l?.model === "SATELLITE" ||
    String(l?.path || "").toUpperCase().includes("FY4") ||
    String(l?.path || "").toUpperCase().includes("SATELLITE") ||
    String(l?.element || "").toUpperCase().includes("FY4")
  );
}

export function getPeriodsForStep(step = 6) {
  const stepNum = parseInt(step, 10) || 6;
  const periods = [0];
  if (stepNum === 1) {
    for (let p = 1; p <= 36; p += 1) periods.push(p);
    for (let p = 39; p <= 72; p += 3) periods.push(p);
  } else if (stepNum === 3) {
    for (let p = 3; p <= 72; p += 3) periods.push(p);
    for (let p = 78; p <= 120; p += 6) periods.push(p);
  } else if (stepNum === 6) {
    for (let p = 6; p <= 120; p += 6) periods.push(p);
    for (let p = 132; p <= 240; p += 12) periods.push(p);
  } else if (stepNum === 12) {
    for (let p = 12; p <= 240; p += 12) periods.push(p);
  } else if (stepNum === 24) {
    for (let p = 24; p <= 240; p += 24) periods.push(p);
  } else {
    for (let p = stepNum; p <= 120; p += stepNum) periods.push(p);
  }
  return periods;
}

export function filterObsFilesByStep(files, stepHours, isUpper = false) {
  if (!Array.isArray(files) || files.length === 0) return [];

  // Steps are expressed in hours; fractional values (0.25 = 15 min) are allowed for sub-hourly products.
  const stepNum = parseFloat(stepHours) || (isUpper ? 12 : 3);

  const getFileHour = (f) => {
    if (typeof f === "string" && f.length >= 10 && /^\d+$/.test(f.slice(0, 10))) {
      return parseInt(f.slice(8, 10), 10);
    }
    const ms = parseTimestamp(f);
    if (ms !== null) {
      return new Date(ms).getUTCHours();
    }
    return -1;
  };
  const getFileMin = (f) => {
    if (typeof f === "string" && f.length >= 12 && /^\d+$/.test(f.slice(0, 12))) {
      return parseInt(f.slice(10, 12), 10);
    }
    const ms = parseTimestamp(f);
    if (ms !== null) {
      return new Date(ms).getUTCMinutes();
    }
    return 0;
  };

  if (isUpper) {
    if (stepNum === 12 || stepNum === 24) {
      if (stepNum === 24) {
        const filtered24 = files.filter((f) => getFileHour(f) === 8);
        if (filtered24.length > 0) return filtered24;
      }
      // ONLY select 08:00 and 20:00 (UTC+8), filter out 14:00 and 02:00
      const filtered = files.filter((f) => {
        const h = getFileHour(f);
        return h === 8 || h === 20;
      });
      return filtered.length > 0 ? filtered : files.filter((f) => {
        const h = getFileHour(f);
        return h !== 2 && h !== 14;
      });
    } else if (stepNum === 6) {
      // 6h upper-air runs: 02:00, 08:00, 14:00, 20:00 (UTC+8)
      const filtered = files.filter((f) => {
        const h = getFileHour(f);
        return h === 2 || h === 8 || h === 14 || h === 20;
      });
      return filtered.length > 0 ? filtered : [...files];
    }
  }

  // Sub-hourly step (e.g. 15 min FY-4B): keep files on the step grid when possible.
  if (stepNum < 1) {
    const stepMin = Math.max(1, Math.round(stepNum * 60));
    const aligned = files.filter((f) => getFileMin(f) % stepMin === 0);
    return aligned.length >= 2 ? aligned : [...files];
  }

  // 1h on sub-hourly data (satellite 15 min, radar 6 min): keep the on-the-hour files only.
  if (stepNum === 1) {
    const hourly = files.filter((f) => getFileMin(f) === 0);
    return hourly.length >= 2 ? hourly : [...files];
  }

  // 3h interval on the hour: prefer standard clock grid (00, 03, 06, 09, 12, 15, 18, 21),
  // fallback to synoptic 3h (02, 05, 08, 11, 14, 17, 20, 23) for surface stations.
  if (stepNum === 3) {
    const standard3 = files.filter((f) => getFileMin(f) === 0 && getFileHour(f) % 3 === 0);
    if (standard3.length >= 2) return standard3;
    const synoptic3 = files.filter((f) => getFileMin(f) === 0 && ((getFileHour(f) + 1) % 3 === 0));
    if (synoptic3.length >= 2) return synoptic3;
  }

  // 6h interval on the hour: prefer standard clock grid (00, 06, 12, 18),
  // fallback to surface synoptic 6h (02, 08, 14, 20).
  if (stepNum === 6) {
    const standard6 = files.filter((f) => getFileMin(f) === 0 && getFileHour(f) % 6 === 0);
    if (standard6.length >= 2) return standard6;
    const synoptic6 = files.filter((f) => {
      const h = getFileHour(f);
      return (h === 2 || h === 8 || h === 14 || h === 20) && getFileMin(f) === 0;
    });
    if (synoptic6.length >= 2) return synoptic6;
  }

  // 12h interval on the hour: prefer standard clock grid (00, 12),
  // fallback to surface synoptic 12h (08, 20).
  if (stepNum === 12) {
    const standard12 = files.filter((f) => getFileMin(f) === 0 && getFileHour(f) % 12 === 0);
    if (standard12.length >= 2) return standard12;
    const synoptic12 = files.filter((f) => (getFileHour(f) === 8 || getFileHour(f) === 20) && getFileMin(f) === 0);
    if (synoptic12.length >= 2) return synoptic12;
  }

  // 24h interval on the hour: prefer standard midnight (00:00),
  // fallback to surface synoptic 24h (08:00).
  if (stepNum === 24) {
    const standard24 = files.filter((f) => getFileMin(f) === 0 && getFileHour(f) === 0);
    if (standard24.length >= 2) return standard24;
    const synoptic24 = files.filter((f) => getFileHour(f) === 8 && getFileMin(f) === 0);
    if (synoptic24.length >= 2) return synoptic24;
  }

  // Fallback for general or arbitrary hourly step: always restrict to on-the-hour files
  // when available so sub-hourly data never lands on :30 / :15.
  const hourlyFiles = files.filter((f) => getFileMin(f) === 0);
  const candidates = hourlyFiles.length >= 2 ? hourlyFiles : files;

  const filtered = [];
  let lastTimeMs = 0;
  const minIntervalMs = stepNum * 3600000 - 60000;
  for (const file of candidates) {
    const timeMs = parseTimestamp(file);
    if (timeMs !== null) {
      if (lastTimeMs === 0 || Math.abs(timeMs - lastTimeMs) >= minIntervalMs) {
        filtered.push(file);
        lastTimeMs = timeMs;
      }
    } else {
      filtered.push(file);
    }
  }
  return filtered.length > 0 ? filtered : [...files];
}

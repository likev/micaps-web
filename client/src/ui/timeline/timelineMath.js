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

  const stepNum = parseInt(stepHours, 10) || (isUpper ? 12 : 3);

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

  // Surface synoptic 24h interval: 08:00 UTC+8 daily
  if (stepNum === 24) {
    const synoptic24 = files.filter((f) => getFileHour(f) === 8 && getFileMin(f) === 0);
    if (synoptic24.length >= 2) return synoptic24;
  }

  // Surface synoptic 12h interval: 08:00 and 20:00 UTC+8
  if (stepNum === 12) {
    const synoptic12 = files.filter((f) => (getFileHour(f) === 8 || getFileHour(f) === 20) && getFileMin(f) === 0);
    if (synoptic12.length >= 2) return synoptic12;
  }

  // Surface synoptic 6h interval: 02:00, 08:00, 14:00, 20:00 UTC+8
  if (stepNum === 6) {
    const synoptic6 = files.filter((f) => {
      const h = getFileHour(f);
      return (h === 2 || h === 8 || h === 14 || h === 20) && getFileMin(f) === 0;
    });
    if (synoptic6.length >= 2) return synoptic6;
  }

  if (stepNum <= 1) return [...files];

  const filtered = [];
  let lastTimeMs = 0;
  for (const file of files) {
    const timeMs = parseTimestamp(file);
    if (timeMs !== null) {
      if (lastTimeMs === 0 || Math.abs(timeMs - lastTimeMs) >= (stepNum * 3600000 - 1800000)) {
        filtered.push(file);
        lastTimeMs = timeMs;
      }
    } else {
      filtered.push(file);
    }
  }
  return filtered.length > 0 ? filtered : [...files];
}

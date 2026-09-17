export const MAX_OBS_CHIPS = 10;

export function findClosestFile(files, target) {
  if (!Array.isArray(files) || files.length === 0) return "";
  if (files.includes(target)) return target;
  if (!target || typeof target !== "string" || target.length < 10) return files[files.length - 1];

  const tYear = parseInt(target.slice(0, 4), 10);
  const tMonth = parseInt(target.slice(4, 6), 10) - 1;
  const tDay = parseInt(target.slice(6, 8), 10);
  const tHour = parseInt(target.slice(8, 10), 10);
  const tMin = parseInt(target.slice(10, 12) || "0", 10);
  const targetMs = Date.UTC(tYear, tMonth, tDay, tHour, tMin);

  let closest = files[files.length - 1];
  let minDiff = Infinity;
  for (const f of files) {
    if (typeof f === "string" && f.length >= 10) {
      const y = parseInt(f.slice(0, 4), 10);
      const m = parseInt(f.slice(4, 6), 10) - 1;
      const d = parseInt(f.slice(6, 8), 10);
      const h = parseInt(f.slice(8, 10), 10);
      const mn = parseInt(f.slice(10, 12) || "0", 10);
      const diff = Math.abs(Date.UTC(y, m, d, h, mn) - targetMs);
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

  if (isUpper) {
    if (stepNum === 12 || stepNum === 24) {
      if (stepNum === 24) {
        const filtered24 = files.filter((f) => {
          if (f.length < 10) return false;
          const hour = parseInt(f.slice(8, 10), 10);
          return hour === 8;
        });
        if (filtered24.length > 0) return filtered24;
      }
      // ONLY select 08:00 and 20:00 (UTC+8), filter out 14:00 and 02:00
      const filtered = files.filter((f) => {
        if (f.length < 10) return false;
        const hour = parseInt(f.slice(8, 10), 10);
        return hour === 8 || hour === 20;
      });
      return filtered.length > 0 ? filtered : files.filter((f) => {
        const hour = parseInt(f.slice(8, 10), 10);
        return hour !== 2 && hour !== 14;
      });
    } else if (stepNum === 6) {
      // 6h upper-air runs: 02:00, 08:00, 14:00, 20:00 (UTC+8)
      const filtered = files.filter((f) => {
        if (f.length < 10) return false;
        const hour = parseInt(f.slice(8, 10), 10);
        return hour === 2 || hour === 8 || hour === 14 || hour === 20;
      });
      return filtered.length > 0 ? filtered : [...files];
    }
  }

  // Surface synoptic 24h interval: 08:00 UTC+8 daily
  if (stepNum === 24) {
    const synoptic24 = files.filter((f) => {
      if (f.length < 10) return false;
      const hour = parseInt(f.slice(8, 10), 10);
      const min = parseInt(f.slice(10, 12) || "0", 10);
      return hour === 8 && min === 0;
    });
    if (synoptic24.length >= 2) return synoptic24;
  }

  // Surface synoptic 12h interval: 08:00 and 20:00 UTC+8
  if (stepNum === 12) {
    const synoptic12 = files.filter((f) => {
      if (f.length < 10) return false;
      const hour = parseInt(f.slice(8, 10), 10);
      const min = parseInt(f.slice(10, 12) || "0", 10);
      return (hour === 8 || hour === 20) && min === 0;
    });
    if (synoptic12.length >= 2) return synoptic12;
  }

  // Surface synoptic 6h interval: 02:00, 08:00, 14:00, 20:00 UTC+8
  if (stepNum === 6) {
    const synoptic6 = files.filter((f) => {
      if (f.length < 10) return false;
      const hour = parseInt(f.slice(8, 10), 10);
      const min = parseInt(f.slice(10, 12) || "0", 10);
      return (hour === 2 || hour === 8 || hour === 14 || hour === 20) && min === 0;
    });
    if (synoptic6.length >= 2) return synoptic6;
  }

  if (stepNum <= 1) return [...files];

  const filtered = [];
  let lastTimeMs = 0;
  for (const file of files) {
    if (file.length >= 10) {
      const year = parseInt(file.slice(0, 4), 10);
      const month = parseInt(file.slice(4, 6), 10) - 1;
      const day = parseInt(file.slice(6, 8), 10);
      const hour = parseInt(file.slice(8, 10), 10);
      const min = parseInt(file.slice(10, 12) || "0", 10);
      const timeMs = Date.UTC(year, month, day, hour, min);
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

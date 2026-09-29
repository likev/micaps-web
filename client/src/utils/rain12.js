// rain12.js - Detection helpers for precipitation accumulation (RAIN01, RAIN03, RAIN06, RAIN12, RAIN24) elements and windows

const SUPPORTED_ACCUMULATION_HOURS = [1, 3, 6, 12, 24, 48, 72];

export function getRainAccumulationHours(name) {
  if (!name || typeof name !== "string") return null;
  const up = name.trim().toUpperCase();

  // Pattern 1: RAIN/APCP/PRECIP/TP prefix followed by accumulation digits,
  // e.g. RAIN01, RAIN1, RAIN001, RAIN_06, RAIN-12, RAIN24, RAIN012, RAIN024, RAIN24H, dark-rain24.xml, ECMWF_HR/RAIN12
  const match1 = up.match(/(?:^|[^A-Z0-9])(?:RAIN|APCP|PRECIP|TP)[-_]?(\d+)(?:H(?:RS?)?)?(?![0-9])/i);
  if (match1) {
    const hours = parseInt(match1[1], 10);
    if (SUPPORTED_ACCUMULATION_HOURS.includes(hours)) return hours;
  }

  // Pattern 2: Digits followed by hour and rain/precip/accum,
  // e.g. "12h Rain", "24-hr Precip", "6h Accumulation", "3-hour rain"
  const match2 = up.match(/(?:^|[^A-Z0-9])(\d+)\s*[-_]?(?:H|HR|HRS|HOUR|HOURS)\s*[-_]?(?:RAIN|PRECIP|ACCUM)/i);
  if (match2) {
    const hours = parseInt(match2[1], 10);
    if (SUPPORTED_ACCUMULATION_HOURS.includes(hours)) return hours;
  }

  return null;
}

export function getRainAccumulationHoursForWindow(win) {
  if (!win) return null;
  const direct =
    getRainAccumulationHours(win.element) ??
    getRainAccumulationHours(win.activeGroup?.id) ??
    getRainAccumulationHours(win.activeGroup?.name);
  if (direct !== null) return direct;

  if (Array.isArray(win.activeGroup?.layers)) {
    for (const l of win.activeGroup.layers) {
      if (!l) continue;
      const h =
        getRainAccumulationHours(l.element) ??
        getRainAccumulationHours(l.id) ??
        getRainAccumulationHours(l.path);
      if (h !== null) return h;
    }
  }

  if (Array.isArray(win.layers)) {
    for (const l of win.layers) {
      if (!l) continue;
      const h =
        getRainAccumulationHours(l.element) ??
        getRainAccumulationHours(l.id) ??
        getRainAccumulationHours(l.path);
      if (h !== null) return h;
    }
  }

  if (typeof win.id === "string") {
    const h = getRainAccumulationHours(win.id);
    if (h !== null) return h;
  }

  return null;
}

export function isRain12Element(name) {
  return getRainAccumulationHours(name) === 12;
}

export function isWindowRain12(win) {
  return getRainAccumulationHoursForWindow(win) === 12;
}

export function isRain01Element(name) {
  return getRainAccumulationHours(name) === 1;
}

export function isWindowRain01(win) {
  return getRainAccumulationHoursForWindow(win) === 1;
}

export function isRain03Element(name) {
  return getRainAccumulationHours(name) === 3;
}

export function isWindowRain03(win) {
  return getRainAccumulationHoursForWindow(win) === 3;
}

export function isRain06Element(name) {
  return getRainAccumulationHours(name) === 6;
}

export function isWindowRain06(win) {
  return getRainAccumulationHoursForWindow(win) === 6;
}

export function isRain24Element(name) {
  return getRainAccumulationHours(name) === 24;
}

export function isWindowRain24(win) {
  return getRainAccumulationHoursForWindow(win) === 24;
}

export function isRainAccumulationElement(name) {
  return getRainAccumulationHours(name) !== null;
}

export function isWindowRainAccumulation(win) {
  return getRainAccumulationHoursForWindow(win) !== null;
}

export function getDisabledPeriodsForRain(rainHours, discretePeriods = null) {
  if (!rainHours || typeof rainHours !== "number" || rainHours <= 0) return [];
  if (Array.isArray(discretePeriods) && discretePeriods.length > 0) {
    return discretePeriods.filter((p) => Number(p) < rainHours);
  }
  // Default fallback for standard discrete forecast intervals:
  const result = [];
  for (let p = 0; p < rainHours; p += 6) {
    result.push(p);
  }
  return result.length > 0 ? result : [0];
}

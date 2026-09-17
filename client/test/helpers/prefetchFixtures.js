// prefetchFixtures.js - Test window and timeline fixtures for prefetch test suites

export function makeNwpWin(overrides = {}) {
  return {
    id: overrides.id || "win-nwp",
    period: overrides.period ?? 24,
    level: overrides.level ?? 500,
    forecastCycle: overrides.forecastCycle || "26082820",
    isObservation: overrides.isObservation ?? false,
    activeGroup: overrides.activeGroup || {
      id: "ecmwf-500",
      name: "500 hPa Height & Temperature (ECMWF)",
      hasLevel: true,
      defaultLevel: 500,
      layers: [
        { type: "contour", model: "ECMWF_HR", element: "HGT", level: 500 },
        { type: "contour", model: "ECMWF_HR", element: "TMP", level: 500 },
      ],
    },
    layers: overrides.layers || [],
  };
}

export function makeTimelineSteps(overrides = {}) {
  return {
    mode: overrides.mode || "nwp",
    periods: overrides.periods || { prev: 18, current: 24, next: 30, cycle: "26082820" },
    ...overrides,
  };
}

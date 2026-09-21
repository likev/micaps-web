// appCore.js - Plain-core application state definitions and helpers
export function createInitialAppState() {
  return {
    model: "ECMWF_HR",
    element: "TMP",
    level: 850,
    activeGroup: null,
    activeWinId: null,
    cycle: "26082708.024",
    period: 24,
    obsTime: null,
    isObservation: false,
    availableLevels: [1000, 925, 850, 700, 500, 400, 300, 200, 100],
    availableFiles: [],

    layers: {
      pmtiles: true,
      contour: true,
      contourf: true,
      raster: false,
      wind: false,
      station: true,
      graticule: true,
    },
    opacity: {
      contourf: 0.75,
      raster: 0.85,
    },

    gridData: null,
    stationData: null,

    isPlaying: false,
    playbackSpeed: 1500,

    status: "connecting",
    isMock: false,
  };
}

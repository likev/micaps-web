// stationState.js - Per-map WeakMap state management and global test handle

export const mapState = new WeakMap();
export let lastStationGeoJSON = null;

export function setLastStationGeoJSON(geojson) {
  lastStationGeoJSON = geojson;
}

export function getLastStationGeoJSON() {
  return lastStationGeoJSON;
}

export function getState(map) {
  if (!mapState.has(map)) {
    mapState.set(map, {
      canvas: null,
      ctx: null,
      animId: null,
      hoverAnimId: null,
      lastHoverEvent: null,
      activeBins: new Map(),
      currentScale: 1.0,
      geojson: null,
      visible: true,
      activeVisibleStations: [],
      renderedCount: 0,
      config: {
        showTemp: true,
        showDewpoint: true,
        showWind: true,
        showDTD: false,
        showCloud: false,
        showWeather: false,
        showPressure: false,
        showTendency: false,
        showVisibility: false,
        showRain6: false,
        filterField1: "none",
        filterOp1: ">",
        filterVal1: "",
        filterLogic: "VIEW",
        filterField2: "none",
        filterOp2: "<",
        filterVal2: "",
        __themeId: "dark",
      },
      moveListener: null,
      mouseMoveListener: null,
      mouseOutListener: null,
    });
  }
  return mapState.get(map);
}

export function getStationGeoJSON(map = null) {
  if (map && mapState.has(map)) {
    return mapState.get(map).geojson || null;
  }
  return lastStationGeoJSON || null;
}

export function clearStationMarkersForMap(_map) {
  // Direct Canvas 2D mode retains no separate DOM marker elements to clear
}

const targetGlobal = typeof window !== "undefined" ? window : globalThis;
if (!targetGlobal.__STATION_LAYER__) {
  targetGlobal.__STATION_LAYER__ = {
    getVisibleCount: (map = null) => {
      if (map && mapState.has(map)) {
        return mapState.get(map).renderedCount || 0;
      }
      if (targetGlobal.__MAP__ && mapState.has(targetGlobal.__MAP__)) {
        return mapState.get(targetGlobal.__MAP__).renderedCount || 0;
      }
      return 0;
    },
    getTotalCount: () => {
      if (targetGlobal.__MAP__) {
        const s = mapState.get(targetGlobal.__MAP__);
        if (s && s.geojson && s.geojson.features) return s.geojson.features.length;
      }
      return lastStationGeoJSON && lastStationGeoJSON.features ? lastStationGeoJSON.features.length : 0;
    },
    setVisible: (map, visible) => {
      if (map && mapState.has(map)) {
        mapState.get(map).visible = Boolean(visible);
      }
    },
  };
}

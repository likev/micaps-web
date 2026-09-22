// layerDefaults.js - Default configurations and factories for weather and basemap layers

export function isWindRelated(layer) {
  if (!layer) return false;
  if (layer.type === "wind") return true;
  const elem = (layer.element || "").toUpperCase();
  if (elem === "WIND" || elem === "UV" || elem === "WND" || elem === "WIN" || elem === "FF" || elem === "WS") return true;
  const id = (layer.id || "").toLowerCase();
  if (id.includes("wind") || id.includes("streamline")) return true;
  const name = (layer.name || "").toLowerCase();
  if (name.includes("wind") || name.includes("streamline") || name.includes("风")) return true;
  return false;
}

export function isUpperAirStationLayer(layer) {
  if (!layer) return false;
  if (layer.model === "UPPER_AIR") return true;
  const id = (layer.id || "").toLowerCase();
  const name = (layer.name || "").toLowerCase();
  if (
    id.includes("upper") ||
    id.includes("sounding") ||
    name.includes("upper") ||
    name.includes("sounding") ||
    name.includes("高空") ||
    name.includes("探空")
  ) {
    return true;
  }
  return false;
}

export function resolveDefaultScheme() {
  try {
    const s = localStorage.getItem("micaps-basemap-scheme");
    if (s === "light" || s === "dark" || s === "micaps") return s;
  } catch {}
  try {
    const cfg = typeof window !== "undefined" ? window.__MICAPS_CONFIG__ : null;
    if (cfg?.basemap?.scheme) return cfg.basemap.scheme;
  } catch {}
  try {
    if (typeof document !== "undefined") {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr === "light" || attr === "dark") return attr;
    }
  } catch {}
  return "dark";
}

export function resolveDefaultProjection() {
  try {
    const cfg = (typeof window !== "undefined" ? window.__MICAPS_CONFIG__ : null) || (typeof globalThis !== "undefined" ? globalThis.__MICAPS_CONFIG__ : null);
    if (cfg?.basemap?.projection && (cfg.basemap.projection === "mercator" || cfg.basemap.projection === "globe" || cfg.basemap.projection === "vertical-perspective")) {
      return cfg.basemap.projection;
    }
  } catch {}
  try {
    const p = typeof localStorage !== "undefined" ? localStorage.getItem("micaps-map-projection") : null;
    if (p === "mercator" || p === "globe" || p === "vertical-perspective") return p;
  } catch {}
  return "mercator";
}

export function createDefaultLayers(winId = "default") {
  const cfg = typeof window !== "undefined" ? window.__MICAPS_CONFIG__?.basemap : null;
  return [
    {
      id: `layer-pmtiles-${winId}`,
      rawId: "pmtiles",
      name: "China Vector Basemap",
      type: "pmtiles",
      visible: true,
      removable: false,
      color: "#238636",
      isExpanded: false,
      config: {
        showGraticule: cfg?.showGraticule !== undefined ? cfg.showGraticule : true,
        showWorld: cfg?.showWorld !== undefined ? cfg.showWorld : true,
        showProvinces: cfg?.showProvinces !== undefined ? cfg.showProvinces : true,
        showCities: cfg?.showCities !== undefined ? cfg.showCities : true,
        scheme: cfg?.scheme || resolveDefaultScheme(),
        projection: cfg?.projection || resolveDefaultProjection(),
      },
    },
  ];
}

export function buildBaseConfig(layerDef) {
  if (layerDef.type === "station") {
    if (isUpperAirStationLayer(layerDef)) {
      return {
        showTemp: layerDef.config?.showTemp !== undefined ? layerDef.config.showTemp : true,
        showDewpoint: layerDef.config?.showDewpoint !== undefined ? layerDef.config.showDewpoint : true,
        showPressure: layerDef.config?.showPressure !== undefined ? layerDef.config.showPressure : true,
        showWind: layerDef.config?.showWind !== undefined ? layerDef.config.showWind : true,
        showDTD: layerDef.config?.showDTD !== undefined ? layerDef.config.showDTD : false,
        showStreamlines: layerDef.config?.showStreamlines !== undefined ? layerDef.config.showStreamlines : false,
        filterField1: layerDef.config?.filterField1 || "none",
        filterOp1: layerDef.config?.filterOp1 || ">=",
        filterVal1: layerDef.config?.filterVal1 !== undefined ? layerDef.config.filterVal1 : "",
        filterLogic: layerDef.config?.filterLogic || "none",
        filterField2: layerDef.config?.filterField2 || "none",
        filterOp2: layerDef.config?.filterOp2 || "<=",
        filterVal2: layerDef.config?.filterVal2 !== undefined ? layerDef.config.filterVal2 : "",
      };
    }
    return {
      showTemp: layerDef.config?.showTemp !== undefined ? layerDef.config.showTemp : true,
      showDewpoint: layerDef.config?.showDewpoint !== undefined ? layerDef.config.showDewpoint : true,
      showWind: layerDef.config?.showWind !== undefined ? layerDef.config.showWind : true,
      showCloud: layerDef.config?.showCloud !== undefined ? layerDef.config.showCloud : false,
      showWeather: layerDef.config?.showWeather !== undefined ? layerDef.config.showWeather : false,
      showPressure: layerDef.config?.showPressure !== undefined ? layerDef.config.showPressure : false,
      showTendency: layerDef.config?.showTendency !== undefined ? layerDef.config.showTendency : false,
      showVisibility: layerDef.config?.showVisibility !== undefined ? layerDef.config.showVisibility : false,
      showRain6: layerDef.config?.showRain6 !== undefined ? layerDef.config.showRain6 : false,
      showDTD: layerDef.config?.showDTD !== undefined ? layerDef.config.showDTD : false,
      showStreamlines: layerDef.config?.showStreamlines !== undefined ? layerDef.config.showStreamlines : false,
      filterField1: layerDef.config?.filterField1 || "none",
      filterOp1: layerDef.config?.filterOp1 || ">",
      filterVal1: layerDef.config?.filterVal1 !== undefined ? layerDef.config.filterVal1 : "",
      filterLogic: layerDef.config?.filterLogic || "none",
      filterField2: layerDef.config?.filterField2 || "none",
      filterOp2: layerDef.config?.filterOp2 || "<",
      filterVal2: layerDef.config?.filterVal2 !== undefined ? layerDef.config.filterVal2 : "",
    };
  }

  if (layerDef.type === "wind") {
    return {
      showWind: layerDef.config?.showWind !== undefined ? layerDef.config.showWind : true,
      showBarbs: layerDef.config?.showBarbs !== undefined ? layerDef.config.showBarbs : false,
      showRaster: layerDef.config?.showRaster !== undefined ? layerDef.config.showRaster : false,
      palettePath: layerDef.config?.palettePath || null,
    };
  }

  if (layerDef.type === "tlogp") {
    return {
      stationId: layerDef.config?.stationId || layerDef.stationId || "58362",
      parcelLevel: layerDef.config?.parcelLevel || "surface",
      showTemp: layerDef.config?.showTemp !== false,
      showDewpoint: layerDef.config?.showDewpoint !== false,
      showWind: layerDef.config?.showWind !== false,
      showParcel: layerDef.config?.showParcel !== false,
      showDryAdiabats: layerDef.config?.showDryAdiabats !== false,
      showMoistAdiabats: layerDef.config?.showMoistAdiabats !== false,
      showMixingRatio: layerDef.config?.showMixingRatio !== false,
      showIndices: layerDef.config?.showIndices !== false,
      ...(layerDef.config || {}),
    };
  }

  if (layerDef.type === "timeheight") {
    return {
      lon: layerDef.config?.lon !== undefined ? layerDef.config.lon : 121.5,
      lat: layerDef.config?.lat !== undefined ? layerDef.config.lat : 31.4,
      mode: layerDef.config?.mode === "line" ? "line" : "point",
      lon0: layerDef.config?.lon0 !== undefined ? layerDef.config.lon0 : 115.0,
      lat0: layerDef.config?.lat0 !== undefined ? layerDef.config.lat0 : 28.0,
      lon1: layerDef.config?.lon1 !== undefined ? layerDef.config.lon1 : 125.0,
      lat1: layerDef.config?.lat1 !== undefined ? layerDef.config.lat1 : 38.0,
      npoints: layerDef.config?.npoints !== undefined ? layerDef.config.npoints : 41,
      initCycle: layerDef.config?.initCycle || null,
      startHour: layerDef.config?.startHour !== undefined ? layerDef.config.startHour : 0,
      endHour: layerDef.config?.endHour !== undefined ? layerDef.config.endHour : 144,
      stepHours: layerDef.config?.stepHours !== undefined ? layerDef.config.stepHours : 12,
      timeDirection: layerDef.config?.timeDirection || "ltr",
      levels: layerDef.config?.levels || [1000, 925, 850, 700, 500, 400, 300, 250, 200, 100],
      showRH: layerDef.config?.showRH !== false,
      showTemp: layerDef.config?.showTemp !== false,
      showVVel: layerDef.config?.showVVel !== false,
      showWind: layerDef.config?.showWind !== false,
      showGridPointMarker: layerDef.config?.showGridPointMarker !== false,
      ...(layerDef.config || {}),
    };
  }

  if (layerDef.type === "lineheight") {
    return {
      lon0: layerDef.config?.lon0 !== undefined ? layerDef.config.lon0 : 115.0,
      lat0: layerDef.config?.lat0 !== undefined ? layerDef.config.lat0 : 28.0,
      lon1: layerDef.config?.lon1 !== undefined ? layerDef.config.lon1 : 125.0,
      lat1: layerDef.config?.lat1 !== undefined ? layerDef.config.lat1 : 38.0,
      npoints: layerDef.config?.npoints !== undefined ? layerDef.config.npoints : 41,
      lead: layerDef.config?.lead !== undefined ? layerDef.config.lead : null,
      initCycle: layerDef.config?.initCycle || null,
      levels: layerDef.config?.levels || [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200],
      flipDirection: layerDef.config?.flipDirection || false,
      showRH: layerDef.config?.showRH !== false,
      showTemp: layerDef.config?.showTemp !== false,
      showVVel: layerDef.config?.showVVel !== false,
      showWind: layerDef.config?.showWind !== false,
      showTransectMarker: layerDef.config?.showTransectMarker !== false,
      ...(layerDef.config || {}),
    };
  }

  if (layerDef.type === "hovmoller") {
    return {
      lon0: layerDef.config?.lon0 !== undefined ? layerDef.config.lon0 : 115.0,
      lat0: layerDef.config?.lat0 !== undefined ? layerDef.config.lat0 : 28.0,
      lon1: layerDef.config?.lon1 !== undefined ? layerDef.config.lon1 : 125.0,
      lat1: layerDef.config?.lat1 !== undefined ? layerDef.config.lat1 : 38.0,
      npoints: layerDef.config?.npoints !== undefined ? layerDef.config.npoints : 41,
      initCycle: layerDef.config?.initCycle || null,
      startHour: layerDef.config?.startHour !== undefined ? layerDef.config.startHour : 0,
      endHour: layerDef.config?.endHour !== undefined ? layerDef.config.endHour : 144,
      stepHours: layerDef.config?.stepHours !== undefined ? layerDef.config.stepHours : 12,
      level: layerDef.config?.level !== undefined ? layerDef.config.level : 850,
      axisSwap: layerDef.config?.axisSwap || "dist-x",
      timeDir: layerDef.config?.timeDir || "fwd",
      showRH: layerDef.config?.showRH !== false,
      showTemp: layerDef.config?.showTemp !== false,
      showVVel: layerDef.config?.showVVel !== false,
      showWind: layerDef.config?.showWind !== false,
      showTransectMarker: layerDef.config?.showTransectMarker !== false,
      ...(layerDef.config || {}),
    };
  }

  return {
    showFill:
      layerDef.config?.showFill !== undefined
        ? layerDef.config.showFill
        : layerDef.element !== "HGT" &&
          layerDef.element !== "DTD" &&
          layerDef.element !== "VOR" &&
          layerDef.element !== "DIV" &&
          layerDef.type !== "wind",
    showLine:
      layerDef.config?.showLine !== undefined
        ? layerDef.config.showLine
        : layerDef.element === "DTD"
        ? false
        : true,
    opacity: layerDef.config?.opacity || 0.75,
    lineColor:
      layerDef.config?.lineColor ||
      (layerDef.element === "HGT"
        ? "#58a6ff"
        : layerDef.element === "TMP"
        ? "#f85149"
        : layerDef.element === "DTD"
        ? "#e3b341"
        : layerDef.element === "VOR"
        ? "#c678dd"
        : layerDef.element === "DIV"
        ? "#56d4dd"
        : "#ffffff"),
    lineWidth: layerDef.config?.lineWidth !== undefined ? layerDef.config.lineWidth : 2.0,
    boldValues:
      layerDef.config?.boldValues ||
      (layerDef.element === "HGT"
        ? [5880, 588]
        : layerDef.element === "SLP"
        ? [1010]
        : layerDef.element === "TMP"
        ? [0]
        : layerDef.element === "DTD"
        ? [2, 10]
        : layerDef.element === "VOR"
        ? [0, 10]
        : layerDef.element === "DIV"
        ? [0]
        : []),
    boldLineWidth: layerDef.config?.boldLineWidth !== undefined ? layerDef.config.boldLineWidth : 4.0,
    showWind: layerDef.config?.showWind !== undefined ? layerDef.config.showWind : false,
    showBarbs: layerDef.config?.showBarbs !== undefined ? layerDef.config.showBarbs : false,
    showRaster:
      layerDef.config?.showRaster !== undefined
        ? layerDef.config.showRaster
        : layerDef.element === "DTD"
        ? true
        : false,
    palettePath: layerDef.config?.palettePath || null,
    interval: layerDef.config?.interval || null,
    levels: layerDef.config?.levels || null,
    ...(layerDef.config || {}),
  };
}


// mapInstance.js - MapLibre GL map setup with PMTiles integration
import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import { getPMTilesStyle, applyBasemapScheme, getBasemapScheme } from "./pmtilesLayers.js";
import { addGraticuleLayers, updateGraticuleScheme } from "./graticule.js";

/**
 * Disarms MapLibre GL v5's internal ProjectionErrorMeasurement subsystem.
 *
 * In MapLibre GL JS v5.x (Globe & Vertical-Perspective projections), ProjectionErrorMeasurement
 * runs an offscreen 1x1 GPU readback loop using a WebGL2 PIXEL_PACK_BUFFER (STREAM_READ) and fenceSync
 * to calibrate GPU atan() inaccuracies. On modern browsers (Chrome/Edge ANGLE), rapid re-renders or frame
 * pauses cause subsequent writes into the PBO before the previous fence is read back, invalidating
 * the driver's readback staging shadow copy and emitting:
 *   "performance warning: READ-usage buffer was written, then fenced, but written again before being read back.
 *    This discarded the shadow copy that was created to accelerate readback."
 * (Tracked in MapLibre Issue #7872 and removed upstream in PR #7916).
 *
 * Disarming updateGPUdependent prevents PBO allocation, fence leaks, and shadow-copy invalidation.
 */
export function disarmProjectionErrorMeasurement(projection) {
  if (!projection) return;
  if (typeof projection.updateGPUdependent === "function") {
    projection.updateGPUdependent = () => {};
  }
  if (projection._verticalPerspectiveProjection) {
    disarmProjectionErrorMeasurement(projection._verticalPerspectiveProjection);
  }
  const proto = Object.getPrototypeOf(projection);
  if (proto && typeof proto.updateGPUdependent === "function") {
    proto.updateGPUdependent = () => {};
  }
}

// Auto-patch MapLibre Style prototype once on import
if (typeof maplibregl !== "undefined" && maplibregl?.Style?.prototype?._setProjectionInternal) {
  const origSetProjectionInternal = maplibregl.Style.prototype._setProjectionInternal;
  maplibregl.Style.prototype._setProjectionInternal = function (name) {
    const res = origSetProjectionInternal.call(this, name);
    disarmProjectionErrorMeasurement(this.projection);
    return res;
  };
}

let protocolRegistered = false;
let activeMap = null;

export function ensurePMTilesProtocol() {
  if (!protocolRegistered) {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    protocolRegistered = true;
  }
}

export const MAP_PROJECTIONS = [
  { id: "mercator", name: "Mercator (2D)", icon: "🗺️" },
  { id: "globe", name: "Globe (3D)", icon: "🌍" },
  { id: "vertical-perspective", name: "Perspective (3D)", icon: "🪐" },
];

export function resolveInitialProjection() {
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("micaps-map-projection") : null;
    if (stored && (stored === "mercator" || stored === "globe" || stored === "vertical-perspective")) return stored;
  } catch {}
  try {
    const cfg = typeof window !== "undefined" ? window.__MICAPS_CONFIG__ : null;
    if (cfg?.basemap?.projection) return cfg.basemap.projection;
  } catch {}
  return "mercator";
}

export function resolveInitialBasemapScheme() {
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("micaps-basemap-scheme") : null;
    if (stored && (stored === "dark" || stored === "light")) return stored;
  } catch {}
  try {
    // also check CURRENT_CONFIG if already loaded (dynamic import to avoid circular dep)
    const cfg = typeof window !== "undefined" ? window.__MICAPS_CONFIG__ : null;
    if (cfg?.basemap?.scheme) return cfg.basemap.scheme;
  } catch {}
  if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

export function resolvePMTilesUrl(url) {
  const origin = typeof window !== "undefined" && window.location ? window.location.origin : "http://localhost:8088";
  if (typeof url !== "string" || !url.trim()) return `${origin}/map-china.pmtiles`;
  const clean = url.trim();
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean;
  }
  if (clean.startsWith("/")) {
    return `${origin}${clean}`;
  }
  const filename = clean.endsWith(".pmtiles") ? clean : `${clean}.pmtiles`;
  return `${origin}/${filename}`;
}

export function createMapInstance(containerIdOrEl, options = {}) {
  ensurePMTilesProtocol();

  const pmtilesUrl = resolvePMTilesUrl(options.pmtilesUrl);
  const schemeName = options.scheme || options.basemapScheme || resolveInitialBasemapScheme();
  const projectionType = options.projection || resolveInitialProjection();

  const mapInstance = new maplibregl.Map({
    container: containerIdOrEl,
    style: getPMTilesStyle(pmtilesUrl, schemeName, projectionType),
    center: options.center || [108.0, 34.0],
    zoom: options.zoom || 4.2,
    minZoom: 2,
    maxZoom: 14,
    attributionControl: false,
    keyboard: false,
  });

  if (mapInstance.keyboard) {
    mapInstance.keyboard.disable();
  }

  mapInstance.addControl(
    new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
    "top-right"
  );

  mapInstance.on("load", () => {
    addGraticuleLayers(mapInstance, schemeName);
  });

  mapInstance.on("styledata", () => {
    if (mapInstance.style?.projection) {
      disarmProjectionErrorMeasurement(mapInstance.style.projection);
    }
  });

  // expose scheme and projection helpers on instance
  mapInstance.__basemapScheme = schemeName;
  mapInstance.__mapProjection = projectionType;

  return mapInstance;
}

export function setBasemapScheme(map, schemeName) {
  const m = map || getActiveMap();
  if (!m) return;
  const scheme = getBasemapScheme(schemeName);
  if (m.isStyleLoaded && m.isStyleLoaded()) {
    applyBasemapScheme(m, scheme.id);
    updateGraticuleScheme(m, scheme.id);
    m.__basemapScheme = scheme.id;
  } else {
    m.once("load", () => {
      applyBasemapScheme(m, scheme.id);
      updateGraticuleScheme(m, scheme.id);
      m.__basemapScheme = scheme.id;
    });
  }
  try { if (typeof localStorage !== "undefined") localStorage.setItem("micaps-basemap-scheme", scheme.id); } catch {}
  // also persist to CURRENT_CONFIG if available
  try {
    if (typeof window !== "undefined" && window.__MICAPS_CONFIG__) {
      window.__MICAPS_CONFIG__.basemap = { ...(window.__MICAPS_CONFIG__.basemap || {}), scheme: scheme.id };
    }
  } catch {}
}

export function setMapProjection(map, projectionType) {
  const m = map || getActiveMap();
  if (!m) return;
  const proj = projectionType || "mercator";

  const applyProj = () => {
    try {
      if (typeof m.setProjection === "function") {
        m.setProjection({ type: proj });
        if (m.style?.projection) {
          disarmProjectionErrorMeasurement(m.style.projection);
        }
        m.__mapProjection = proj;
        if (typeof m.triggerRepaint === "function") m.triggerRepaint();
        if (typeof m.fire === "function") m.fire("move");
      }
    } catch (err) {
      console.warn("Failed to set projection:", err);
    }
  };

  if (m.isStyleLoaded && m.isStyleLoaded()) {
    applyProj();
  } else {
    m.once("load", applyProj);
  }

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("micaps-map-projection", proj);
    }
  } catch {}
  try {
    if (typeof window !== "undefined" && window.__MICAPS_CONFIG__) {
      window.__MICAPS_CONFIG__.basemap = {
        ...(window.__MICAPS_CONFIG__.basemap || {}),
        projection: proj,
      };
    }
  } catch {}
}

export function getMapProjection(map) {
  const m = map || getActiveMap();
  return m?.__mapProjection || resolveInitialProjection();
}

export function getBasemapSchemeName(map) {
  const m = map || getActiveMap();
  return m?.__basemapScheme || resolveInitialBasemapScheme();
}

export function setActiveMap(map) {
  activeMap = map;
  window.__MAP__ = map;
}

export function getActiveMap() {
  return activeMap || window.__MAP__;
}

export function initMap(containerId = "map-container") {
  const map = createMapInstance(containerId);
  setActiveMap(map);
  map.on("load", () => {
    window.__MAP_LOADED__ = true;
  });
  return map;
}

export function getMap() {
  return getActiveMap();
}

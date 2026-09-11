// mapInstance.js - MapLibre GL map setup with PMTiles integration
import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import { getPMTilesStyle, applyBasemapScheme, getBasemapScheme } from "./pmtilesLayers.js";
import { addGraticuleLayers, updateGraticuleScheme } from "./graticule.js";

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

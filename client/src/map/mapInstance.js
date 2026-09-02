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

export function createMapInstance(containerIdOrEl, options = {}) {
  ensurePMTilesProtocol();

  const pmtilesUrl = `${window.location.origin}/map-china.pmtiles`;
  const schemeName = options.scheme || options.basemapScheme || resolveInitialBasemapScheme();

  const mapInstance = new maplibregl.Map({
    container: containerIdOrEl,
    style: getPMTilesStyle(pmtilesUrl, schemeName),
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

  // expose scheme helper on instance
  mapInstance.__basemapScheme = schemeName;

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

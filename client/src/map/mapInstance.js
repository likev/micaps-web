// mapInstance.js - MapLibre GL map setup with PMTiles integration
import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import { getPMTilesStyle } from "./pmtilesLayers.js";
import { addGraticuleLayers } from "./graticule.js";

let protocolRegistered = false;
let activeMap = null;

export function ensurePMTilesProtocol() {
  if (!protocolRegistered) {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    protocolRegistered = true;
  }
}

export function createMapInstance(containerIdOrEl, options = {}) {
  ensurePMTilesProtocol();

  const pmtilesUrl = `${window.location.origin}/map-china.pmtiles`;

  const mapInstance = new maplibregl.Map({
    container: containerIdOrEl,
    style: getPMTilesStyle(pmtilesUrl),
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
    addGraticuleLayers(mapInstance);
  });

  return mapInstance;
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

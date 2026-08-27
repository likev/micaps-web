// mapInstance.js - MapLibre GL map setup with PMTiles integration
import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";
import { getPMTilesStyle } from "./pmtilesLayers.js";
import { addGraticuleLayers } from "./graticule.js";

let map = null;

export function initMap(containerId = "map-container") {
  // Register pmtiles:// custom protocol
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  const pmtilesUrl = `${window.location.origin}/map-china.pmtiles`;

  map = new maplibregl.Map({
    container: containerId,
    style: getPMTilesStyle(pmtilesUrl),
    center: [108.0, 34.0],
    zoom: 4.2,
    minZoom: 2,
    maxZoom: 14,
    attributionControl: false,
  });

  map.addControl(
    new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
    "top-right"
  );

  map.on("load", () => {
    console.log("[Map] MapLibre style loaded with PMTiles base map");
    addGraticuleLayers(map);
    window.__MAP_LOADED__ = true;
  });

  window.__MAP__ = map;
  return map;
}

export function getMap() {
  return map;
}

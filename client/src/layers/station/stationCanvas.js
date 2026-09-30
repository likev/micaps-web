// stationCanvas.js - Station canvas overlay management, spatial binning, and render loop
import {
  getState,
  lastStationGeoJSON,
  setLastStationGeoJSON,
} from "./stationState.js";
import { hashStation } from "./stationExtract.js";
import { compileStationFilter } from "./stationFilter.js";
import { renderStationPlotToCanvas } from "./stationPlot.js";
import {
  onStationMouseMove,
  handleStationMouseOut,
  handleStationClick,
} from "./stationHover.js";

const reqAnim = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
const cancelAnim = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : (id) => clearTimeout(id);

export function isStationLayerMatch(targetId, entryId, entry = null) {
  if (!targetId || !entryId) return false;
  if (targetId === entryId) return true;

  const t = String(targetId).toLowerCase();
  const e = String(entryId).toLowerCase();

  if (t === e) return true;

  // Surface layer matching: both indicate surface
  const tIsSurface = t.includes("surface");
  const eIsSurface = e.includes("surface");
  if (tIsSurface && eIsSurface) {
    const tHasLag = t.includes("lag") || t.includes("t-") || t.includes("t0") || t.includes("nowcast");
    const eHasLag = e.includes("lag") || e.includes("t-") || e.includes("t0") || e.includes("nowcast");
    if (!tHasLag && !eHasLag) return true;
    if (tHasLag && eHasLag) return t === e;
    return false;
  }

  // Upper-air / Sounding layer matching: both indicate upper-air or sounding
  const tIsUpper = t.includes("upper") || t.includes("sounding");
  const eIsUpper = e.includes("upper") || e.includes("sounding");
  if (tIsUpper && eIsUpper) {
    const tLvl = t.match(/\b\d{3,4}\b/)?.[0];
    const eLvl = e.match(/\b\d{3,4}\b/)?.[0] || (entry?.config?.level ? String(entry.config.level) : null);
    if (tLvl && eLvl) return tLvl === eLvl;
    const tIsTLogP = t.includes("tlogp");
    const eIsTLogP = e.includes("tlogp");
    if (tIsTLogP || eIsTLogP) return tIsTLogP === eIsTLogP;
    return true;
  }

  return false;
}

export function setStationConfig(map, config, layerId = null) {
  if (!map || !config) return;
  const state = getState(map);
  if (!state) return;
  const targetId = layerId || config?.layerId || config?.id;

  let matched = false;
  if (state.stationLayers && state.stationLayers.size > 0) {
    if (targetId && state.stationLayers.has(targetId)) {
      const entry = state.stationLayers.get(targetId);
      entry.config = { ...(entry.config || {}), ...config };
      matched = true;
    } else if (targetId) {
      for (const [id, entry] of state.stationLayers.entries()) {
        if (isStationLayerMatch(targetId, id, entry)) {
          entry.config = { ...(entry.config || {}), ...config };
          matched = true;
        }
      }
    }
    if (!matched && state.stationLayers.size === 1) {
      const entry = state.stationLayers.values().next().value;
      if (entry) {
        entry.config = { ...(entry.config || {}), ...config };
        matched = true;
      }
    }
    if (!matched && !targetId) {
      for (const entry of state.stationLayers.values()) {
        entry.config = { ...(entry.config || {}), ...config };
      }
    }
  }

  state.config = { ...(state.config || {}), ...config };
  updateVisibleMarkersForMap(map);
}

export function ensureStationCanvas(map) {
  if (!map || typeof map.getContainer !== "function") return null;
  const container = map.getContainer();
  if (!container) return null;
  const state = getState(map);
  let canvas = container.querySelector ? container.querySelector(".station-plot-canvas") : null;
  if (!canvas && typeof document !== "undefined" && typeof document.createElement === "function") {
    canvas = document.createElement("canvas");
    canvas.className = "station-plot-canvas";
    if (canvas.style) {
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = "410";
    }
    if (container.appendChild) {
      container.appendChild(canvas);
    }
  }
  if (canvas) {
    state.canvas = canvas;
    if (typeof canvas.getContext === "function") {
      state.ctx = canvas.getContext("2d");
    }
  }
  return canvas;
}

export function getStationCanvas(map) {
  if (!map) return null;
  return getState(map).canvas || null;
}

export function renderStationWeatherPlots(map, geojson, visible = true, config = null, layerId = null) {
  if (!map || !geojson || !geojson.features) return;
  setLastStationGeoJSON(geojson);
  const state = getState(map);
  const id = layerId || config?.layerId || config?.id || "default";
  state.geojson = geojson;
  if (visible !== undefined) state.visible = Boolean(visible);
  if (map.__basemapScheme && !config?.__themeId) {
    state.config.__themeId = map.__basemapScheme;
  }
  const mergedConfig = { ...state.config, ...(config || {}), layerId: id };
  if (config) {
    state.config = mergedConfig;
  }
  if (!state.stationLayers) state.stationLayers = new Map();
  const idLower = String(id).toLowerCase();
  const isUpper = idLower.startsWith("upperair-") || idLower.includes("sounding") || idLower === "station-upper";
  if (isUpper) {
    for (const existingId of Array.from(state.stationLayers.keys())) {
      const eLower = String(existingId).toLowerCase();
      if (existingId !== id && (eLower.startsWith("upperair-") || eLower.includes("sounding") || eLower === "station-upper")) {
        state.stationLayers.delete(existingId);
      }
    }
  }
  const isSurface = idLower.startsWith("surface-") || idLower.includes("surface") || idLower === "station-surface";
  if (isSurface) {
    const idHasLag = idLower.includes("lag") || idLower.includes("t-") || idLower.includes("nowcast");
    if (!idHasLag) {
      for (const existingId of Array.from(state.stationLayers.keys())) {
        const eLower = String(existingId).toLowerCase();
        const eHasLag = eLower.includes("lag") || eLower.includes("t-") || eLower.includes("nowcast");
        if (existingId !== id && !eHasLag && (eLower.startsWith("surface-") || eLower.includes("surface") || eLower === "station-surface")) {
          state.stationLayers.delete(existingId);
        }
      }
    }
  }
  state.stationLayers.set(id, {
    id,
    geojson,
    visible: visible !== undefined ? Boolean(visible) : true,
    config: mergedConfig,
  });

  ensureStationCanvas(map);

  if (state.moveListener && typeof map.off === "function") {
    map.off("move", state.moveListener);
    map.off("zoom", state.moveListener);
    map.off("resize", state.moveListener);
    map.off("moveend", state.moveListener);
    map.off("zoomend", state.moveListener);
  }

  const scheduleDraw = () => {
    if (state.animId) return;
    state.animId = reqAnim(() => {
      state.animId = null;
      drawStationCanvas(map);
    });
  };

  state.moveListener = scheduleDraw;
  if (typeof map.on === "function") {
    map.on("move", scheduleDraw);
    map.on("zoom", scheduleDraw);
    map.on("resize", scheduleDraw);
    map.on("moveend", scheduleDraw);
    map.on("zoomend", scheduleDraw);

    if (!state.mouseMoveListener) {
      state.mouseMoveListener = (e) => onStationMouseMove(map, e);
      state.mouseOutListener = () => handleStationMouseOut(map);
      state.clickListener = (e) => handleStationClick(map, e);
      map.on("mousemove", state.mouseMoveListener);
      map.on("mouseout", state.mouseOutListener);
      map.on("click", state.clickListener);
    }
  }

  updateVisibleMarkersForMap(map);
}

export function drawStationCanvas(map) {
  const state = getState(map);
  const canvas = ensureStationCanvas(map);
  if (!canvas) return false;

  const container = map.getContainer ? map.getContainer() : null;
  if (!container) return false;

  const rect = container.getBoundingClientRect ? container.getBoundingClientRect() : { width: 800, height: 600 };
  const w = Math.round(rect.width) || 800;
  const h = Math.round(rect.height) || 600;
  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const targetW = Math.round(w * dpr);
  const targetH = Math.round(h * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext ? canvas.getContext("2d") : state.ctx;
  if (!ctx) return false;
  state.ctx = ctx;

  if (typeof ctx.setTransform === "function") {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  ctx.clearRect(0, 0, w, h);

  if (map.__basemapScheme && (!state.config.__themeId || state.config.__themeId !== map.__basemapScheme)) {
    state.config.__themeId = map.__basemapScheme;
  }

  // Collect layers to render
  const layersToDraw = [];
  if (state.stationLayers && state.stationLayers.size > 0) {
    for (const l of state.stationLayers.values()) {
      if (l.visible && l.geojson?.features?.length > 0) {
        layersToDraw.push(l);
      }
    }
  } else if (state.visible && state.geojson?.features?.length > 0) {
    layersToDraw.push({ id: "default", geojson: state.geojson, config: state.config, visible: state.visible });
  }

  if (layersToDraw.length === 0) {
    state.activeVisibleStations = [];
    state.activeBins = new Map();
    state.renderedCount = 0;
    return true;
  }

  const bounds = typeof map.getBounds === "function" ? map.getBounds() : null;
  let south = -90, north = 90, west = -180, east = 180, fullWorld = false;
  if (bounds) {
    south = bounds.getSouth();
    north = bounds.getNorth();
    west = bounds.getWest();
    east = bounds.getEast();
    fullWorld = (east - west >= 360);
  }

  const curZoom = typeof map.getZoom === "function" ? map.getZoom() : 5;
  const scale = curZoom < 4.5 ? 0.85 : (curZoom < 6.5 ? 1.0 : 1.15);
  state.currentScale = scale;
  const hasProject = typeof map.project === "function";

  const allVisibleStations = [];
  const activeBins = new Map();

  for (const layerEntry of layersToDraw) {
    const lCfg = layerEntry.config || state.config;
    const isSoftStale = lCfg.status === "soft-stale" || lCfg.isSoftStale;
    const isHardStale = lCfg.status === "hard-stale" || lCfg.isHardStale;
    const filterFn = compileStationFilter(lCfg);
    const screenBins = new Map();

    for (const f of layerEntry.geojson.features) {
      if (!f.geometry || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length < 2) continue;
      const [lon, lat] = f.geometry.coordinates;

      if (bounds) {
        if (lat < south - 1.5 || lat > north + 1.5) continue;
        if (!fullWorld) {
          let normLon = lon;
          while (normLon < west) normLon += 360;
          while (normLon > east) normLon -= 360;
          if (normLon < west || normLon > east) continue;
        }
      }

      if (!filterFn(f.properties || {})) continue;
      if (!hasProject) continue;

      const pt = map.project([lon, lat]);
      if (pt.x < -60 || pt.x > w + 60 || pt.y < -60 || pt.y > h + 60) continue;

      const binKey = `${Math.floor(pt.x / 100)},${Math.floor(pt.y / 100)}`;
      let list = screenBins.get(binKey);
      if (!list) {
        list = [];
        screenBins.set(binKey, list);
      }
      const hash = hashStation(f.properties?.station_id, lon, lat);
      list.push({ feature: f, pt, lon, lat, hash, layerId: layerEntry.id });
    }

    const selectedStations = [];
    for (const [binKey, list] of screenBins.entries()) {
      let chosen;
      if (list.length <= 5) {
        chosen = list;
      } else {
        list.sort((a, b) => a.hash - b.hash);
        chosen = list.slice(0, 5);
      }
      let existingBin = activeBins.get(binKey);
      if (!existingBin) {
        existingBin = [];
        activeBins.set(binKey, existingBin);
      }
      for (let i = 0; i < chosen.length; i++) {
        existingBin.push(chosen[i]);
        selectedStations.push(chosen[i]);
      }
    }

    ctx.save();
    if (isSoftStale) {
      // ~30% desaturation for soft-stale (§2.4)
      if (typeof ctx.filter !== "undefined") {
        ctx.filter = "saturate(70%)";
      }
    } else if (isHardStale) {
      // Hard drop in opacity for hard-stale (§2.4)
      ctx.globalAlpha = 0.35;
    }

    for (let i = 0; i < selectedStations.length; i++) {
      const s = selectedStations[i];
      renderStationPlotToCanvas(ctx, s.feature.properties || {}, s.pt.x, s.pt.y, lCfg, scale);

      // Diagonal hatch overlay for hard-stale (§2.4)
      if (isHardStale) {
        ctx.save();
        ctx.strokeStyle = "rgba(248, 81, 73, 0.45)";
        ctx.lineWidth = 1.5;
        const bSize = 20 * scale;
        ctx.beginPath();
        for (let offset = -bSize; offset <= bSize; offset += 6) {
          ctx.moveTo(s.pt.x + offset - 8, s.pt.y - bSize);
          ctx.lineTo(s.pt.x + offset + 8, s.pt.y + bSize);
        }
        ctx.stroke();
        ctx.restore();
      }
      allVisibleStations.push(s);
    }
    ctx.restore();
  }

  state.activeBins = activeBins;
  state.activeVisibleStations = allVisibleStations;
  state.renderedCount = allVisibleStations.length;
  return true;
}

export function updateVisibleMarkersForMap(map) {
  drawStationCanvas(map);
}

export function updateVisibleMarkers() {
  // Legacy export alias for backward compatibility
}

export function setStationVisibility(map, visible, layerId = null) {
  if (!map) return;
  const state = getState(map);
  if (!state) return;
  if (layerId) {
    let matched = false;
    if (state.stationLayers && state.stationLayers.has(layerId)) {
      const l = state.stationLayers.get(layerId);
      l.visible = Boolean(visible);
      matched = true;
    } else if (state.stationLayers && state.stationLayers.size > 0) {
      for (const [id, l] of state.stationLayers.entries()) {
        if (isStationLayerMatch(layerId, id, l)) {
          l.visible = Boolean(visible);
          matched = true;
        }
      }
    }
    if (!matched) {
      if (state.stationLayers && state.stationLayers.size === 1) {
        const l = state.stationLayers.values().next().value;
        if (l) l.visible = Boolean(visible);
      } else {
        return;
      }
    }
  } else {
    state.visible = Boolean(visible);
    if (state.stationLayers) {
      for (const l of state.stationLayers.values()) {
        l.visible = Boolean(visible);
      }
    }
  }
  const anyVis = (state.stationLayers && state.stationLayers.size > 0)
    ? Array.from(state.stationLayers.values()).some((l) => l.visible)
    : Boolean(state.visible);
  if (state.canvas && state.canvas.style) {
    state.canvas.style.display = anyVis ? "block" : "none";
  }
  if (!anyVis) {
    if (state.hoverAnimId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(state.hoverAnimId);
      state.hoverAnimId = null;
    }
    state.lastHoverEvent = null;
    if (state.ctx && state.canvas) {
      state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    }
    state.activeVisibleStations = [];
    state.activeBins = new Map();
    state.renderedCount = 0;
    handleStationMouseOut(map);
  } else {
    updateVisibleMarkersForMap(map);
  }
}

export function removeStationLayer(map, layerId = null) {
  if (!map) return;
  const state = getState(map);
  if (!state) return;
  if (layerId) {
    if (state.stationLayers && state.stationLayers.size > 0) {
      if (state.stationLayers.has(layerId)) {
        state.stationLayers.delete(layerId);
        if (state.stationLayers.size > 0) {
          updateVisibleMarkersForMap(map);
          return;
        }
      } else {
        let deleted = false;
        for (const [id, l] of state.stationLayers.entries()) {
          if (isStationLayerMatch(layerId, id, l)) {
            state.stationLayers.delete(id);
            deleted = true;
          }
        }
        if (deleted && state.stationLayers.size > 0) {
          updateVisibleMarkersForMap(map);
          return;
        }
        if (!deleted && state.stationLayers.size > 1) {
          return;
        }
      }
    }
  }
  if (state.stationLayers) {
    state.stationLayers.clear();
  }
  if (state.animId) {
    cancelAnim(state.animId);
    state.animId = null;
  }
  if (state.hoverAnimId && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.hoverAnimId);
    state.hoverAnimId = null;
  }
  state.lastHoverEvent = null;

  if (state.moveListener && typeof map.off === "function") {
    map.off("move", state.moveListener);
    map.off("zoom", state.moveListener);
    map.off("resize", state.moveListener);
    map.off("moveend", state.moveListener);
    map.off("zoomend", state.moveListener);
    state.moveListener = null;
  }
  if (state.mouseMoveListener && typeof map.off === "function") {
    map.off("mousemove", state.mouseMoveListener);
    state.mouseMoveListener = null;
  }
  if (state.mouseOutListener && typeof map.off === "function") {
    map.off("mouseout", state.mouseOutListener);
    state.mouseOutListener = null;
  }
  if (state.clickListener && typeof map.off === "function") {
    map.off("click", state.clickListener);
    state.clickListener = null;
  }
  if (state.canvas) {
    if (state.ctx) {
      state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    }
    if (state.canvas.parentNode) {
      state.canvas.parentNode.removeChild(state.canvas);
    }
    state.canvas = null;
    state.ctx = null;
  }
  state.activeVisibleStations = [];
  state.activeBins = new Map();
  state.renderedCount = 0;
  if (lastStationGeoJSON === state.geojson || !map) {
    setLastStationGeoJSON(null);
  }
  state.geojson = null;
  state.visible = false;
  handleStationMouseOut(map);
}

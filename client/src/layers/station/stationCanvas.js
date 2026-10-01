// stationCanvas.js - Station canvas overlay management, spatial binning, and render loop
import {
  getState,
  lastStationGeoJSON,
  setLastStationGeoJSON,
} from "./stationState.js";
import { hashStation } from "./stationExtract.js";
import {
  compileStationFilter,
  hasActiveStationFilters,
  collectActiveRules,
  normalizeFilterField,
  isViewOnly,
  isFieldVisibleInView,
} from "./stationFilter.js";
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

  // Generic aliases
  const tIsGeneric = t === "surface" || t === "surface-obs" || t === "station-surface" || t === "station" || t === "default";
  const eIsGeneric = e === "surface" || e === "surface-obs" || e === "station-surface" || e === "station" || e === "default";

  // Surface layer matching
  const tIsSurface = t.includes("surface");
  const eIsSurface = e.includes("surface");
  if (tIsSurface && eIsSurface) {
    const tHasLag = t.includes("lag") || t.includes("t-") || t.includes("t0") || t.includes("nowcast");
    const eHasLag = e.includes("lag") || e.includes("t-") || e.includes("t0") || e.includes("nowcast");
    if (tHasLag || eHasLag) return t === e;
    if (tIsGeneric || eIsGeneric) return true;
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
    const tIsUpperGeneric = t === "upper" || t === "station-upper" || t === "upperair-obs" || tIsGeneric;
    const eIsUpperGeneric = e === "upper" || e === "station-upper" || e === "upperair-obs" || eIsGeneric;
    if (tIsUpperGeneric || eIsUpperGeneric) return true;
    return false;
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

  // Only update global fallback config if untargeted or single layer
  if (!targetId || !state.stationLayers || state.stationLayers.size <= 1) {
    state.config = { ...(state.config || {}), ...config };
  }
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
  if (!state.stationLayers || state.stationLayers.size <= 1) {
    if (config) {
      state.config = mergedConfig;
    }
  }
  if (!state.stationLayers) state.stationLayers = new Map();
  if (id !== "default" && state.stationLayers.has("default")) {
    state.stationLayers.delete("default");
  }
  const idLower = String(id).toLowerCase();
  const activeLayers = map?._micapsWindow?.activeGroup?.layers;
  const isUpper = idLower.startsWith("upperair-") || idLower.includes("sounding") || idLower === "station-upper";
  if (isUpper) {
    for (const existingId of Array.from(state.stationLayers.keys())) {
      const eLower = String(existingId).toLowerCase();
      if (activeLayers && activeLayers.some((l) => l.id === existingId)) continue;
      if (existingId !== id && (eLower.startsWith("upperair-") || eLower.includes("sounding") || eLower === "station-upper")) {
        state.stationLayers.delete(existingId);
      }
    }
  }
  const isSurface = idLower.startsWith("surface-") || idLower.includes("surface") || idLower === "station-surface";
  if (isSurface) {
    const idHasLag = idLower.includes("lag") || idLower.includes("t-") || idLower.includes("t0") || idLower.includes("nowcast");
    if (!idHasLag) {
      for (const existingId of Array.from(state.stationLayers.keys())) {
        const eLower = String(existingId).toLowerCase();
        if (activeLayers && activeLayers.some((l) => l.id === existingId)) continue;
        const eHasLag = eLower.includes("lag") || eLower.includes("t-") || eLower.includes("t0") || eLower.includes("nowcast");
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
    const lCfg = { ...(state.config || {}), ...(layerEntry.config || {}) };
    const isSoftStale = lCfg.status === "soft-stale" || lCfg.isSoftStale;
    const isHardStale = lCfg.status === "hard-stale" || lCfg.isHardStale;

    const activeRules = collectActiveRules(lCfg);
    const hasRules = activeRules.length > 0;
    const viewMode = isViewOnly(lCfg);
    const isWholeFilter = hasRules && !viewMode;

    const rawMinZoom = lCfg.minZoom ?? lCfg.minzoom;
    const minZ = (rawMinZoom !== undefined && rawMinZoom !== null) ? Number(rawMinZoom) : null;
    const hasMinZoom = minZ !== null && !isNaN(minZ);
    const isBelowMinZoom = hasMinZoom && curZoom < minZ;

    const UNFILTERED_BIN_CAP = 5;
    const FILTERED_BIN_CAP = 10;
    const DENSE_FILTER_THRESHOLD = 500;

    // Track filtered canonical fields
    const filteredRuleFields = new Set();
    for (const r of activeRules) {
      const canonical = normalizeFilterField(r.field);
      if (canonical) filteredRuleFields.add(canonical);
    }
    const isFieldFiltered = (f) => {
      const canon = normalizeFilterField(f) || f;
      if (filteredRuleFields.has(canon)) return true;
      if ((canon === "Rain" || canon === "Rain6") && (filteredRuleFields.has("Rain") || filteredRuleFields.has("Rain6"))) return true;
      if ((canon === "SLP" || canon === "Height") && (filteredRuleFields.has("SLP") || filteredRuleFields.has("Height"))) return true;
      return false;
    };

    // 1. Data filtering and matching counts
    const rawFeatures = layerEntry.geojson?.features || [];
    const candidateFeatures = [];
    let validCount = 0;
    let filteredMatchCount = 0;

    if (isWholeFilter) {
      const filterFn = compileStationFilter(lCfg);
      for (let i = 0; i < rawFeatures.length; i++) {
        const f = rawFeatures[i];
        if (!f.geometry || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length < 2) continue;
        validCount++;
        if (!filterFn(f.properties || {})) continue;
        candidateFeatures.push(f);
      }
      filteredMatchCount = candidateFeatures.length;
    } else if (viewMode && hasRules) {
      for (let i = 0; i < rawFeatures.length; i++) {
        const f = rawFeatures[i];
        if (!f.geometry || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length < 2) continue;
        validCount++;
        const p = f.properties || {};
        let matchesAnyFiltered = false;
        for (const field of filteredRuleFields) {
          if (isFieldVisibleInView(p, lCfg, field)) {
            matchesAnyFiltered = true;
            break;
          }
        }
        if (matchesAnyFiltered) filteredMatchCount++;
        // If curZoom < minZoom, unfiltered elements are culled.
        // Stations without matching filtered elements have nothing to show, so skip early!
        if (isBelowMinZoom && !matchesAnyFiltered) continue;
        candidateFeatures.push(f);
      }
    } else {
      // Unfiltered
      for (let i = 0; i < rawFeatures.length; i++) {
        const f = rawFeatures[i];
        if (!f.geometry || !Array.isArray(f.geometry.coordinates) || f.geometry.coordinates.length < 2) continue;
        validCount++;
        candidateFeatures.push(f);
      }
    }

    // Zoom-level culling (minZoom):
    // 1. Without rules: cull completely if curZoom < minZoom.
    // 2. With whole filter rules: if filtered dataset is dense (>= 500), do NOT bypass minZoom!
    // 3. ViewOnly mode: minZoom culling operates per element (unfiltered elements culled, sparse filtered kept).
    if (!hasRules && isBelowMinZoom) {
      continue;
    }
    const isDenseFiltered = isWholeFilter && filteredMatchCount >= DENSE_FILTER_THRESHOLD;
    if (isBelowMinZoom && isDenseFiltered) {
      continue;
    }

    const screenBins = new Map();
    const binSize = 100;

    for (let i = 0; i < candidateFeatures.length; i++) {
      const f = candidateFeatures[i];
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

      if (!hasProject) continue;

      const pt = map.project([lon, lat]);
      if (pt.x < -60 || pt.x > w + 60 || pt.y < -60 || pt.y > h + 60) continue;

      const binKey = `${Math.floor(pt.x / binSize)},${Math.floor(pt.y / binSize)}`;
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
      if (!hasRules) {
        // Full-density unfiltered mode: LoD caps at UNFILTERED_BIN_CAP (5)
        let chosen;
        if (list.length <= UNFILTERED_BIN_CAP) {
          chosen = list;
        } else {
          list.sort((a, b) => a.hash - b.hash);
          chosen = list.slice(0, UNFILTERED_BIN_CAP);
        }
        for (let i = 0; i < chosen.length; i++) {
          const item = chosen[i];
          item.allowedFields = null;
          selectedStations.push(item);
        }
      } else if (isWholeFilter) {
        // Whole-station filtered mode:
        // Sparse cells keep all matching stations; dense cells are decluttered to FILTERED_BIN_CAP (10)
        let chosen;
        if (list.length <= FILTERED_BIN_CAP) {
          chosen = list;
        } else {
          list.sort((a, b) => a.hash - b.hash);
          chosen = list.slice(0, FILTERED_BIN_CAP);
        }
        for (let i = 0; i < chosen.length; i++) {
          const item = chosen[i];
          item.allowedFields = null;
          selectedStations.push(item);
        }
      } else {
        // ViewOnly mode: culling & decluttering operate PER ELEMENT
        const filteredMatches = [];
        const unfilteredCandidates = [];

        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          const p = item.feature.properties || {};
          const matchedFields = [];
          for (const field of filteredRuleFields) {
            if (isFieldVisibleInView(p, lCfg, field)) {
              matchedFields.push(field);
            }
          }
          item._matchedFields = matchedFields;
          if (matchedFields.length > 0) {
            filteredMatches.push(item);
          } else {
            unfilteredCandidates.push(item);
          }
        }

        // 1. Filtered elements: prioritize stations matching active filter rules.
        // Sparse cells keep all matching stations (up to FILTERED_BIN_CAP);
        // dense cells are decluttered to FILTERED_BIN_CAP to prevent overlapping.
        let chosenFiltered;
        if (filteredMatches.length <= FILTERED_BIN_CAP) {
          chosenFiltered = filteredMatches;
        } else {
          filteredMatches.sort((a, b) => a.hash - b.hash);
          chosenFiltered = filteredMatches.slice(0, FILTERED_BIN_CAP);
        }

        const ALL_CANDIDATE_FIELDS = [
          "TT", "Td", "DTD", "Wind", "Rain", "Rain6",
          "Visibility", "SLP", "Height", "Cloud", "Weather", "Tendency"
        ];

        // For each chosen filtered station:
        // - Allow matched filtered fields
        // - If curZoom >= minZoom (!isBelowMinZoom), ALSO allow all unfiltered candidate fields
        for (let i = 0; i < chosenFiltered.length; i++) {
          const item = chosenFiltered[i];
          const allowed = new Set();
          if (item._matchedFields) {
            for (const f of item._matchedFields) {
              allowed.add(f);
              if (f === "Rain6" || f === "Rain") {
                allowed.add("Rain");
                allowed.add("Rain6");
              }
              if (f === "SLP" || f === "Height") {
                allowed.add("SLP");
                allowed.add("Height");
              }
            }
          }
          if (!isBelowMinZoom) {
            for (const f of ALL_CANDIDATE_FIELDS) {
              if (!isFieldFiltered(f)) {
                allowed.add(f);
              }
            }
          }
          if (allowed.size > 0) {
            item.allowedFields = allowed;
            selectedStations.push(item);
          }
        }

        // 2. Unfiltered stations (did not match any filtered rule):
        // If curZoom < minZoom, unfiltered elements are culled completely!
        // If curZoom >= minZoom, declutter unfiltered stations to fill remaining capacity up to UNFILTERED_BIN_CAP
        if (!isBelowMinZoom) {
          const remainingSlots = Math.max(0, UNFILTERED_BIN_CAP - chosenFiltered.length);
          if (remainingSlots > 0 && unfilteredCandidates.length > 0) {
            let chosenOther;
            if (unfilteredCandidates.length <= remainingSlots) {
              chosenOther = unfilteredCandidates;
            } else {
              unfilteredCandidates.sort((a, b) => a.hash - b.hash);
              chosenOther = unfilteredCandidates.slice(0, remainingSlots);
            }
            for (let i = 0; i < chosenOther.length; i++) {
              const item = chosenOther[i];
              const allowed = new Set();
              for (const f of ALL_CANDIDATE_FIELDS) {
                if (!isFieldFiltered(f)) {
                  allowed.add(f);
                }
              }
              if (allowed.size > 0) {
                item.allowedFields = allowed;
                selectedStations.push(item);
              }
            }
          }
        }
      }
    }

    // Register active hover bins
    for (let i = 0; i < selectedStations.length; i++) {
      const item = selectedStations[i];
      const hoverBinKey = `${Math.floor(item.pt.x / 100)},${Math.floor(item.pt.y / 100)}`;
      let existingBin = activeBins.get(hoverBinKey);
      if (!existingBin) {
        existingBin = [];
        activeBins.set(hoverBinKey, existingBin);
      }
      existingBin.push(item);
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
      renderStationPlotToCanvas(ctx, s.feature.properties || {}, s.pt.x, s.pt.y, lCfg, scale, s.allowedFields);

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

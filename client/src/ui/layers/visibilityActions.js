// visibilityActions.js - Layer visibility toggle handling
import {
  setLayerIsobandVisibility,
  setLayerIsolineVisibility,
  getLayerDOMIds,
} from "../../layers/contourLayer.js";
import { setStationVisibility } from "../../layers/stationLayer.js";
import { setRasterVisibility, getRasterDOMIds } from "../../layers/rasterLayer.js";
import { stopWindAnimation, removeGridWindBarbs } from "../../layers/windLayer.js";
import {
  getSourceFeatures,
  triggerIsobandOverlay,
  triggerRasterOverlay,
  triggerVortDivOverlay,
  triggerWindStreamlines,
  triggerWindBarbs,
  triggerStationStreamlines,
} from "../../services/overlayTriggers.js";
import { syncLegendForLayer } from "./legendSync.js";
import { getLayerById, getLayersForWindow } from "./layerStore.js";
import { getStationGeoJSON } from "../../layers/stationLayer.js";

export function layerNeedsRecalc(layer, winObj, map) {
  if (!layer) return false;

  // Station, PMTiles, profile layers don't have heavy grid calculations to recalculate here
  if (layer.type !== "contour" && layer.type !== "wind") {
    return false;
  }

  // 1. Data check: if calculation data is completely missing or empty
  if (layer.type === "contour") {
    if (!layer.gridData || !layer.gridData.values || (Array.isArray(layer.gridData.values) && layer.gridData.values.length === 0)) {
      return true;
    }
  } else if (layer.type === "wind") {
    if (!layer.gridData || !layer.gridData.u || !layer.gridData.v) {
      return true;
    }
  }

  // 2. State checks against current window state (time, forecast_init, step lead, level)
  if (winObj) {
    const isUpper = layer.model === "UPPER_AIR" || (layer.id && layer.id.startsWith("contour-sounding-"));
    const isSurface = layer.model === "SURFACE" || layer.model === "SURFACE_ANALYSIS" || (layer.id && layer.id.startsWith("contour-surface-"));
    const isObs = isUpper || isSurface || Boolean(winObj.isObservation);

    // Vertical level check
    const hasLevel = winObj.activeGroup?.hasLevel !== false && layer.model !== "SURFACE" && layer.level !== 0 && winObj.level !== null && winObj.level !== undefined;
    if (hasLevel) {
      if (layer.level === undefined || layer.level === null) return true;
      if (Number(layer.level) !== Number(winObj.level)) return true;
    }

    // Time / cycle / step lead checks
    if (!isObs) {
      const curPeriod = winObj.period !== undefined && winObj.period !== null ? Number(winObj.period) : null;
      const curCycle = winObj.forecastCycle || null;

      let layerPeriod = layer.period !== undefined && layer.period !== null
        ? Number(layer.period)
        : (layer.stepLead !== undefined && layer.stepLead !== null ? Number(layer.stepLead) : null);
      let layerCycle = layer.forecastCycle || null;

      if (layer.file && typeof layer.file === "string" && layer.file.includes(".")) {
        const parts = layer.file.split(".");
        if (!layerCycle && parts[0]) layerCycle = parts[0];
        if (layerPeriod === null && parts[1]) {
          const parsed = parseInt(parts[1], 10);
          if (!isNaN(parsed)) layerPeriod = parsed;
        }
      }

      if (curPeriod !== null && layerPeriod !== null && curPeriod !== layerPeriod) {
        return true;
      }
      if (curCycle && layerCycle && curCycle !== layerCycle) {
        return true;
      }
      if (curCycle && curPeriod !== null) {
        const expectedFile = `${curCycle}.${String(curPeriod).padStart(3, "0")}`;
        if (layer.file && layer.file !== expectedFile) return true;
      }
      if (curPeriod !== null && !layer.file && layerPeriod === null) {
        return true;
      }
    } else {
      if (winObj.obsTime) {
        let expectedObs = winObj.obsTime;
        if (typeof expectedObs === "string" && expectedObs.length === 14 && !expectedObs.includes(".")) {
          expectedObs = `${expectedObs}.000`;
        }
        if (layer.file && layer.file !== expectedObs) return true;
        if (layer.obsTime && layer.obsTime !== expectedObs) return true;
        if (!layer.file && !layer.obsTime) return true;
      }
    }
  }

  // 3. MapLibre source check: if contour layer has no features in its sources
  if (map && typeof map.getSource === "function" && layer.type === "contour" && layer.gridData?.values) {
    const { isobandSrcId, isolineSrcId } = getLayerDOMIds(layer.id);
    const needLine = layer.config?.showLine !== false;
    const needFill = Boolean(layer.config?.showFill);
    if (needLine) {
      const lineSrc = map.getSource(isolineSrcId);
      if (lineSrc) {
        const lineFeats = getSourceFeatures(lineSrc);
        if (lineFeats.length === 0) return true;
      }
    }
    if (needFill) {
      const bandSrc = map.getSource(isobandSrcId);
      if (bandSrc) {
        const bandFeats = getSourceFeatures(bandSrc);
        if (bandFeats.length === 0) return true;
      }
    }
  }

  return false;
}

export async function recalcAndRerenderLayer(map, layer, winObj) {
  if (!map || !layer) return;
  const isUpper = layer.model === "UPPER_AIR" || (layer.id && layer.id.startsWith("contour-sounding-"));
  const isSurface = layer.model === "SURFACE" || layer.model === "SURFACE_ANALYSIS" || (layer.id && layer.id.startsWith("contour-surface-"));
  const elem = (layer.element || "").toUpperCase();
  const isNwpKinematic = (elem === "VOR" || elem === "DIV" || (elem === "WIND" && layer.type === "contour")) && !isUpper && !isSurface;

  layer.visible = true;

  if (isUpper && layer.type === "contour") {
    const curLevel = (winObj?.level !== undefined && winObj?.level !== null) ? winObj.level : (layer.level || 500);
    const targetId = `contour-sounding-${(layer.element || "HGT").toLowerCase()}-${curLevel}`;
    layer.id = targetId;
    layer.level = curLevel;
    layer.obsTime = winObj?.obsTime || layer.obsTime;
    layer.file = winObj?.obsTime || layer.file;

    const winLayers = getLayersForWindow(winObj);
    const stnLayer = winLayers.find((l) => l.type === "station" && l.model === "UPPER_AIR");
    let stations = stnLayer?.stationsGeoJSON || (typeof getStationGeoJSON === "function" ? getStationGeoJSON(map) : null);

    if (!stations || !stations.features || stations.features.length < 3) {
      try {
        const { fetchStationObservations } = await import("../../api/catalogApi.js");
        const obsPath = `UPPER_AIR/PLOT/${curLevel}`;
        stations = await fetchStationObservations(obsPath, winObj?.obsTime);
      } catch {}
    }

    if (stations && stations.features && stations.features.length >= 3) {
      const cfg = {
        ...(layer.render || {}),
        ...(layer.config || {}),
        layerId: targetId,
        visible: true,
        obsTime: winObj?.obsTime,
        file: winObj?.obsTime,
        lineColor: layer.color || layer.config?.lineColor,
      };
      if (elem === "VOR" || elem === "DIV") {
        const { analyzeKinematicContours } = await import("../../layers/analysis/kinematicContours.js");
        analyzeKinematicContours({
          map,
          stationsGeoJSON: stations,
          rawElement: layer.element,
          level: curLevel,
          options: cfg,
          win: winObj,
          isSounding: true,
        });
      } else {
        const { analyzeAndRenderSoundingElementContour } = await import("../../layers/soundingAnalysis.js");
        analyzeAndRenderSoundingElementContour(map, stations, curLevel, layer.element, cfg, winObj);
      }
      const rendered = getLayerById(targetId, winObj);
      if (rendered && (rendered.config?.showRaster || layer.config?.showRaster)) {
        await triggerRasterOverlay(map, rendered, winObj);
      }
      syncLegendForLayer(rendered || layer, winObj, true);
    }
  } else if (isSurface && layer.type === "contour") {
    const targetId = layer.id || `contour-surface-${(layer.element || "SLP").toLowerCase()}`;
    layer.id = targetId;
    layer.obsTime = winObj?.obsTime || layer.obsTime;
    layer.file = winObj?.obsTime || layer.file;

    const winLayers = getLayersForWindow(winObj);
    const stnLayer = winLayers.find((l) => l.type === "station" && l.model === "SURFACE");
    let stations = stnLayer?.stationsGeoJSON || (typeof getStationGeoJSON === "function" ? getStationGeoJSON(map) : null);

    if (!stations || !stations.features || stations.features.length < 3) {
      try {
        const { fetchStationObservations } = await import("../../api/catalogApi.js");
        stations = await fetchStationObservations("SURFACE/PLOT", winObj?.obsTime);
      } catch {}
    }

    if (stations && stations.features && stations.features.length >= 3) {
      const cfg = {
        ...(layer.render || {}),
        ...(layer.config || {}),
        layerId: targetId,
        visible: true,
        obsTime: winObj?.obsTime,
        file: winObj?.obsTime,
        lineColor: layer.color || layer.config?.lineColor,
      };
      if (elem === "VOR" || elem === "DIV") {
        const { analyzeKinematicContours } = await import("../../layers/analysis/kinematicContours.js");
        analyzeKinematicContours({
          map,
          stationsGeoJSON: stations,
          rawElement: layer.element,
          level: null,
          options: cfg,
          win: winObj,
          isSounding: false,
        });
      } else {
        const { analyzeAndRenderSurfaceContours } = await import("../../layers/surfaceAnalysis.js");
        analyzeAndRenderSurfaceContours(map, stations, layer.element, cfg, winObj);
      }
      const rendered = getLayerById(targetId, winObj);
      if (rendered && (rendered.config?.showRaster || layer.config?.showRaster)) {
        await triggerRasterOverlay(map, rendered, winObj);
      }
      syncLegendForLayer(rendered || layer, winObj, true);
    }
  } else if (isNwpKinematic) {
    const curLevel = (winObj?.level !== undefined && winObj?.level !== null && (!winObj?.activeGroup || winObj?.activeGroup?.hasLevel !== false))
      ? winObj.level
      : layer.level;
    layer.level = curLevel;
    const model = layer.model || winObj?.model || "ECMWF_HR";
    const elem = (layer.element || "VOR").toLowerCase();
    layer.id = (curLevel !== null && curLevel !== undefined)
      ? `contour-${model}-${elem}-${curLevel}`
      : `contour-${model}-${elem}`;
    await triggerVortDivOverlay(map, layer, winObj);
    const rendered = getLayerById(layer.id, winObj);
    syncLegendForLayer(rendered || layer, winObj, true);
  } else if (layer.type === "contour") {
    const { loadWeatherField } = await import("../../services/weatherLoader.js");
    const targetLevel = (layer.model === "SURFACE" || layer.level === 0)
      ? null
      : (winObj?.level !== undefined ? winObj.level : layer.level);
    const period = winObj?.period ?? 24;
    const levelChanged = targetLevel !== layer.level;
    layer.level = targetLevel;
    layer.period = period;
    if (winObj?.forecastCycle) {
      layer.forecastCycle = winObj.forecastCycle;
      layer.file = `${winObj.forecastCycle}.${String(period).padStart(3, "0")}`;
    }
    const updatedPath = (levelChanged || !layer.path)
      ? (targetLevel ? `${layer.model || "ECMWF_HR"}/${layer.element}/${targetLevel}` : `${layer.model || "ECMWF_HR"}/${layer.element}`)
      : layer.path;
    const updatedName = (levelChanged && layer.name && /\d+\s*hPa/.test(layer.name))
      ? layer.name.replace(/\d+\s*hPa/, `${targetLevel} hPa`)
      : layer.name;
    const updatedId = (levelChanged && layer.id && /\d+$/.test(layer.id))
      ? layer.id.replace(/\d+$/, String(targetLevel))
      : layer.id;
    layer.id = updatedId;
    layer.name = updatedName;
    layer.path = updatedPath;

    await loadWeatherField(map, layer.model, layer.element, targetLevel, period, {
      ...(layer.render || {}),
      ...(layer.config || {}),
      id: updatedId,
      name: updatedName,
      path: updatedPath,
      visible: true,
      colormap: layer.colormap,
      lineColor: layer.color || layer.config?.lineColor,
    }, winObj, false);
  } else if (layer.type === "wind") {
    const { loadWeatherField } = await import("../../services/weatherLoader.js");
    const targetLevel = (layer.model === "SURFACE" || layer.level === 0)
      ? null
      : (winObj?.level !== undefined ? winObj.level : layer.level);
    const period = winObj?.period ?? 24;
    const levelChanged = targetLevel !== layer.level;
    layer.level = targetLevel;
    layer.period = period;
    if (winObj?.forecastCycle) {
      layer.forecastCycle = winObj.forecastCycle;
      layer.file = `${winObj.forecastCycle}.${String(period).padStart(3, "0")}`;
    }
    const updatedPath = (levelChanged || !layer.path)
      ? (targetLevel ? `${layer.model || "ECMWF_HR"}/${layer.element || "WIND"}/${targetLevel}` : `${layer.model || "ECMWF_HR"}/${layer.element || "WIND"}`)
      : layer.path;
    const updatedName = (levelChanged && layer.name && /\d+\s*hPa/.test(layer.name))
      ? layer.name.replace(/\d+\s*hPa/, `${targetLevel} hPa`)
      : layer.name;
    const updatedId = (levelChanged && layer.id && /\d+$/.test(layer.id))
      ? layer.id.replace(/\d+$/, String(targetLevel))
      : layer.id;
    layer.id = updatedId;
    layer.name = updatedName;
    layer.path = updatedPath;

    await loadWeatherField(map, layer.model, layer.element || "WIND", targetLevel, period, {
      ...(layer.render || {}),
      ...(layer.config || {}),
      id: updatedId,
      name: updatedName,
      path: updatedPath,
      isWind: true,
      visible: true,
    }, winObj, false);
  }
  syncLegendForLayer(layer, winObj, true);
}

export function handleVisibilityAction(map, layerId, value, layer, winObj) {
  if (!layer) return;

  // The Svelte layer panel works with a reactive copy of the core layer list.
  // Keep the live object and the canonical window store in sync before the
  // panel is refreshed; otherwise syncLayersState() restores the old value
  // and the next eye click repeats the hide action instead of showing it.
  const isVisible = Boolean(value);
  layer.visible = isVisible;
  if (layerId && winObj) {
    try {
      const canonical = getLayerById(layerId, winObj);
      if (canonical && canonical !== layer) canonical.visible = isVisible;
    } catch { /* best-effort store synchronization */ }

    for (const snapshots of [winObj.layerSnapshots, winObj.derivedContourSnapshots]) {
      if (!Array.isArray(snapshots)) continue;
      const snapshot = snapshots.find((entry) =>
        entry?.id === layerId ||
        (entry?.type === "station" && layer.type === "station" && (entry?.model === layer.model || (!entry?.model && !layer.model)))
      );
      if (snapshot) snapshot.visible = isVisible;
    }

    if (Array.isArray(winObj.activeGroup?.layers)) {
      const pLayer = winObj.activeGroup.layers.find((candidate) =>
        candidate?.id === layerId ||
        (candidate?.type === "station" && layer.type === "station" && (candidate?.model === layer.model || (!candidate?.model && !layer.model))) ||
        (candidate?.model === layer.model && candidate?.element === layer.element &&
          Boolean(candidate?.derivedFrom) === Boolean(layer.derivedFrom))
      );
      if (pLayer) {
        pLayer.visible = isVisible;
      }
    }
  }

  // Synchronize legend lifecycle on layer visibility change immediately (contour/wind only)
  syncLegendForLayer(layer, winObj, isVisible);

  if (layer.type === "contour" || layer.type === "wind") {
    if (isVisible) {
      if (layerNeedsRecalc(layer, winObj, map)) {
        return recalcAndRerenderLayer(map, layer, winObj);
      }

      if (layer.config?.showFill) {
        const { isobandSrcId } = getLayerDOMIds(layerId);
        const isobandSrc = map.getSource(isobandSrcId);
        const features = getSourceFeatures(isobandSrc);
        if (features.length > 0) {
          setLayerIsobandVisibility(map, layerId, true);
        } else {
          triggerIsobandOverlay(map, layer, winObj);
        }
      } else {
        setLayerIsobandVisibility(map, layerId, false);
      }

      const showLine = layer.config?.showLine !== false;
      const showLabels = layer.config?.showLabels !== false;
      setLayerIsolineVisibility(map, layerId, showLine, showLabels);

      if (layer.config?.showRaster) {
        const { rasterLayerId } = getRasterDOMIds(layerId);
        if (map.getLayer(rasterLayerId)) {
          setRasterVisibility(map, true, layerId);
        } else {
          triggerRasterOverlay(map, layer, winObj);
        }
      }

      if (layer.type === "wind" || layer.config?.showWind) {
        if (layer.config?.showWind !== false) {
          triggerWindStreamlines(map, layer, winObj);
        }
      }

      if (layer.type === "wind" || layer.config?.showBarbs) {
        if (layer.config?.showBarbs) {
          triggerWindBarbs(map, layer, winObj);
        }
      }
    } else {
      setLayerIsobandVisibility(map, layerId, false);
      setLayerIsolineVisibility(map, layerId, false);
      if (layer.config?.showRaster) {
        setRasterVisibility(map, false, layerId);
      }
      if (layer.type === "wind" || layer.config?.showWind) {
        stopWindAnimation(map);
      }
      if (layer.type === "wind" || layer.config?.showBarbs) {
        removeGridWindBarbs(map);
      }
    }
  } else if (layer.type === "station") {
    if (isVisible) {
      setStationVisibility(map, true, layer?.id);
      if (layer.config?.showStreamlines) {
        triggerStationStreamlines(map, layer, winObj);
      }
    } else {
      setStationVisibility(map, false, layer?.id);
      if (layer.config?.showStreamlines) {
        stopWindAnimation(map);
      }
    }
  } else if (layer.type === "pmtiles") {
    const showGraticule = isVisible && layer.config?.showGraticule !== false;
    const showWorld = isVisible && layer.config?.showWorld !== false;
    const showProvinces = isVisible && layer.config?.showProvinces !== false;
    const showCities = isVisible && layer.config?.showCities !== false;

    const worldLayers = ["world-fill", "world-boundary"];
    const chinaLayers = ["china-fill", "china-boundary"];
    const provLayers = ["provinces-bg-fill", "provinces-boundary", "provinces-fill", "provinces-detail-boundary"];
    const cityLayers = ["citys-fill", "citys-boundary", "county-fill", "county-boundary"];

    worldLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showWorld ? "visible" : "none");
    });
    chinaLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", value ? "visible" : "none");
    });
    provLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showProvinces ? "visible" : "none");
    });
    cityLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showCities ? "visible" : "none");
    });
    if (map.getLayer("graticule-lines")) {
      map.setLayoutProperty("graticule-lines", "visibility", showGraticule ? "visible" : "none");
    }
  } else if (layer.type === "tlogp") {
    import("../../layers/tlogp/tlogpLayer.js").then(({ setTLogPVisibility }) => {
      setTLogPVisibility(map, isVisible, winObj);
    });
  } else if (layer.type === "timeheight") {
    import("../../layers/timeheight/timeHeightLayer.js").then(({ setTimeHeightVisibility }) => {
      setTimeHeightVisibility(map, isVisible, winObj);
    });
  } else if (layer.type === "lineheight") {
    import("../../layers/lineprofile/lineProfileLayer.js").then(({ setLineHeightVisibility }) => {
      setLineHeightVisibility(map, isVisible, winObj);
    });
  } else if (layer.type === "hovmoller") {
    import("../../layers/lineprofile/lineProfileLayer.js").then(({ setHovmollerVisibility }) => {
      setHovmollerVisibility(map, isVisible, winObj);
    });
  }

  // Synchronize legend lifecycle on layer visibility change (contour/wind only)
  syncLegendForLayer(layer, winObj, isVisible);
}

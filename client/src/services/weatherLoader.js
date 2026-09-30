// weatherLoader.js - Loads and renders NWP forecast weather fields and derived wind kinematics
import { getActiveWindow, updateWindowTitle } from "../ui/tabWindowManager.js";
import { getLayerById, addOrUpdateLayer, syncLayerControlForWindow } from "../ui/layerControl.js";
import { renderContourLayers, setLayerIsobandVisibility, setLayerIsolineVisibility } from "../layers/contourLayer.js";
import { flushContourSource } from "../layers/contour/contourMapSync.js";
import { renderBinaryRaster, renderGridRaster } from "../layers/rasterLayer.js";
import { renderWindStreamlines, stopWindAnimation, renderGridWindBarbs, removeGridWindBarbs } from "../layers/windLayer.js";
import { fetchGridData, fetchGridBinaryStream, fetchTree } from "../api/catalogApi.js";
import { updateLegend, removeLegend } from "../ui/legend.js";
import { appState } from "../store/appState.js";
import { resolveLatestForecastCycle } from "../utils/timelineSync.js";
import { schedulePrefetch } from "./prefetchService.js";
import { armContourReRender } from "./contourReRender.js";
import * as contourReRenderModule from "./contourReRender.js";
import { getCachedWindGrid, setCachedWindGrid } from "../utils/windGridCache.js";
import { showErrorToast } from "../ui/toast.js";
import { resolveLayerTime, parseTimestamp, parseOffset } from "../utils/timeResolver.js";

/**
 * Resolve a contour's stroke color across a timeline reload.
 *
 * `customOptions` comes from the active preset copy and is the authoritative
 * value for a time-step load. The live layer config is the fallback for
 * callers that load a field directly. `layer.color` is only a UI mirror and
 * must never outrank either config source.
 */
export function resolveLineColor({ customOptions = null, existingLayer = null, snapshot = null, defaultLineColor = "#ffffff" } = {}) {
  const values = [
    customOptions?.lineColor,
    existingLayer?.config?.lineColor,
    snapshot?.config?.lineColor,
    existingLayer?.color,
    snapshot?.color,
    defaultLineColor,
  ];
  return values.find((value) => typeof value === "string" && value.trim()) || defaultLineColor;
}

export async function loadWeatherField(map, model, element, level, period, customOptions = null, win = null, isTimeStep = false, expectedSeq = null) {
  if (!map || !model || !element || typeof model !== "string" || typeof element !== "string" || model.toLowerCase() === "null" || model.toLowerCase() === "undefined" || element.toLowerCase() === "null" || element.toLowerCase() === "undefined") {
    console.warn(`[weatherLoader] Aborting loadWeatherField: invalid map (${Boolean(map)}), model (${model}), or element (${element})`);
    return;
  }
  if (map && win) {
    try {
      map._micapsWindow = win;
      map._winId = win.id;
    } catch {}
  }
  const isVOR = element === "VOR";
  const isDIV = element === "DIV";
  const isDerivedWind = element === "WIND" && (customOptions?.type === "contour" || (customOptions?.id && customOptions.id.startsWith("contour-")) || customOptions?.derivedFrom);
  const isVortDiv = isVOR || isDIV || isDerivedWind;

  let cycle = win?.forecastCycle;
  if (!cycle) {
    cycle = await resolveLatestForecastCycle(model, isVortDiv ? "WIND" : element, level);
    if (win) {
      win.forecastCycle = cycle;
      updateWindowTitle(win);
    }
  }

  const cursorTime = win?.wallClockCursor ||
    (win?.obsTime ? parseTimestamp(win.obsTime) : null) ||
    (win?.forecastCycle ? { cycle: win.forecastCycle, period: period ?? win.period } : null) ||
    (typeof window !== "undefined" && window.__MICAPS_CURSOR__) ||
    Date.now();

  let targetLevel = level;
  if (targetLevel === null || targetLevel === undefined || targetLevel === "null" || targetLevel === "undefined" || String(targetLevel).trim() === "") {
    if (customOptions?.level !== undefined && customOptions?.level !== null) {
      targetLevel = customOptions.level;
    } else if (win?.level !== undefined && win?.level !== null) {
      targetLevel = win.level;
    } else if (win?.activeGroup?.defaultLevel !== undefined && win?.activeGroup?.defaultLevel !== null) {
      targetLevel = win.activeGroup.defaultLevel;
    }
  }
  const hasLevel = targetLevel !== null && targetLevel !== undefined && targetLevel !== "null" && targetLevel !== "undefined" && String(targetLevel).trim().toLowerCase() !== "undefined" && String(targetLevel).trim().toLowerCase() !== "null" && targetLevel !== "" && targetLevel !== 0;
  const defaultPath = hasLevel ? `${model}/${element}/${targetLevel}` : `${model}/${element}`;
  let path = customOptions?.path || defaultPath;
  let dataPath = isVortDiv ? (hasLevel ? `${model}/WIND/${targetLevel}` : `${model}/WIND`) : path;
  const isWind = (element === "WIND" && !isDerivedWind) || customOptions?.isWind;
  const layerId = customOptions?.id || (isWind ? `wind-${element}` : (isVortDiv ? (hasLevel ? `contour-${model}-${element.toLowerCase()}-${targetLevel}` : `contour-${model}-${element.toLowerCase()}`) : `contour-${element}`));
  const defaultName = isWind
    ? (hasLevel ? `${targetLevel} hPa Wind Field (${model})` : `Wind Field (${model})`)
    : (isVortDiv
      ? `${hasLevel ? `${targetLevel} hPa ` : ""}Derived ${isVOR ? "Relative Vorticity" : (isDIV ? "Divergence" : "Wind Speed")} (${model})`
      : (hasLevel ? `${targetLevel} hPa ${element} (${model})` : `${element} (${model})`));
  const name = customOptions?.name || defaultName;

  // Retrieve available real files for dataPath from catalog or customOptions
  let availableFiles = [];
  if (Array.isArray(customOptions?.sampleTimes) && customOptions.sampleTimes.length > 0) {
    availableFiles = customOptions.sampleTimes;
  } else {
    try {
      let fileEntries = await fetchTree(dataPath, 100);
      if (Array.isArray(fileEntries) && fileEntries.length > 0) {
        // If fileEntries are subdirectories representing levels (e.g. 1000, 925, 850, 500), dive into the level
        const isLevelDirs = fileEntries.every((e) => /^\d+$/.test(e.name) && (e.size === 0 || !e.name.includes(".")));
        if (isLevelDirs) {
          const chosenLvl = targetLevel || 500;
          dataPath = `${dataPath}/${chosenLvl}`;
          path = dataPath;
          targetLevel = chosenLvl;
          fileEntries = await fetchTree(dataPath, 100);
        }
        if (Array.isArray(fileEntries)) {
          availableFiles = fileEntries
            .map((f) => f.name)
            .filter((n) => Boolean(n) && n.includes(".") && !/^\d+$/.test(n));
        }
      }
    } catch (err) {
      console.warn(`[weatherLoader] fetchTree failed for ${dataPath}:`, err);
    }
  }

  if (availableFiles.length > 0) {
    availableFiles.sort((a, b) => a.localeCompare(b));
  }

  const cycleFiles = (cycle && availableFiles.length > 0) ? availableFiles.filter((f) => f.startsWith(`${cycle}.`)) : [];
  const candidateFiles = cycleFiles.length > 0 ? cycleFiles : availableFiles;

  let effectivePeriod = period;
  if (effectivePeriod === null || effectivePeriod === undefined || isNaN(Number(effectivePeriod)) || String(effectivePeriod) === "null") {
    if (customOptions?.period !== undefined && customOptions?.period !== null) {
      effectivePeriod = Number(customOptions.period);
    } else if (customOptions?.stepLead !== undefined && customOptions?.stepLead !== null) {
      effectivePeriod = Number(customOptions.stepLead);
    } else if (win?.period !== undefined && win?.period !== null && !isNaN(Number(win.period))) {
      effectivePeriod = Number(win.period);
    } else {
      effectivePeriod = 24;
    }
  } else {
    effectivePeriod = Number(effectivePeriod);
  }

  const isObsMode = Boolean(win?.isObservation || (!win?.forecastCycle && win?.obsTime));
  const isLive = win?.timelineMode === "live";
  const policy = (customOptions?.policy || customOptions?.config?.policy || (isObsMode ? "hold" : "nearest")).toLowerCase();
  const hasPolicy = Boolean(customOptions?.policy || customOptions?.config?.policy);
  const rawOffset = customOptions?.offset ?? customOptions?.config?.offset;
  const hasOffset = rawOffset !== undefined && rawOffset !== null && rawOffset !== 0 && rawOffset !== "0";

  let file = null;
  let resolved = null;

  if (candidateFiles.length > 0 && (hasPolicy || hasOffset || isObsMode)) {
    const layerMetaForResolve = {
      id: layerId,
      model,
      element,
      level: targetLevel,
      cycle,
      forecastCycle: cycle,
      period: effectivePeriod,
      policy,
      tolerance: customOptions?.tolerance || customOptions?.config?.tolerance,
      offset: rawOffset,
      sampleTimes: candidateFiles,
    };
    resolved = resolveLayerTime(layerMetaForResolve, cursorTime, { forceLatestAt: isLive });
    if (resolved?.sampleFile) {
      file = resolved.sampleFile;
      const parts = file.split(".");
      if (parts.length > 1 && /^\d+$/.test(parts[1])) {
        effectivePeriod = parseInt(parts[1], 10);
      }
    }
  }

  if (!file) {
    if (hasOffset) {
      const offMin = parseOffset(rawOffset);
      effectivePeriod = Math.max(0, effectivePeriod + Math.round(offMin / 60));
    }
    file = `${cycle}.${String(effectivePeriod).padStart(3, "0")}`;

    if (candidateFiles.length > 0 && !candidateFiles.includes(file)) {
      if (policy === "latest-at" || policy === "hold") {
        let bestFile = null;
        let bestLead = -1;
        for (const cf of candidateFiles) {
          const parts = cf.split(".");
          if (parts.length > 1 && /^\d+$/.test(parts[1])) {
            const p = parseInt(parts[1], 10);
            if (p <= effectivePeriod && p > bestLead) {
              bestLead = p;
              bestFile = cf;
            }
          }
        }
        file = bestFile || candidateFiles[0];
      } else {
        let closestFile = candidateFiles[0];
        let minDiff = Infinity;
        for (const cf of candidateFiles) {
          const parts = cf.split(".");
          if (parts.length > 1 && /^\d+$/.test(parts[1])) {
            const p = parseInt(parts[1], 10);
            const diff = Math.abs(p - effectivePeriod);
            if (diff < minDiff) {
              minDiff = diff;
              closestFile = cf;
            }
          }
        }
        file = closestFile;
      }
      const parts = file.split(".");
      if (parts.length > 1 && /^\d+$/.test(parts[1])) {
        effectivePeriod = parseInt(parts[1], 10);
      }
    }
  }

  if (!resolved) {
    const layerMetaDummy = {
      id: layerId,
      model,
      element,
      level: targetLevel,
      cycle,
      forecastCycle: cycle,
      period: effectivePeriod,
      file,
      policy,
      tolerance: customOptions?.tolerance || customOptions?.config?.tolerance,
      offset: rawOffset,
      sampleTimes: candidateFiles.length > 0 ? candidateFiles : undefined,
    };
    resolved = resolveLayerTime(layerMetaDummy, cursorTime, { forceLatestAt: isLive });
  }

  const existingLayer = getLayerById(layerId, win);
  const snap = win?.layerSnapshots?.find((s) => s.id === layerId || (s.element === element && s.model === model));
  const exCfg = existingLayer?.config || snap?.config || {};

  const isHeight = element === "HGT";
  const isTemp = element === "TMP";
  const defaultLineColor = isHeight ? "#58a6ff" : (isTemp ? "#f85149" : (isVOR ? "#c678dd" : (isDIV ? "#56d4dd" : "#58a6ff")));
  const lineColor = resolveLineColor({
    customOptions: isTimeStep ? customOptions : null,
    existingLayer,
    snapshot: snap,
    defaultLineColor: customOptions?.lineColor || defaultLineColor,
  });
  const opacity = exCfg.opacity ?? customOptions?.opacity ?? 0.75;
  let showFill = exCfg.showFill ?? customOptions?.showFill ?? (!isHeight && !isWind && !isVortDiv);
  const showLine = exCfg.showLine ?? customOptions?.showLine ?? !isWind;
  const showLabels = exCfg.showLabels ?? customOptions?.showLabels ?? true;
  const lineWidth = exCfg.lineWidth ?? customOptions?.lineWidth ?? (isVortDiv ? 2.0 : 1.4);
  const showWind = exCfg.showWind ?? customOptions?.showWind ?? isWind;
  const showBarbs = exCfg.showBarbs ?? customOptions?.showBarbs ?? false;
  let showRaster = exCfg.showRaster ?? customOptions?.showRaster ?? (isVortDiv ? false : Boolean(appState.state?.layers?.raster));
  if (showFill && showRaster) {
    showRaster = false;
  }
  const defaultBoldValues = isVOR ? [0, 10] : (isDIV ? [0] : customOptions?.boldValues);
  const boldValues = exCfg.boldValues ?? customOptions?.boldValues ?? defaultBoldValues;
  // null = explicit "built-in default" reset from the palette picker and must
  // win over the preset default; only fall through while the key is absent.
  const pickPalettePath = (...holders) => {
    for (const h of holders) {
      if (h && Object.prototype.hasOwnProperty.call(h, "palettePath")) return h.palettePath;
    }
    return undefined;
  };
  const pickedPalette = pickPalettePath(exCfg, customOptions, snap?.config);
  const savedPalettePath = pickedPalette === undefined ? null : pickedPalette;
  const isVisible = existingLayer
    ? (existingLayer.visible !== false)
    : (snap ? snap.visible !== false : (customOptions?.visible !== undefined ? customOptions.visible !== false : true));
  const smooth = exCfg.smooth ?? customOptions?.smooth ?? true;
  const smoothIterations = exCfg.smoothIterations ?? customOptions?.smoothIterations ?? 2;
  const labelSize = exCfg.labelSize ?? customOptions?.labelSize;
  const interval = exCfg.interval ?? customOptions?.interval ?? snap?.config?.interval ?? null;
  const levels = exCfg.levels ?? customOptions?.levels ?? snap?.config?.levels ?? null;

  if (!isVisible) {
    if (map) {
      flushContourSource(map, layerId);
      setLayerIsobandVisibility(map, layerId, false);
      setLayerIsolineVisibility(map, layerId, false);
      if (isWind) {
        stopWindAnimation(map);
        removeGridWindBarbs(map);
      }
    }
    contourReRenderModule.disarmContourReRender?.(map, layerId, win);
    removeLegend(layerId || element, win);

    addOrUpdateLayer({
      id: layerId,
      name,
      type: isWind ? "wind" : "contour",
      element,
      level: targetLevel,
      model,
      path: dataPath,
      file,
      period: effectivePeriod,
      stepLead: effectivePeriod,
      forecastCycle: cycle,
      gridData: null,
      colormap: customOptions?.colormap || element,
      color: lineColor,
      visible: false,
      derivedFrom: customOptions?.derivedFrom || (isVortDiv ? (hasLevel ? `wind-${model}-${level}` : `wind-${model}`) : undefined),
      policy: customOptions?.policy,
      tolerance: customOptions?.tolerance,
      offset: customOptions?.offset,
      sampleTimes: candidateFiles.length > 0 ? candidateFiles : customOptions?.sampleTimes,
      resolved,
      status: resolved.status,
      isSoftStale: resolved.status === "soft-stale",
      isHardStale: resolved.isHardStale,
      config: isWind ? {
        showWind,
        showBarbs,
        showRaster,
        palettePath: savedPalettePath,
      } : {
        showFill,
        showLine,
        showLabels,
        lineColor,
        opacity,
        lineWidth,
        boldValues: exCfg.boldValues ?? customOptions?.boldValues,
        boldLineWidth: exCfg.boldLineWidth ?? customOptions?.boldLineWidth,
        labelSize,
        palettePath: savedPalettePath,
        showRaster,
        showWind: false,
        showBarbs: false,
        smooth,
        smoothIterations,
        interval,
        levels,
      },
    }, win);

    if (win && getActiveWindow() === win) {
      syncLayerControlForWindow(win);
    }
    return;
  }

  try {
    let gridData;
    if (isVortDiv) {
      const cacheKey = hasLevel ? `${model}/WIND/${level}/${file}` : `${model}/WIND/${file}`;
      let windData = getCachedWindGrid(win, cacheKey);
      if (!windData) {
        if (win?.windGridData && (win.level === level || !level) && win.windGridData.u && win.windGridData.v) {
          windData = win.windGridData;
        } else {
          windData = await fetchGridData(dataPath, file);
          if (win) setCachedWindGrid(win, cacheKey, windData);
        }
      }
      if (win && !win.windGridData) {
        win.windGridData = windData;
      }
      const { buildKinematicGridData } = await import("../layers/kinematics.js");
      gridData = buildKinematicGridData(element, windData.u, windData.v, windData, {
        smoothOutput: smooth,
        outputSmoothIterations: smoothIterations,
      });
    } else {
      gridData = await fetchGridData(path, file);
      if (isWind) {
        const cacheKey = hasLevel ? `${model}/WIND/${level}/${file}` : `${model}/WIND/${file}`;
        if (win) setCachedWindGrid(win, cacheKey, gridData);
      }
    }

    if (win && expectedSeq !== null && expectedSeq !== undefined && win.loadSeq !== expectedSeq) {
      return; // Discard stale in-flight response from fast navigation
    }
    let colormap = customOptions?.colormap || element;

    // Restore a previously-chosen XML palette for this layer
    if (savedPalettePath) {
      const paletteKey = `palette:${layerId}`;
      try {
        const { loadXMLPalette } = await import("../utils/paletteLoader.js");
        const { setColormaps, COLORMAPS } = await import("../utils/colormaps.js");
        const stops = await loadXMLPalette(savedPalettePath);
        if (stops) {
          setColormaps({ ...COLORMAPS, [paletteKey]: stops });
          if (existingLayer) existingLayer.colormap = paletteKey;
          colormap = paletteKey;
        }
      } catch { /* ignore — fall back to built-in */ }
    }

    if (!win?.activeGroup) {
      appState.set("gridData", gridData);
      if (win) {
        win.gridData = gridData;
        win.element = element;
        win.model = model;
        win.colormap = colormap;
      }
    }
    if (win && isWind) {
      win.windGridData = gridData;
    }

    if (!isWind) {
      renderContourLayers(map, gridData, element, {
        layerId,
        levels,
        showFill: isVisible && showFill,
        showRaster: isVisible && showRaster,
        showLine: isVisible && showLine,
        showLabels: isVisible && showLabels,
        lineColor,
        lineWidth,
        boldValues,
        boldLineWidth: exCfg.boldLineWidth ?? customOptions?.boldLineWidth,
        opacity,
        colormap,
        smooth,
        smoothIterations,
        labelSize,
        status: resolved.status,
        isSoftStale: resolved.status === "soft-stale",
        isHardStale: resolved.isHardStale,
        viewportBounds: (map && typeof map.getBounds === "function") ? map.getBounds().toArray() : null,
      });
    }

    addOrUpdateLayer({
      id: layerId,
      name,
      type: isWind ? "wind" : "contour",
      element,
      level: targetLevel,
      model,
      path: dataPath,
      file,
      period: effectivePeriod,
      stepLead: effectivePeriod,
      forecastCycle: cycle,
      gridData,
      colormap,
      color: lineColor,
      visible: isVisible,
      derivedFrom: customOptions?.derivedFrom || (isVortDiv ? (hasLevel ? `wind-${model}-${level}` : `wind-${model}`) : undefined),
      policy: customOptions?.policy,
      tolerance: customOptions?.tolerance,
      offset: customOptions?.offset,
      sampleTimes: candidateFiles.length > 0 ? candidateFiles : customOptions?.sampleTimes,
      resolved,
      status: resolved.status,
      isSoftStale: resolved.status === "soft-stale",
      isHardStale: resolved.isHardStale,
      config: isWind ? {
        showWind,
        showBarbs,
        showRaster,
        palettePath: savedPalettePath,
        status: resolved.status,
        isSoftStale: resolved.status === "soft-stale",
        isHardStale: resolved.isHardStale,
      } : {
        showFill,
        showLine,
        showLabels,
        lineColor,
        opacity,
        lineWidth,
        boldValues: exCfg.boldValues ?? customOptions?.boldValues,
        boldLineWidth: exCfg.boldLineWidth ?? customOptions?.boldLineWidth,
        labelSize,
        palettePath: savedPalettePath,
        showRaster,
        showWind: false,
        showBarbs: false,
        smooth,
        smoothIterations,
        interval,
        levels,
        status: resolved.status,
        isSoftStale: resolved.status === "soft-stale",
        isHardStale: resolved.isHardStale,
      },
    }, win);

    if (!isWind || showRaster) {
      const layerObj = getLayerById(layerId, win) || {
        id: layerId,
        name,
        element,
        level,
        model,
        path: dataPath,
        file,
        period: effectivePeriod,
        stepLead: effectivePeriod,
        forecastCycle: cycle,
        gridData,
        colormap,
        visible: isVisible,
        resolved,
        status: resolved.status,
        isSoftStale: resolved.status === "soft-stale",
        isHardStale: resolved.isHardStale,
        config: {
          showFill,
          showLine,
          showLabels,
          lineColor,
          opacity,
          lineWidth,
          boldValues: exCfg.boldValues ?? customOptions?.boldValues,
          boldLineWidth: exCfg.boldLineWidth ?? customOptions?.boldLineWidth,
          labelSize,
          palettePath: savedPalettePath,
          showRaster,
          smooth,
          smoothIterations,
          interval,
          levels,
          status: resolved.status,
          isSoftStale: resolved.status === "soft-stale",
          isHardStale: resolved.isHardStale,
        },
      };
      armContourReRender(map, layerObj, win);
    }

    // Bug fix: addOrUpdateLayer only re-renders the panel when winId === currentActiveWinId.
    // If the user switched tabs while data was loading, currentActiveWinId may differ even though
    // win is still the correct active window. Force a panel sync here to make layers visible immediately.
    if (win && getActiveWindow() === win) {
      syncLayerControlForWindow(win);
    }

    if (showRaster && isVisible) {
      const rasterOpts = {
        layerId,
        opacity,
        status: resolved.status,
        isSoftStale: resolved.status === "soft-stale",
        isHardStale: resolved.isHardStale,
      };
      if (gridData && (gridData.values || (gridData.u && gridData.v))) {
        renderGridRaster(map, gridData, element, colormap, rasterOpts);
      } else {
        const binBuffer = await fetchGridBinaryStream(path, file);
        renderBinaryRaster(map, binBuffer, element, colormap, rasterOpts);
      }
    }

    if (isWind && gridData.u && gridData.v) {
      if (isVisible && showWind) {
        renderWindStreamlines(map, gridData);
      } else {
        stopWindAnimation(map);
      }
      if (isVisible && showBarbs) {
        renderGridWindBarbs(map, gridData);
      } else {
        removeGridWindBarbs(map);
      }
    }

    const hasShading = isVisible && (Boolean(showFill) || Boolean(showRaster));
    if (hasShading) {
      updateLegend(element, colormap, gridData.stats?.min, gridData.stats?.max, win, {
        layerId,
        id: layerId,
        name,
        resolved,
        status: resolved.status,
        isSoftStale: resolved.status === "soft-stale",
        isHardStale: resolved.isHardStale,
      });
    } else {
      removeLegend(layerId || element, win);
    }

    if (win) {
      const prefetchOpts = win.prefetchDirections ? { directions: win.prefetchDirections } : {};
      schedulePrefetch(win, 150, prefetchOpts);
    }
  } catch (err) {
    console.error(`[Bootstrap] Field load failed for ${path}/${file}:`, err);
    showErrorToast(`Failed to load ${element}${hasLevel ? ` ${level}hPa` : ""}: ${err.message || err}`);
  }
}

// weatherLoader.js - Loads and renders NWP forecast weather fields and derived wind kinematics
import { getActiveWindow, updateWindowTitle } from "../ui/tabWindowManager.js";
import { getLayerById, addOrUpdateLayer, syncLayerControlForWindow } from "../ui/layerControl.js";
import { renderContourLayers } from "../layers/contourLayer.js";
import { renderBinaryRaster, renderGridRaster } from "../layers/rasterLayer.js";
import { renderWindStreamlines, stopWindAnimation, renderGridWindBarbs, removeGridWindBarbs } from "../layers/windLayer.js";
import { fetchGridData, fetchGridBinaryStream } from "../api/catalogApi.js";
import { updateLegend, removeLegend } from "../ui/legend.js";
import { appState } from "../store/appState.js";
import { resolveLatestForecastCycle } from "../utils/timelineSync.js";
import { schedulePrefetch } from "./prefetchService.js";
import { armContourReRender } from "./contourReRender.js";
import { showErrorToast } from "../ui/toast.js";

export async function loadWeatherField(map, model, element, level, period, customOptions = null, win = null, isTimeStep = false, expectedSeq = null) {
  if (!map || !model || !element || typeof model !== "string" || typeof element !== "string" || model.toLowerCase() === "null" || model.toLowerCase() === "undefined" || element.toLowerCase() === "null" || element.toLowerCase() === "undefined") {
    console.warn(`[weatherLoader] Aborting loadWeatherField: invalid map (${Boolean(map)}), model (${model}), or element (${element})`);
    return;
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
  const file = `${cycle}.${String(period).padStart(3, "0")}`;
  const path = `${model}/${element}/${level}`;
  const dataPath = isVortDiv ? `${model}/WIND/${level}` : path;
  const isWind = (element === "WIND" && !isDerivedWind) || customOptions?.isWind;
  const layerId = customOptions?.id || (isWind ? `wind-${element}` : (isVortDiv ? `contour-${model}-${element.toLowerCase()}-${level}` : `contour-${element}`));
  const name = isWind
    ? `${level} hPa Wind Field (${model})`
    : (isVortDiv
      ? `${level} hPa Derived ${isVOR ? "Relative Vorticity" : (isDIV ? "Divergence" : "Wind Speed")} (${model})`
      : `${level} hPa ${element} (${model})`);

  const existingLayer = getLayerById(layerId, win);
  const snap = win?.layerSnapshots?.find((s) => s.id === layerId || (s.element === element && s.model === model));
  const exCfg = existingLayer?.config || snap?.config || {};

  const isHeight = element === "HGT";
  const isTemp = element === "TMP";
  const defaultLineColor = isHeight ? "#58a6ff" : (isTemp ? "#f85149" : (isVOR ? "#c678dd" : (isDIV ? "#56d4dd" : "#58a6ff")));
  const lineColor = existingLayer?.color || snap?.color || exCfg.lineColor || customOptions?.lineColor || defaultLineColor;
  const opacity = exCfg.opacity ?? customOptions?.opacity ?? 0.75;
  let showFill = exCfg.showFill ?? customOptions?.showFill ?? (!isHeight && !isWind && !isVortDiv);
  const showLine = exCfg.showLine ?? customOptions?.showLine ?? !isWind;
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
  const isVisible = existingLayer ? (existingLayer.visible !== false) : (snap ? snap.visible !== false : true);
  const smooth = exCfg.smooth ?? customOptions?.smooth ?? true;
  const smoothIterations = exCfg.smoothIterations ?? customOptions?.smoothIterations ?? 2;
  const labelSize = exCfg.labelSize ?? customOptions?.labelSize;
  const interval = exCfg.interval ?? customOptions?.interval ?? snap?.config?.interval ?? null;
  const levels = exCfg.levels ?? customOptions?.levels ?? snap?.config?.levels ?? null;

  try {
    let gridData;
    if (isVortDiv) {
      const cacheKey = `${model}/WIND/${level}/${file}`;
      let windData = null;
      if (win?._windGridCache?.has(cacheKey)) {
        windData = win._windGridCache.get(cacheKey);
      } else if (win?.windGridData && (win.level === level || !level) && win.windGridData.u && win.windGridData.v) {
        windData = win.windGridData;
      } else {
        windData = await fetchGridData(dataPath, file);
        if (win) {
          if (!win._windGridCache) win._windGridCache = new Map();
          win._windGridCache.set(cacheKey, windData);
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
        const cacheKey = `${model}/WIND/${level}/${file}`;
        if (win) {
          if (!win._windGridCache) win._windGridCache = new Map();
          win._windGridCache.set(cacheKey, gridData);
        }
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
        lineColor,
        lineWidth,
        boldValues,
        boldLineWidth: customOptions?.boldLineWidth,
        opacity,
        colormap,
        smooth,
        smoothIterations,
        labelSize,
        viewportBounds: (map && typeof map.getBounds === "function") ? map.getBounds().toArray() : null,
      });
    }

    addOrUpdateLayer({
      id: layerId,
      name,
      type: isWind ? "wind" : "contour",
      element,
      level,
      model,
      path: dataPath,
      file,
      gridData,
      colormap,
      color: lineColor,
      visible: isVisible,
      derivedFrom: customOptions?.derivedFrom || (isVortDiv ? `wind-${model}-${level}` : undefined),
      config: isWind ? {
        showWind,
        showBarbs,
        showRaster,
        palettePath: savedPalettePath,
      } : {
        showFill,
        showLine,
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

    if (!isWind || showRaster) {
      const layerObj = getLayerById(layerId, win) || {
        id: layerId,
        element,
        level,
        model,
        path,
        file,
        gridData,
        colormap,
        visible: isVisible,
        config: {
          showFill,
          showLine,
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
      if (gridData && (gridData.values || (gridData.u && gridData.v))) {
        renderGridRaster(map, gridData, element, colormap, { layerId, opacity });
      } else {
        const binBuffer = await fetchGridBinaryStream(path, file);
        renderBinaryRaster(map, binBuffer, element, colormap, { layerId, opacity });
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
      updateLegend(element, colormap, gridData.stats?.min, gridData.stats?.max, win);
    } else {
      removeLegend(element, win);
    }

    if (win) {
      const prefetchOpts = win.prefetchDirections ? { directions: win.prefetchDirections } : {};
      schedulePrefetch(win, 150, prefetchOpts);
    }
  } catch (err) {
    console.error(`[Bootstrap] Field load failed for ${path}/${file}:`, err);
    showErrorToast(`Failed to load ${element} ${level}hPa: ${err.message || err}`);
  }
}

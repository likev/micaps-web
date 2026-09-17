// presetLoader.js - Preset group loading, weather layer teardown, and config reload
import { getLayersForWindow, clearWindowWeatherLayers } from "../ui/layerControl.js";
import { removeAllContourLayers } from "../layers/contourLayer.js";
import { stopWindAnimation, removeGridWindBarbs } from "../layers/windLayer.js";
import { removeStationLayer } from "../layers/stationLayer.js";
import { removeRasterLayer } from "../layers/rasterLayer.js";
import { loadTLogPLayer, removeTLogPLayer, tlogpController } from "../layers/tlogp/tlogpLayer.js";
import { clearLegends } from "../ui/legend.js";
import { getActiveWindow, updateWindowTitle, setWindowHeaderPreset, refreshPresetControls } from "../ui/tabWindowManager.js";
import { setNavBarPreset, refreshNavBarPresets } from "../ui/navBar.js";
import { appState } from "../store/appState.js";
import { resolveForecastCycles, syncObservationTimeline, invalidateForecastCyclesCache } from "../utils/timelineSync.js";
import { setTimelineMode } from "../ui/timeSlider.js";
import { resolveColormap } from "../utils/colormaps.js";
import { loadWeatherField } from "./weatherLoader.js";
import { loadObservationProduct } from "./derivedContours.js";
import { schedulePrefetch } from "./prefetchService.js";
import { loadPresetGroups } from "../config/presets.js";

export function clearAllWeatherLayersFromMap(map, win = null) {
  if (!map) return;
  // Snapshot visibility/config before wiping so every clear path (preset reload,
  // init-cycle change, catalog load, level change) can restore operator state.
  // Only snapshot once per cycle — changeVerticalLevel pre-snapshots before
  // delegating here, so never overwrite a fresher snapshot with an emptied list.
  if (win && !win.layerSnapshots) {
    try {
      const prev = getLayersForWindow(win);
      if (prev && prev.length > 0) {
        win.layerSnapshots = prev.map((l) => ({
          id: l.id,
          type: l.type,
          model: l.model,
          element: l.element,
          visible: l.visible !== false,
          config: { ...(l.config || {}) },
          color: l.color,
          colormap: l.colormap,
        }));
      }
    } catch { /* snapshot is best-effort */ }
  }
  try {
    removeAllContourLayers(map);
    stopWindAnimation(map);
    removeGridWindBarbs(map);
    removeStationLayer(map);
    removeRasterLayer(map);
    removeTLogPLayer(map, win);
    clearLegends(win);
  } catch (err) {
    console.warn("[Main] Error cleaning up weather layers:", err);
  }
  if (win) {
    clearWindowWeatherLayers(win);
  }
}

export async function loadPresetGroup(map, group, period = null, level = null, win = null, isTimeStep = false, expectedSeq = null) {
  if (!group || !group.layers) return;
  if (map && win) {
    map._micapsWindow = win;
  }
  if (!isTimeStep) {
    clearAllWeatherLayersFromMap(map, win);
  }

  const curPeriod = period !== null ? period : (win?.period ?? 24);
  const curLevel = level !== null ? level : (group.defaultLevel || win?.level || 500);
  const prevPeriod = win?.period;

  if (win) {
    if (level !== null) win.level = level;
    win.period = curPeriod;
    const titleName = group.hasLevel && level !== null
      ? group.name
        // Rewrite the level prefix ("500 hPa ..." -> "700 hPa ...", space included)
        .replace(/\d+\s*hPa/i, `${level} hPa`)
        // Drop any stale internal catalog-path suffix "(MODEL/ELEMENT/LEVEL)" from display names
        .replace(/\s*\((?:SURFACE|UPPER_AIR)\/[^)]*\)/i, "")
      : group.name;
    updateWindowTitle(win, titleName);
    setWindowHeaderPreset(win, group.id);
  }
  if (win && getActiveWindow() === win) {
    appState.update({
      activeGroup: group,
      level: win.level,
      period: curPeriod,
      model: win.model,
      element: win.element,
      obsTime: win.obsTime,
      isObservation: win.isObservation,
    });
    setNavBarPreset(group.id);
  }

  const winTitle = `W${(win?.winIdx ?? 0) + 1}: ${group.name}`;
  if (!isTimeStep && !group.isObservation && win) {
    const pLayer = group.layers.find((l) => l.type === "contour" || l.type === "wind");
    const cycles = await resolveForecastCycles(pLayer?.model || win.model || "ECMWF_HR", pLayer?.element || win.element || "TMP", curLevel);
    if (!win.forecastCycle || !cycles.includes(win.forecastCycle)) {
      win.forecastCycle = cycles[0];
    }
    updateWindowTitle(win);
    const nwpPayload = { period: curPeriod, winTitle, initCycle: win.forecastCycle, cycles, stepLength: win.stepLength || 6 };
    win._nwpTimeline = nwpPayload;
    if (getActiveWindow() === win) {
      setTimelineMode("nwp", nwpPayload);
    } else {
      win._pendingNwp = nwpPayload;
    }
  }

  console.log(`[PresetGroup] Loading "${group.name}" with levelOverride=${level}, period=+${curPeriod}h, cycle=${win?.forecastCycle}...`);

  const results = await Promise.allSettled(
    group.layers.map(async (layer) => {
      let targetLevel = null;
      if (level !== null) {
        targetLevel = (layer.model === "SURFACE" || layer.level === 0) ? null : level;
      } else {
        targetLevel = layer.level || (group.hasLevel ? group.defaultLevel : null);
      }

      if (layer.type === "contour" || layer.type === "wind") {
        if (layer.derivedFrom && (layer.model === "SURFACE" || layer.model === "UPPER_AIR")) {
          // Skip loadWeatherField for station-derived contours;
          // station pass derives them once station data is fetched.
          return;
        }
        const render = layer.render || {};
        await loadWeatherField(map, layer.model, layer.element, targetLevel, curPeriod, {
          ...render,
          id: layer.id,
          keepWind: true,
          colormap: resolveColormap(group, render, targetLevel),
        }, win, isTimeStep, expectedSeq);
      } else if (layer.type === "station") {
        const obsPath = (layer.model === "UPPER_AIR" && targetLevel)
          ? `UPPER_AIR/${layer.element || "PLOT"}/${targetLevel}`
          : (layer.path || (layer.model === "UPPER_AIR"
            ? `UPPER_AIR/${layer.element || "PLOT"}/${targetLevel || 500}`
            : `${layer.model}/${layer.element}`));
        let file = win?.obsTime;
        if (!file || (!isTimeStep && group.isObservation && level !== null)) {
          file = await syncObservationTimeline(obsPath, win?.obsTime, winTitle, win);
          if (win) {
            win.obsTime = file;
            updateWindowTitle(win);
          }
        }
        const stationLayerId = (layer.model === "UPPER_AIR" && targetLevel) ? `upperair-obs-${targetLevel}` : layer.id;
        await loadObservationProduct(map, layer.model, layer.element, targetLevel, file, win, obsPath, expectedSeq, stationLayerId);
      } else if (layer.type === "tlogp") {
        let file = win?.obsTime;
        if (!file || (!isTimeStep && group.isObservation && !win?.obsTime)) {
          file = await syncObservationTimeline(layer.path || "UPPER_AIR/TLOGP", win?.obsTime, winTitle, win);
          if (win) {
            win.obsTime = file;
            updateWindowTitle(win);
          }
        }
        if (isTimeStep && tlogpController.isActive()) {
          await tlogpController.updateCycle(file, win, map);
        } else {
          await loadTLogPLayer(map, layer, curPeriod, targetLevel, win);
        }
      }
    })
  );
  const anySuccess = results.some((r) => r.status === "fulfilled");
  if (!anySuccess && win && prevPeriod !== undefined) {
    // Rollback period assignment if all layer loads failed
    win.period = prevPeriod;
  }
  // Snapshots are one-shot: consumed by the loaders above (existing+snap merge).
  // Clear here so a later unrelated preset cannot inherit stale visibility.
  if (win?.layerSnapshots) {
    win.layerSnapshots = null;
  }
  if (win) {
    const prefetchOpts = win.prefetchDirections ? { directions: win.prefetchDirections } : {};
    schedulePrefetch(win, 150, prefetchOpts);
  }
}

export async function reloadConfiguration() {
  invalidateForecastCyclesCache();
  await loadPresetGroups();
  refreshPresetControls();
  refreshNavBarPresets();
  console.log("[Config] Preset configuration reloaded");
  const win = getActiveWindow();
  if (win?.map) {
    win.forecastCycle = null;
    if (win.activeGroup) {
      await loadPresetGroup(win.map, win.activeGroup, win.period, win.level, win);
    } else if (!win.isObservation) {
      await loadWeatherField(win.map, win.model, win.element, win.level, win.period, null, win);
    }
  }
}

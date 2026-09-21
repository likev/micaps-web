// presetLoader.js - Preset group loading, weather layer teardown, and config reload
import { getLayersForWindow, clearWindowWeatherLayers, syncLayerControlForWindow } from "../ui/layerControl.js";
import { removeAllContourLayers } from "../layers/contourLayer.js";
import { stopWindAnimation, removeGridWindBarbs } from "../layers/windLayer.js";
import { removeStationLayer } from "../layers/stationLayer.js";
import { removeRasterLayer } from "../layers/rasterLayer.js";
import { loadTLogPLayer, removeTLogPLayer, tlogpController } from "../layers/tlogp/tlogpLayer.js";
import { loadTimeHeightLayer, removeTimeHeightLayer, timeHeightController } from "../layers/timeheight/timeHeightLayer.js";
import { loadLineHeightLayer, removeLineHeightLayer, lineHeightController, loadHovmollerLayer, removeHovmollerLayer, hovmollerController } from "../layers/lineprofile/lineProfileLayer.js";
import { clearLegends } from "../ui/legend.js";
import { getActiveWindow, updateWindowTitle, setWindowHeaderPreset, refreshPresetControls } from "../ui/tabWindowManager.js";
import { setNavBarPreset, refreshNavBarPresets } from "../ui/navBar.js";
import { appState } from "../store/appState.js";
import { resolveForecastCycles, syncObservationTimeline, invalidateForecastCyclesCache } from "../utils/timelineSync.js";
import { setTimelineMode, setTimeSliderVisible } from "../ui/timeSlider.js";
import { resolveColormap } from "../utils/colormaps.js";
import { loadWeatherField } from "./weatherLoader.js";
import { loadObservationProduct } from "./derivedContours.js";
import { schedulePrefetch } from "./prefetchService.js";
import { loadPresetGroups, PRESET_GROUPS } from "../config/presets.js";

export function clearAllWeatherLayersFromMap(map, win = null, { resetVisibility = false } = {}) {
  if (!map) return;
  // Snapshot visibility/config before wiping so every clear path (preset reload,
  // init-cycle change, catalog load, level change) can restore operator state.
  // Only snapshot once per cycle — changeVerticalLevel pre-snapshots before
  // delegating here, so never overwrite a fresher snapshot with an emptied list.
  //
  // resetVisibility=true: fresh user-initiated group reload — preserve colors/configs
  // but reset all layers to visible so previously-hidden layers come back on reload.
  // resetVisibility=false (default): level change / init-cycle change — preserve
  // exact visible state so operator-hidden layers stay hidden across level steps.
  if (win && !win.layerSnapshots) {
    try {
      const prev = getLayersForWindow(win);
      if (prev && prev.length > 0) {
        win.layerSnapshots = prev.map((l) => ({
          id: l.id,
          type: l.type,
          model: l.model,
          element: l.element,
          visible: resetVisibility ? true : (l.visible !== false),
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
    removeTimeHeightLayer(map, win);
    removeLineHeightLayer(map, win);
    removeHovmollerLayer(map, win);
    clearLegends(win);
  } catch (err) {
    console.warn("[Main] Error cleaning up weather layers:", err);
  }
  if (win) {
    clearWindowWeatherLayers(win);
  }
}


export async function loadPresetGroup(map, group, period = null, level = null, win = null, isTimeStep = false, expectedSeq = null) {
  if (!group) {
    console.warn("[PresetGroup] Abort: no group");
    return;
  }
  if (!map) {
    console.warn(`[PresetGroup] Abort "${group.id || group.name}": no map instance`);
    return;
  }
  if (!Array.isArray(group.layers) && group?.id) {
    try {
      const pristine = PRESET_GROUPS?.find((g) => g.id === group.id);
      if (pristine && Array.isArray(pristine.layers)) {
        group.layers = JSON.parse(JSON.stringify(pristine.layers));
      }
    } catch { /* fall through to the invalid-group guard */ }
  }
  if (!Array.isArray(group.layers)) {
    console.warn(`[PresetGroup] Abort "${group.id || group.name}": group.layers is not an array`);
    return;
  }
  if (!isTimeStep && group?.id) {
    // Self-heal: if a base preset layer was ✕-removed from this window copy,
    // restore it from the pristine global definition so fresh Load Data always
    // iterates the full preset (eye-hide is handled via resetVisibility below).
    try {
      const pristine = PRESET_GROUPS?.find((g) => g.id === group.id);
      if (pristine && Array.isArray(pristine.layers)) {
        for (const pl of pristine.layers) {
          if (pl?.derivedFrom) continue;
          const exists = group.layers.some(
            (l) => (pl.id && l.id === pl.id) || (l.model === pl.model && l.element === pl.element)
          );
          if (!exists) {
            group.layers.push(JSON.parse(JSON.stringify(pl)));
          }
        }
      }
    } catch { /* self-heal is best-effort */ }
  }
  if (map && win) {
    map._micapsWindow = win;
  }
  if (!isTimeStep) {
    // resetVisibility=true: fresh reload → previously-hidden layers come back visible
    clearAllWeatherLayersFromMap(map, win, { resetVisibility: true });
  }

  const curPeriod = period !== null ? period : (win?.period ?? 24);
  const curLevel = level !== null ? level : (group.defaultLevel || win?.level || 500);
  const prevPeriod = win?.period;
  // Fresh observation loads must land on latest even when re-clicking the same
  // preset (applyPresetToWindow only clears on group-id change). Capture before
  // the first per-layer sync sets _obsTimeline, so every station layer in this
  // Load uses bypassCache + latest instead of the second layer downgrading via
  // stale cache. Level steps keep _obsTimeline and preserve the selected chip.
  const freshObsLoad = !isTimeStep && Boolean(group.isObservation) && !win?._obsTimeline;

  // Rewrite derived/station ids to the requested level so Load Data at a
  // non-default level (e.g. 850 preset opened at 700) does not load stale
  // 500/850 ids/paths. Mirrors levelController rewriting for level steps.
  if (level !== null && group.hasLevel !== false && Array.isArray(group.layers)) {
    for (const l of group.layers) {
      if (l?.model === "UPPER_AIR") {
        l.level = level;
        if (l.type === "station") {
          l.id = `upperair-obs-${level}`;
          l.path = `UPPER_AIR/${l.element || "PLOT"}/${level}`;
          l.name = `${level} hPa Sounding Station Plots`;
        } else if (l.derivedFrom) {
          l.id = `contour-sounding-${(l.element || "HGT").toLowerCase()}-${level}`;
          if (typeof l.derivedFrom === "string" && l.derivedFrom.startsWith("upperair-obs-")) {
            l.derivedFrom = `upperair-obs-${level}`;
          }
          const elemName = l.element === "HGT" ? "Geopotential Height" : (l.element === "TMP" ? "Temperature" : (l.element === "DTD" ? "Dew-Point Depression" : (l.element === "VOR" ? "Relative Vorticity" : (l.element === "DIV" ? "Divergence" : l.element))));
          l.name = `${level} hPa Derived ${elemName}`;
        }
      } else if (l?.derivedFrom && (l.element === "VOR" || l.element === "DIV" || l.element === "WIND")) {
        l.level = level;
        l.id = `contour-${l.model || "ECMWF_HR"}-${String(l.element).toLowerCase()}-${level}`;
      }
    }
  }

  if (win) {
    if (group.hasLevel === false) {
      win.level = null;
    } else if (level !== null) {
      win.level = level;
    }
    win.period = curPeriod;
    if (group.hasLevel === false || group.id === "composite-tlogp" || group.layers?.some((l) => l.element === "TLOGP")) {
      if (win.layerSnapshots) {
        win.layerSnapshots = win.layerSnapshots.filter(
          (s) => s.type !== "contour" && !s.id?.startsWith("contour-sounding-") && s.id !== "upperair-obs-500"
        );
      }
      if (win.derivedContourSnapshots) {
        win.derivedContourSnapshots = null;
      }
    }
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
    const pLayer = group.layers.find((l) => l.type === "contour" || l.type === "wind" || l.type === "timeheight" || l.type === "lineheight" || l.type === "hovmoller");
    // Fresh Loads bypass the 5-min cycle cache so a new model run appears
    // immediately; without this the loader could overwrite handleLoadData's
    // fresh latest with a stale cached cycles[0].
    const cycles = await resolveForecastCycles(pLayer?.model || win.model || "ECMWF_HR", pLayer?.element || win.element || "TMP", curLevel, true);
    if (!win.forecastCycle || !cycles.includes(win.forecastCycle)) {
      win.forecastCycle = cycles[0];
    }
    updateWindowTitle(win);
    const isTimeHeight = group.id === "composite-ec-timeheight" || group.layers.some((l) => l.type === "timeheight");
    const isHovmoller = group.id === "composite-ec-hovmoller" || group.layers.some((l) => l.type === "hovmoller");
    const defaultStep = (isTimeHeight || isHovmoller) ? 12 : 6;
    const nwpPayload = { period: curPeriod, winTitle, initCycle: win.forecastCycle, cycles, stepLength: win.stepLength || defaultStep };
    win._nwpTimeline = nwpPayload;
    if (getActiveWindow() === win) {
      if (isTimeHeight || isHovmoller) {
        setTimeSliderVisible(false);
      } else {
        setTimelineMode("nwp", nwpPayload);
      }
    } else {
      win._pendingNwp = nwpPayload;
    }
  }

  console.log(`[PresetGroup] Loading "${group.name}" with levelOverride=${level}, period=+${curPeriod}h, cycle=${win?.forecastCycle}...`);

  const results = await Promise.allSettled(
    group.layers.map(async (layer) => {
      let targetLevel = null;
      const isTLogPLayer = layer.element === "TLOGP" || (layer.path && layer.path.includes("TLOGP")) || layer.type === "tlogp";
      if (group.hasLevel === false || isTLogPLayer) {
        targetLevel = null;
      } else if (level !== null) {
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
          visible: layer.visible !== false,
          colormap: resolveColormap(group, render, targetLevel),
        }, win, isTimeStep, expectedSeq);
      } else if (layer.type === "station") {
        const isTLogP = layer.element === "TLOGP" || (layer.path && layer.path.includes("TLOGP"));
        const obsPath = isTLogP
          ? (layer.path || "UPPER_AIR/TLOGP")
          : (layer.model === "UPPER_AIR" && targetLevel)
            ? `UPPER_AIR/${layer.element || "PLOT"}/${targetLevel}`
            : (layer.path || (layer.model === "UPPER_AIR"
              ? `UPPER_AIR/${layer.element || "PLOT"}/${targetLevel || 500}`
              : `${layer.model}/${layer.element}`));
        let file = win?.obsTime;
        // Fresh Load Data always lands on latest (bypassCache). Level steps
        // preserve the selected chip: _obsTimeline exists so freshObsLoad is
        // false and the current file is kept when still valid.
        if (!file || freshObsLoad || (!isTimeStep && group.isObservation && level !== null && !win?._obsTimeline)) {
          file = await syncObservationTimeline(obsPath, freshObsLoad ? null : win?.obsTime, winTitle, win, { forceLatest: freshObsLoad });
          if (win) {
            win.obsTime = file;
            updateWindowTitle(win);
          }
        } else if (freshObsLoad) {
          file = await syncObservationTimeline(obsPath, null, winTitle, win, { forceLatest: true });
          if (win) {
            win.obsTime = file;
            updateWindowTitle(win);
          }
        }
        const stationLayerId = (!isTLogP && layer.model === "UPPER_AIR" && targetLevel) ? `upperair-obs-${targetLevel}` : layer.id;
        console.log(`[PresetGroup] Station load ${obsPath}/${file} (layer ${stationLayerId})`);
        await loadObservationProduct(map, layer.model, layer.element, targetLevel, file, win, obsPath, expectedSeq, stationLayerId);
      } else if (layer.type === "tlogp") {
        let file = win?.obsTime;
        if (!file || freshObsLoad || (!isTimeStep && group.isObservation && !win?.obsTime)) {
          file = await syncObservationTimeline(layer.path || "UPPER_AIR/TLOGP", freshObsLoad ? null : win?.obsTime, winTitle, win, { forceLatest: freshObsLoad });
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
      } else if (layer.type === "timeheight") {
        if (isTimeStep && timeHeightController.isActive(win)) {
          timeHeightController.updateCursorLead(curPeriod, win);
        } else {
          await loadTimeHeightLayer(map, layer, win);
        }
      } else if (layer.type === "lineheight") {
        if (isTimeStep && lineHeightController.isActive(win)) {
          lineHeightController.setLead(curPeriod, win);
        } else {
          await loadLineHeightLayer(map, layer, win);
        }
      } else if (layer.type === "hovmoller") {
        if (isTimeStep && hovmollerController.isActive(win)) {
          // Panel owns its time: global steps are no-ops (swallowed)
        } else {
          await loadHovmollerLayer(map, layer, win);
        }
      }
    })
  );
  const anySuccess = results.some((r) => r.status === "fulfilled");
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn(`[PresetGroup] Layer load failed for "${group.name}":`, result.reason);
    }
  }
  if (!anySuccess && win && prevPeriod !== undefined) {
    // Rollback period assignment if all layer loads failed
    win.period = prevPeriod;
  }
  // Snapshots are one-shot: consumed by the loaders above (existing+snap merge).
  // Clear here so a later unrelated preset cannot inherit stale visibility.
  if (win?.layerSnapshots) {
    win.layerSnapshots = null;
  }
  if (win && getActiveWindow() === win) {
    syncLayerControlForWindow(win);
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
    } else if (!win.isObservation && win.model && win.element) {
      await loadWeatherField(win.map, win.model, win.element, win.level, win.period, null, win);
    } else {
      clearAllWeatherLayersFromMap(win.map, win, { resetVisibility: true });
      clearLegends(win);
      updateWindowTitle(win);
    }
  }
}

// levelController.js - Vertical level transitions, layer state snapshots, and sounding/preset level sync
import { getActiveWindow, setWindowHeaderLevel, updateWindowTitle } from "../ui/tabWindowManager.js";
import { setNavBarLevel } from "../ui/navBar.js";
import { appState } from "../store/appState.js";
import { getLayersForWindow, addOrUpdateLayer } from "../ui/layerControl.js";
import { syncObservationTimeline } from "../utils/timelineSync.js";
import { triggerVortDivOverlay } from "../ui/layerActions.js";
import { schedulePrefetch } from "./prefetchService.js";
import { clearAllWeatherLayersFromMap, loadPresetGroup } from "./presetLoader.js";
import { loadObservationProduct } from "./derivedContours.js";
import { loadWeatherField } from "./weatherLoader.js";

export async function changeVerticalLevel(map, direction, explicitLevel = null, win = getActiveWindow()) {
  const activeGroup = win?.activeGroup;
  if (activeGroup && !activeGroup.hasLevel) {
    console.warn(`[Level] Current preset "${activeGroup.name}" does not have vertical levels.`);
    return;
  }
  // Note: line-profile Up/Down protection comes from hasLevel:false above + the
  // bootstrap onLevelStep swallow, not from a layer-type check here.
  if (win && (win.model === "SURFACE" || win.level === 0) && !activeGroup?.hasLevel) {
    console.warn("[Level] Surface observations do not have vertical levels.");
    return;
  }

  const levels = [1000, 925, 850, 700, 500, 400, 300, 200, 100];
  let targetLevel = explicitLevel;

  if (targetLevel === null) {
    const curLevel = win?.level || 500;
    let idx = levels.indexOf(curLevel);
    if (idx === -1) idx = 4;

    let newIdx = idx + direction;
    if (newIdx < 0) newIdx = 0;
    if (newIdx >= levels.length) newIdx = levels.length - 1;
    targetLevel = levels[newIdx];
    if (targetLevel === curLevel) return;
  }

  if (win) {
    win.loadSeq = (win.loadSeq || 0) + 1;
  }
  const currentSeq = win?.loadSeq;

  console.log(`[Level] Setting vertical level to ${targetLevel} hPa (seq=${currentSeq})`);
  if (win) win.level = targetLevel;
  if (win && getActiveWindow() === win) appState.set("level", targetLevel);
  setNavBarLevel(targetLevel);
  setWindowHeaderLevel(win, targetLevel);

  // Snapshot all window layers before level change to preserve visibility and config
  const prevLayers = getLayersForWindow(win);
  if (prevLayers && prevLayers.length > 0) {
    win.layerSnapshots = prevLayers.map((l) => ({
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

  if (activeGroup && activeGroup.hasLevel) {
    const stationLayer = activeGroup.layers?.find((l) => l.type === "station" && l.model === "UPPER_AIR");
    const targetStationId = stationLayer ? `upperair-obs-${targetLevel}` : null;

    const prevContours = getLayersForWindow(win)
      .filter((l) => l.type === "contour" && l.model === "UPPER_AIR")
      .map((l) => ({
        id: `contour-sounding-${(l.element || "HGT").toLowerCase()}-${targetLevel}`,
        model: l.model,
        element: l.element,
        level: targetLevel,
        config: { ...(l.config || {}) },
        derivedFrom: targetStationId || l.derivedFrom,
        visible: l.visible !== false,
      }));
    if (prevContours.length > 0) {
      win.derivedContourSnapshots = prevContours;
    }
    if (activeGroup.layers) {
      for (const l of activeGroup.layers) {
        if (l.model === "UPPER_AIR") {
          l.level = targetLevel;
          if (l.type === "station") {
            l.id = targetStationId || l.id;
            l.path = `UPPER_AIR/${l.element || "PLOT"}/${targetLevel}`;
            l.name = `${targetLevel} hPa Sounding Station Plots`;
          } else if (l.derivedFrom) {
            l.id = `contour-sounding-${(l.element || "HGT").toLowerCase()}-${targetLevel}`;
            if (targetStationId) l.derivedFrom = targetStationId;
            const elemName = l.element === "HGT" ? "Geopotential Height" : (l.element === "TMP" ? "Temperature" : (l.element === "DTD" ? "Dew-Point Depression" : (l.element === "VOR" ? "Relative Vorticity" : (l.element === "DIV" ? "Divergence" : l.element))));
            l.name = `${targetLevel} hPa Derived ${elemName}`;
          }
        } else if (l.derivedFrom && (l.element === "VOR" || l.element === "DIV" || l.element === "WIND")) {
          l.level = targetLevel;
          l.id = `contour-${l.model || "ECMWF_HR"}-${(l.element).toLowerCase()}-${targetLevel}`;
          const elemName = l.element === "VOR" ? "Relative Vorticity" : (l.element === "DIV" ? "Divergence" : "Wind Speed");
          l.name = `${targetLevel} hPa Derived ${elemName}`;
        }
      }
    }
    await loadPresetGroup(map, activeGroup, win.period, targetLevel, win, false, currentSeq);
  } else if (win?.isObservation || win?.model === "UPPER_AIR") {
    const prevContours = getLayersForWindow(win)
      .filter((l) => l.type === "contour" && l.model === "UPPER_AIR")
      .map((l) => {
        const elemName = l.element === "HGT" ? "Geopotential Height" : (l.element === "TMP" ? "Temperature" : (l.element === "DTD" ? "Dew-Point Depression" : (l.element === "VOR" ? "Relative Vorticity" : (l.element === "DIV" ? "Divergence" : l.element))));
        return {
          id: `contour-sounding-${(l.element || "HGT").toLowerCase()}-${targetLevel}`,
          name: `${targetLevel} hPa Derived ${elemName}`,
          model: l.model,
          element: l.element,
          level: targetLevel,
          config: { ...(l.config || {}) },
          derivedFrom: l.derivedFrom,
          visible: l.visible !== false,
        };
      });
    clearAllWeatherLayersFromMap(map, win);
    if (prevContours.length > 0) {
      win.derivedContourSnapshots = prevContours;
    }
    const obsPath = `UPPER_AIR/PLOT/${targetLevel}`;
    const winTitle = `W${(win?.winIdx ?? 0) + 1}: Upper-Air ${targetLevel} hPa Sounding`;
    const file = await syncObservationTimeline(obsPath, null, winTitle, win, { forceLatest: true });
    if (win && win.loadSeq !== currentSeq) return;
    if (win) {
      win.obsTime = file;
      updateWindowTitle(win, `${targetLevel} hPa Upper-Air Sounding`);
    }
    await loadObservationProduct(map, "UPPER_AIR", "PLOT", targetLevel, file, win, obsPath, currentSeq);
  } else {
    const prevDerived = getLayersForWindow(win)
      .filter((l) => l.type === "contour" && (l.element === "VOR" || l.element === "DIV" || l.derivedFrom))
      .map((l) => ({
        id: l.id,
        model: l.model,
        element: l.element,
        level: targetLevel,
        config: { ...(l.config || {}) },
        derivedFrom: l.derivedFrom,
        visible: l.visible !== false,
        colormap: l.colormap,
      }));
    clearAllWeatherLayersFromMap(map, win);
    const model = win?.model || "ECMWF_HR";
    const element = win?.element || "TMP";
    const period = win?.period ?? 24;
    if (win) {
      updateWindowTitle(win, `${targetLevel} hPa ${element} (${model})`);
    }
    await loadWeatherField(map, model, element, targetLevel, period, null, win, false, currentSeq);
    if (win && currentSeq !== null && currentSeq !== undefined && win.loadSeq !== currentSeq) {
      return;
    }
    for (const snap of prevDerived) {
      if (snap.element === element) continue;
      const liveLayerId = `contour-${snap.model || model}-${snap.element.toLowerCase()}-${targetLevel}`;
      const restored = {
        ...snap,
        id: liveLayerId,
        level: targetLevel,
        gridData: null,
      };
      addOrUpdateLayer(restored, win);
      await triggerVortDivOverlay(map, restored, win);
      if (win && currentSeq !== null && currentSeq !== undefined && win.loadSeq !== currentSeq) {
        return;
      }
    }
  }

  if (win?.layerSnapshots) {
    win.layerSnapshots = null;
  }
  if (win) {
    schedulePrefetch(win);
  }
}

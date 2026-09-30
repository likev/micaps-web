// derivedContours.js - Observation station plot loading and objective analysis derived contours
import { getActiveWindow } from "../ui/tabWindowManager.js";
import { getLayerById, addOrUpdateLayer, removeLayer, getLayersForWindow, syncLayerControlForWindow } from "../ui/layerControl.js";
import { triggerStationStreamlines, triggerRasterOverlay } from "../ui/layerActions.js";
import { renderStationWeatherPlots } from "../layers/stationLayer.js";
import { removeContourLayer } from "../layers/contourLayer.js";
import { stopWindAnimation, removeGridWindBarbs } from "../layers/windLayer.js";
import { removeRasterLayer } from "../layers/rasterLayer.js";
import { analyzeAndRenderSoundingContours, analyzeAndRenderSoundingElementContour } from "../layers/soundingAnalysis.js";
import { analyzeAndRenderSurfaceContours } from "../layers/surfaceAnalysis.js";
import { fetchStationObservations } from "../api/catalogApi.js";
import { updateLegend, removeLegend } from "../ui/legend.js";
import { schedulePrefetch } from "./prefetchService.js";
import { showErrorToast } from "../ui/toast.js";
import { appState } from "../store/appState.js";
import { resolveLayerTime, parseTimestamp } from "../utils/timeResolver.js";

export async function renderSoundingDerivedContoursForStation(map, stations, curLevel, activeGroup, win, stationLayerId) {
  if (!curLevel || activeGroup?.id === "composite-tlogp" || activeGroup?.hasLevel === false) return;
  const groupDerived = activeGroup?.layers?.filter((l) => l.type === "contour" && l.model === "UPPER_AIR" && Boolean(l.derivedFrom)) || [];
  // Core contours must not starve: presets no longer pre-declare HGT/TMP, so
  // once any dynamic layer (e.g. DTD) lands in activeGroup, the default-only
  // fallback below is bypassed and HGT/TMP would never render — neither fresh
  // (new split windows) nor on steps (stale map data). Backfill the missing
  // core elements locally (never persisted); the loop below then renders them
  // with the same visibility/snapshot/legend handling as declared layers.
  // Eye-hidden entries stay hidden (they are present, just invisible); only
  // genuinely absent elements are backfilled.
  if (groupDerived.length > 0) {
    for (const defElem of ["HGT", "TMP"]) {
      if (!groupDerived.some((l) => (l.element || "").toUpperCase() === defElem)) {
        groupDerived.push({
          id: `contour-sounding-${defElem.toLowerCase()}-${curLevel}`,
          type: "contour",
          model: "UPPER_AIR",
          element: defElem,
          level: curLevel,
          derivedFrom: stationLayerId,
          render: {},
        });
      }
    }
  }
  if (groupDerived.length > 0) {
    for (const cLayer of groupDerived) {
      try {
        const elem = (cLayer.element || "HGT").toUpperCase();
        const targetId = cLayer.id || `contour-sounding-${elem.toLowerCase()}-${curLevel}`;
        const existingDerived = getLayerById(targetId, win);
        // Visibility comes from the live store, else an EXACT-id snapshot,
        // else the preset entry. A model+element fallback snapshot must never
        // decide visibility: snapshots are remapped per level, so a stale
        // cross-level entry (e.g. after a discarded level step) would
        // otherwise resurrect eye-hidden state on an unrelated window/level.
        // The fallback below is still used for config/palette inheritance.
        const snapExact = win?.derivedContourSnapshots?.find((s) => s.id === targetId);
        const snap = snapExact || win?.derivedContourSnapshots?.find((s) => s.model === "UPPER_AIR" && s.element === elem);
        const cfg = { ...(cLayer.render || cLayer.config || {}) };
        cfg.layerId = targetId;
        cfg.derivedFrom = cLayer.derivedFrom || stationLayerId;
        const isVisible = existingDerived ? (existingDerived.visible !== false) : (snapExact ? snapExact.visible !== false : cLayer.visible !== false);
        cfg.visible = isVisible;
        if (snap?.config) Object.assign(cfg, snap.config);
        if (existingDerived?.config) Object.assign(cfg, existingDerived.config);
        // Re-assert identity/visibility AFTER the merges: snapshots embed the
        // previous level's layerId/visible inside config (buildContourLayerMeta
        // bakes them into renderOptions), which would otherwise resurrect stale
        // ids and un-hide eye-hidden layers on level steps and fresh reloads.
        const cursorTime = win?.wallClockCursor ||
          (win?.obsTime ? parseTimestamp(win.obsTime) : null) ||
          (typeof window !== "undefined" && window.__MICAPS_CURSOR__) ||
          Date.now();
        const stationLayer = getLayerById(stationLayerId, win);
        const rawSamples = cLayer.sampleTimes || stationLayer?.sampleTimes || win?._obsTimeline?.files;
        const sampleTimes = Array.isArray(rawSamples) ? [...rawSamples].sort((a, b) => a.localeCompare(b)) : rawSamples;
        const cResolved = resolveLayerTime({
          ...cLayer,
          sampleTimes,
        }, cursorTime);
        cLayer.resolved = cResolved;

        cfg.layerId = targetId;
        cfg.visible = isVisible;
        cfg.derivedFrom = cLayer.derivedFrom || stationLayerId;
        cfg.sampleTimes = sampleTimes;
        cfg.resolved = cResolved;
        cfg.status = cResolved.status;
        cfg.isSoftStale = cResolved.status === "soft-stale";
        cfg.isHardStale = cResolved.isHardStale;
        cfg.obsTime = cResolved.sampleFile || win?.obsTime;
        cfg.file = cResolved.sampleFile || win?.obsTime;
        if (existingDerived?.colormap) cfg.colormap = existingDerived.colormap;
        else if (snap?.colormap) cfg.colormap = snap.colormap;
        if (cfg.lineColor == null && existingDerived?.color) cfg.lineColor = existingDerived.color;
        else if (snap?.color) cfg.lineColor = snap.color;
        // Explicit built-in reset (palettePath null/empty) must drop stale
        // palette: keys inherited from snap/existing so timeline chips don't
        // resurrect the old custom palette.
        if (!cfg.palettePath && typeof cfg.colormap === "string" && cfg.colormap.startsWith("palette:")) {
          cfg.colormap = elem;
        }

        if (cfg.palettePath) {
          const paletteKey = `palette:${targetId}`;
          try {
            const { loadXMLPalette } = await import("../utils/paletteLoader.js");
            const { setColormaps, COLORMAPS } = await import("../utils/colormaps.js");
            const stops = await loadXMLPalette(cfg.palettePath);
            if (stops) {
              setColormaps({ ...COLORMAPS, [paletteKey]: stops });
              cfg.colormap = paletteKey;
            }
          } catch {}
        }

        analyzeAndRenderSoundingElementContour(map, stations, curLevel, elem, cfg, win);
        const renderedLayer = getLayersForWindow(win).find((l) => l.id === targetId);
        if (renderedLayer && (renderedLayer.config?.showRaster || cLayer.render?.showRaster) && isVisible) {
          await triggerRasterOverlay(map, renderedLayer, win);
        }
        const hasShading = isVisible && (Boolean(renderedLayer?.config?.showFill ?? cfg.showFill) || Boolean(renderedLayer?.config?.showRaster ?? cLayer.render?.showRaster));
        if (hasShading) {
          const colormap = renderedLayer?.colormap || cfg.colormap || elem;
          updateLegend(elem, colormap, renderedLayer?.gridData?.stats?.min, renderedLayer?.gridData?.stats?.max, win, {
            layerId: targetId,
            id: targetId,
            name: cLayer.name,
            resolved: cResolved,
            status: cResolved.status,
            isSoftStale: cResolved.status === "soft-stale",
            isHardStale: cResolved.isHardStale,
          });
        } else {
          removeLegend(targetId || elem, win);
        }
      } catch (err) {
        console.warn(`[Main] Sounding derived contour failed for ${cLayer.element}:`, err);
      }
    }
  } else {
    const winLayers = getLayersForWindow(win);
    let activeUpperContours = winLayers.filter((l) => l.type === "contour" && l.model === "UPPER_AIR");
    if (activeUpperContours.length === 0 && Array.isArray(win?.derivedContourSnapshots)) {
      activeUpperContours = win.derivedContourSnapshots.filter((l) => l.model === "UPPER_AIR");
    }
    if (activeUpperContours.length > 0) {
      for (const cLayer of activeUpperContours) {
        try {
          const elem = (cLayer.element || "HGT").toUpperCase();
          const targetId = cLayer.id || `contour-sounding-${elem.toLowerCase()}-${curLevel}`;
          const existingDerived = getLayerById(targetId, win);
          // Same exact-id visibility rule as above; fallback only for config.
          const snapExact = win?.derivedContourSnapshots?.find((s) => s.id === targetId);
          const snap = snapExact || win?.derivedContourSnapshots?.find((s) => s.model === "UPPER_AIR" && s.element === elem);
          const isVisible = existingDerived ? (existingDerived.visible !== false) : (snapExact ? snapExact.visible !== false : cLayer.visible !== false);
          const cfg = { ...(cLayer.config || {}), visible: isVisible, layerId: targetId };
          if (snap?.config) Object.assign(cfg, snap.config);
          if (existingDerived?.config) Object.assign(cfg, existingDerived.config);
          // Re-assert: win-layer/snapshot configs embed a stale layerId/visible
          // (baked into renderOptions at creation); keep this level's values.
          cfg.layerId = targetId;
          cfg.visible = isVisible;
          cfg.policy = cLayer.policy;
          cfg.tolerance = cLayer.tolerance;
          cfg.offset = cLayer.offset;
          cfg.sampleTimes = cLayer.sampleTimes;
          cfg.obsTime = win?.obsTime;
          cfg.file = win?.obsTime;
          if (existingDerived?.colormap) cfg.colormap = existingDerived.colormap;
          else if (snap?.colormap) cfg.colormap = snap.colormap;
          if (cfg.lineColor == null && existingDerived?.color) cfg.lineColor = existingDerived.color;
          else if (snap?.color) cfg.lineColor = snap.color;
          if (!cfg.palettePath && typeof cfg.colormap === "string" && cfg.colormap.startsWith("palette:")) {
            cfg.colormap = elem;
          }

          if (cfg.palettePath) {
            const paletteKey = `palette:${targetId}`;
            try {
              const { loadXMLPalette } = await import("../utils/paletteLoader.js");
              const { setColormaps, COLORMAPS } = await import("../utils/colormaps.js");
              const stops = await loadXMLPalette(cfg.palettePath);
              if (stops) {
                setColormaps({ ...COLORMAPS, [paletteKey]: stops });
                cfg.colormap = paletteKey;
              }
            } catch {}
          }

          analyzeAndRenderSoundingElementContour(map, stations, curLevel, elem, cfg, win);
          const renderedLayer = getLayersForWindow(win).find((l) => l.id === targetId);
          if (renderedLayer && (renderedLayer.config?.showRaster || cLayer.config?.showRaster) && isVisible) {
            await triggerRasterOverlay(map, renderedLayer, win);
          }
          const hasShading = isVisible && (Boolean(renderedLayer?.config?.showFill ?? cfg.showFill) || Boolean(renderedLayer?.config?.showRaster ?? cLayer.config?.showRaster));
          if (hasShading) {
            const colormap = renderedLayer?.colormap || cfg.colormap || elem;
            updateLegend(elem, colormap, renderedLayer?.gridData?.stats?.min, renderedLayer?.gridData?.stats?.max, win);
          } else {
            removeLegend(elem, win);
          }
        } catch (err) {
          console.warn(`[Main] Sounding active contour failed for ${cLayer.element}:`, err);
        }
      }
    } else {
      analyzeAndRenderSoundingContours(map, stations, curLevel, {}, win);
    }
  }
  if (win?.derivedContourSnapshots) win.derivedContourSnapshots = null;
}

export async function renderSurfaceDerivedContoursForStation(map, stations, activeGroup, win, stationLayerId) {
  const groupDerived = activeGroup?.layers?.filter((l) => l.type === "contour" && l.model === "SURFACE" && Boolean(l.derivedFrom)) || [];
  if (groupDerived.length > 0) {
    for (const cLayer of groupDerived) {
      try {
        const elem = (cLayer.element || "SLP").toUpperCase();
        const targetId = cLayer.id || `contour-surface-${elem.toLowerCase()}`;
        const existingDerived = getLayerById(targetId, win);
        // Same exact-id visibility rule as sounding; fallback only for config.
        const snapExact = win?.derivedContourSnapshots?.find((s) => s.id === targetId);
        const snap = snapExact || win?.derivedContourSnapshots?.find((s) => s.model === "SURFACE" && s.element === elem);
        const cfg = { ...(cLayer.render || cLayer.config || {}) };
        cfg.layerId = targetId;
        cfg.derivedFrom = cLayer.derivedFrom || stationLayerId;
        const isVisible = existingDerived ? (existingDerived.visible !== false) : (snapExact ? snapExact.visible !== false : cLayer.visible !== false);
        cfg.visible = isVisible;
        if (snap?.config) Object.assign(cfg, snap.config);
        if (existingDerived?.config) Object.assign(cfg, existingDerived.config);
        // Re-assert identity/visibility AFTER the merges: snapshots embed the
        // previous level's layerId/visible inside config (buildContourLayerMeta
        // bakes them into renderOptions), which would otherwise resurrect stale
        // ids and un-hide eye-hidden layers on level steps and fresh reloads.
        const cursorTime = win?.wallClockCursor ||
          (win?.obsTime ? parseTimestamp(win.obsTime) : null) ||
          (typeof window !== "undefined" && window.__MICAPS_CURSOR__) ||
          Date.now();
        const stationLayer = getLayerById(stationLayerId, win);
        const rawSamples = cLayer.sampleTimes || stationLayer?.sampleTimes || win?._obsTimeline?.files;
        const sampleTimes = Array.isArray(rawSamples) ? [...rawSamples].sort((a, b) => a.localeCompare(b)) : rawSamples;
        const cResolved = resolveLayerTime({
          ...cLayer,
          sampleTimes,
        }, cursorTime);
        cLayer.resolved = cResolved;

        cfg.layerId = targetId;
        cfg.visible = isVisible;
        cfg.derivedFrom = cLayer.derivedFrom || stationLayerId;
        cfg.policy = cLayer.policy;
        cfg.tolerance = cLayer.tolerance;
        cfg.offset = cLayer.offset;
        cfg.sampleTimes = sampleTimes;
        cfg.resolved = cResolved;
        cfg.status = cResolved.status;
        cfg.isSoftStale = cResolved.status === "soft-stale";
        cfg.isHardStale = cResolved.isHardStale;
        cfg.obsTime = cResolved.sampleFile || win?.obsTime;
        cfg.file = cResolved.sampleFile || win?.obsTime;
        if (existingDerived?.colormap) cfg.colormap = existingDerived.colormap;
        else if (snap?.colormap) cfg.colormap = snap.colormap;
        if (cfg.lineColor == null && existingDerived?.color) cfg.lineColor = existingDerived.color;
        else if (snap?.color) cfg.lineColor = snap.color;
        if (!cfg.palettePath && typeof cfg.colormap === "string" && cfg.colormap.startsWith("palette:")) {
          cfg.colormap = elem;
        }

        if (cfg.palettePath) {
          const paletteKey = `palette:${targetId}`;
          try {
            const { loadXMLPalette } = await import("../utils/paletteLoader.js");
            const { setColormaps, COLORMAPS } = await import("../utils/colormaps.js");
            const stops = await loadXMLPalette(cfg.palettePath);
            if (stops) {
              setColormaps({ ...COLORMAPS, [paletteKey]: stops });
              cfg.colormap = paletteKey;
            }
          } catch {}
        }

        analyzeAndRenderSurfaceContours(map, stations, elem, cfg, win);
        const renderedLayer = getLayersForWindow(win).find((l) => l.id === targetId);
        if (renderedLayer && (renderedLayer.config?.showRaster || cLayer.render?.showRaster) && isVisible) {
          await triggerRasterOverlay(map, renderedLayer, win);
        }
        const hasShading = isVisible && (Boolean(renderedLayer?.config?.showFill ?? cfg.showFill) || Boolean(renderedLayer?.config?.showRaster ?? cLayer.render?.showRaster));
        if (hasShading) {
          const colormap = renderedLayer?.colormap || cfg.colormap || elem;
          updateLegend(elem, colormap, renderedLayer?.gridData?.stats?.min, renderedLayer?.gridData?.stats?.max, win, {
            layerId: targetId,
            id: targetId,
            name: cLayer.name,
            resolved: cResolved,
            status: cResolved.status,
            isSoftStale: cResolved.status === "soft-stale",
            isHardStale: cResolved.isHardStale,
          });
        } else {
          removeLegend(targetId || elem, win);
        }
      } catch (err) {
        console.warn(`[Main] Surface derived contour failed for ${cLayer.element}:`, err);
      }
    }
  } else {
    const winLayers = getLayersForWindow(win);
    let activeSurfaceContours = winLayers.filter((l) => l.type === "contour" && l.model === "SURFACE");
    if (activeSurfaceContours.length === 0 && Array.isArray(win?.derivedContourSnapshots)) {
      activeSurfaceContours = win.derivedContourSnapshots.filter((l) => l.model === "SURFACE");
    }
    if (activeSurfaceContours.length > 0) {
      for (const cLayer of activeSurfaceContours) {
        try {
          const elem = (cLayer.element || "SLP").toUpperCase();
          const targetId = cLayer.id || `contour-surface-${elem.toLowerCase()}`;
          const existingDerived = getLayerById(targetId, win);
          // Same exact-id visibility rule as above; fallback only for config.
          const snapExact = win?.derivedContourSnapshots?.find((s) => s.id === targetId);
          const snap = snapExact || win?.derivedContourSnapshots?.find((s) => s.model === "SURFACE" && s.element === elem);
          const isVisible = existingDerived ? (existingDerived.visible !== false) : (snapExact ? snapExact.visible !== false : cLayer.visible !== false);
          const cfg = { ...(cLayer.config || {}), visible: isVisible, layerId: targetId };
          if (snap?.config) Object.assign(cfg, snap.config);
          if (existingDerived?.config) Object.assign(cfg, existingDerived.config);
          // Re-assert: win-layer/snapshot configs embed a stale layerId/visible
          // (baked into renderOptions at creation); keep this level's values.
          cfg.layerId = targetId;
          cfg.visible = isVisible;
          cfg.obsTime = win?.obsTime;
          cfg.file = win?.obsTime;
          if (existingDerived?.colormap) cfg.colormap = existingDerived.colormap;
          else if (snap?.colormap) cfg.colormap = snap.colormap;
          if (cfg.lineColor == null && existingDerived?.color) cfg.lineColor = existingDerived.color;
          else if (snap?.color) cfg.lineColor = snap.color;
          if (!cfg.palettePath && typeof cfg.colormap === "string" && cfg.colormap.startsWith("palette:")) {
            cfg.colormap = elem;
          }

          if (cfg.palettePath) {
            const paletteKey = `palette:${targetId}`;
            try {
              const { loadXMLPalette } = await import("../utils/paletteLoader.js");
              const { setColormaps, COLORMAPS } = await import("../utils/colormaps.js");
              const stops = await loadXMLPalette(cfg.palettePath);
              if (stops) {
                setColormaps({ ...COLORMAPS, [paletteKey]: stops });
                cfg.colormap = paletteKey;
              }
            } catch {}
          }

          analyzeAndRenderSurfaceContours(map, stations, elem, cfg, win);
          const renderedLayer = getLayersForWindow(win).find((l) => l.id === targetId);
          if (renderedLayer && (renderedLayer.config?.showRaster || cLayer.config?.showRaster) && isVisible) {
            await triggerRasterOverlay(map, renderedLayer, win);
          }
          const hasShading = isVisible && (Boolean(renderedLayer?.config?.showFill ?? cfg.showFill) || Boolean(renderedLayer?.config?.showRaster ?? cLayer.config?.showRaster));
          if (hasShading) {
            const colormap = renderedLayer?.colormap || cfg.colormap || elem;
            updateLegend(elem, colormap, renderedLayer?.gridData?.stats?.min, renderedLayer?.gridData?.stats?.max, win);
          } else {
            removeLegend(elem, win);
          }
        } catch (err) {
          console.warn(`[Main] Surface active contour failed for ${cLayer.element}:`, err);
        }
      }
    } else {
      analyzeAndRenderSurfaceContours(map, stations, "SLP", {}, win);
    }
  }
  if (win?.derivedContourSnapshots) win.derivedContourSnapshots = null;
}

export async function loadUpperAirComposite(map, level = 500, obsTime = "20260828200000.000", win = getActiveWindow(), expectedSeq = null) {
  const curLevel = level || 500;
  // Guard upper-air sounding: validate that obsTime conforms to standard synoptic soundings (08:00 or 20:00 BJT)
  let effectiveObsTime = obsTime || "20260828200000.000";
  if (typeof effectiveObsTime === "string" && effectiveObsTime.length >= 10) {
    const hour = parseInt(effectiveObsTime.slice(8, 10), 10);
    if (hour !== 8 && hour !== 20) {
      console.warn(`[UpperAir] Warning: requested time ${effectiveObsTime} (hour ${hour}) is outside standard 08:00/20:00 synoptic soundings.`);
    }
  }
  const path = `UPPER_AIR/PLOT/${curLevel}`;
  let stations;
  try {
    stations = await fetchStationObservations(path, effectiveObsTime);
  } catch (err) {
    console.error("[Main] Upper-air composite load error:", err);
    showErrorToast(`Upper-air load failed (${curLevel}hPa): ${err.message || err}`);
    return;
  }
  if (win && expectedSeq !== null && expectedSeq !== undefined && win.loadSeq !== expectedSeq) {
    return; // Discard stale in-flight response from fast navigation
  }
  appState.set("stationData", stations);
  const activeGroup = win?.activeGroup;
  const groupStationLayer = activeGroup?.layers?.find((l) => l.type === "station");
  const layerId = groupStationLayer?.id || "station-upper";
  const existingStn = getLayerById(layerId, win);
  const snapStn = win?.layerSnapshots?.find((s) => s.id === layerId || (s.type === "station" && s.model === "UPPER_AIR"));
  const isVisible = existingStn ? (existingStn.visible !== false) : (snapStn ? snapStn.visible !== false : (appState.state.layers.station !== false));
  const cursorTime = win?.wallClockCursor ||
    (win?.obsTime ? parseTimestamp(win.obsTime) : null) ||
    (typeof window !== "undefined" && window.__MICAPS_CURSOR__) ||
    Date.now();
  const stnResolved = resolveLayerTime(groupStationLayer || {
    id: layerId,
    type: "station",
    model: "UPPER_AIR",
    file: effectiveObsTime,
    policy: groupStationLayer?.policy,
    tolerance: groupStationLayer?.tolerance,
    offset: groupStationLayer?.offset,
    sampleTimes: groupStationLayer?.sampleTimes,
  }, cursorTime);
  const stnConfig = {
    ...(groupStationLayer?.render || {}),
    ...(groupStationLayer?.config || {}),
    ...(snapStn?.config || {}),
    ...(existingStn?.config || {}),
    resolved: stnResolved,
    status: stnResolved.status,
    isSoftStale: stnResolved.status === "soft-stale",
    isHardStale: stnResolved.isHardStale,
  };
  renderStationWeatherPlots(map, stations, isVisible, stnConfig, layerId);
  const stnLayer = addOrUpdateLayer({
    id: layerId,
    name: `${curLevel} hPa Sounding Station Plots`,
    type: "station",
    color: "#e3b341",
    visible: isVisible,
    removable: true,
    stationsGeoJSON: stations,
    model: "UPPER_AIR",
    level: curLevel,
    policy: groupStationLayer?.policy,
    tolerance: groupStationLayer?.tolerance,
    offset: groupStationLayer?.offset,
    sampleTimes: groupStationLayer?.sampleTimes,
    resolved: stnResolved,
    status: stnResolved.status,
    isSoftStale: stnResolved.status === "soft-stale",
    isHardStale: stnResolved.isHardStale,
    config: stnConfig,
  }, win);
  if (win && getActiveWindow() === win) syncLayerControlForWindow(win);
  if (stnLayer?.config?.showStreamlines && isVisible) triggerStationStreamlines(map, stnLayer, win);
  if (stations?.features?.length >= 3) {
    await renderSoundingDerivedContoursForStation(map, stations, curLevel, activeGroup, win, layerId);
  }
  if (win) {
    const prefetchOpts = win.prefetchDirections ? { directions: win.prefetchDirections } : {};
    schedulePrefetch(win, 150, prefetchOpts);
  }
}

export async function loadObservationProduct(map, model, element, level, file, win = getActiveWindow(), customPath = null, expectedSeq = null, customStationLayerId = null) {
  let targetFile = file;
  if (typeof targetFile === "string") {
    targetFile = targetFile.trim();
    if (targetFile === "null" || targetFile === "undefined") {
      targetFile = "";
    } else if (targetFile.length === 14 && !targetFile.includes(".")) {
      targetFile = `${targetFile}.000`;
    }
  }
  const path = customPath || (model === "SURFACE" ? `SURFACE/${element}` : (model === "UPPER_AIR" ? `UPPER_AIR/${element}/${level || 500}` : `${model}/${element}`));
  try {
    const stations = await fetchStationObservations(path, targetFile);
    if (win && expectedSeq !== null && expectedSeq !== undefined && win.loadSeq !== expectedSeq) {
      return; // Discard stale in-flight response from fast navigation
    }
    // Replacement data is in hand: only now retire the previous time-step's
    // wind/raster/barb visuals. Tearing them down before the guarded fetch
    // (as the step callers used to do) blanks the map while the store still
    // reports visible whenever the load discards or fails.
    try { stopWindAnimation(map); } catch {}
    try { removeGridWindBarbs(map); } catch {}
    try { removeRasterLayer(map); } catch {}
    appState.set("stationData", stations);
    const activeGroup = win?.activeGroup;
    const groupStationLayer = customStationLayerId
      ? activeGroup?.layers?.find((l) => l.id === customStationLayerId)
      : activeGroup?.layers?.find((l) => l.type === "station");
    const isTLogP = element === "TLOGP" || (path && path.includes("TLOGP"));
    if (isTLogP) {
      const winLayers = getLayersForWindow(win);
      const staleContours = winLayers.filter(
        (l) => l.type === "contour" && (l.model === "UPPER_AIR" || l.id?.startsWith("contour-sounding-"))
      );
      for (const sc of staleContours) {
        removeContourLayer(map, sc.id);
        removeLayer(sc.id, win);
      }
    }
    const layerId = customStationLayerId || groupStationLayer?.id || (isTLogP ? "upperair-tlogp-stations" : (model === "UPPER_AIR" ? "station-upper" : `station-${model.toLowerCase()}`));
    const existingStn = getLayerById(layerId, win);
    const snapStn = win?.layerSnapshots?.find((s) => s.id === layerId || (s.type === "station" && s.model === model));
    const isVisible = existingStn
      ? (existingStn.visible !== false)
      : (snapStn ? snapStn.visible !== false : (groupStationLayer?.visible !== undefined ? groupStationLayer.visible !== false : (appState.state.layers.station !== false)));
    const name = isTLogP
      ? "Sounding Station Network"
      : (model === "UPPER_AIR" ? `${level || 500} hPa Sounding Station Plots` : `${model === "SURFACE" ? "Surface" : "Upper Air"} Station Observations`);
    const isRainProduct = /rain/i.test(element || "") || /rain/i.test(path || "");
    const cursorTime = win?.wallClockCursor ||
      (win?.obsTime ? parseTimestamp(win.obsTime) : null) ||
      (typeof window !== "undefined" && window.__MICAPS_CURSOR__) ||
      Date.now();
    const stnResolved = resolveLayerTime(groupStationLayer || {
      id: layerId,
      type: "station",
      model,
      element,
      file: targetFile,
      policy: groupStationLayer?.policy,
      tolerance: groupStationLayer?.tolerance,
      offset: groupStationLayer?.offset,
      sampleTimes: groupStationLayer?.sampleTimes,
    }, cursorTime);
    const stnConfig = {
      ...(isRainProduct ? { showRain6: true } : {}),
      ...(groupStationLayer?.render || {}),
      ...(groupStationLayer?.config || {}),
      ...(snapStn?.config || {}),
      ...(existingStn?.config || {}),
      resolved: stnResolved,
      status: stnResolved.status,
      isSoftStale: stnResolved.status === "soft-stale",
      isHardStale: stnResolved.isHardStale,
    };
    renderStationWeatherPlots(map, stations, isVisible, stnConfig, layerId);
    const stnLayer = addOrUpdateLayer({
      id: layerId,
      name,
      type: "station",
      color: "#e3b341",
      visible: isVisible,
      removable: true,
      stationsGeoJSON: stations,
      model,
      element,
      level,
      policy: groupStationLayer?.policy,
      tolerance: groupStationLayer?.tolerance,
      offset: groupStationLayer?.offset,
      sampleTimes: groupStationLayer?.sampleTimes,
      resolved: stnResolved,
      status: stnResolved.status,
      isSoftStale: stnResolved.status === "soft-stale",
      isHardStale: stnResolved.isHardStale,
      config: stnConfig,
    }, win);
    if (win && getActiveWindow() === win) syncLayerControlForWindow(win);
    if (stnLayer?.config?.showStreamlines && isVisible) triggerStationStreamlines(map, stnLayer, win);
    if (model === "SURFACE" && stations?.features?.length >= 3) {
      await renderSurfaceDerivedContoursForStation(map, stations, activeGroup, win, layerId);
    }
    if (model === "UPPER_AIR" && !isTLogP && stations?.features?.length >= 3) {
      const curLevel = level || 500;
      await renderSoundingDerivedContoursForStation(map, stations, curLevel, activeGroup, win, layerId);
    }
    if (win) {
      const prefetchOpts = win.prefetchDirections ? { directions: win.prefetchDirections } : {};
      schedulePrefetch(win, 150, prefetchOpts);
    }
  } catch (err) {
    console.error("[Main] Observation load error:", err);
    showErrorToast(`Observation load failed: ${err.message || err}`);
  }
}

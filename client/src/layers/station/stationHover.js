// stationHover.js - High-efficiency O(1) screen grid hover hit testing and tooltip integration
import { getState } from "./stationState.js";

export function isPointInBounds(bounds, lon, lat) {
  if (!bounds) return true;
  const s = bounds.getSouth();
  const n = bounds.getNorth();
  if (lat < s - 1.5 || lat > n + 1.5) return false;

  const w = bounds.getWest();
  const e = bounds.getEast();
  if (e - w >= 360) return true;

  let normLon = lon;
  while (normLon < w) normLon += 360;
  while (normLon > e) normLon -= 360;

  return normLon >= w && normLon <= e;
}

export function onStationMouseMove(map, e) {
  const state = getState(map);
  if (!state.visible || !state.activeVisibleStations || state.activeVisibleStations.length === 0) return;
  state.lastHoverEvent = e;

  if (typeof requestAnimationFrame === "function") {
    if (state.hoverAnimId) return;
    state.hoverAnimId = requestAnimationFrame(() => {
      state.hoverAnimId = null;
      if (state.lastHoverEvent) {
        handleStationHover(map, state.lastHoverEvent);
      }
    });
  } else {
    handleStationHover(map, e);
  }
}

export function findStationAtPoint(map, point) {
  const state = getState(map);
  if (!state.visible || !state.activeVisibleStations || state.activeVisibleStations.length === 0) return null;
  if (!point) return null;

  const px = point.x;
  const py = point.y;
  const scale = state.currentScale || 1.0;
  const minDist = 22 * scale; // Hit radius scales with zoom
  let closestDistSq = minDist * minDist;
  let hovered = null;

  // 1. Fast O(1) coarse bin lookup using 100x100px screen cells
  if (state.activeBins && state.activeBins.size > 0) {
    const minBx = Math.floor((px - minDist) / 100);
    const maxBx = Math.floor((px + minDist) / 100);
    const minBy = Math.floor((py - minDist) / 100);
    const maxBy = Math.floor((py + minDist) / 100);

    for (let bx = minBx; bx <= maxBx; bx++) {
      for (let by = minBy; by <= maxBy; by++) {
        const bin = state.activeBins.get(`${bx},${by}`);
        if (!bin) continue;
        for (let i = 0; i < bin.length; i++) {
          const s = bin[i];
          const dx = s.pt.x - px;
          const dy = s.pt.y - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < closestDistSq) {
            closestDistSq = d2;
            hovered = s;
          }
        }
      }
    }
  } else {
    for (const s of state.activeVisibleStations) {
      const dx = s.pt.x - px;
      const dy = s.pt.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < closestDistSq) {
        closestDistSq = d2;
        hovered = s;
      }
    }
  }
  return hovered;
}

export function handleStationClick(map, e) {
  if (!map || !e || !e.point) return;
  const hit = findStationAtPoint(map, e.point);
  if (hit && hit.feature && hit.feature.properties) {
    const props = hit.feature.properties;
    const stnId = props.station_id || props.id;
    if (stnId) {
      Promise.all([
        import("../tlogp/tlogpController.js"),
        import("../../ui/tabWindowManager.js").catch(() => ({})),
      ]).then(([{ tlogpController }, tabWinModule]) => {
        if (tlogpController && tlogpController.isActive()) {
          const getActiveWindow = tabWinModule?.getActiveWindow;
          const targetWin = map._micapsWindow || (typeof getActiveWindow === "function" ? getActiveWindow() : null) || (typeof window !== "undefined" && window.__MICAPS_ACTIVE_WIN__) || null;
          tlogpController.setStation(String(stnId), targetWin, map);
        }
      });
    }
  }
}

export function handleStationHover(map, e) {
  const state = getState(map);
  if (!state.visible || !state.activeVisibleStations || state.activeVisibleStations.length === 0) return;
  if (!e || !e.point) return;

  const px = e.point.x;
  const py = e.point.y;
  const hovered = findStationAtPoint(map, e.point);

  const targetGlobal = typeof window !== "undefined" ? window : globalThis;
  if (hovered) {
    if (map.getCanvas && map.getCanvas()) {
      map.getCanvas().style.cursor = "pointer";
    }
    if (typeof targetGlobal.__SHOW_TOOLTIP__ === "function") {
      targetGlobal.__SHOW_TOOLTIP__([hovered.lon, hovered.lat], hovered.feature.properties, { x: px, y: py });
    }
  } else {
    if (map.getCanvas && map.getCanvas()) {
      map.getCanvas().style.cursor = "";
    }
    if (typeof targetGlobal.__HIDE_TOOLTIP__ === "function") {
      targetGlobal.__HIDE_TOOLTIP__();
    }
  }
}

export function handleStationMouseOut(map) {
  const state = getState(map);
  if (state.hoverAnimId && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(state.hoverAnimId);
    state.hoverAnimId = null;
  }
  state.lastHoverEvent = null;

  if (map.getCanvas && map.getCanvas()) {
    map.getCanvas().style.cursor = "";
  }
  const targetGlobal = typeof window !== "undefined" ? window : globalThis;
  if (typeof targetGlobal.__HIDE_TOOLTIP__ === "function") {
    targetGlobal.__HIDE_TOOLTIP__();
  }
}

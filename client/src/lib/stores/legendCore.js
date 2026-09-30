// legendCore.js - Plain-core legend data structures and item builders
import { getColormap, getCSSGradient } from "../../utils/colormaps.js";
import { formatElementUnit } from "../../utils/formatters.js";
import { getWindowById } from "./tabsCore.js";
import { getLayersForWindow, getCurrentActiveWinId } from "./layersCore.js";
import { resolveLayerTime } from "../../utils/timeResolver.js";

const windowLegends = new Map();

export function getWindowLegendsMap() {
  return windowLegends;
}

let defaultWinResolver = null;

export function setDefaultWinResolver(resolver) {
  defaultWinResolver = resolver;
}

// True while the Svelte Legend component is mounted and owns #legend-panel.
// Legacy direct-DOM writes must stand down then, or Svelte reconciliation
// fights them (stale wipes / partial renders ~0.1s after load).
let svelteOwner = false;

export function setSvelteLegendOwner(v) {
  svelteOwner = Boolean(v);
}

export function hasSvelteLegendOwner() {
  return svelteOwner;
}

// Change listeners for cross-module reactivity bridging (plain JS so both
// legacy ui/legend.js and the Svelte store can share one notification path
// without import cycles or .svelte.js runtime requirements).
const legendListeners = new Set();

export function onLegendChange(cb) {
  if (typeof cb !== "function") return () => {};
  legendListeners.add(cb);
  return () => { legendListeners.delete(cb); };
}

export function notifyLegendChanged(winId = null) {
  for (const cb of legendListeners) {
    try { cb(winId); } catch {}
  }
}

export function buildLegendItems(winOrId, legendsMap = windowLegends, winResolver = null) {
  const winId = typeof winOrId === "string" ? winOrId : (winOrId?.id || "default");
  const elMap = legendsMap.get(winId);
  if (!elMap || elMap.size === 0) return [];

  let livePrefix = null;
  let liveWin = null;
  if (winOrId && typeof winOrId === "object" && typeof winOrId.winIdx === "number") {
    livePrefix = `W${winOrId.winIdx + 1}`;
  }
  const resolver = winResolver || defaultWinResolver || getWindowById;
  if (!livePrefix && typeof resolver === "function") {
    try {
      liveWin = resolver(winId);
      if (liveWin && typeof liveWin.winIdx === "number") livePrefix = `W${liveWin.winIdx + 1}`;
    } catch {}
  }

  const layers = getLayersForWindow(winId) || [];

  // Deduplicate entries so each layer/element has at most one legend item
  const rawItems = Array.from(elMap.values());
  const dedupedItems = [];
  const seenIdentities = new Set();
  const staleKeysToDelete = [];

  for (let i = rawItems.length - 1; i >= 0; i--) {
    const item = rawItems[i];
    const { element } = item;
    const normElement = (element || "TMP").toUpperCase();

    // How many layers in this window have this element?
    const elementLayers = layers.filter(
      (l) => (l.element && l.element.toUpperCase() === normElement) || (normElement === "WIND" && l.type === "wind")
    );

    let layer = null;
    if (item.layerId) {
      layer = layers.find((l) => l.id === item.layerId) || null;
    }
    if (!layer && elementLayers.length === 1) {
      layer = elementLayers[0];
    } else if (!layer && item.name) {
      layer = elementLayers.find((l) => l.name === item.name) || null;
    }

    // Identity for deduplication:
    // If an item has an explicit layerId, that layerId distinguishes it from other layers with different layerIds.
    // When no layerId is present and at most 1 layer of this element exists, collapse to the element identity.
    const identity = layer?.id || item.layerId || (elementLayers.length <= 1 ? normElement : (item.key || normElement));

    if (seenIdentities.has(identity)) {
      if (item.key && elMap.has(item.key)) {
        staleKeysToDelete.push(item.key);
      }
      continue;
    }
    seenIdentities.add(identity);
    dedupedItems.unshift({ item, layer });
  }

  for (const k of staleKeysToDelete) {
    elMap.delete(k);
  }

  return dedupedItems.map(({ item, layer }) => {
    const { element, colormap, zMin, zMax } = item;
    const palette = getColormap(colormap, element);
    const unit = formatElementUnit(element);
    const grad = getCSSGradient(element, colormap);

    let tickLabels = [];
    if (palette && palette.length > 0) {
      const fixedScale = new Set(["RH", "TMP", "TD", "DTD", "WIND", "RAIN", "RAIN6"]);
      if (!fixedScale.has(element) && zMin !== undefined && zMax !== undefined && zMax > zMin) {
        if (element === "HGT") {
          const isDam = zMax < 2500;
          const low = Math.round(zMin);
          const mid = Math.round((zMin + zMax) / 2);
          const high = Math.round(zMax);
          tickLabels = [`${low}`, `${mid}`, `${high} ${isDam ? "dam" : "gpm"}`];
        } else {
          const low = Math.round(zMin);
          const mid = Math.round((zMin + zMax) / 2);
          const high = Math.round(zMax);
          tickLabels = [`${low}`, `${mid}`, `${high} ${unit}`.trim()];
        }
      } else {
        const first = palette[0].val;
        const mid = palette[Math.floor(palette.length / 2)].val;
        const last = palette[palette.length - 1].val;
        tickLabels = [`${first}`, `${mid}`, `${last} ${unit}`.trim()];
      }
    }

    const titleText = item.name || (layers.filter((l) => l.element && l.element.toUpperCase() === element).length > 1 ? layer?.name : null) || element;
    const prefix = livePrefix || item.winPrefix || (typeof winId === "string" && winId.match(/win-(\d+)/) ? `W${parseInt(winId.match(/win-(\d+)/)[1], 10) + 1}` : null);
    const displayTitle = prefix ? `[${prefix}] ${titleText}` : titleText;

    // Part 2: Time resolution & staleness for legend item (§2.4)
    let timeBadge = item.timeBadge || null;
    let resolvedTimeZ = item.resolvedTimeZ || null;
    let ageStr = item.ageStr || null;
    let status = item.status || "current";
    let statusIcon = item.statusIcon || "●";
    let statusText = item.statusText || "Current";
    let isStale = Boolean(item.isStale);
    let isHardStale = Boolean(item.isHardStale);
    let isDesync = Boolean(item.isDesync);

    if (layer) {
      if (layer.resolved) {
        resolvedTimeZ = layer.resolved.actualTimeZ;
        ageStr = layer.resolved.ageStr;
        timeBadge = `${resolvedTimeZ} (${ageStr})`;
        status = layer.resolved.status;
        statusIcon = layer.resolved.statusIcon;
        statusText = layer.resolved.statusText;
        isStale = layer.resolved.isStale;
        isHardStale = layer.resolved.isHardStale;
        isDesync = layer.resolved.isDesync;
      } else if (liveWin) {
        const cursor = liveWin.obsTime || (liveWin.period !== undefined ? { cycle: liveWin.forecastCycle, period: liveWin.period } : Date.now());
        const res = resolveLayerTime(layer, cursor);
        resolvedTimeZ = res.actualTimeZ;
        ageStr = res.ageStr;
        timeBadge = `${resolvedTimeZ} (${ageStr})`;
        status = res.status;
        statusIcon = res.statusIcon;
        statusText = res.statusText;
        isStale = res.isStale;
        isHardStale = res.isHardStale;
        isDesync = res.isDesync;
      }
    }

    const statusColors = {
      current: "#3fb950",
      "soft-stale": "#d29922",
      "hard-stale": "#f85149",
      desync: "#58a6ff",
    };
    const statusColor = statusColors[status] || "#3fb950";

    return {
      key: item.key || layer?.id || item.layerId || element,
      element,
      colormap,
      zMin,
      zMax,
      unit,
      gradient: grad,
      tickLabels,
      displayTitle,
      timeBadge,
      resolvedTimeZ,
      ageStr,
      status,
      statusIcon,
      statusColor,
      statusText,
      isStale,
      isHardStale,
      isDesync,
      layerId: layer?.id || item.layerId || null,
    };
  });
}

export function updateLegend(element = "TMP", colormap = null, zMin = undefined, zMax = undefined, win = null, extra = {}) {
  const normElement = (element || "TMP").toUpperCase();
  const resolver = defaultWinResolver || getWindowById;
  const winObj = typeof win === "string" ? (typeof resolver === "function" ? resolver(win) : null) : win;
  const winId = typeof win === "string" ? win : (win?.id || (typeof getCurrentActiveWinId === "function" ? getCurrentActiveWinId() : "default") || "default");
  if (!windowLegends.has(winId)) {
    windowLegends.set(winId, new Map());
  }
  const elMap = windowLegends.get(winId);

  const extraObj = (typeof extra === "object" && extra !== null) ? extra : {};

  // 1. Resolve layerId
  let layerId = extraObj.layerId || extraObj.id || extraObj.layer?.id || null;
  const windowLayers = getLayersForWindow(winId) || [];
  const elementLayers = windowLayers.filter(
    (l) => (l.element && l.element.toUpperCase() === normElement) || (normElement === "WIND" && l.type === "wind")
  );

  if (!layerId && colormap && String(colormap).startsWith("palette:")) {
    const candidateId = String(colormap).slice(8);
    if (elMap.has(candidateId) || windowLayers.some((l) => l.id === candidateId)) {
      layerId = candidateId;
    }
  }
  if (!layerId) {
    if (elementLayers.length === 1) {
      layerId = elementLayers[0].id;
    } else if (elementLayers.length > 1) {
      if (extraObj.name) {
        const byName = elementLayers.find((l) => l.name === extraObj.name);
        if (byName) layerId = byName.id;
      }
      if (!layerId && extraObj.level !== undefined) {
        const byLevel = elementLayers.find((l) => l.level === extraObj.level);
        if (byLevel) layerId = byLevel.id;
      }
    }
  }

  // 2. Locate existing legend entry in elMap to avoid duplicating items
  let existingKey = null;
  let existingEntry = null;

  if (layerId) {
    if (elMap.has(layerId)) {
      existingKey = layerId;
      existingEntry = elMap.get(layerId);
    } else {
      for (const [k, v] of elMap.entries()) {
        if (v.layerId === layerId || k === layerId) {
          existingKey = k;
          existingEntry = v;
          break;
        }
      }
    }
    // Also check if there's an entry matching name
    if (!existingEntry && extraObj.name) {
      for (const [k, v] of elMap.entries()) {
        if (v.element === normElement && v.name === extraObj.name) {
          existingKey = k;
          existingEntry = v;
          break;
        }
      }
    }
    // Check generic element entry if it has no conflicting layerId
    if (!existingEntry && elMap.has(normElement)) {
      const candidate = elMap.get(normElement);
      if (!candidate.layerId || candidate.layerId === layerId) {
        existingKey = normElement;
        existingEntry = candidate;
      }
    }
    // If only one layer of this element exists and has no conflicting layerId, match that existing entry
    if (!existingEntry && elementLayers.length <= 1) {
      const elemMatches = Array.from(elMap.entries()).filter(([k, v]) => v.element === normElement && (!v.layerId || v.layerId === layerId));
      if (elemMatches.length === 1) {
        existingKey = elemMatches[0][0];
        existingEntry = elemMatches[0][1];
      }
    }
  } else {
    // No layerId provided
    if (extraObj.name) {
      for (const [k, v] of elMap.entries()) {
        if (v.element === normElement && v.name === extraObj.name) {
          existingKey = k;
          existingEntry = v;
          break;
        }
      }
    }
    if (!existingEntry && elMap.has(normElement)) {
      existingKey = normElement;
      existingEntry = elMap.get(normElement);
    }
    if (!existingEntry) {
      // Find entries matching normElement
      const matches = Array.from(elMap.entries()).filter(([k, v]) => v.element === normElement);
      if (matches.length === 1) {
        existingKey = matches[0][0];
        existingEntry = matches[0][1];
      } else if (matches.length > 1) {
        if (extraObj.level !== undefined) {
          const byLevel = matches.filter(([k, v]) => v.level === extraObj.level);
          if (byLevel.length === 1) {
            existingKey = byLevel[0][0];
            existingEntry = byLevel[0][1];
          }
        }
        if (!existingEntry && zMin !== undefined && zMax !== undefined) {
          const byZ = matches.filter(([k, v]) => v.zMin === zMin && v.zMax === zMax);
          if (byZ.length === 1) {
            existingKey = byZ[0][0];
            existingEntry = byZ[0][1];
          }
        }
      }
    }
  }

  // Inherit layerId from existing entry if known
  if (!layerId && existingEntry?.layerId) {
    layerId = existingEntry.layerId;
  }

  // Canonical storage key: prefer layerId, then existingKey, then normElement
  const legendKey = layerId || existingKey || normElement;

  // 3. Remove any conflicting / duplicate entries for the same layer or element
  if (existingKey && existingKey !== legendKey) {
    elMap.delete(existingKey);
  }
  for (const [k, v] of elMap.entries()) {
    if (k === legendKey) continue;
    if (layerId && (v.layerId === layerId || k === layerId)) {
      elMap.delete(k);
    } else if (v.element === normElement) {
      if (!v.layerId && (elementLayers.length <= 1 || k === normElement || !layerId)) {
        elMap.delete(k);
      }
    }
  }

  // 4. Merge prefixes & metadata
  let winPrefix = winObj && typeof winObj.winIdx === "number" ? `W${winObj.winIdx + 1}` : null;
  if (!winPrefix && typeof winId === "string") {
    const m = winId.match(/win-(\d+)/);
    if (m) winPrefix = `W${parseInt(m[1], 10) + 1}`;
  }
  winPrefix = winPrefix || existingEntry?.winPrefix || null;

  let timeBadge = extraObj.timeBadge;
  if (!timeBadge && extraObj.resolved?.actualTimeZ) {
    timeBadge = `${extraObj.resolved.actualTimeZ} (${extraObj.resolved.ageStr || "±0m"})`;
  }
  timeBadge = timeBadge || existingEntry?.timeBadge || null;

  const resolvedTimeZ = extraObj.resolvedTimeZ || extraObj.resolved?.actualTimeZ || existingEntry?.resolvedTimeZ || null;
  const ageStr = extraObj.ageStr || extraObj.resolved?.ageStr || existingEntry?.ageStr || null;
  const status = extraObj.status || extraObj.resolved?.status || existingEntry?.status || "current";
  const statusIcon = extraObj.statusIcon || extraObj.resolved?.statusIcon || existingEntry?.statusIcon || "●";
  const statusText = extraObj.statusText || extraObj.resolved?.statusText || existingEntry?.statusText || "Current";
  const isStale = extraObj.isStale !== undefined ? extraObj.isStale : (extraObj.resolved?.isStale ?? existingEntry?.isStale ?? false);
  const isHardStale = extraObj.isHardStale !== undefined ? extraObj.isHardStale : (extraObj.resolved?.isHardStale ?? existingEntry?.isHardStale ?? false);
  const isDesync = extraObj.isDesync !== undefined ? extraObj.isDesync : (extraObj.resolved?.isDesync ?? existingEntry?.isDesync ?? false);
  const name = extraObj.name || existingEntry?.name || null;

  elMap.set(legendKey, {
    key: legendKey,
    layerId,
    name,
    element: normElement,
    colormap,
    zMin: zMin !== undefined ? zMin : existingEntry?.zMin,
    zMax: zMax !== undefined ? zMax : existingEntry?.zMax,
    winPrefix,
    ...extraObj,
    timeBadge,
    resolvedTimeZ,
    ageStr,
    status,
    statusIcon,
    statusText,
    isStale,
    isHardStale,
    isDesync,
  });
  notifyLegendChanged(winId);
}

export function removeLegend(elementOrId, win = null) {
  if (!elementOrId) return;
  const winId = typeof win === "string" ? win : (win?.id || (typeof getCurrentActiveWinId === "function" ? getCurrentActiveWinId() : "default") || "default");
  if (windowLegends.has(winId)) {
    const elMap = windowLegends.get(winId);
    let matched = false;
    if (elMap.has(elementOrId)) {
      elMap.delete(elementOrId);
      matched = true;
    }
    for (const [k, v] of elMap.entries()) {
      if (v.layerId === elementOrId || k === elementOrId) {
        elMap.delete(k);
        matched = true;
      }
    }
    // Only fall back to element-name matching if elementOrId did not match a specific layer ID
    if (!matched) {
      const norm = String(elementOrId).toUpperCase();
      if (elMap.has(norm)) {
        elMap.delete(norm);
      }
      for (const [k, v] of elMap.entries()) {
        if (v.element === norm || v.element === elementOrId) {
          elMap.delete(k);
        }
      }
    }
  }
  notifyLegendChanged(winId);
}

export function clearLegends(win = null) {
  const winId = typeof win === "string" ? win : (win?.id || "default");
  if (windowLegends.has(winId)) {
    windowLegends.get(winId).clear();
  }
  notifyLegendChanged(winId);
}

export function deleteWindowLegends(win = null) {
  const winId = typeof win === "string" ? win : (win?.id || "default");
  if (windowLegends.has(winId)) {
    windowLegends.delete(winId);
  }
  notifyLegendChanged(winId);
}

// derivedContourActions.js - Triggers for adding derived contour layers from wind or station data
import { appState } from "../../store/appState.js";
import { getLayersForWindow, addOrUpdateLayer } from "./layerStore.js";
import { getStationGeoJSON } from "../../layers/stationLayer.js";
import { updateLegend } from "../legend.js";
import { upsertDerivedLayerToPreset } from "../../config/presets.js";
import {
  notifyError,
  triggerRasterOverlay,
  triggerVortDivOverlay,
} from "../../services/overlayTriggers.js";
import { setCachedWindGrid } from "../../utils/windGridCache.js";

function syncDerivedLayerToWindowPreset(activeGroup, layerEntry) {
  if (!activeGroup || !Array.isArray(activeGroup.layers) || !layerEntry) return;
  const index = activeGroup.layers.findIndex((candidate) =>
    candidate?.id === layerEntry.id ||
    (candidate?.derivedFrom && candidate.derivedFrom === layerEntry.derivedFrom && candidate.model === layerEntry.model && candidate.element === layerEntry.element)
  );
  if (index >= 0) {
    activeGroup.layers[index] = {
      ...activeGroup.layers[index],
      ...layerEntry,
      render: { ...(activeGroup.layers[index].render || {}), ...(layerEntry.render || {}) },
    };
  } else {
    activeGroup.layers.push({ ...layerEntry, render: { ...(layerEntry.render || {}) } });
  }
}

const DERIVED_INDEX_KEYS = new Set([
  "K-INDEX",
  "K_INDEX",
  "SHOWALTER",
  "LIFTED",
  "SWEAT",
  "TT",
  "SHEAR",
  "THICKNESS",
  "TMP_DIFF",
]);

export function isServerDerivedElement(val) {
  const norm = (val || "").toUpperCase().trim();
  if (DERIVED_INDEX_KEYS.has(norm)) return true;
  if (/^T?(\d+)[-_](\d+)$/.test(norm)) return true;
  return false;
}

export async function handleDerivedServerContourAction(map, layer, value, winObj) {
  const normVal = (value || "").toUpperCase().trim();
  const rangeMatch = normVal.match(/^T?(\d+)[-_](\d+)$/);

  const isStation =
    layer?.type === "station" ||
    layer?.model === "UPPER_AIR" ||
    (layer?.id && layer.id.includes("upper")) ||
    (layer?.name && (layer.name.includes("Sounding") || layer.name.includes("Upper"))) ||
    (!layer?.model && winObj?.model === "UPPER_AIR");

  const activeGroup = winObj?.activeGroup || appState.get("activeGroup");

  if (isStation) {
    let elem = "K_INDEX";
    let lvl = "850-500";
    let virtualPath = "";
    let elemName = "";
    let colormap = "K_INDEX";

    if (rangeMatch) {
      elem = "TMP_DIFF";
      lvl = `${rangeMatch[1]}-${rangeMatch[2]}`;
      virtualPath = `/api/derived/UPPER_AIR/PLOT/TMP/${lvl}`;
      elemName = `T${lvl} Difference`;
      colormap = "TMP";
    } else {
      const idx = normVal === "K-INDEX" || normVal === "K" ? "K_INDEX" : normVal;
      elem = idx;
      const pathIdx = normVal === "K_INDEX" ? "K-INDEX" : normVal;
      virtualPath = `/api/derived/UPPER_AIR/PLOT/${pathIdx}`;
      elemName = idx;
      colormap = idx;
    }

    const liveLayerId = `contour-sounding-${elem.toLowerCase().replace(/_/g, "-")}-${lvl}`;
    const derivedFrom = layer?.id || `upperair-obs-${lvl}`;
    const file = layer?.file || winObj?.obsTime || winObj?.file || "";

    const { SOUNDING_CONTOUR_CONFIGS, analyzeAndRenderSoundingElementContour } = await import(
      "../../layers/soundingAnalysis.js"
    );
    const { fetchStationObservations } = await import("../../api/catalogApi.js");

    let stnData = null;
    try {
      stnData = await fetchStationObservations(virtualPath, file);
    } catch (err) {
      console.warn("[derivedContourActions] fetchStationObservations failed:", err);
    }

    const geojson =
      stnData && Array.isArray(stnData.features) && stnData.features.length >= 3
        ? stnData
        : layer?.stationsGeoJSON || getStationGeoJSON(map) || winObj?.stationsGeoJSON || appState.get("stationData");

    if (!geojson || !Array.isArray(geojson.features) || geojson.features.length < 3) {
      notifyError(`Insufficient station observations to generate derived ${elemName}.`);
      return;
    }

    const cfg = SOUNDING_CONTOUR_CONFIGS[elem] || SOUNDING_CONTOUR_CONFIGS.TMP_DIFF || {};
    const defaultColor = cfg.defaultColor || "#f85149";

    const res = analyzeAndRenderSoundingElementContour(
      map,
      geojson,
      lvl,
      elem,
      {
        layerId: liveLayerId,
        lineColor: defaultColor,
        derivedFrom,
        path: virtualPath,
        colormap,
        showFill: Boolean(cfg.showFill),
        showLine: true,
        showRaster: false,
      },
      winObj
    );

    const renderedLayer = getLayersForWindow(winObj).find((l) => l.id === liveLayerId);
    if (renderedLayer) {
      renderedLayer.path = virtualPath;
    }

    if (res && activeGroup?.id) {
      const derivedEntry = {
        id: liveLayerId,
        model: "UPPER_AIR",
        element: elem,
        level: lvl,
        name: `Derived ${cfg.name || elemName}`,
        path: virtualPath,
        type: "contour",
        derivedFrom,
        render: {
          showFill: Boolean(cfg.showFill),
          showLine: true,
          showRaster: false,
          lineColor: defaultColor,
          colormap,
        },
      };
      upsertDerivedLayerToPreset(activeGroup.id, derivedEntry);
      syncDerivedLayerToWindowPreset(activeGroup, derivedEntry);
    }
    return;
  }

  // Model Grid Derivation (ECMWF_HR, JAPAN_MR, etc.)
  const model = layer?.model || winObj?.model || "ECMWF_HR";
  let elem = "TMP";
  let lvl = "850-500";
  let virtualPath = "";
  let elemName = "";
  let colormap = "TMP";

  if (rangeMatch) {
    elem = "TMP";
    lvl = `${rangeMatch[1]}-${rangeMatch[2]}`;
    virtualPath = `/api/derived/${model}/TMP/${lvl}`;
    elemName = `T${lvl} Lapse Rate`;
    colormap = "TMP";
  } else {
    elem = normVal === "K_INDEX" ? "K-INDEX" : normVal;
    virtualPath = `/api/derived/${model}/${elem}`;
    elemName = elem;
    colormap = elem.replace(/-/g, "_");
  }

  const liveLayerId = `contour-${model}-${elem.toLowerCase().replace(/_/g, "-")}-${lvl}`;
  const derivedFrom = layer?.id || `model-${model}`;
  const period = winObj?.period ?? layer?.period ?? 24;

  const { loadWeatherField } = await import("../../services/weatherLoader.js");
  const layerName = `Derived ${elemName} (${model})`;

  await loadWeatherField(
    map,
    model,
    elem,
    lvl,
    period,
    {
      id: liveLayerId,
      name: layerName,
      path: virtualPath,
      colormap,
      derivedFrom,
    },
    winObj
  );

  if (activeGroup?.id) {
    const derivedEntry = {
      id: liveLayerId,
      model,
      element: elem,
      level: lvl,
      name: layerName,
      path: virtualPath,
      type: "contour",
      derivedFrom,
      render: {
        colormap,
        lineColor: "#f85149",
        lineWidth: 2,
        showFill: Boolean(colormap === "K_INDEX" || colormap === "RH"),
        showLine: true,
        showRaster: false,
        smooth: true,
        smoothIterations: 2,
      },
    };
    upsertDerivedLayerToPreset(activeGroup.id, derivedEntry);
    syncDerivedLayerToWindowPreset(activeGroup, derivedEntry);
  }
}

export function handleAddContourAction(map, layer, value, winObj) {
  if (isServerDerivedElement(value)) {
    handleDerivedServerContourAction(map, layer, value, winObj);
    return;
  }

  let elem = (value || "SLP").toUpperCase();
  if (elem === "VORT" || elem === "VORTICITY" || elem === "RVOR" || elem === "REL_VOR") elem = "VOR";
  if (elem === "DIVERGENCE") elem = "DIV";
  if (elem === "SPEED" || elem === "WS") elem = "WIND";

  const isWindLayer = (layer?.type === "wind" || layer?.element === "WIND") && layer?.type !== "station";
  if (isWindLayer) {
    const model = layer?.model || winObj?.model || "ECMWF_HR";
    const level =
      layer?.level !== undefined && layer?.level !== null ? layer.level : winObj?.level !== undefined ? winObj.level : 850;
    const liveLayerId = `contour-${model}-${elem.toLowerCase()}-${level}`;

    // If wind vectors are available on layer, cache them for triggerVortDivOverlay
    if (layer?.gridData && layer.gridData.u && layer.gridData.v) {
      if (winObj) {
        winObj.windGridData = layer.gridData;
        const period = winObj.period ?? 24;
        const cycle = winObj.forecastCycle || (layer.file ? layer.file.split(".")[0] : null);
        const file = layer.file || (cycle ? `${cycle}.${String(period).padStart(3, "0")}` : null);
        if (file) {
          setCachedWindGrid(winObj, `${model}/WIND/${level}/${file}`, layer.gridData);
        }
      }
    }

    const activeGroup = winObj?.activeGroup || appState.get("activeGroup");
    const derivedFrom = layer?.id || "wind";
    const elemName = elem === "VOR" ? "Relative Vorticity" : elem === "DIV" ? "Divergence" : "Wind Speed";
    const defaultColor = elem === "VOR" ? "#c678dd" : elem === "DIV" ? "#56d4dd" : "#58a6ff";
    const boldValues = elem === "VOR" ? [0, 10] : elem === "DIV" ? [0] : undefined;
    const boldLineWidth = elem === "VOR" || elem === "DIV" ? 4 : undefined;

    const layers = getLayersForWindow(winObj);
    let existingLayer = layers.find((l) => l.id === liveLayerId);

    if (existingLayer) {
      existingLayer.visible = true;
      if (!existingLayer.config) existingLayer.config = {};
      if (existingLayer.config.showLine === undefined) existingLayer.config.showLine = true;
      addOrUpdateLayer(existingLayer, winObj);
      triggerVortDivOverlay(map, existingLayer, winObj);
    } else {
      const newLayer = {
        id: liveLayerId,
        name: `${level ? `${level} hPa ` : ""}Derived ${elemName}`,
        type: "contour",
        element: elem,
        model,
        level,
        visible: true,
        removable: true,
        derivedFrom,
        colormap: elem,
        color: defaultColor,
        config: {
          showFill: false,
          showLine: true,
          showRaster: false,
          colormap: elem,
          lineColor: defaultColor,
          lineWidth: 2,
          boldValues,
          boldLineWidth,
          smooth: true,
          smoothIterations: 2,
          opacity: 0.75,
        },
      };
      addOrUpdateLayer(newLayer, winObj);
      triggerVortDivOverlay(map, newLayer, winObj);
    }

    if (activeGroup?.id) {
      const derivedEntry = {
        id: liveLayerId,
        model,
        element: elem,
        level,
        name: `${level ? `${level} hPa ` : ""}Derived ${elemName}`,
        type: "contour",
        derivedFrom,
        visible: true,
        render: {
          showFill: false,
          showLine: true,
          showRaster: false,
          lineColor: defaultColor,
          colormap: elem,
          lineWidth: 2,
          boldValues,
          boldLineWidth,
          smooth: true,
          smoothIterations: 2,
          opacity: 0.75,
        },
      };
      upsertDerivedLayerToPreset(activeGroup.id, derivedEntry);
      syncDerivedLayerToWindowPreset(activeGroup, derivedEntry);
    }
    return;
  }

  const geojson = layer?.stationsGeoJSON || getStationGeoJSON(map) || winObj?.stationsGeoJSON || appState.get("stationData");
  if (!geojson || !geojson.features || geojson.features.length < 3) {
    console.warn("[LayerActions] Insufficient station data to generate contour for:", elem);
    notifyError(`Insufficient station data (< 3 stations) to generate ${elem} contour.`);
    return;
  }

  const isUpper =
    layer?.model === "UPPER_AIR" ||
    (layer?.id && layer.id.includes("upper")) ||
    (layer?.name && (layer.name.includes("Sounding") || layer.name.includes("Upper")));

  if (isUpper) {
    const level = layer?.level || winObj?.level || 500;
    import("../../layers/soundingAnalysis.js").then(
      ({ analyzeAndRenderSoundingElementContour, SOUNDING_CONTOUR_CONFIGS }) => {
        const liveLayerId = `contour-sounding-${elem.toLowerCase()}-${level}`;
        const cfg = SOUNDING_CONTOUR_CONFIGS?.[elem];
        const defaultColor =
          cfg?.defaultColor ||
          (elem === "TMP" ? "#f85149" : elem === "VOR" ? "#c678dd" : elem === "DIV" ? "#56d4dd" : "#58a6ff");
        const activeGroup = winObj?.activeGroup || appState.get("activeGroup");
        const stnLayerInGroup = activeGroup?.layers?.find((l) => l.type === "station");
        const derivedFrom = stnLayerInGroup?.id || layer?.id || `upperair-obs-${level}`;
        const isDTD = elem === "DTD";
        const isKinematic = elem === "VOR" || elem === "DIV";
        const contourDefaults = isDTD
          ? { showFill: false, showLine: false, showRaster: true }
          : isKinematic
          ? { showFill: false, showLine: true, showRaster: false }
          : {};

        const res = analyzeAndRenderSoundingElementContour(
          map,
          geojson,
          level,
          elem,
          {
            layerId: liveLayerId,
            lineColor: defaultColor,
            derivedFrom,
            ...contourDefaults,
          },
          winObj
        );

        if (!res) {
          notifyError(`Insufficient valid wind observations (< 3 stations) to generate ${elem} contour.`);
          return;
        }

        if (activeGroup?.id) {
          const derivedEntry = {
            id: liveLayerId,
            model: "UPPER_AIR",
            element: elem,
            level,
            name: `${level} hPa Derived ${cfg?.name || elem}`,
            type: "contour",
            derivedFrom,
            render: {
              showFill: false,
              showLine: !isDTD,
              showRaster: isDTD,
              lineColor: defaultColor,
            },
          };
          upsertDerivedLayerToPreset(activeGroup.id, derivedEntry);
          syncDerivedLayerToWindowPreset(activeGroup, derivedEntry);
        }
        if (isDTD) {
          const renderedLayer = getLayersForWindow(winObj).find((l) => l.id === liveLayerId);
          if (renderedLayer) {
            triggerRasterOverlay(map, renderedLayer, winObj);
            updateLegend(
              elem,
              renderedLayer.colormap || "DTD",
              renderedLayer.gridData?.stats?.min,
              renderedLayer.gridData?.stats?.max,
              winObj
            );
          }
        }
      }
    );
  } else {
    import("../../layers/surfaceAnalysis.js").then(
      ({ analyzeAndRenderSurfaceContours, SURFACE_CONTOUR_CONFIGS }) => {
        const activeGroup = winObj?.activeGroup || appState.get("activeGroup");
        const parentLayerId = layer?.id || activeGroup?.layers?.find((l) => l.type === "station")?.id || "surface-obs";
        const derivedFrom = parentLayerId;
        const isDefaultParent = !parentLayerId || parentLayerId === "surface-obs" || parentLayerId === "station-surface" || parentLayerId === "surface" || parentLayerId === "default";
        const liveLayerId = !isDefaultParent ? `contour-surface-${elem.toLowerCase()}-${parentLayerId}` : `contour-surface-${elem.toLowerCase()}`;
        const cfg = SURFACE_CONTOUR_CONFIGS?.[elem];
        const defaultColor = cfg?.defaultColor || (elem === "VOR" ? "#c678dd" : elem === "DIV" ? "#56d4dd" : "#58a6ff");
        const isDTD = elem === "DTD";
        const isKinematic = elem === "VOR" || elem === "DIV";
        const contourDefaults = isDTD
          ? { showFill: false, showLine: false, showRaster: true }
          : isKinematic
          ? { showFill: false, showLine: true, showRaster: false }
          : {};

        const res = analyzeAndRenderSurfaceContours(
          map,
          geojson,
          elem,
          {
            layerId: liveLayerId,
            lineColor: defaultColor,
            derivedFrom,
            ...contourDefaults,
          },
          winObj
        );

        if (!res) {
          notifyError(`Insufficient valid wind observations (< 3 stations) to generate ${elem} contour.`);
          return;
        }

        if (activeGroup?.id) {
          const derivedEntry = {
            id: liveLayerId,
            model: "SURFACE",
            element: elem,
            name: `${layer?.name ? `${layer.name} ` : "Surface "}Derived ${cfg?.name || elem}`,
            type: "contour",
            derivedFrom,
            render: {
              showFill: false,
              showLine: !isDTD,
              showRaster: isDTD,
              lineColor: defaultColor,
            },
          };
          upsertDerivedLayerToPreset(activeGroup.id, derivedEntry);
          syncDerivedLayerToWindowPreset(activeGroup, derivedEntry);
        }
        if (isDTD) {
          const renderedLayer = getLayersForWindow(winObj).find((l) => l.id === liveLayerId);
          if (renderedLayer) {
            triggerRasterOverlay(map, renderedLayer, winObj);
            updateLegend(
              elem,
              renderedLayer.colormap || "DTD",
              renderedLayer.gridData?.stats?.min,
              renderedLayer.gridData?.stats?.max,
              winObj
            );
          }
        }
      }
    );
  }
}

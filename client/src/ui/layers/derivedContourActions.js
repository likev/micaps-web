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

export function handleAddContourAction(map, layer, value, winObj) {
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
        if (!winObj._windGridCache) winObj._windGridCache = new Map();
        const period = winObj.period ?? 24;
        const cycle = winObj.forecastCycle || (layer.file ? layer.file.split(".")[0] : null);
        const file = layer.file || (cycle ? `${cycle}.${String(period).padStart(3, "0")}` : null);
        if (file) {
          winObj._windGridCache.set(`${model}/WIND/${level}/${file}`, layer.gridData);
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
      if (Array.isArray(activeGroup.layers)) {
        const idx = activeGroup.layers.findIndex(
          (l) => l.id === liveLayerId || (l.model === model && l.element === elem && l.derivedFrom)
        );
        if (idx >= 0) {
          activeGroup.layers[idx] = { ...activeGroup.layers[idx], ...derivedEntry };
        } else {
          activeGroup.layers.push(derivedEntry);
        }
      }
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
        const liveLayerId = `contour-surface-${elem.toLowerCase()}`;
        const cfg = SURFACE_CONTOUR_CONFIGS?.[elem];
        const defaultColor = cfg?.defaultColor || (elem === "VOR" ? "#c678dd" : elem === "DIV" ? "#56d4dd" : "#58a6ff");
        const activeGroup = winObj?.activeGroup || appState.get("activeGroup");
        const stnLayerInGroup = activeGroup?.layers?.find((l) => l.type === "station");
        const derivedFrom = stnLayerInGroup?.id || layer?.id || "surface-obs";
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
            name: `Surface Derived ${cfg?.name || elem}`,
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

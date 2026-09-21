// configActions.js - Layer configuration change handlers (palette, styles, fills, smoothing)
import {
  setLayerIsobandVisibility,
  setLayerIsolineVisibility,
  setLayerIsobandOpacity,
  setLayerIsolineStyle,
  renderContourLayers,
} from "../../layers/contourLayer.js";
import { getLayerById } from "./layerStore.js";
import { setStationConfig, getStationGeoJSON } from "../../layers/stationLayer.js";
import { setRasterVisibility, getRasterDOMIds } from "../../layers/rasterLayer.js";
import { stopWindAnimation, removeGridWindBarbs } from "../../layers/windLayer.js";
import { appState } from "../../store/appState.js";
import { updateLegend, removeLegend } from "../legend.js";
import { armContourReRender } from "../../services/contourReRender.js";
import {
  triggerIsobandOverlay,
  triggerRasterOverlay,
  triggerWindStreamlines,
  triggerWindBarbs,
  triggerStationStreamlines,
  triggerVortDivOverlay,
} from "../../services/overlayTriggers.js";

const paletteSeq = new Map();

export function handleConfigAction(map, layerId, value, layer, winObj) {
  if (!layer) return;
  if (value && typeof value === "object") {
    // LayerRow already applies this optimistically, but the legacy layer
    // bindings and programmatic actions do not. Keep one authoritative live
    // config so the next timeline reload can snapshot it.
    layer.config = { ...(layer.config || {}), ...value };
  }
  // Write-through to the canonical store object: the caller may hold a stale
  // copy (e.g. Svelte panel array pre-dating an addOrUpdateLayer replace), in
  // which case map-move re-renders (which read the store) would resurrect the
  // old style until the next timeline reload. Sync here so every path agrees.
  if (layer?.id && winObj) {
    try {
      const canonical = getLayerById(layer.id, winObj);
      if (canonical && canonical !== layer) {
        canonical.config = { ...(canonical.config || {}), ...(layer.config || {}) };
        if (layer.color !== undefined) canonical.color = layer.color;
        if (layer.colormap !== undefined) canonical.colormap = layer.colormap;
        if (layer.visible !== undefined) canonical.visible = layer.visible;
        if (layer.gridData !== undefined && canonical.gridData === undefined) {
          canonical.gridData = layer.gridData;
        }
      }
    } catch { /* best-effort */ }
  }

  if (layer.type === "pmtiles") {
    if (value.scheme !== undefined) {
      import("../../map/pmtilesLayers.js").then(({ applyBasemapScheme }) => {
        try { applyBasemapScheme(map, value.scheme); } catch {}
      });
      import("../../map/graticule.js").then(({ updateGraticuleScheme }) => {
        try { updateGraticuleScheme(map, value.scheme); } catch {}
      });
    }
    if (value.projection !== undefined) {
      import("../../map/mapInstance.js").then(({ setMapProjection }) => {
        try { setMapProjection(map, value.projection); } catch {}
      });
    }
    if (value.showGraticule !== undefined) {
      if (map.getLayer("graticule-lines")) {
        map.setLayoutProperty("graticule-lines", "visibility", layer.visible && value.showGraticule !== false ? "visible" : "none");
      }
    }
    if (value.showWorld !== undefined) {
      const worldLayers = ["world-fill", "world-boundary"];
      worldLayers.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", layer.visible && value.showWorld !== false ? "visible" : "none");
      });
    }
    if (value.showProvinces !== undefined) {
      const provLayers = ["provinces-bg-fill", "provinces-boundary", "provinces-fill", "provinces-detail-boundary"];
      provLayers.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", layer.visible && value.showProvinces !== false ? "visible" : "none");
      });
    }
    if (value.showCities !== undefined) {
      const cityLayers = ["citys-fill", "citys-boundary", "county-fill", "county-boundary"];
      cityLayers.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", layer.visible && value.showCities !== false ? "visible" : "none");
      });
    }
  } else if (layer.type === "contour" || layer.type === "wind") {
    if (!layer.config) layer.config = {};
    if (value.showFill !== undefined) {
      layer.config.showFill = value.showFill;
      if (value.showFill) {
        layer.config.showRaster = false;
        setRasterVisibility(map, false, layerId);
        triggerIsobandOverlay(map, layer, winObj);
      } else {
        setLayerIsobandVisibility(map, layerId, false);
      }
    }
    if (value.showLine !== undefined) {
      layer.config.showLine = value.showLine;
      setLayerIsolineVisibility(map, layerId, layer.visible && value.showLine);
    }
    if (value.showRaster !== undefined) {
      layer.config.showRaster = value.showRaster;
      if (value.showRaster && layer.visible) {
        layer.config.showFill = false;
        setLayerIsobandVisibility(map, layerId, false);
        const { rasterLayerId } = getRasterDOMIds(layerId);
        if (map.getLayer(rasterLayerId)) {
          setRasterVisibility(map, true, layerId);
        } else {
          triggerRasterOverlay(map, layer, winObj);
        }
      } else {
        setRasterVisibility(map, false, layerId);
      }
    }

    const effectiveShowFill = value.showFill !== undefined ? value.showFill : Boolean(layer.config?.showFill);
    const effectiveShowRaster = value.showRaster !== undefined ? value.showRaster : Boolean(layer.config?.showRaster);
    const hasShading = Boolean(layer.visible && (effectiveShowFill || effectiveShowRaster));

    if (layer.element && (value.showFill !== undefined || value.showRaster !== undefined || value.showLine !== undefined)) {
      if (!hasShading) {
        removeLegend(layer.element, winObj);
      } else {
        const colormap = layer.colormap || layer.config?.palettePath || layer.element;
        updateLegend(layer.element, colormap, layer.gridData?.stats?.min, layer.gridData?.stats?.max, winObj);
      }
    }
    if (value.opacity !== undefined) {
      setLayerIsobandOpacity(map, layerId, value.opacity);
      const { rasterLayerId } = getRasterDOMIds(layerId);
      if (map.getLayer(rasterLayerId)) {
        map.setPaintProperty(rasterLayerId, "raster-opacity", value.opacity);
      }
    }
    if (
      value.lineWidth !== undefined ||
      value.lineColor !== undefined ||
      value.boldValues !== undefined ||
      value.boldLineWidth !== undefined ||
      value.labelSize !== undefined
    ) {
      // Keep the list dot + loader fallback (existingLayer.color) in sync:
      // the Svelte row only patches layer.config, so without this a lineColor
      // change would be overwritten by the stale layer.color on next chip.
      if (value.lineColor !== undefined) {
        layer.color = value.lineColor;
        // `layer` can be a Svelte proxy while the layer store keeps the raw
        // object. Update the raw mirror after applying the patch as well.
        try {
          const canonical = getLayerById(layerId, winObj);
          if (canonical) {
            canonical.color = value.lineColor;
            canonical.config = { ...(canonical.config || {}), lineColor: value.lineColor };
          }
        } catch {}
      }
      setLayerIsolineStyle(map, layerId, {
        lineWidth: value.lineWidth ?? layer.config?.lineWidth,
        lineColor: value.lineColor ?? layer.config?.lineColor,
        boldLineWidth: value.boldLineWidth ?? layer.config?.boldLineWidth,
        labelSize: value.labelSize ?? layer.config?.labelSize,
        ...(value.boldValues !== undefined ? { boldValues: value.boldValues ?? layer.config?.boldValues } : {}),
      });
    }

    if (
      (value.smooth !== undefined || value.interval !== undefined || value.levels !== undefined) &&
      layer.type === "contour"
    ) {
      const isUpper = layer.model === "UPPER_AIR" || (layer.id && layer.id.startsWith("contour-sounding-"));
      const isSurface =
        layer.model === "SURFACE" ||
        layer.model === "SURFACE_ANALYSIS" ||
        (layer.id && layer.id.startsWith("contour-surface-"));
      const isNwpKinematic =
        (layer.element === "VOR" || layer.element === "DIV" || (layer.element === "WIND" && layer.type === "contour")) &&
        !isUpper &&
        !isSurface;

      const levels = value.levels !== undefined ? value.levels : (layer.config?.levels ?? null);
      if (value.interval !== undefined) {
        layer.config.interval = value.interval;
      }
      layer.config.levels = levels;

      const smooth = value.smooth !== undefined ? value.smooth : (layer.config?.smooth !== false);

      if (isUpper || isSurface) {
        const geojson = layer?.stationsGeoJSON || getStationGeoJSON(map) || winObj?.stationsGeoJSON || appState.get("stationData");
        if (geojson && geojson.features && geojson.features.length >= 3) {
          if (isUpper) {
            const level = layer.level || winObj?.level || 500;
            import("../../layers/soundingAnalysis.js").then(({ analyzeAndRenderSoundingElementContour }) => {
              analyzeAndRenderSoundingElementContour(
                map,
                geojson,
                level,
                layer.element,
                { ...layer.config, layerId, smooth, levels },
                winObj
              );
            });
          } else {
            import("../../layers/surfaceAnalysis.js").then(({ analyzeAndRenderSurfaceContours }) => {
              analyzeAndRenderSurfaceContours(
                map,
                geojson,
                layer.element,
                { ...layer.config, layerId, smooth, levels },
                winObj
              );
            });
          }
        }
      } else if (isNwpKinematic) {
        triggerVortDivOverlay(map, layer, winObj);
      } else if (layer.gridData) {
        renderContourLayers(map, layer.gridData, layer.element || "TMP", {
          ...layer.config,
          layerId,
          levels,
          smooth,
          showFill: layer.visible && layer.config?.showFill,
          showLine: layer.visible && layer.config?.showLine,
          opacity: layer.config?.opacity,
          lineColor: layer.config?.lineColor,
          lineWidth: layer.config?.lineWidth,
          boldValues: layer.config?.boldValues,
          boldLineWidth: layer.config?.boldLineWidth,
          colormap: layer.colormap,
          viewportBounds: map && typeof map.getBounds === "function" ? map.getBounds().toArray() : null,
        });
        armContourReRender(map, layer, winObj);
      }
    }

    if (value.showWind !== undefined) {
      if (value.showWind && layer.visible) {
        triggerWindStreamlines(map, layer, winObj);
      } else {
        stopWindAnimation(map);
      }
    }

    if (value.showBarbs !== undefined) {
      if (value.showBarbs && layer.visible) {
        triggerWindBarbs(map, layer, winObj);
      } else {
        removeGridWindBarbs(map);
      }
    }

    // Palette change: load the XML palette file and update the live colormap for this layer
    if (value.palettePath !== undefined) {
      const elem = (layer.element || "TMP").toUpperCase();
      if (!value.palettePath) {
        layer.colormap = null;
        if (layer.type === "contour" && layer.gridData) {
          renderContourLayers(map, layer.gridData, elem, {
            ...layer.config,
            layerId,
            colormap: elem,
            showFill: layer.visible && layer.config?.showFill !== false,
            showLine: layer.visible && layer.config?.showLine !== false,
            opacity: layer.config?.opacity ?? 0.75,
            lineColor: layer.config?.lineColor,
            lineWidth: layer.config?.lineWidth,
            boldValues: layer.config?.boldValues,
            boldLineWidth: layer.config?.boldLineWidth,
            smooth: layer.config?.smooth,
            smoothIterations: layer.config?.smoothIterations,
            labelSize: layer.config?.labelSize,
            viewportBounds: map && typeof map.getBounds === "function" ? map.getBounds().toArray() : null,
          });
          armContourReRender(map, layer, winObj);
          const hasShad = layer.visible !== false && (Boolean(layer.config?.showFill) || Boolean(layer.config?.showRaster));
          if (hasShad) {
            updateLegend(elem, elem, layer.gridData?.stats?.min, layer.gridData?.stats?.max, winObj);
          } else {
            removeLegend(elem, winObj);
          }
        }
        if (layer.config?.showRaster && layer.visible) {
          triggerRasterOverlay(map, layer, winObj);
        }
      } else {
        const seq = (paletteSeq.get(layer.id) || 0) + 1;
        paletteSeq.set(layer.id, seq);
        const mySeq = seq;
        const capturedPath = value.palettePath;
        import("../../utils/paletteLoader.js").then(({ loadXMLPalette }) => {
          loadXMLPalette(capturedPath).then((stops) => {
            if (mySeq !== paletteSeq.get(layer.id)) return;
            if (!stops) return;
            import("../../utils/colormaps.js").then(({ setColormaps, COLORMAPS }) => {
              if (mySeq !== paletteSeq.get(layer.id)) return;
              try {
                const key = `palette:${layer.id}`;
                setColormaps({ ...COLORMAPS, [key]: stops });
                layer.colormap = key;
                const isUpper = layer.model === "UPPER_AIR" || (layer.id && layer.id.startsWith("contour-sounding-"));
                const isSurface =
                  layer.model === "SURFACE" ||
                  layer.model === "SURFACE_ANALYSIS" ||
                  (layer.id && layer.id.startsWith("contour-surface-"));
                const isNwpKinematic =
                  (elem === "VOR" || elem === "DIV" || (elem === "WIND" && layer.type === "contour")) &&
                  !isUpper &&
                  !isSurface;
                if (isNwpKinematic) {
                  triggerVortDivOverlay(map, layer, winObj);
                } else if (layer.type === "contour" && layer.gridData) {
                  renderContourLayers(map, layer.gridData, elem, {
                    ...layer.config,
                    layerId,
                    colormap: key,
                    showFill: layer.visible && layer.config?.showFill !== false,
                    showLine: layer.visible && layer.config?.showLine !== false,
                    opacity: layer.config?.opacity ?? 0.75,
                    lineColor: layer.config?.lineColor,
                    lineWidth: layer.config?.lineWidth,
                    boldValues: layer.config?.boldValues,
                    boldLineWidth: layer.config?.boldLineWidth,
                    smooth: layer.config?.smooth,
                    smoothIterations: layer.config?.smoothIterations,
                    labelSize: layer.config?.labelSize,
                    viewportBounds: map && typeof map.getBounds === "function" ? map.getBounds().toArray() : null,
                  });
                  armContourReRender(map, layer, winObj);
                  const hasShad = layer.visible !== false && (Boolean(layer.config?.showFill) || Boolean(layer.config?.showRaster));
                  if (hasShad) {
                    updateLegend(elem, key, layer.gridData?.stats?.min, layer.gridData?.stats?.max, winObj);
                  } else {
                    removeLegend(elem, winObj);
                  }
                }
                if (layer.config?.showRaster && layer.visible && !isNwpKinematic) {
                  triggerRasterOverlay(map, layer, winObj);
                }
                armContourReRender(map, layer, winObj);
              } catch {}
            });
          });
        });
      }
    }
  } else if (layer.type === "station") {
    setStationConfig(map, value);
    if (value.showStreamlines !== undefined) {
      if (value.showStreamlines && layer.visible) {
        triggerStationStreamlines(map, layer, winObj);
      } else {
        stopWindAnimation(map);
      }
    }
  } else if (layer.type === "tlogp") {
    import("../../layers/tlogp/tlogpLayer.js").then(({ tlogpController }) => {
      if (value.stationId !== undefined) tlogpController.setStation(value.stationId, winObj, map);
      if (value.parcelLevel !== undefined) tlogpController.setParcelLevel(value.parcelLevel, null, winObj);
      const flags = {};
      ["showTemp", "showDewpoint", "showWind", "showParcel", "showDryAdiabats", "showMoistAdiabats", "showMixingRatio"].forEach((key) => {
        if (value[key] !== undefined) flags[key] = Boolean(value[key]);
      });
      if (Object.keys(flags).length && tlogpController.panel?.canvasRenderer) {
        tlogpController.panel.canvasRenderer.setOptions(flags);
      }
    });
  } else if (layer.type === "timeheight") {
    import("../../layers/timeheight/timeHeightLayer.js").then(({ timeHeightController }) => {
      const state = timeHeightController._getState(winObj);
      if (value.lon !== undefined || value.lat !== undefined) {
        timeHeightController.setPoint(value.lon ?? state.activePoint.lon, value.lat ?? state.activePoint.lat, winObj, map);
      }
      if (value.startHour !== undefined || value.endHour !== undefined || value.stepHours !== undefined) {
        timeHeightController.setRange(value.startHour ?? state.startHour, value.endHour ?? state.endHour, value.stepHours ?? state.stepHours, winObj);
      }
      if (value.initCycle !== undefined) timeHeightController.setCycle(value.initCycle, winObj);
      if (value.timeDirection !== undefined) timeHeightController.setTimeDirection(value.timeDirection, winObj);
      const flags = {};
      [["showRH", "showRH"], ["showTemp", "showTemp"], ["showVVel", "showVVel"], ["showWind", "showWind"]].forEach(([key, target]) => {
        if (value[key] !== undefined) flags[target] = Boolean(value[key]);
      });
      if (value.showGridPointMarker !== undefined) timeHeightController.setHighlightVisible(map, Boolean(value.showGridPointMarker));
      if (Object.keys(flags).length) state.panel?.canvasRenderer?.setOptions(flags);
    });
  } else if (layer.type === "lineheight") {
    import("../../layers/lineprofile/lineProfileLayer.js").then(({ lineHeightController }) => {
      const state = lineHeightController._getState(winObj);
      if (value.lon0 !== undefined || value.lat0 !== undefined || value.lon1 !== undefined || value.lat1 !== undefined || value.npoints !== undefined) {
        lineHeightController.setLine(
          { lon: value.lon0 ?? state.line.a.lon, lat: value.lat0 ?? state.line.a.lat },
          { lon: value.lon1 ?? state.line.b.lon, lat: value.lat1 ?? state.line.b.lat },
          value.npoints ?? state.npoints,
          winObj
        );
      }
      if (value.flipDirection !== undefined) lineHeightController.setFlip(value.flipDirection, winObj);
      if (value.initCycle !== undefined) lineHeightController.setCycle(value.initCycle, winObj);
      const flags = {};
      ["showRH", "showTemp", "showVVel", "showWind"].forEach((key) => {
        if (value[key] !== undefined) flags[key] = Boolean(value[key]);
      });
      if (Object.keys(flags).length) state.panel?.canvasRenderer?.setOptions(flags);
    });
  } else if (layer.type === "hovmoller") {
    import("../../layers/lineprofile/lineProfileLayer.js").then(({ hovmollerController }) => {
      const state = hovmollerController._getState(winObj);
      if (value.lon0 !== undefined || value.lat0 !== undefined || value.lon1 !== undefined || value.lat1 !== undefined || value.npoints !== undefined) {
        hovmollerController.setLine(
          { lon: value.lon0 ?? state.line.a.lon, lat: value.lat0 ?? state.line.a.lat },
          { lon: value.lon1 ?? state.line.b.lon, lat: value.lat1 ?? state.line.b.lat },
          value.npoints ?? state.npoints,
          winObj
        );
      }
      if (value.startHour !== undefined || value.endHour !== undefined || value.stepHours !== undefined) {
        hovmollerController.setSpan(value.startHour ?? state.startHour, value.endHour ?? state.endHour, value.stepHours ?? state.stepHours, winObj);
      }
      if (value.level !== undefined) hovmollerController.setLevel(value.level, winObj);
      if (value.initCycle !== undefined) hovmollerController.setCycle(value.initCycle, winObj);
      if (value.axisSwap !== undefined) hovmollerController.setAxisSwap(value.axisSwap, winObj);
      if (value.timeDir !== undefined) hovmollerController.setTimeDir(value.timeDir, winObj);
      const flags = {};
      ["showRH", "showTemp", "showVVel", "showWind"].forEach((key) => {
        if (value[key] !== undefined) flags[key] = Boolean(value[key]);
      });
      if (Object.keys(flags).length) state.panel?.canvasRenderer?.setOptions(flags);
    });
  }
}

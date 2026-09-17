// layerActions.js - Dispatcher for layer control toggle, visibility, and aux actions
import {
  setLayerIsobandVisibility,
  setLayerIsolineVisibility,
  setLayerIsobandOpacity,
  setLayerIsolineColor,
  setLayerIsolineStyle,
  renderContourLayers,
  removeContourLayer,
  getLayerDOMIds,
} from "../layers/contourLayer.js";
import { setStationVisibility, setStationConfig, getStationGeoJSON } from "../layers/stationLayer.js";
import { renderBinaryRaster, renderGridRaster, setRasterVisibility, removeRasterLayer, getRasterDOMIds } from "../layers/rasterLayer.js";
import { renderWindStreamlines, stopWindAnimation, renderGridWindBarbs, removeGridWindBarbs, generateStationWindGrid } from "../layers/windLayer.js";
import { fetchGridBinaryStream, fetchGridData, fetchStationObservations } from "../api/catalogApi.js";
import { appState } from "../store/appState.js";
import { getActiveWindow, getWindowById, updateWindowTitle } from "./tabWindowManager.js";
import { getLayersForWindow, addOrUpdateLayer } from "./layerControl.js";
import { updateLegend, removeLegend } from "./legend.js";
import { upsertDerivedLayerToPreset, removeDerivedLayerFromPreset } from "../config/presets.js";
import { armContourReRender, disarmContourReRender } from "../services/contourReRender.js";

function notifyError(msg) {
  import("../main.js").then(({ showErrorToast }) => {
    try { showErrorToast(msg); } catch {}
  }).catch(() => {});
}

const paletteSeq = new Map();

export function handleLayerAction(map, action, layerId, value, layer, win = getActiveWindow()) {
  const winObj = typeof win === "string" ? (getWindowById(win) || getActiveWindow()) : (win || getActiveWindow());

  if (action === "visibility") {
    if (!layer) return;
    if (layer.type === "contour" || layer.type === "wind") {
      if (layer.config?.showFill) {
        if (value) {
          const { isobandSrcId } = getLayerDOMIds(layerId);
          const isobandSrc = map.getSource(isobandSrcId);
          const features = getSourceFeatures(isobandSrc);
          if (features.length > 0) {
            setLayerIsobandVisibility(map, layerId, true);
          } else {
            triggerIsobandOverlay(map, layer, winObj);
          }
        } else {
          setLayerIsobandVisibility(map, layerId, false);
        }
      } else {
        setLayerIsobandVisibility(map, layerId, false);
      }
      setLayerIsolineVisibility(map, layerId, value && layer.config?.showLine);
      if (layer.config?.showRaster) {
        if (value) {
          const { rasterLayerId } = getRasterDOMIds(layerId);
          if (map.getLayer(rasterLayerId)) {
            setRasterVisibility(map, true, layerId);
          } else {
            triggerRasterOverlay(map, layer, win);
          }
        } else {
          setRasterVisibility(map, false, layerId);
        }
      }
      if (layer.type === "wind" || layer.config?.showWind) {
        if (value && layer.config?.showWind !== false) {
          triggerWindStreamlines(map, layer, winObj);
        } else {
          stopWindAnimation(map);
        }
      }
      if (layer.type === "wind" || layer.config?.showBarbs) {
        if (value && layer.config?.showBarbs) {
          triggerWindBarbs(map, layer, winObj);
        } else {
          removeGridWindBarbs(map);
        }
      }
    } else if (layer.type === "station") {
      setStationVisibility(map, value);
      if (layer.config?.showStreamlines) {
        if (value) {
          triggerStationStreamlines(map, layer, winObj);
        } else {
          stopWindAnimation(map);
        }
      }
    } else if (layer.type === "pmtiles") {
      const showGraticule = value && (layer.config?.showGraticule !== false);
      const showWorld = value && (layer.config?.showWorld !== false);
      const showProvinces = value && (layer.config?.showProvinces !== false);
      const showCities = value && (layer.config?.showCities !== false);

      const worldLayers = ["world-fill", "world-boundary"];
      const chinaLayers = ["china-fill", "china-boundary"];
      const provLayers = ["provinces-bg-fill", "provinces-boundary", "provinces-fill", "provinces-detail-boundary"];
      const cityLayers = ["citys-fill", "citys-boundary", "county-fill", "county-boundary"];

      worldLayers.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showWorld ? "visible" : "none"); });
      chinaLayers.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", value ? "visible" : "none"); });
      provLayers.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showProvinces ? "visible" : "none"); });
      cityLayers.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showCities ? "visible" : "none"); });
      if (map.getLayer("graticule-lines")) map.setLayoutProperty("graticule-lines", "visibility", showGraticule ? "visible" : "none");
    }

    // Synchronize legend lifecycle on layer visibility change (contour/wind only;
    // station plots never had legends — avoid creating PLOT_* entries with fallback ticks)
    if ((layer.type === "contour" || layer.type === "wind") && layer.element) {
      const hasShading = value && (Boolean(layer.config?.showFill) || Boolean(layer.config?.showRaster));
      if (hasShading) {
        const colormap = layer.colormap || layer.config?.palettePath || layer.element;
        updateLegend(layer.element, colormap, layer.gridData?.stats?.min, layer.gridData?.stats?.max, winObj);
      } else {
        removeLegend(layer.element, winObj);
      }
    }
  } else if (action === "config") {
    if (layer.type === "pmtiles") {
      if (value.scheme !== undefined) {
        // live theme switch without reload — lazy import to avoid cycle
        import("../map/pmtilesLayers.js").then(({ applyBasemapScheme }) => {
          try { applyBasemapScheme(map, value.scheme); } catch {}
        });
        import("../map/graticule.js").then(({ updateGraticuleScheme }) => {
          try { updateGraticuleScheme(map, value.scheme); } catch {}
        });
      }
      if (value.projection !== undefined) {
        import("../map/mapInstance.js").then(({ setMapProjection }) => {
          try { setMapProjection(map, value.projection); } catch {}
        });
      }
      if (value.showGraticule !== undefined) {
        if (map.getLayer("graticule-lines")) {
          map.setLayoutProperty("graticule-lines", "visibility", (layer.visible && value.showGraticule !== false) ? "visible" : "none");
        }
      }
      if (value.showWorld !== undefined) {
        const worldLayers = ["world-fill", "world-boundary"];
        worldLayers.forEach((id) => {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", (layer.visible && value.showWorld !== false) ? "visible" : "none");
        });
      }
      if (value.showProvinces !== undefined) {
        const provLayers = ["provinces-bg-fill", "provinces-boundary", "provinces-fill", "provinces-detail-boundary"];
        provLayers.forEach((id) => {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", (layer.visible && value.showProvinces !== false) ? "visible" : "none");
        });
      }
      if (value.showCities !== undefined) {
        const cityLayers = ["citys-fill", "citys-boundary", "county-fill", "county-boundary"];
        cityLayers.forEach((id) => {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", (layer.visible && value.showCities !== false) ? "visible" : "none");
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
      if (value.lineWidth !== undefined || value.lineColor !== undefined || value.boldValues !== undefined || value.boldLineWidth !== undefined || value.labelSize !== undefined) {
        setLayerIsolineStyle(map, layerId, {
          lineWidth: value.lineWidth ?? layer.config?.lineWidth,
          lineColor: value.lineColor ?? layer.config?.lineColor,
          boldLineWidth: value.boldLineWidth ?? layer.config?.boldLineWidth,
          labelSize: value.labelSize ?? layer.config?.labelSize,
          ...(value.boldValues !== undefined ? { boldValues: value.boldValues ?? layer.config?.boldValues } : {}),
        });
      }

      if (value.smooth !== undefined && layer.type === "contour") {
        const isUpper = (layer.model === "UPPER_AIR") || (layer.id && layer.id.startsWith("contour-sounding-"));
        const isSurface = (layer.model === "SURFACE" || layer.model === "SURFACE_ANALYSIS") || (layer.id && layer.id.startsWith("contour-surface-"));
        const isNwpKinematic = (layer.element === "VOR" || layer.element === "DIV" || (layer.element === "WIND" && layer.type === "contour")) && !isUpper && !isSurface;
        if (isUpper || isSurface) {
          const geojson = layer?.stationsGeoJSON || getStationGeoJSON(map) || win?.stationsGeoJSON || appState.get("stationData");
          if (geojson && geojson.features && geojson.features.length >= 3) {
            if (isUpper) {
              const level = layer.level || win?.level || 500;
              import("../layers/soundingAnalysis.js").then(({ analyzeAndRenderSoundingElementContour }) => {
                analyzeAndRenderSoundingElementContour(map, geojson, level, layer.element, {
                  ...layer.config,
                  layerId,
                  smooth: value.smooth,
                }, win);
              });
            } else {
              import("../layers/surfaceAnalysis.js").then(({ analyzeAndRenderSurfaceContours }) => {
                analyzeAndRenderSurfaceContours(map, geojson, layer.element, {
                  ...layer.config,
                  layerId,
                  smooth: value.smooth,
                }, win);
              });
            }
          }
        } else if (isNwpKinematic) {
          triggerVortDivOverlay(map, layer, winObj);
        } else if (layer.gridData) {
          renderContourLayers(map, layer.gridData, layer.element || "TMP", {
            ...layer.config,
            layerId,
            smooth: value.smooth,
            showFill: layer.visible && layer.config?.showFill,
            showLine: layer.visible && layer.config?.showLine,
            opacity: layer.config?.opacity,
            lineColor: layer.config?.lineColor,
            lineWidth: layer.config?.lineWidth,
            boldValues: layer.config?.boldValues,
            boldLineWidth: layer.config?.boldLineWidth,
            colormap: layer.colormap,
            viewportBounds: (map && typeof map.getBounds === "function") ? map.getBounds().toArray() : null,
          });
          armContourReRender(map, layer, winObj);
        }
      }

      if (value.showWind !== undefined) {
        if (value.showWind && layer.visible) {
          triggerWindStreamlines(map, layer, win);
        } else {
          stopWindAnimation(map);
        }
      }

      if (value.showBarbs !== undefined) {
        if (value.showBarbs && layer.visible) {
          triggerWindBarbs(map, layer, win);
        } else {
          removeGridWindBarbs(map);
        }
      }

      // Palette change: load the XML palette file and update the live colormap for this layer (sequence-guarded)
      if (value.palettePath !== undefined) {
        const elem = (layer.element || "TMP").toUpperCase();
        if (!value.palettePath) {
          // Revert to built-in default — re-render with element default colormap
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
              viewportBounds: (map && typeof map.getBounds === "function") ? map.getBounds().toArray() : null,
            });
            armContourReRender(map, layer, winObj);
            const hasShading = (layer.visible !== false) && (Boolean(layer.config?.showFill) || Boolean(layer.config?.showRaster));
            if (hasShading) {
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
          import("../utils/paletteLoader.js").then(({ loadXMLPalette }) => {
            loadXMLPalette(capturedPath).then((stops) => {
              if (mySeq !== paletteSeq.get(layer.id)) return;
              if (!stops) return;
              // Register under a stable per-layer key so colormaps.js can resolve it
              import("../utils/colormaps.js").then(({ setColormaps, COLORMAPS }) => {
                if (mySeq !== paletteSeq.get(layer.id)) return;
                try {
                  const key = `palette:${layer.id}`;
                  setColormaps({ ...COLORMAPS, [key]: stops });
                  // Store key on layer so contour isobands and raster pick it up
                  layer.colormap = key;
                  const isUpper = (layer.model === "UPPER_AIR") || (layer.id && layer.id.startsWith("contour-sounding-"));
                  const isSurface = (layer.model === "SURFACE" || layer.model === "SURFACE_ANALYSIS") || (layer.id && layer.id.startsWith("contour-surface-"));
                  const isNwpKinematic = (elem === "VOR" || elem === "DIV" || (elem === "WIND" && layer.type === "contour")) && !isUpper && !isSurface;
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
                      viewportBounds: (map && typeof map.getBounds === "function") ? map.getBounds().toArray() : null,
                    });
                    armContourReRender(map, layer, winObj);
                    const hasShading = (layer.visible !== false) && (Boolean(layer.config?.showFill) || Boolean(layer.config?.showRaster));
                    if (hasShading) {
                      updateLegend(elem, key, layer.gridData?.stats?.min, layer.gridData?.stats?.max, winObj);
                    } else {
                      removeLegend(elem, winObj);
                    }
                  }
                  if (layer.config?.showRaster && layer.visible && !isNwpKinematic) {
                    triggerRasterOverlay(map, layer, winObj);
                  }
                  armContourReRender(map, layer, winObj);
                } catch { /* ignore colormap registration errors */ }
              });
            });
          });
        }
      }
    } else if (layer.type === "station") {
      setStationConfig(map, value);
      if (value.showStreamlines !== undefined) {
        if (value.showStreamlines && layer.visible) {
          triggerStationStreamlines(map, layer, win);
        } else {
          stopWindAnimation(map);
        }
      }
    }
  } else if (action === "addContour") {
    let elem = (value || "SLP").toUpperCase();
    if (elem === "VORT" || elem === "VORTICITY" || elem === "RVOR" || elem === "REL_VOR") elem = "VOR";
    if (elem === "DIVERGENCE") elem = "DIV";
    if (elem === "SPEED" || elem === "WS") elem = "WIND";

    const isWindLayer = (layer?.type === "wind" || layer?.element === "WIND") && layer?.type !== "station";
    if (isWindLayer) {
      const model = layer?.model || winObj?.model || "ECMWF_HR";
      const level = layer?.level !== undefined && layer?.level !== null ? layer.level : (winObj?.level !== undefined ? winObj.level : 850);
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
      const elemName = elem === "VOR" ? "Relative Vorticity" : (elem === "DIV" ? "Divergence" : "Wind Speed");
      const defaultColor = elem === "VOR" ? "#c678dd" : (elem === "DIV" ? "#56d4dd" : "#58a6ff");
      const boldValues = elem === "VOR" ? [0, 10] : (elem === "DIV" ? [0] : undefined);
      const boldLineWidth = (elem === "VOR" || elem === "DIV") ? 4 : undefined;

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
          const idx = activeGroup.layers.findIndex((l) => l.id === liveLayerId || (l.model === model && l.element === elem && l.derivedFrom));
          if (idx >= 0) {
            activeGroup.layers[idx] = { ...activeGroup.layers[idx], ...derivedEntry };
          } else {
            activeGroup.layers.push(derivedEntry);
          }
        }
      }
      return;
    }

    const geojson = layer?.stationsGeoJSON || getStationGeoJSON(map) || win?.stationsGeoJSON || appState.get("stationData");
    if (!geojson || !geojson.features || geojson.features.length < 3) {
      console.warn("[LayerActions] Insufficient station data to generate contour for:", elem);
      notifyError(`Insufficient station data (< 3 stations) to generate ${elem} contour.`);
      return;
    }

    const isUpper = (layer?.model === "UPPER_AIR") || (layer?.id && layer.id.includes("upper")) || (layer?.name && (layer.name.includes("Sounding") || layer.name.includes("Upper")));
    if (isUpper) {
      const level = layer?.level || win?.level || 500;
      import("../layers/soundingAnalysis.js").then(({ analyzeAndRenderSoundingElementContour, SOUNDING_CONTOUR_CONFIGS }) => {
        const liveLayerId = `contour-sounding-${elem.toLowerCase()}-${level}`;
        const cfg = SOUNDING_CONTOUR_CONFIGS?.[elem];
        const defaultColor = cfg?.defaultColor || (elem === "TMP" ? "#f85149" : (elem === "VOR" ? "#c678dd" : (elem === "DIV" ? "#56d4dd" : "#58a6ff")));
        const activeGroup = win?.activeGroup || appState.get("activeGroup");
        const stnLayerInGroup = activeGroup?.layers?.find((l) => l.type === "station");
        const derivedFrom = stnLayerInGroup?.id || layer?.id || `upperair-obs-${level}`;
        const isDTD = elem === "DTD";
        const isKinematic = elem === "VOR" || elem === "DIV";
        const contourDefaults = isDTD ? { showFill: false, showLine: false, showRaster: true } : (isKinematic ? { showFill: false, showLine: true, showRaster: false } : {});

        const res = analyzeAndRenderSoundingElementContour(map, geojson, level, elem, {
          layerId: liveLayerId,
          lineColor: defaultColor,
          derivedFrom,
          ...contourDefaults,
        }, win);

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
              showLine: isDTD ? false : true,
              showRaster: isDTD ? true : false,
              lineColor: defaultColor,
            },
          };
          upsertDerivedLayerToPreset(activeGroup.id, derivedEntry);
        }
        if (isDTD) {
          const renderedLayer = getLayersForWindow(win).find((l) => l.id === liveLayerId);
          if (renderedLayer) {
            triggerRasterOverlay(map, renderedLayer, win);
            updateLegend(elem, renderedLayer.colormap || "DTD", renderedLayer.gridData?.stats?.min, renderedLayer.gridData?.stats?.max, win);
          }
        }
      });
    } else {
      import("../layers/surfaceAnalysis.js").then(({ analyzeAndRenderSurfaceContours, SURFACE_CONTOUR_CONFIGS }) => {
        const liveLayerId = `contour-surface-${elem.toLowerCase()}`;
        const cfg = SURFACE_CONTOUR_CONFIGS?.[elem];
        const defaultColor = cfg?.defaultColor || (elem === "VOR" ? "#c678dd" : (elem === "DIV" ? "#56d4dd" : "#58a6ff"));
        const activeGroup = win?.activeGroup || appState.get("activeGroup");
        const stnLayerInGroup = activeGroup?.layers?.find((l) => l.type === "station");
        const derivedFrom = stnLayerInGroup?.id || layer?.id || "surface-obs";
        const isDTD = elem === "DTD";
        const isKinematic = elem === "VOR" || elem === "DIV";
        const contourDefaults = isDTD ? { showFill: false, showLine: false, showRaster: true } : (isKinematic ? { showFill: false, showLine: true, showRaster: false } : {});

        const res = analyzeAndRenderSurfaceContours(map, geojson, elem, {
          layerId: liveLayerId,
          lineColor: defaultColor,
          derivedFrom,
          ...contourDefaults,
        }, win);

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
              showLine: isDTD ? false : true,
              showRaster: isDTD ? true : false,
              lineColor: defaultColor,
            },
          };
          upsertDerivedLayerToPreset(activeGroup.id, derivedEntry);
        }
        if (isDTD) {
          const renderedLayer = getLayersForWindow(win).find((l) => l.id === liveLayerId);
          if (renderedLayer) {
            triggerRasterOverlay(map, renderedLayer, win);
            updateLegend(elem, renderedLayer.colormap || "DTD", renderedLayer.gridData?.stats?.min, renderedLayer.gridData?.stats?.max, win);
          }
        }
      });
    }
  } else if (action === "remove") {
    if ((layer.type === "contour" || layer.type === "wind") && layer.element) {
      removeLegend(layer.element, win);
    }
    if (layer.type === "contour" || layer.type === "wind") {
      removeContourLayer(map, layerId);
      removeRasterLayer(map, layerId);
      if (layer.type === "wind" || layer.config?.showWind) {
        stopWindAnimation(map);
      }
      if (layer.type === "wind" || layer.config?.showBarbs) {
        removeGridWindBarbs(map);
      }

      // Persist deletion of layer from preset configuration
      const activeGroup = win?.activeGroup || appState.get("activeGroup");
      if (activeGroup?.id) {
        if (layer.derivedFrom || layer.id?.startsWith("contour-surface-") || layer.id?.startsWith("contour-sounding-")) {
          removeDerivedLayerFromPreset(activeGroup.id, layer);
        }
        if (Array.isArray(activeGroup.layers)) {
          const aIdx = activeGroup.layers.findIndex((l) => l.id === layerId || (l.model === layer.model && l.element === layer.element));
          if (aIdx >= 0) {
            activeGroup.layers.splice(aIdx, 1);
          }
        }
      }
      if (Array.isArray(win?.derivedContourSnapshots)) {
        win.derivedContourSnapshots = win.derivedContourSnapshots.filter(
          (s) => s.id !== layerId && !(s.model === layer.model && s.element === layer.element)
        );
      }
      if (Array.isArray(win?.layerSnapshots)) {
        win.layerSnapshots = win.layerSnapshots.filter(
          (s) => s.id !== layerId && !(s.model === layer.model && s.element === layer.element)
        );
      }

      // If in non-preset single-product mode and the base element layer was removed,
      // update win.element to the next remaining weather layer (e.g. derived divergence)
      if (!activeGroup) {
        const remaining = getLayersForWindow(win).filter(
          (l) => l.type !== "pmtiles" && l.id !== layerId && l.id !== layer?.id
        );
        if (remaining.length > 0) {
          if (win && (win.element === layer.element || layerId === `wind-${win.element}` || layerId === `contour-${win.element}`)) {
            const nextLayer = remaining[0];
            win.element = nextLayer.element;
            if (nextLayer.model) win.model = nextLayer.model;
            if (nextLayer.level !== undefined && nextLayer.level !== null) win.level = nextLayer.level;
            updateWindowTitle(win);
          }
        }
      }
    } else if (layer.type === "station") {
      setStationVisibility(map, false);
      if (layer.config?.showStreamlines) stopWindAnimation(map);
      if (Array.isArray(win?.layerSnapshots)) {
        win.layerSnapshots = win.layerSnapshots.filter((s) => s.id !== layerId);
      }
    }
  } else if (action === "aux") {
    if (layerId === "raster") {
      if (value) {
        const layers = getLayersForWindow(winObj);
        layers.forEach((l) => {
          if (l.type === "contour") {
            l.config = { ...l.config, showFill: false, showRaster: true };
            setLayerIsobandVisibility(map, l.id, false);
          }
        });
        triggerRasterOverlay(map, null, winObj);
      } else {
        setRasterVisibility(map, false);
        const layers = getLayersForWindow(winObj);
        layers.forEach((l) => {
          if (l.config?.showRaster) l.config.showRaster = false;
          const hasShading = (l.visible !== false) && Boolean(l.config?.showFill);
          if (!hasShading && l.element) removeLegend(l.element, winObj);
        });
      }
    } else if (layerId === "contourf") {
      const layers = getLayersForWindow(winObj);
      const contourLayers = layers.filter((l) => l.type === "contour");
      contourLayers.forEach((l) => {
        l.config = { ...l.config, showFill: value };
        setLayerIsobandVisibility(map, l.id, l.visible !== false && value);
        if (value) {
          l.config.showRaster = false;
          setRasterVisibility(map, false, l.id);
        }
        const hasShading = (l.visible !== false) && (value || Boolean(l.config?.showRaster));
        if (hasShading) {
          const colormap = l.colormap || l.config?.palettePath || l.element;
          updateLegend(l.element, colormap, l.gridData?.stats?.min, l.gridData?.stats?.max, winObj);
        } else {
          removeLegend(l.element, winObj);
        }
      });
    } else if (layerId === "wind") {
      if (value) {
        triggerWindStreamlines(map, null, winObj);
      } else {
        stopWindAnimation(map);
      }
    }
  }
}

function getSourceFeatures(src) {
  if (!src) return [];
  const d = src._data?.geojson || src._data || src.data;
  return Array.isArray(d?.features) ? d.features : [];
}

export async function triggerIsobandOverlay(map, layer = null, win = null) {
  if (!map || !layer || layer.type === "wind") return;
  const layerId = layer.id || (layer.element ? `contour-${layer.element}` : "default");
  const { isobandSrcId } = getLayerDOMIds(layerId);
  const isobandSrc = map.getSource(isobandSrcId);
  const features = getSourceFeatures(isobandSrc);

  if (features.length > 0) {
    setLayerIsobandVisibility(map, layerId, layer.visible !== false);
    if (layer.visible !== false && layer.element) {
      const colormap = layer.colormap || layer.config?.palettePath || layer.element;
      updateLegend(layer.element, colormap, layer.gridData?.stats?.min, layer.gridData?.stats?.max, win);
    }
    return;
  }

  // 1. Direct in-memory gridData from layer
  if (layer.gridData && layer.gridData.header) {
    const isVisible = layer.visible !== false;
    renderContourLayers(map, layer.gridData, layer.element || "TMP", {
      ...layer.config,
      layerId,
      showFill: isVisible,
      showRaster: false,
      showLine: isVisible && layer.config?.showLine !== false,
      opacity: layer.config?.opacity ?? 0.75,
      lineColor: layer.config?.lineColor,
      lineWidth: layer.config?.lineWidth,
      boldValues: layer.config?.boldValues,
      boldLineWidth: layer.config?.boldLineWidth,
      colormap: layer.colormap || layer.element,
      smooth: layer.config?.smooth,
      smoothIterations: layer.config?.smoothIterations,
      labelSize: layer.config?.labelSize,
      viewportBounds: (map && typeof map.getBounds === "function") ? map.getBounds().toArray() : null,
    });
    armContourReRender(map, layer, win);
    if (isVisible && layer.element) {
      const colormap = layer.colormap || layer.config?.palettePath || layer.element;
      updateLegend(layer.element, colormap, layer.gridData?.stats?.min, layer.gridData?.stats?.max, win);
    }
    return;
  }

  // 2. Fetch gridData if missing (for catalog-loaded NWP layers)
  const isUpper = (layer.model === "UPPER_AIR") || (layer.id && layer.id.startsWith("contour-sounding-"));
  const isSurface = (layer.model === "SURFACE" || layer.model === "SURFACE_ANALYSIS") || (layer.id && layer.id.startsWith("contour-surface-"));
  const isNwpKinematic = (layer.element === "VOR" || layer.element === "DIV" || (layer.element === "WIND" && layer.type === "contour")) && !isUpper && !isSurface;
  if (isNwpKinematic) {
    await triggerVortDivOverlay(map, layer, win);
    return;
  }

  const model = layer.model || win?.model || "ECMWF_HR";
  const level = layer.level !== undefined && layer.level !== null ? layer.level : (win?.level !== undefined ? win.level : null);
  let path = layer.path;
  if (!path) {
    const isUpper = model === "UPPER_AIR" || (layer.element && layer.element.includes("UPPER"));
    path = isUpper ? `UPPER_AIR/${layer.element}/${level || 500}` : `${model}/${layer.element}/${level !== null ? level : "0"}`;
  }
  let file = layer.file || win?.obsTime;
  if (!file && win?.forecastCycle) {
    file = `${win.forecastCycle}.${String(win.period ?? 24).padStart(3, "0")}`;
  }
  if (path && file) {
    try {
      const gridData = await fetchGridData(path, file);
      if (gridData && gridData.header) {
        layer.gridData = gridData;
        const isVisible = layer.visible !== false;
        renderContourLayers(map, gridData, layer.element || "TMP", {
          ...layer.config,
          layerId,
          showFill: isVisible,
          showRaster: false,
          showLine: isVisible && layer.config?.showLine !== false,
          opacity: layer.config?.opacity ?? 0.75,
          lineColor: layer.config?.lineColor,
          lineWidth: layer.config?.lineWidth,
          boldValues: layer.config?.boldValues,
          boldLineWidth: layer.config?.boldLineWidth,
          colormap: layer.colormap || layer.element,
          smooth: layer.config?.smooth,
          smoothIterations: layer.config?.smoothIterations,
          labelSize: layer.config?.labelSize,
          viewportBounds: (map && typeof map.getBounds === "function") ? map.getBounds().toArray() : null,
        });
        armContourReRender(map, layer, win);
        if (isVisible && layer.element) {
          const colormap = layer.colormap || layer.config?.palettePath || layer.element;
          updateLegend(layer.element, colormap, gridData.stats?.min, gridData.stats?.max, win);
        }
        return;
      }
    } catch (err) {
      console.warn("[LayerActions] Failed to fetch gridData for isoband overlay:", err);
    }
  }

  // Fallback: sync visibility on existing layer
  setLayerIsobandVisibility(map, layerId, layer.visible !== false);
}

export async function triggerRasterOverlay(map, layer = null, win = null) {
  if (!map) return;

  // If no specific layer is supplied (e.g. global aux raster action), trigger for all active weather layers in window
  if (!layer) {
    const layers = getLayersForWindow(win);
    const weatherLayers = layers.filter(
      (l) => (l.type === "contour" || l.type === "wind" || l.gridData) && l.visible !== false && l.config?.showRaster !== false
    );
    if (weatherLayers.length > 0) {
      weatherLayers.forEach((l) => triggerRasterOverlay(map, l, win));
      return;
    }
  }

  const layerId = layer?.id || (layer?.type === "wind" || layer?.element === "WIND" ? "wind-WIND" : (layer?.element ? `contour-${layer.element}` : "default"));
  const element = layer?.element || win?.element || "TMP";
  let colormap = layer?.colormap || layer?.render?.colormap || win?.colormap || element;
  const opacity = layer?.config?.opacity !== undefined ? layer.config.opacity : 0.85;

  const palettePath = layer?.config?.palettePath || layer?.render?.palettePath;
  if (palettePath) {
    const paletteKey = `palette:${layerId}`;
    try {
      const { loadXMLPalette } = await import("../utils/paletteLoader.js");
      const { setColormaps, COLORMAPS } = await import("../utils/colormaps.js");
      const stops = await loadXMLPalette(palettePath);
      if (stops) {
        setColormaps({ ...COLORMAPS, [paletteKey]: stops });
        if (layer) layer.colormap = paletteKey;
        colormap = paletteKey;
      }
    } catch {}
  }

  // 1. Direct in-memory gridData from layer (e.g. RH, HGT, Wind, Surface SLP, or Sounding Analysis)
  if (layer?.gridData) {
    renderGridRaster(map, layer.gridData, element, colormap, { layerId, opacity });
    if (layer.visible !== false) {
      updateLegend(element, colormap, layer.gridData.stats?.min, layer.gridData.stats?.max, win);
    }
    armContourReRender(map, layer, win);
    return;
  }

  // 2. Wind gridData from window (if wind layer without attached gridData)
  if ((layer?.type === "wind" || layer?.element === "WIND") && win?.windGridData) {
    renderGridRaster(map, win.windGridData, "WIND", colormap, { layerId, opacity });
    if (layer?.visible !== false) {
      updateLegend("WIND", colormap, 0, undefined, win);
    }
    return;
  }

  // 3. Dynamic model, element, level and file from layer or window
  const isUpper = (layer?.model === "UPPER_AIR") || (layer?.id && layer?.id.startsWith("contour-sounding-"));
  const isSurface = (layer?.model === "SURFACE" || layer?.model === "SURFACE_ANALYSIS") || (layer?.id && layer?.id.startsWith("contour-surface-"));
  const isNwpKinematic = (element === "VOR" || element === "DIV" || (element === "WIND" && layer?.type === "contour")) && !isUpper && !isSurface;
  if (isNwpKinematic) {
    await triggerVortDivOverlay(map, layer, win);
    return;
  }

  const model = layer?.model || win?.model || "ECMWF_HR";
  const level = layer?.level !== undefined && layer?.level !== null ? layer.level : (win?.level !== undefined ? win.level : null);

  let path = layer?.path;
  if (!path) {
    if (model === "SURFACE") {
      path = `SURFACE/${element}`;
    } else if (level && level > 0) {
      path = `${model}/${element}/${level}`;
    } else {
      path = `${model}/${element}`;
    }
  }

  let file = layer?.file || win?.obsTime || win?.file;
  if (!file) {
    const period = win?.period ?? 24;
    let cycle = win?.forecastCycle || appState.get("forecastCycle");
    if (!cycle) {
      try {
        const { resolveLatestForecastCycle } = await import("../utils/timelineSync.js");
        cycle = await resolveLatestForecastCycle(model, element, level);
      } catch {}
    }
    if (!cycle) {
      const { generateDynamicForecastCycles } = await import("../utils/timelineSync.js");
      cycle = generateDynamicForecastCycles(null, 1)[0];
    }
    file = `${cycle}.${String(period).padStart(3, "0")}`;
  }

  fetchGridBinaryStream(path, file)
    .then((bin) => {
      renderBinaryRaster(map, bin, element, colormap, { layerId, opacity });
      if (layer?.visible !== false) {
        updateLegend(element, colormap, layer?.gridData?.stats?.min, layer?.gridData?.stats?.max, win);
      }
    })
    .catch((err) => {
      console.warn(`[Raster] Binary stream fetch failed for ${path}/${file}, trying JSON gridData:`, err);
      fetchGridData(path, file)
        .then((grid) => {
          if (grid && (grid.values || (grid.u && grid.v))) {
            if (layer) layer.gridData = grid;
            renderGridRaster(map, grid, element, colormap, { layerId, opacity });
            if (layer?.visible !== false) {
              updateLegend(element, colormap, grid.stats?.min, grid.stats?.max, win);
            }
            if (layer) armContourReRender(map, layer, win);
          } else {
            notifyError(`Failed to load raster overlay data for ${element}.`);
          }
        })
        .catch((jsonErr) => {
          console.warn(`[Raster] JSON gridData fetch failed for ${path}/${file}:`, jsonErr);
          notifyError(`Failed to load raster overlay for ${element}: ${jsonErr?.message || jsonErr}`);
        });
    });
}

async function triggerWindStreamlines(map, layer = null, win = null) {
  if (!layer) {
    const layers = getLayersForWindow(win);
    const windLayers = layers.filter(
      (l) => (l.type === "wind" || l.element === "WIND") && l.visible !== false && l.config?.showWind !== false
    );
    if (windLayers.length > 0) {
      windLayers.forEach((l) => triggerWindStreamlines(map, l, win));
      return;
    }
  }

  let grid = layer?.gridData || win?.windGridData || win?.gridData || appState.get("gridData");
  if (grid && grid.u && grid.v) {
    renderWindStreamlines(map, grid);
    return;
  }

  const model = layer?.model || win?.model || "ECMWF_HR";
  const level = layer?.level !== undefined && layer?.level !== null && layer?.level > 0 ? layer.level : (win?.level || 850);
  const period = win?.period ?? 24;
  let cycle = win?.forecastCycle || appState.get("forecastCycle");
  if (!cycle) {
    try {
      const { resolveLatestForecastCycle } = await import("../utils/timelineSync.js");
      cycle = await resolveLatestForecastCycle(model, "WIND", level);
    } catch {}
  }
  if (!cycle) {
    const { generateDynamicForecastCycles } = await import("../utils/timelineSync.js");
    cycle = generateDynamicForecastCycles(null, 1)[0];
  }
  const file = layer?.file || win?.file || `${cycle}.${String(period).padStart(3, "0")}`;
  const path = `${model}/WIND/${level}`;

  fetchGridData(path, file)
    .then((windGrid) => {
      if (windGrid && windGrid.u && windGrid.v) {
        if (layer) layer.gridData = windGrid;
        if (win) win.windGridData = windGrid;
        renderWindStreamlines(map, windGrid);
      }
    })
    .catch((err) => {
      console.warn("[Wind] Fetch wind failed:", err);
      notifyError(`Failed to load wind streamlines for ${level}hPa: ${err?.message || err}`);
    });
}

async function triggerWindBarbs(map, layer = null, win = null) {
  let grid = layer?.gridData || win?.windGridData || win?.gridData || appState.get("gridData");
  if (grid && grid.u && grid.v) {
    renderGridWindBarbs(map, grid);
    return;
  }

  const model = layer?.model || win?.model || "ECMWF_HR";
  const level = layer?.level !== undefined && layer?.level !== null && layer?.level > 0 ? layer.level : (win?.level || 850);
  const period = win?.period ?? 24;
  let cycle = win?.forecastCycle || appState.get("forecastCycle");
  if (!cycle) {
    try {
      const { resolveLatestForecastCycle } = await import("../utils/timelineSync.js");
      cycle = await resolveLatestForecastCycle(model, "WIND", level);
    } catch {}
  }
  if (!cycle) {
    const { generateDynamicForecastCycles } = await import("../utils/timelineSync.js");
    cycle = generateDynamicForecastCycles(null, 1)[0];
  }
  const file = layer?.file || win?.file || `${cycle}.${String(period).padStart(3, "0")}`;
  const path = `${model}/WIND/${level}`;

  fetchGridData(path, file)
    .then((windGrid) => {
      if (windGrid && windGrid.u && windGrid.v) {
        if (layer) layer.gridData = windGrid;
        if (win) win.windGridData = windGrid;
        renderGridWindBarbs(map, windGrid);
      }
    })
    .catch((err) => {
      console.warn("[Wind] Fetch wind barbs failed:", err);
      notifyError(`Failed to load wind barbs for ${level}hPa: ${err?.message || err}`);
    });
}

export async function triggerStationStreamlines(map, layer = null, win = null) {
  const curLevel = layer?.level || win?.level || (layer?.model === "UPPER_AIR" ? 500 : null);
  const geojson = layer?.stationsGeoJSON || getStationGeoJSON(map) || win?.stationsGeoJSON || appState.get("stationData");
  if (geojson && geojson.features && geojson.features.length >= 3) {
    const windGrid = generateStationWindGrid(geojson, curLevel);
    if (windGrid) {
      if (layer) layer.gridData = windGrid;
      if (win) win.windGridData = windGrid;
      renderWindStreamlines(map, windGrid);
      return;
    }
  }

  // Fallback: If station GeoJSON is not yet in memory, fetch it via API
  const model = layer?.model || "SURFACE";
  const element = layer?.element || (model === "SURFACE" ? "PLOT_GLOBAL_3H" : "PLOT");
  const level = layer?.level || win?.level || 500;
  const path = layer?.path || (model === "SURFACE" ? `SURFACE/${element}` : `UPPER_AIR/${element}/${level}`);
  let file = layer?.file || win?.file || win?.obsTime || appState.get("obsTime") || appState.get("file");
  if (!file) {
    try {
      const { syncObservationTimeline } = await import("../utils/timelineSync.js");
      const winTitle = win?.title || layer?.name || "";
      file = await syncObservationTimeline(path, null, winTitle, win);
    } catch {}
  }

  if (!file) {
    console.warn("[StationStreamlines] No obsTime/file available, aborting fetch");
    notifyError("No observation time available for station streamlines.");
    return;
  }

  fetchStationObservations(path, file)
    .then((data) => {
      if (data && data.features && data.features.length >= 3) {
        if (layer) layer.stationsGeoJSON = data;
        const windGrid = generateStationWindGrid(data, level);
        if (windGrid) {
          if (layer) layer.gridData = windGrid;
          if (win) win.windGridData = windGrid;
          renderWindStreamlines(map, windGrid);
        }
      } else {
        notifyError("Insufficient station observation data for streamlines.");
      }
    })
    .catch((err) => {
      console.warn("[StationStreamlines] Fetch failed:", err);
      notifyError(`Failed to load station streamlines: ${err?.message || err}`);
    });
}

export async function triggerVortDivOverlay(map, layer = null, win = null) {
  if (!map || !layer) return;
  const element = (layer.element || "VOR").toUpperCase();
  const model = layer.model || win?.model || "ECMWF_HR";
  const level = layer.level !== undefined && layer.level !== null ? layer.level : (win?.level !== undefined ? win.level : 850);
  const layerId = layer.id || `contour-${model}-${element.toLowerCase()}-${level}`;
  const isVisible = layer.visible !== false;

  let colormap = layer.colormap || layer.render?.colormap || element;
  const palettePath = layer.config?.palettePath || layer.render?.palettePath;
  if (palettePath && (!layer.colormap || !layer.colormap.startsWith("palette:"))) {
    const paletteKey = `palette:${layerId}`;
    try {
      const { loadXMLPalette } = await import("../utils/paletteLoader.js");
      const { setColormaps, COLORMAPS } = await import("../utils/colormaps.js");
      const stops = await loadXMLPalette(palettePath);
      if (stops) {
        setColormaps({ ...COLORMAPS, [paletteKey]: stops });
        layer.colormap = paletteKey;
        colormap = paletteKey;
      }
    } catch {}
  }

  const period = win?.period ?? 24;
  let cycle = win?.forecastCycle || (layer.file ? layer.file.split(".")[0] : null);
  if (!cycle) {
    try {
      const { resolveLatestForecastCycle } = await import("../utils/timelineSync.js");
      cycle = await resolveLatestForecastCycle(model, "WIND", level);
    } catch {}
  }
  const file = cycle ? `${cycle}.${String(period).padStart(3, "0")}` : (layer.file || null);
  if (file && layer.file !== file) {
    layer.file = file;
    layer.gridData = null;
  }

  // 1. Check if layer already has computed kinematic gridData
  if (layer.gridData && layer.gridData.header && layer.gridData.values) {
    renderContourLayers(map, layer.gridData, element, {
      ...layer.config,
      layerId,
      showFill: isVisible && Boolean(layer.config?.showFill),
      showRaster: isVisible && Boolean(layer.config?.showRaster),
      showLine: isVisible && layer.config?.showLine !== false,
      lineColor: layer.config?.lineColor || (element === "VOR" ? "#c678dd" : (element === "DIV" ? "#56d4dd" : "#58a6ff")),
      lineWidth: layer.config?.lineWidth,
      boldValues: layer.config?.boldValues,
      boldLineWidth: layer.config?.boldLineWidth,
      colormap,
      smooth: layer.config?.smooth,
      smoothIterations: layer.config?.smoothIterations,
      labelSize: layer.config?.labelSize,
      viewportBounds: (map && typeof map.getBounds === "function") ? map.getBounds().toArray() : null,
    });
    armContourReRender(map, layer, win);
    if (layer.config?.showRaster && isVisible) {
      renderGridRaster(map, layer.gridData, element, colormap, { layerId, opacity: layer.config?.opacity ?? 0.75 });
    }
    const hasShading = isVisible && (Boolean(layer.config?.showFill) || Boolean(layer.config?.showRaster));
    if (hasShading) {
      updateLegend(element, colormap, layer.gridData.stats?.min, layer.gridData.stats?.max, win);
    } else {
      removeLegend(element, win);
    }
    return;
  }

  // 2. Resolve parent wind field via three-tier fallback: layer.gridData -> win.windGridData / win._windGridCache -> fetch
  let windGrid = null;
  const cacheKey = file ? `${model}/WIND/${level}/${file}` : null;

  if (cacheKey && win?._windGridCache?.has(cacheKey)) {
    windGrid = win._windGridCache.get(cacheKey);
  } else if (win?.windGridData && win.windGridData._file === file && (win.level === level || !level) && win.windGridData.u && win.windGridData.v) {
    windGrid = win.windGridData;
  } else if (file) {
    try {
      const { fetchGridData } = await import("../api/catalogApi.js");
      windGrid = await fetchGridData(`${model}/WIND/${level}`, file);
      if (windGrid) windGrid._file = file;
      if (win && cacheKey) {
        if (!win._windGridCache) win._windGridCache = new Map();
        win._windGridCache.set(cacheKey, windGrid);
      }
    } catch (err) {
      console.warn(`[LayerActions] Failed to fetch wind grid for ${model}/WIND/${level}/${file}:`, err);
      return;
    }
  }

  if (!windGrid || !windGrid.u || !windGrid.v) {
    console.warn(`[LayerActions] No valid wind vectors found for kinematic calculation: ${model}/WIND/${level}`);
    return;
  }

  // 3. Compute kinematic grid
  const { buildKinematicGridData } = await import("../layers/kinematics.js");
  const kinGrid = buildKinematicGridData(element, windGrid.u, windGrid.v, windGrid, {
    smoothOutput: layer.config?.smooth !== false,
    outputSmoothIterations: layer.config?.smoothIterations ?? 1,
  });

  if (!kinGrid) return;
  layer.gridData = kinGrid;

  // 4. Render contour layers
  renderContourLayers(map, kinGrid, element, {
    ...layer.config,
    layerId,
    showFill: isVisible && Boolean(layer.config?.showFill),
    showRaster: isVisible && Boolean(layer.config?.showRaster),
    showLine: isVisible && layer.config?.showLine !== false,
    lineColor: layer.config?.lineColor || (element === "VOR" ? "#c678dd" : (element === "DIV" ? "#56d4dd" : "#58a6ff")),
    lineWidth: layer.config?.lineWidth,
    boldValues: layer.config?.boldValues,
    boldLineWidth: layer.config?.boldLineWidth,
    colormap,
    smooth: layer.config?.smooth,
    smoothIterations: layer.config?.smoothIterations,
    labelSize: layer.config?.labelSize,
    viewportBounds: (map && typeof map.getBounds === "function") ? map.getBounds().toArray() : null,
  });
  armContourReRender(map, layer, win);

  if (layer.config?.showRaster && isVisible) {
    renderGridRaster(map, kinGrid, element, colormap, { layerId, opacity: layer.config?.opacity ?? 0.75 });
  }

  const hasShading = isVisible && (Boolean(layer.config?.showFill) || Boolean(layer.config?.showRaster));
  if (hasShading) {
    updateLegend(element, colormap, kinGrid.stats?.min, kinGrid.stats?.max, win);
  } else {
    removeLegend(element, win);
  }
}

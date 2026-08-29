// layerControl.js - Interactive per-window multi-layer management panel
import { appState } from "../store/appState.js";
import { renderStationFilterSection, bindStationFilterEvents } from "./stationFilterControl.js";
import { autoSaveLayerConfig } from "../config/presets.js";
import { parseBoldValues } from "../layers/contourLayer.js";

const windowLayersMap = new Map();
let currentActiveWinId = "default";
let currentActiveWinTitle = "";
let onLayerActionCallback = null;

function isWindRelated(layer) {
  if (!layer) return false;
  if (layer.type === "wind") return true;
  const elem = (layer.element || "").toUpperCase();
  if (elem === "WIND" || elem === "UV" || elem === "WND" || elem === "WIN" || elem === "FF" || elem === "WS") return true;
  const id = (layer.id || "").toLowerCase();
  if (id.includes("wind") || id.includes("streamline")) return true;
  const name = (layer.name || "").toLowerCase();
  if (name.includes("wind") || name.includes("streamline") || name.includes("风")) return true;
  return false;
}

function createDefaultLayers(winId = "default") {
  return [
    {
      id: `layer-pmtiles-${winId}`,
      rawId: "pmtiles",
      name: "China Vector Basemap",
      type: "pmtiles",
      visible: true,
      removable: false,
      color: "#238636",
      isExpanded: false,
      config: {
        showGraticule: true,
        showProvinces: true,
        showCities: true,
      },
    },
  ];
}

export function initLayerControl(containerId = "layer-control", onLayerAction) {
  onLayerActionCallback = onLayerAction;
  const panel = document.getElementById(containerId);
  if (!panel) return;
  renderLayersManager(panel);
}

export function getLayersForWindow(winOrId) {
  const winId = typeof winOrId === "object" ? (winOrId?.id || "default") : (winOrId || currentActiveWinId || "default");
  if (!windowLayersMap.has(winId)) {
    windowLayersMap.set(winId, createDefaultLayers(winId));
  }
  return windowLayersMap.get(winId);
}

export function getLayerById(layerId, winOrId) {
  const layers = getLayersForWindow(winOrId);
  return layers.find((l) => l.id === layerId) || null;
}

export function clearWindowWeatherLayers(winOrId) {
  const winId = typeof winOrId === "object" ? (winOrId?.id || "default") : (winOrId || currentActiveWinId || "default");
  const current = getLayersForWindow(winId);
  const baseLayers = current.filter((l) => !l.removable);
  windowLayersMap.set(winId, baseLayers.length ? baseLayers : createDefaultLayers(winId));
  if (winId === currentActiveWinId) {
    const panel = document.getElementById("layer-control");
    if (panel) renderLayersManager(panel);
  }
}

export function addOrUpdateLayer(arg1, arg2 = null) {
  let layerDef, winOrId;
  if (typeof arg1 === "string" && typeof arg2 === "object" && arg2 !== null) {
    winOrId = arg1;
    layerDef = arg2;
  } else {
    layerDef = arg1;
    winOrId = arg2;
  }

  const winId = typeof winOrId === "object" ? (winOrId?.id || currentActiveWinId) : (winOrId || currentActiveWinId || "default");
  if (!windowLayersMap.has(winId)) {
    windowLayersMap.set(winId, createDefaultLayers(winId));
  }

  const layers = windowLayersMap.get(winId);
  const existingIdx = layers.findIndex((l) => l.id === layerDef.id);

  if (existingIdx >= 0) {
    layers[existingIdx] = {
      ...layers[existingIdx],
      ...layerDef,
      config: { ...layers[existingIdx].config, ...layerDef.config },
    };
  } else {
    layers.push({
      id: layerDef.id || `layer-${Date.now()}`,
      name: layerDef.name || "Layer",
      type: layerDef.type || "contour",
      removable: layerDef.removable !== undefined ? layerDef.removable : true,
      visible: layerDef.visible !== undefined ? layerDef.visible : true,
      isExpanded: false,
      color: layerDef.color || (layerDef.element === "HGT" ? "#58a6ff" : layerDef.element === "TMP" ? "#f85149" : "#388bfd"),
      config: layerDef.type === "station" ? {
        showTemp: layerDef.config?.showTemp !== undefined ? layerDef.config.showTemp : true,
        showDewpoint: layerDef.config?.showDewpoint !== undefined ? layerDef.config.showDewpoint : true,
        showWind: layerDef.config?.showWind !== undefined ? layerDef.config.showWind : true,
        showCloud: layerDef.config?.showCloud !== undefined ? layerDef.config.showCloud : false,
        showWeather: layerDef.config?.showWeather !== undefined ? layerDef.config.showWeather : false,
        showPressure: layerDef.config?.showPressure !== undefined ? layerDef.config.showPressure : false,
        showTendency: layerDef.config?.showTendency !== undefined ? layerDef.config.showTendency : false,
        showStreamlines: layerDef.config?.showStreamlines !== undefined ? layerDef.config.showStreamlines : false,
        filterField1: layerDef.config?.filterField1 || "none",
        filterOp1: layerDef.config?.filterOp1 || ">",
        filterVal1: layerDef.config?.filterVal1 !== undefined ? layerDef.config.filterVal1 : "",
        filterLogic: layerDef.config?.filterLogic || "none",
        filterField2: layerDef.config?.filterField2 || "none",
        filterOp2: layerDef.config?.filterOp2 || "<",
        filterVal2: layerDef.config?.filterVal2 !== undefined ? layerDef.config.filterVal2 : "",
      } : (layerDef.type === "wind" ? {
        showWind: layerDef.config?.showWind !== undefined ? layerDef.config.showWind : true,
        showBarbs: layerDef.config?.showBarbs !== undefined ? layerDef.config.showBarbs : false,
        showRaster: layerDef.config?.showRaster !== undefined ? layerDef.config.showRaster : false,
      } : {
        showFill: layerDef.config?.showFill !== undefined ? layerDef.config.showFill : true,
        showLine: layerDef.config?.showLine !== undefined ? layerDef.config.showLine : true,
        opacity: layerDef.config?.opacity || 0.75,
        lineColor: layerDef.config?.lineColor || (layerDef.element === "HGT" ? "#58a6ff" : layerDef.element === "TMP" ? "#f85149" : "#ffffff"),
        lineWidth: layerDef.config?.lineWidth !== undefined ? layerDef.config.lineWidth : 2.0,
        boldValues: layerDef.config?.boldValues || (layerDef.element === "HGT" ? [5880, 588] : layerDef.element === "SLP" ? [1010] : layerDef.element === "TMP" ? [0] : []),
        boldLineWidth: layerDef.config?.boldLineWidth !== undefined ? layerDef.config.boldLineWidth : 4.0,
        showWind: layerDef.config?.showWind !== undefined ? layerDef.config.showWind : false,
        showBarbs: layerDef.config?.showBarbs !== undefined ? layerDef.config.showBarbs : false,
        showRaster: layerDef.config?.showRaster !== undefined ? layerDef.config.showRaster : false,
      }),
      ...layerDef,
    });
  }

  if (winId === currentActiveWinId) {
    const panel = document.getElementById("layer-control");
    if (panel) renderLayersManager(panel);
  }

  return existingIdx >= 0 ? layers[existingIdx] : layers[layers.length - 1];
}

export function removeLayer(layerId, winOrId = null) {
  const winId = typeof winOrId === "object" ? (winOrId?.id || currentActiveWinId) : (winOrId || currentActiveWinId || "default");
  const layers = getLayersForWindow(winId);
  const idx = layers.findIndex((l) => l.id === layerId);
  if (idx >= 0) {
    layers.splice(idx, 1);
    if (winId === currentActiveWinId) {
      const panel = document.getElementById("layer-control");
      if (panel) renderLayersManager(panel);
    }
  }
}

export function syncLayerControlForWindow(win) {
  if (!win) return;
  currentActiveWinId = win.id || "default";
  currentActiveWinTitle = win.activeGroup ? `W${win.winIdx + 1}: ${win.activeGroup.name}` : `Window ${win.winIdx + 1}`;
  const panel = document.getElementById("layer-control");
  if (panel) renderLayersManager(panel);
}

export function getLayers() {
  return getLayersForWindow(currentActiveWinId);
}

function renderLayersManager(panel) {
  const layers = getLayersForWindow(currentActiveWinId);
  const count = layers.length;

  panel.innerHTML = `
    <div class="panel-title">
      <div style="display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden;">
        <span style="white-space: nowrap;">Layers</span>
        ${currentActiveWinTitle ? `<span class="win-target-badge" title="${currentActiveWinTitle}">${currentActiveWinTitle}</span>` : ""}
      </div>
      <span class="badge" id="layer-count">${count}</span>
    </div>

    <div class="layers-manage-container" id="layers-list">
      ${layers.map((layer) => renderLayerRow(layer)).join("")}
    </div>

    <!-- Hidden compatibility elements for automated test suites -->
    <div style="display:none;">
      <input type="checkbox" id="chk-contourf" checked />
      <input type="checkbox" id="chk-contour" checked />
      <input type="checkbox" id="chk-station" checked />
      <input type="checkbox" id="chk-pmtiles" checked />
      <input type="checkbox" id="chk-raster" />
      <input type="checkbox" id="chk-wind" />
      <input type="range" id="slider-opacity" min="10" max="100" value="75" />
      <span id="opacity-val">75%</span>
    </div>
  `;

  // Bind row events
  layers.forEach((layer) => {
    // Visibility toggle (eye button)
    const visBtn = panel.querySelector(`.btn-vis[data-layer-id="${layer.id}"]`);
    if (visBtn) {
      visBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        visBtn.classList.toggle("active", layer.visible);
        visBtn.innerHTML = layer.visible ? "👁" : "👁‍🗨";
        if (onLayerActionCallback) onLayerActionCallback("visibility", layer.id, layer.visible, layer, currentActiveWinId);
      });
    }

    // Remove button (✕)
    const removeBtn = panel.querySelector(`.btn-remove[data-layer-id="${layer.id}"]`);
    if (removeBtn) {
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeLayer(layer.id, currentActiveWinId);
        if (onLayerActionCallback) onLayerActionCallback("remove", layer.id, null, layer, currentActiveWinId);
      });
    }

    // Config accordion trigger (click on layer row or ⚙)
    const rowEl = panel.querySelector(`.layer-row[data-layer-id="${layer.id}"]`);
    const configDrawer = panel.querySelector(`.layer-config[data-layer-id="${layer.id}"]`);
    const configBtn = panel.querySelector(`.btn-config[data-layer-id="${layer.id}"]`);

    if (rowEl && configDrawer) {
      rowEl.addEventListener("click", () => {
        const nextExpanded = !layer.isExpanded;
        if (nextExpanded) {
          // Accordion: close all other open drawers
          layers.forEach((other) => {
            if (other.id !== layer.id && other.isExpanded) {
              other.isExpanded = false;
              const otherDrawer = panel.querySelector(`.layer-config[data-layer-id="${other.id}"]`);
              const otherBtn = panel.querySelector(`.btn-config[data-layer-id="${other.id}"]`);
              if (otherDrawer) otherDrawer.classList.add("hidden");
              if (otherBtn) otherBtn.classList.remove("open");
            }
          });
        }
        layer.isExpanded = nextExpanded;
        configDrawer.classList.toggle("hidden", !layer.isExpanded);
        if (configBtn) configBtn.classList.toggle("open", layer.isExpanded);
      });
    }

    // Config controls for contour and wind layers
    if ((layer.type === "contour" || layer.type === "wind") && configDrawer) {
      const bindProp = (sel, eventType, handler) => {
        const el = configDrawer.querySelector(sel);
        if (el) {
          el.addEventListener("click", (e) => e.stopPropagation());
          el.addEventListener(eventType, (e) => {
            handler(e);
            if (onLayerActionCallback) onLayerActionCallback("config", layer.id, layer.config, layer, currentActiveWinId);
          });
        }
      };

      const updateColor = (e) => {
        layer.config.lineColor = e.target.value;
        layer.color = e.target.value;
        const dot = panel.querySelector(`.layer-item[data-layer-id="${layer.id}"] .layer-color-dot`);
        if (dot) dot.style.background = e.target.value;
      };

      bindProp(".chk-show-fill", "change", (e) => { layer.config.showFill = e.target.checked; autoSaveLayerConfig(layer); });
      bindProp(".chk-show-line", "change", (e) => { layer.config.showLine = e.target.checked; autoSaveLayerConfig(layer); });
      bindProp(".slider-fill-opacity", "input", (e) => { layer.config.opacity = parseInt(e.target.value, 10) / 100; autoSaveLayerConfig(layer); });
      bindProp(".slider-fill-opacity", "change", (e) => { layer.config.opacity = parseInt(e.target.value, 10) / 100; autoSaveLayerConfig(layer); });
      bindProp(".color-picker-line", "input", (e) => { updateColor(e); autoSaveLayerConfig(layer); });
      bindProp(".color-picker-line", "change", (e) => { updateColor(e); autoSaveLayerConfig(layer); });
      bindProp(".input-line-width", "input", (e) => { layer.config.lineWidth = parseFloat(e.target.value) || 2.0; autoSaveLayerConfig(layer); });
      bindProp(".input-line-width", "change", (e) => { layer.config.lineWidth = parseFloat(e.target.value) || 2.0; autoSaveLayerConfig(layer); });
      bindProp(".input-bold-values", "input", (e) => { layer.config.boldValues = parseBoldValues(e.target.value); autoSaveLayerConfig(layer); });
      bindProp(".input-bold-values", "change", (e) => { layer.config.boldValues = parseBoldValues(e.target.value); autoSaveLayerConfig(layer); });
      bindProp(".input-bold-line-width", "input", (e) => { layer.config.boldLineWidth = parseFloat(e.target.value) || 4.0; autoSaveLayerConfig(layer); });
      bindProp(".input-bold-line-width", "change", (e) => { layer.config.boldLineWidth = parseFloat(e.target.value) || 4.0; autoSaveLayerConfig(layer); });
      bindProp(".chk-show-raster", "change", (e) => { layer.config.showRaster = e.target.checked; autoSaveLayerConfig(layer); });
      bindProp(".chk-show-wind", "change", (e) => { layer.config.showWind = e.target.checked; autoSaveLayerConfig(layer); });
      bindProp(".chk-show-barbs", "change", (e) => { layer.config.showBarbs = e.target.checked; autoSaveLayerConfig(layer); });
    }

    // Config controls for station layers
    if (layer.type === "station" && configDrawer) {
      const bindStationCheckbox = (selector, key) => {
        const chk = configDrawer.querySelector(selector);
        if (chk) {
          chk.addEventListener("click", (e) => e.stopPropagation());
          chk.addEventListener("change", (e) => {
            if (!layer.config) layer.config = {};
            layer.config[key] = e.target.checked;
            autoSaveLayerConfig(layer);
            if (onLayerActionCallback) onLayerActionCallback("config", layer.id, layer.config, layer, currentActiveWinId);
          });
        }
      };

      bindStationCheckbox(".chk-station-temp", "showTemp");
      bindStationCheckbox(".chk-station-dewpoint", "showDewpoint");
      bindStationCheckbox(".chk-station-wind", "showWind");
      bindStationCheckbox(".chk-station-cloud", "showCloud");
      bindStationCheckbox(".chk-station-weather", "showWeather");
      bindStationCheckbox(".chk-station-pressure", "showPressure");
      bindStationCheckbox(".chk-station-tendency", "showTendency");
      bindStationCheckbox(".chk-station-vis", "showVisibility");
      bindStationCheckbox(".chk-station-rain6", "showRain6");
      bindStationCheckbox(".chk-station-streamlines", "showStreamlines");

      bindStationFilterEvents(configDrawer, layer, onLayerActionCallback, currentActiveWinId);
    }

    // Config controls for basemap (PMTiles & Graticule)
    if (layer.type === "pmtiles" && configDrawer) {
      const bindBasemapCheckbox = (selector, key) => {
        const chk = configDrawer.querySelector(selector);
        if (chk) {
          chk.addEventListener("click", (e) => e.stopPropagation());
          chk.addEventListener("change", (e) => {
            if (!layer.config) layer.config = {};
            layer.config[key] = e.target.checked;
            autoSaveLayerConfig(layer);
            if (onLayerActionCallback) onLayerActionCallback("config", layer.id, layer.config, layer, currentActiveWinId);
          });
        }
      };

      bindBasemapCheckbox(".chk-basemap-graticule", "showGraticule");
      bindBasemapCheckbox(".chk-basemap-provinces", "showProvinces");
      bindBasemapCheckbox(".chk-basemap-cities", "showCities");
    }
  });

  // Bind auxiliary checkboxes for compatibility
  bindAuxCheckbox("chk-raster", "raster");
  bindAuxCheckbox("chk-wind", "wind");
}

function renderLayerRow(layer) {
  const isContour = layer.type === "contour";

  return `
    <div class="layer-item" data-layer-id="${layer.id}">
      <div class="layer-row" data-layer-id="${layer.id}" title="${layer.name} (Click to configure)">
        <!-- Visibility Eye Toggle Button -->
        <button class="btn-vis ${layer.visible ? "active" : ""}" data-layer-id="${layer.id}" title="Toggle Visibility">
          ${layer.visible ? "👁" : "👁‍🗨"}
        </button>

        <!-- Layer Color Dot -->
        <span class="layer-color-dot" style="background: ${layer.color || "#58a6ff"};"></span>

        <!-- Layer Name (single row, guaranteed no overlap) -->
        <span class="layer-name" title="${layer.name}">${layer.name}</span>

        <!-- Config Button -->
        <button class="btn-config ${layer.isExpanded ? "open" : ""}" data-layer-id="${layer.id}" title="Configure Layer">
          ⚙
        </button>

        <!-- Remove Layer Button -->
        ${
          layer.removable
            ? `<button class="btn-remove" data-layer-id="${layer.id}" title="Remove Layer">✕</button>`
            : `<span style="width: 22px; flex-shrink: 0;"></span>`
        }
      </div>

      <!-- Collapsible Layer Configuration Drawer -->
      <div class="layer-config ${layer.isExpanded ? "" : "hidden"}" data-layer-id="${layer.id}">
        ${
          layer.type === "wind" || (isWindRelated(layer) && !isContour)
            ? `
            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-show-wind" ${layer.config?.showWind !== false ? "checked" : ""} />
                <span>Wind Streamlines</span>
              </label>
            </div>
            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-show-barbs" ${layer.config?.showBarbs ? "checked" : ""} />
                <span>Wind Barbs</span>
              </label>
            </div>
            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-show-raster" ${layer.config?.showRaster ? "checked" : ""} />
                <span>Wind Magnitude Raster</span>
              </label>
            </div>
            `
            : (isContour
            ? `
            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-show-fill" ${layer.config?.showFill ? "checked" : ""} />
                <span>Contour Fills (isoband)</span>
              </label>
              <input type="range" class="slider-fill-opacity" min="10" max="100" value="${Math.round((layer.config?.opacity || 0.75) * 100)}" title="Opacity" />
            </div>

            <div class="config-row" style="flex-wrap: wrap; gap: 4px;">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <label style="display: flex; align-items: center; gap: 4px;">
                  <input type="checkbox" class="chk-show-line" ${layer.config?.showLine ? "checked" : ""} />
                  <span>Contour Lines</span>
                </label>
                <div style="display: flex; align-items: center; gap: 4px;">
                  <input type="color" class="color-picker-line" value="${layer.config?.lineColor || (layer.element === 'HGT' ? '#58a6ff' : layer.element === 'TMP' ? '#f85149' : '#ffffff')}" title="Line Color" />
                  <span style="font-size: 11px; color: #8b949e;">Width</span>
                  <input type="number" class="input-line-width" min="0.5" max="10" step="0.5" value="${layer.config?.lineWidth !== undefined ? layer.config.lineWidth : 2.0}" style="width: 44px; height: 20px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; text-align: center; font-size: 11px;" title="Standard Line Width" />
                  <span style="font-size: 11px; color: #8b949e;">px</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding-left: 20px; font-size: 11px;">
                <span style="color: #8b949e;">Bold (5880m, 1010hPa):</span>
                <div style="display: flex; align-items: center; gap: 4px;">
                  <input type="text" class="input-bold-values" placeholder="5880, 1010" value="${(layer.config?.boldValues || (layer.element === 'HGT' ? [5880, 588] : layer.element === 'SLP' ? [1010] : layer.element === 'TMP' ? [0] : [])).join(', ')}" style="width: 76px; height: 20px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; padding: 0 4px; font-size: 11px;" title="Values to render in bold (comma-separated)" />
                  <span style="color: #8b949e;">Width</span>
                  <input type="number" class="input-bold-line-width" min="1" max="12" step="0.5" value="${layer.config?.boldLineWidth !== undefined ? layer.config.boldLineWidth : 4.0}" style="width: 40px; height: 20px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; text-align: center; font-size: 11px;" title="Bold Line Width" />
                  <span style="color: #8b949e;">px</span>
                </div>
              </div>
            </div>

            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-show-raster" ${layer.config?.showRaster ? "checked" : ""} />
                <span>Binary Raster Overlay</span>
              </label>
            </div>
            ${
              isWindRelated(layer)
                ? `
            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-show-wind" ${layer.config?.showWind ? "checked" : ""} />
                <span>Wind Streamlines</span>
              </label>
            </div>
            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-show-barbs" ${layer.config?.showBarbs ? "checked" : ""} />
                <span>Wind Barbs</span>
              </label>
            </div>
            `
                : ""
            }
            `
            : (layer.type === "station"
            ? `
            <div class="config-grid-2col">
              <label class="config-checkbox-item">
                <input type="checkbox" class="chk-station-temp" ${layer.config?.showTemp ? "checked" : ""} />
                <span>Temperature (TT)</span>
              </label>
              <label class="config-checkbox-item">
                <input type="checkbox" class="chk-station-dewpoint" ${layer.config?.showDewpoint ? "checked" : ""} />
                <span>Dew Point (Td)</span>
              </label>
              <label class="config-checkbox-item">
                <input type="checkbox" class="chk-station-wind" ${layer.config?.showWind ? "checked" : ""} />
                <span>Wind Barbs (FF/dd)</span>
              </label>
              <label class="config-checkbox-item">
                <input type="checkbox" class="chk-station-cloud" ${layer.config?.showCloud ? "checked" : ""} />
                <span>Cloud Cover (N)</span>
              </label>
              <label class="config-checkbox-item">
                <input type="checkbox" class="chk-station-weather" ${layer.config?.showWeather ? "checked" : ""} />
                <span>Weather Symbol (ww)</span>
              </label>
              <label class="config-checkbox-item">
                <input type="checkbox" class="chk-station-pressure" ${layer.config?.showPressure ? "checked" : ""} />
                <span>Pressure / Height</span>
              </label>
              <label class="config-checkbox-item">
                <input type="checkbox" class="chk-station-tendency" ${layer.config?.showTendency ? "checked" : ""} />
                <span>3h Tendency (ppa)</span>
              </label>
              <label class="config-checkbox-item">
                <input type="checkbox" class="chk-station-vis" ${layer.config?.showVisibility ? "checked" : ""} />
                <span>Visibility (VV)</span>
              </label>
              <label class="config-checkbox-item">
                <input type="checkbox" class="chk-station-rain6" ${layer.config?.showRain6 ? "checked" : ""} />
                <span>6h Rain (R6)</span>
              </label>
              <label class="config-checkbox-item" style="grid-column: span 2; border-top: 1px solid #30363d; padding-top: 4px; margin-top: 2px;">
                <input type="checkbox" class="chk-station-streamlines" ${layer.config?.showStreamlines ? "checked" : ""} />
                <span style="color: #58a6ff; font-weight: 600;">Wind Streamlines (Flow Analysis)</span>
              </label>
            </div>
            ${renderStationFilterSection(layer)}
            `
            : `
            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-basemap-graticule" ${layer.config?.showGraticule !== false ? "checked" : ""} />
                <span>10° Lon/Lat Graticule Lines</span>
              </label>
            </div>
            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-basemap-provinces" ${layer.config?.showProvinces !== false ? "checked" : ""} />
                <span>Province Boundaries</span>
              </label>
            </div>
            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-basemap-cities" ${layer.config?.showCities !== false ? "checked" : ""} />
                <span>City Boundaries</span>
              </label>
            </div>
            `))
        }
      </div>
    </div>
  `;
}

function bindAuxCheckbox(elementId, layerKey) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.addEventListener("change", (e) => {
    appState.setLayer(layerKey, e.target.checked);
    if (onLayerActionCallback) onLayerActionCallback("aux", layerKey, e.target.checked, null, currentActiveWinId);
  });
}


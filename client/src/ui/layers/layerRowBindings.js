// layerRowBindings.js - Event bindings for layer controls, drawer toggles, and property updates
import { appState } from "../../store/appState.js";
import { autoSaveLayerConfig } from "../../config/presets.js";
import { parseBoldValues } from "../../layers/contourLayer.js";
import { loadXMLPalette } from "../../utils/paletteLoader.js";
import { bindStationFilterEvents } from "../stationFilterControl.js";
import { populatePaletteSelect } from "./palettePicker.js";
import { removeLayer } from "./layerStore.js";

export function bindLayerRowEvents(panel, layers, currentActiveWinId, onLayerActionCallback) {
  layers.forEach((layer) => {
    // Visibility toggle (eye button)
    const visBtn = panel.querySelector(`.btn-vis[data-layer-id="${layer.id}"]`);
    const rowEl = panel.querySelector(`.layer-row[data-layer-id="${layer.id}"]`);
    if (visBtn) {
      visBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        visBtn.classList.toggle("active", layer.visible);
        visBtn.innerHTML = layer.visible ? "👁" : "🚫";
        visBtn.setAttribute("aria-pressed", layer.visible ? "true" : "false");
        if (rowEl) rowEl.classList.toggle("layer-hidden", !layer.visible);
        if (onLayerActionCallback) {
          onLayerActionCallback("visibility", layer.id, layer.visible, layer, currentActiveWinId);
        }
      });
    }

    // Remove button (✕)
    const removeBtn = panel.querySelector(`.btn-remove[data-layer-id="${layer.id}"]`);
    if (removeBtn) {
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeLayer(layer.id, currentActiveWinId);
        if (onLayerActionCallback) {
          onLayerActionCallback("remove", layer.id, null, layer, currentActiveWinId);
        }
      });
    }

    // Config accordion trigger (click on layer row or ⚙)
    const configDrawer = panel.querySelector(`.layer-config[data-layer-id="${layer.id}"]`);
    const configBtn = panel.querySelector(`.btn-config[data-layer-id="${layer.id}"]`);

    if (rowEl && configDrawer) {
      const toggleDrawer = () => {
        const nextExpanded = !layer.isExpanded;
        if (nextExpanded) {
          // Accordion: close all other open drawers
          layers.forEach((other) => {
            if (other.id !== layer.id && other.isExpanded) {
              other.isExpanded = false;
              const otherDrawer = panel.querySelector(`.layer-config[data-layer-id="${other.id}"]`);
              const otherBtn = panel.querySelector(`.btn-config[data-layer-id="${other.id}"]`);
              const otherRow = panel.querySelector(`.layer-row[data-layer-id="${other.id}"]`);
              if (otherDrawer) otherDrawer.classList.add("hidden");
              if (otherBtn) {
                otherBtn.classList.remove("open");
                otherBtn.setAttribute("aria-expanded", "false");
              }
              if (otherRow) {
                otherRow.setAttribute("aria-expanded", "false");
              }
            }
          });
        }
        layer.isExpanded = nextExpanded;
        configDrawer.classList.toggle("hidden", !layer.isExpanded);
        if (configBtn) {
          configBtn.classList.toggle("open", layer.isExpanded);
          configBtn.setAttribute("aria-expanded", layer.isExpanded ? "true" : "false");
        }
        rowEl.setAttribute("aria-expanded", layer.isExpanded ? "true" : "false");
        if (layer.isExpanded && (layer.type === "contour" || layer.type === "wind")) {
          populatePaletteSelect(configDrawer, layer);
        }
      };

      rowEl.addEventListener("click", toggleDrawer);
      rowEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleDrawer();
        }
      });
    }

    // Config controls for contour and wind layers
    if ((layer.type === "contour" || layer.type === "wind") && configDrawer) {
      const bindProp = (selector, eventType, handler) => {
        const el = configDrawer.querySelector(selector);
        if (el) {
          el.addEventListener("click", (e) => e.stopPropagation());
          el.addEventListener(eventType, (e) => {
            const changed = handler(e);
            if (onLayerActionCallback) {
              onLayerActionCallback("config", layer.id, changed || layer.config, layer, currentActiveWinId);
            }
          });
        }
      };

      const updateColor = (e) => {
        layer.config.lineColor = e.target.value;
        layer.color = e.target.value;
        const dot = panel.querySelector(`.layer-item[data-layer-id="${layer.id}"] .layer-color-dot`);
        if (dot) dot.style.background = e.target.value;
        return { lineColor: e.target.value };
      };

      bindProp(".chk-show-fill", "change", (e) => {
        layer.config.showFill = e.target.checked;
        let showRaster = layer.config.showRaster;
        if (e.target.checked) {
          layer.config.showRaster = false;
          showRaster = false;
          const rasterEl = configDrawer.querySelector(".chk-show-raster");
          if (rasterEl) rasterEl.checked = false;
        }
        autoSaveLayerConfig(layer);
        return { showFill: e.target.checked, showRaster };
      });
      bindProp(".chk-show-line", "change", (e) => {
        layer.config.showLine = e.target.checked;
        autoSaveLayerConfig(layer);
        return { showLine: e.target.checked };
      });
      bindProp(".slider-fill-opacity", "input", (e) => {
        const op = parseInt(e.target.value, 10) / 100;
        layer.config.opacity = op;
        autoSaveLayerConfig(layer);
        return { opacity: op };
      });
      bindProp(".color-picker-line", "input", (e) => {
        const res = updateColor(e);
        autoSaveLayerConfig(layer);
        return res;
      });
      bindProp(".input-line-width", "change", (e) => {
        const w = parseFloat(e.target.value) || 2.0;
        layer.config.lineWidth = w;
        autoSaveLayerConfig(layer);
        return { lineWidth: w };
      });
      bindProp(".input-bold-values", "change", (e) => {
        const bv = parseBoldValues(e.target.value);
        layer.config.boldValues = bv;
        autoSaveLayerConfig(layer);
        return { boldValues: bv };
      });
      bindProp(".input-bold-line-width", "change", (e) => {
        const bw = parseFloat(e.target.value) || 4.0;
        layer.config.boldLineWidth = bw;
        autoSaveLayerConfig(layer);
        return { boldLineWidth: bw };
      });
      bindProp(".input-label-size", "change", (e) => {
        const ls = parseInt(e.target.value, 10) || 13;
        layer.config.labelSize = ls;
        autoSaveLayerConfig(layer);
        return { labelSize: ls };
      });
      bindProp(".chk-show-raster", "change", (e) => {
        layer.config.showRaster = e.target.checked;
        let showFill = layer.config.showFill;
        if (e.target.checked) {
          layer.config.showFill = false;
          showFill = false;
          const fillEl = configDrawer.querySelector(".chk-show-fill");
          if (fillEl) fillEl.checked = false;
        }
        autoSaveLayerConfig(layer);
        return { showRaster: e.target.checked, showFill };
      });
      bindProp(".chk-smooth-lines", "change", (e) => {
        layer.config.smooth = e.target.checked;
        autoSaveLayerConfig(layer);
        return { smooth: e.target.checked };
      });
      bindProp(".chk-show-wind", "change", (e) => {
        layer.config.showWind = e.target.checked;
        autoSaveLayerConfig(layer);
        return { showWind: e.target.checked };
      });
      bindProp(".chk-show-barbs", "change", (e) => {
        layer.config.showBarbs = e.target.checked;
        autoSaveLayerConfig(layer);
        return { showBarbs: e.target.checked };
      });

      // Palette picker: load element-filtered palette files into the select dropdown
      const paletteSel = configDrawer.querySelector(".sel-palette");
      const gradientPreview = configDrawer.querySelector(".palette-gradient-preview");
      if (paletteSel) {
        paletteSel.addEventListener("click", (e) => e.stopPropagation());

        if (layer.isExpanded) {
          populatePaletteSelect(configDrawer, layer);
        }

        paletteSel.addEventListener("change", async (e) => {
          e.stopPropagation();
          const path = e.target.value || null;
          if (!layer.config) layer.config = {};
          layer.config.palettePath = path;
          autoSaveLayerConfig(layer);

          // Update gradient preview
          if (gradientPreview) {
            if (!path) {
              gradientPreview.style.background = "linear-gradient(to right, #888, #fff)";
            } else {
              try {
                const stops = await loadXMLPalette(path);
                if (stops && gradientPreview.isConnected) {
                  const colors = stops
                    .map((s) => `rgba(${s.color.slice(0, 3).join(",")},${((s.color[3] ?? 255) / 255).toFixed(2)})`)
                    .join(", ");
                  gradientPreview.style.background = `linear-gradient(to right, ${colors})`;
                }
              } catch {}
            }
          }

          if (onLayerActionCallback) {
            onLayerActionCallback("config", layer.id, { palettePath: path }, layer, currentActiveWinId);
          }
        });
      }
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
            if (onLayerActionCallback) {
              onLayerActionCallback("config", layer.id, { [key]: e.target.checked }, layer, currentActiveWinId);
            }
          });
        }
      };

      [
        [".chk-station-temp", "showTemp"],
        [".chk-station-dewpoint", "showDewpoint"],
        [".chk-station-pressure", "showPressure"],
        [".chk-station-wind", "showWind"],
        [".chk-station-cloud", "showCloud"],
        [".chk-station-weather", "showWeather"],
        [".chk-station-tendency", "showTendency"],
        [".chk-station-vis", "showVisibility"],
        [".chk-station-rain6", "showRain6"],
        [".chk-station-dtd", "showDTD"],
        [".chk-station-streamlines", "showStreamlines"],
      ].forEach(([sel, key]) => bindStationCheckbox(sel, key));

      bindStationFilterEvents(configDrawer, layer, onLayerActionCallback, currentActiveWinId);
    }

    // Contour generation button (station or wind layer drawers)
    if (configDrawer) {
      const btnAddContour = configDrawer.querySelector(".btn-add-station-contour, .btn-add-contour");
      const selContourElem = configDrawer.querySelector(".sel-contour-element");
      if (btnAddContour && selContourElem) {
        btnAddContour.addEventListener("click", (e) => {
          e.stopPropagation();
          const elem = selContourElem.value;
          if (onLayerActionCallback) {
            onLayerActionCallback("addContour", layer.id, elem, layer, currentActiveWinId);
          }
        });
      }
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
            if (onLayerActionCallback) {
              onLayerActionCallback("config", layer.id, { [key]: e.target.checked }, layer, currentActiveWinId);
            }
          });
        }
      };

      [
        [".chk-basemap-graticule", "showGraticule"],
        [".chk-basemap-world", "showWorld"],
        [".chk-basemap-provinces", "showProvinces"],
        [".chk-basemap-cities", "showCities"],
      ].forEach(([sel, key]) => bindBasemapCheckbox(sel, key));

      const schemeSel = configDrawer.querySelector(".sel-basemap-scheme");
      if (schemeSel) {
        schemeSel.addEventListener("click", (e) => e.stopPropagation());
        schemeSel.addEventListener("change", (e) => {
          if (!layer.config) layer.config = {};
          layer.config.scheme = e.target.value;
          autoSaveLayerConfig(layer);
          if (onLayerActionCallback) {
            onLayerActionCallback("config", layer.id, { scheme: e.target.value }, layer, currentActiveWinId);
          }
        });
      }

      const projSel = configDrawer.querySelector(".sel-basemap-projection");
      if (projSel) {
        projSel.addEventListener("click", (e) => e.stopPropagation());
        projSel.addEventListener("change", (e) => {
          if (!layer.config) layer.config = {};
          layer.config.projection = e.target.value;
          autoSaveLayerConfig(layer);
          if (onLayerActionCallback) {
            onLayerActionCallback("config", layer.id, { projection: e.target.value }, layer, currentActiveWinId);
          }
        });
      }
    }
  });
}

export function bindAuxCheckbox(elementId, layerKey, currentActiveWinId, onLayerActionCallback) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.addEventListener("change", (e) => {
    appState.setLayer(layerKey, e.target.checked);
    if (onLayerActionCallback) {
      onLayerActionCallback("aux", layerKey, e.target.checked, null, currentActiveWinId);
    }
  });
}

export function bindAuxCheckboxes(currentActiveWinId, onLayerActionCallback) {
  const chkRaster = document.getElementById("chk-raster");
  const chkContourf = document.getElementById("chk-contourf");
  if (chkRaster) {
    chkRaster.addEventListener("change", (e) => {
      if (e.target.checked && chkContourf) {
        chkContourf.checked = false;
        appState.setLayer("contourf", false);
        if (onLayerActionCallback) {
          onLayerActionCallback("aux", "contourf", false, null, currentActiveWinId);
        }
      }
      appState.setLayer("raster", e.target.checked);
      if (onLayerActionCallback) {
        onLayerActionCallback("aux", "raster", e.target.checked, null, currentActiveWinId);
      }
    });
  }
  if (chkContourf) {
    chkContourf.addEventListener("change", (e) => {
      if (e.target.checked && chkRaster) {
        chkRaster.checked = false;
        appState.setLayer("raster", false);
        if (onLayerActionCallback) {
          onLayerActionCallback("aux", "raster", false, null, currentActiveWinId);
        }
      }
      appState.setLayer("contourf", e.target.checked);
      if (onLayerActionCallback) {
        onLayerActionCallback("aux", "contourf", e.target.checked, null, currentActiveWinId);
      }
    });
  }
  bindAuxCheckbox("chk-wind", "wind", currentActiveWinId, onLayerActionCallback);
}

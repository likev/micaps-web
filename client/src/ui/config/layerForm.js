// layerForm.js - Layer configuration form for contour, wind, station, and tlogp layers
import { renderSwatchStrip } from "./swatchPicker.js";
import { renderTypeSpecificSection } from "./layerTypeViews.js";
import { escapeHtml } from "./formState.js";

/**
 * Mounts the layer detail form inside container.
 * @param {HTMLElement} container
 * @param {Object} preset - Parent preset object
 * @param {Object} layer - Layer object being edited
 * @param {Object} formState - Central form state
 * @param {Function} onUpdate - Callback when layer mutated: onUpdate({ reRender: boolean })
 * @returns {Function} unmount function
 */
export function mountLayerForm(container, preset, layer, formState, onUpdate) {
  if (!container || !preset || !layer || !formState) return () => {};

  let swatchCleanups = [];

  function cleanPickers() {
    swatchCleanups.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    swatchCleanups = [];
  }

  function getTargetLayer(d) {
    const p = d.presets?.find((x) => x.id === preset.id);
    return p?.layers?.find((x) => x.id === layer.id);
  }

  function render() {
    cleanPickers();
    if (!layer.render) layer.render = {};
    const r = layer.render;
    const type = layer.type || "contour";

    // Find sibling station layers for derivedFrom
    const siblingStations = (preset.layers || []).filter(
      (l) => l.id !== layer.id && (l.type === "station" || l.element === "STATION")
    );

    // Grouped colormaps options
    const customColormaps = Object.keys(formState.getDraft().colormaps || {});
    const activeColormap = r.colormap || "";

    container.innerHTML = `
      <div class="layer-detail-form-card">
        <!-- Common Identity Section -->
        <div class="layer-form-grid">
          <div class="config-field">
            <label class="config-label">Layer ID</label>
            <input type="text" id="layer-inp-id" class="config-input" value="${escapeHtml(layer.id || "")}" />
          </div>

          <div class="config-field">
            <label class="config-label">Display Name</label>
            <input type="text" id="layer-inp-name" class="config-input" value="${escapeHtml(layer.name || "")}" />
          </div>

          <div class="config-field">
            <label class="config-label">Type</label>
            <select id="layer-sel-type" class="config-select">
              <option value="contour" ${type === "contour" ? "selected" : ""}>Contour (Isolines/Isobands)</option>
              <option value="wind" ${type === "wind" ? "selected" : ""}>Wind (Streamlines/Barbs)</option>
              <option value="station" ${type === "station" ? "selected" : ""}>Station (Plot Network)</option>
              <option value="tlogp" ${type === "tlogp" ? "selected" : ""}>T-LogP (Sounding Profile)</option>
            </select>
          </div>

          <div class="config-field">
            <label class="config-label">Model</label>
            <input type="text" id="layer-inp-model" class="config-input" list="datalist-models" value="${escapeHtml(layer.model || "")}" />
            <datalist id="datalist-models">
              <option value="ECMWF_HR">ECMWF_HR</option>
              <option value="SURFACE">SURFACE</option>
              <option value="UPPER_AIR">UPPER_AIR</option>
              <option value="GFS">GFS</option>
              <option value="CMA_MESO">CMA_MESO</option>
            </datalist>
          </div>

          <div class="config-field">
            <label class="config-label">Element</label>
            <input type="text" id="layer-inp-element" class="config-input" list="datalist-elements" value="${escapeHtml(layer.element || "")}" />
            <datalist id="datalist-elements">
              <option value="HGT">HGT (Height)</option>
              <option value="TMP">TMP (Temperature)</option>
              <option value="RH">RH (Relative Humidity)</option>
              <option value="WIND">WIND (Wind Vector)</option>
              <option value="VOR">VOR (Vorticity)</option>
              <option value="DIV">DIV (Divergence)</option>
              <option value="DTD">DTD (Dewpoint Depression)</option>
              <option value="SLP">SLP (Sea Level Pressure)</option>
              <option value="STATION">STATION (Plot)</option>
            </datalist>
          </div>

          <div class="config-field">
            <label class="config-label">Vertical Level (hPa)</label>
            <input
              type="number"
              id="layer-inp-level"
              class="config-input"
              placeholder="e.g. 500 (blank for surface)"
              value="${layer.level !== null && layer.level !== undefined ? layer.level : ""}"
            />
          </div>

          <div class="config-field">
            <label class="config-label">Observation / Data Path</label>
            <input type="text" id="layer-inp-path" class="config-input" placeholder="e.g. UPPER_AIR/TLOGP" value="${escapeHtml(layer.path || "")}" />
          </div>

          <div class="config-field">
            <label class="config-label">Derived From (Station Source)</label>
            <select id="layer-sel-derived" class="config-select">
              <option value="">— None (Direct model data) —</option>
              ${siblingStations
                .map(
                  (s) =>
                    `<option value="${escapeHtml(s.id)}" ${layer.derivedFrom === s.id ? "selected" : ""}>${escapeHtml(s.name || s.id)} (${escapeHtml(s.model || "")})</option>`
                )
                .join("")}
            </select>
          </div>

          <div class="config-field-toggles" style="grid-column: span 2; display: flex; gap: 16px; align-items: center;">
            <label class="config-checkbox-label">
              <input type="checkbox" id="layer-chk-visible" ${layer.visible !== false ? "checked" : ""} />
              <span>Visible by default</span>
            </label>
            <label class="config-checkbox-label">
              <input type="checkbox" id="layer-chk-removable" ${layer.removable !== false ? "checked" : ""} />
              <span>Removable by operator (✕)</span>
            </label>
          </div>
        </div>

        <!-- Per-Type Render Controls -->
        <div class="layer-render-section">
          ${renderTypeSpecificSection(type, layer, r, customColormaps, activeColormap)}
        </div>
      </div>
    `;

    bindEvents();
    mountPickers();
  }

  function mountPickers() {
    if (layer.type === "contour" || !layer.type) {
      const colorContainer = container.querySelector("#layer-line-color-picker");
      if (colorContainer) {
        const picker = renderSwatchStrip(colorContainer, {
          value: layer.render?.lineColor || "#58a6ff",
          elementHint: layer.element,
          onPick: (newHex) => {
            formState.updateDraft((d) => {
              const l = getTargetLayer(d);
              if (l) {
                if (!l.render) l.render = {};
                l.render.lineColor = newHex;
                l.color = newHex;
              }
            });
            layer.color = newHex;
            if (!layer.render) layer.render = {};
            layer.render.lineColor = newHex;
            onUpdate?.({ reRender: false });
          },
        });
        swatchCleanups.push(() => picker.destroy());
      }
    }
  }

  function bindEvents() {
    // Identity fields
    const idInp = container.querySelector("#layer-inp-id");
    idInp?.addEventListener("change", (e) => {
      const val = e.target.value.trim();
      if (val) {
        formState.updateDraft((d) => {
          const l = getTargetLayer(d);
          if (l) l.id = val;
        });
        layer.id = val;
        onUpdate?.({ reRender: true });
      }
    });

    const nameInp = container.querySelector("#layer-inp-name");
    nameInp?.addEventListener("input", (e) => {
      const val = e.target.value;
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) l.name = val;
      });
      layer.name = val;
      onUpdate?.({ reRender: false });
    });

    const typeSel = container.querySelector("#layer-sel-type");
    typeSel?.addEventListener("change", (e) => {
      const val = e.target.value;
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) l.type = val;
      });
      layer.type = val;
      render();
      onUpdate?.({ reRender: false });
    });

    const modelInp = container.querySelector("#layer-inp-model");
    modelInp?.addEventListener("change", (e) => {
      const val = e.target.value.trim();
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) l.model = val;
      });
      layer.model = val;
      onUpdate?.({ reRender: false });
    });

    const elemInp = container.querySelector("#layer-inp-element");
    elemInp?.addEventListener("change", (e) => {
      const val = e.target.value.trim();
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) l.element = val;
      });
      layer.element = val;
      onUpdate?.({ reRender: false });
    });

    const levelInp = container.querySelector("#layer-inp-level");
    levelInp?.addEventListener("change", (e) => {
      const raw = e.target.value.trim();
      const val = raw ? parseInt(raw, 10) : null;
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) l.level = Number.isFinite(val) ? val : null;
      });
      layer.level = Number.isFinite(val) ? val : null;
      onUpdate?.({ reRender: false });
    });

    const pathInp = container.querySelector("#layer-inp-path");
    pathInp?.addEventListener("change", (e) => {
      const val = e.target.value.trim();
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          if (val) l.path = val;
          else delete l.path;
        }
      });
      layer.path = val || undefined;
      onUpdate?.({ reRender: false });
    });

    const derivedSel = container.querySelector("#layer-sel-derived");
    derivedSel?.addEventListener("change", (e) => {
      const val = e.target.value;
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          if (val) l.derivedFrom = val;
          else delete l.derivedFrom;
        }
      });
      layer.derivedFrom = val || undefined;
      onUpdate?.({ reRender: false });
    });

    const chkVis = container.querySelector("#layer-chk-visible");
    chkVis?.addEventListener("change", (e) => {
      const val = e.target.checked;
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) l.visible = val;
      });
      layer.visible = val;
      onUpdate?.({ reRender: false });
    });

    const chkRem = container.querySelector("#layer-chk-removable");
    chkRem?.addEventListener("change", (e) => {
      const val = e.target.checked;
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) l.removable = val;
      });
      layer.removable = val;
      onUpdate?.({ reRender: false });
    });

    // Contour render events
    const chkFill = container.querySelector("#layer-chk-fill");
    chkFill?.addEventListener("change", (e) => {
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          if (!l.render) l.render = {};
          l.render.showFill = e.target.checked;
        }
      });
      onUpdate?.({ reRender: false });
    });

    const sliderOpacity = container.querySelector("#layer-slider-opacity");
    const lblOpacity = container.querySelector("#layer-opacity-val");
    sliderOpacity?.addEventListener("input", (e) => {
      const pct = parseInt(e.target.value, 10);
      if (lblOpacity) lblOpacity.textContent = `${pct}%`;
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          if (!l.render) l.render = {};
          l.render.opacity = pct / 100;
        }
      });
      onUpdate?.({ reRender: false });
    });

    const chkLine = container.querySelector("#layer-chk-line");
    chkLine?.addEventListener("change", (e) => {
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          if (!l.render) l.render = {};
          l.render.showLine = e.target.checked;
        }
      });
      onUpdate?.({ reRender: false });
    });

    const inpLineWidth = container.querySelector("#layer-inp-line-width");
    inpLineWidth?.addEventListener("change", (e) => {
      const val = parseFloat(e.target.value);
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          if (!l.render) l.render = {};
          l.render.lineWidth = Number.isFinite(val) ? val : 2;
        }
      });
      onUpdate?.({ reRender: false });
    });

    const inpBoldValues = container.querySelector("#layer-inp-bold-values");
    inpBoldValues?.addEventListener("change", (e) => {
      const parts = e.target.value.split(",").map((s) => parseFloat(s.trim())).filter((v) => Number.isFinite(v));
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          if (!l.render) l.render = {};
          l.render.boldValues = parts;
        }
      });
      onUpdate?.({ reRender: false });
    });

    const inpBoldWidth = container.querySelector("#layer-inp-bold-width");
    inpBoldWidth?.addEventListener("change", (e) => {
      const val = parseFloat(e.target.value);
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          if (!l.render) l.render = {};
          l.render.boldLineWidth = Number.isFinite(val) ? val : 4;
        }
      });
      onUpdate?.({ reRender: false });
    });

    const chkSmooth = container.querySelector("#layer-chk-smooth");
    chkSmooth?.addEventListener("change", (e) => {
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          if (!l.render) l.render = {};
          l.render.smooth = e.target.checked;
        }
      });
      onUpdate?.({ reRender: false });
    });

    const chkRaster = container.querySelector("#layer-chk-raster");
    chkRaster?.addEventListener("change", (e) => {
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          if (!l.render) l.render = {};
          l.render.showRaster = e.target.checked;
        }
      });
      onUpdate?.({ reRender: false });
    });

    // Interval inputs
    const intStart = container.querySelector("#layer-inp-int-start");
    const intStep = container.querySelector("#layer-inp-int-step");
    const intEnd = container.querySelector("#layer-inp-int-end");
    const btnAuto = container.querySelector("#layer-btn-int-auto");

    function updateInterval() {
      const s = intStart?.value !== "" ? parseFloat(intStart?.value) : null;
      const sp = intStep?.value !== "" ? parseFloat(intStep?.value) : null;
      const e = intEnd?.value !== "" ? parseFloat(intEnd?.value) : null;
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          if (!l.render) l.render = {};
          if (s !== null || sp !== null || e !== null) {
            l.render.interval = { start: s, step: sp, end: e };
          } else {
            delete l.render.interval;
          }
        }
      });
      onUpdate?.({ reRender: false });
    }

    [intStart, intStep, intEnd].forEach((inp) => inp?.addEventListener("change", updateInterval));

    btnAuto?.addEventListener("click", () => {
      if (intStart) intStart.value = "";
      if (intStep) intStep.value = "";
      if (intEnd) intEnd.value = "";
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l?.render) delete l.render.interval;
      });
      onUpdate?.({ reRender: false });
    });

    // Colormap & Palette inputs
    const colormapSel = container.querySelector("#layer-sel-colormap");
    colormapSel?.addEventListener("change", (e) => {
      const val = e.target.value;
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          if (!l.render) l.render = {};
          if (val) l.render.colormap = val;
          else delete l.render.colormap;
        }
      });
      onUpdate?.({ reRender: false });
    });

    const palettePathInp = container.querySelector("#layer-inp-palette-path");
    palettePathInp?.addEventListener("change", (e) => {
      const val = e.target.value.trim();
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          if (!l.render) l.render = {};
          if (val) l.render.palettePath = val;
          else delete l.render.palettePath;
        }
      });
      onUpdate?.({ reRender: false });
    });

    // Wind vector controls
    [
      { id: "#layer-chk-show-wind", key: "showWind" },
      { id: "#layer-chk-show-barbs", key: "showBarbs" },
      { id: "#layer-chk-show-raster", key: "showRaster" },
    ].forEach(({ id, key }) => {
      const el = container.querySelector(id);
      el?.addEventListener("change", (e) => {
        formState.updateDraft((d) => {
          const l = getTargetLayer(d);
          if (l) {
            if (!l.render) l.render = {};
            l.render[key] = e.target.checked;
          }
        });
        onUpdate?.({ reRender: false });
      });
    });

    // T-LogP controls
    const stnInp = container.querySelector("#layer-inp-station-id");
    stnInp?.addEventListener("change", (e) => {
      const val = e.target.value.trim();
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          l.stationId = val;
          l.defaultStation = val;
          if (!l.config) l.config = {};
          l.config.stationId = val;
        }
      });
      layer.stationId = val;
      layer.defaultStation = val;
      onUpdate?.({ reRender: false });
    });

    const parcelSel = container.querySelector("#layer-sel-parcel");
    parcelSel?.addEventListener("change", (e) => {
      const val = e.target.value;
      formState.updateDraft((d) => {
        const l = getTargetLayer(d);
        if (l) {
          l.parcelLevel = val;
          if (!l.config) l.config = {};
          l.config.parcelLevel = val;
        }
      });
      layer.parcelLevel = val;
      onUpdate?.({ reRender: false });
    });

    // Station symbology checkboxes
    [
      { id: "#chk-stn-temp", key: "showTemp" },
      { id: "#chk-stn-dewpoint", key: "showDewpoint" },
      { id: "#chk-stn-dtd", key: "showDTD" },
      { id: "#chk-stn-slp", key: "showPressure" },
      { id: "#chk-stn-wind", key: "showWind" },
      { id: "#chk-stn-cloud", key: "showCloud" },
      { id: "#chk-stn-wx", key: "showWeather" },
      { id: "#chk-stn-tend", key: "showTendency" },
      { id: "#chk-stn-vis", key: "showVisibility" },
      { id: "#chk-stn-rain6", key: "showRain6" },
      { id: "#chk-stn-stream", key: "showStreamlines" },
    ].forEach(({ id, key }) => {
      const el = container.querySelector(id);
      el?.addEventListener("change", (e) => {
        formState.updateDraft((d) => {
          const l = getTargetLayer(d);
          if (l) {
            if (!l.render) l.render = {};
            l.render[key] = e.target.checked;
          }
        });
        onUpdate?.({ reRender: false });
      });
    });
  }

  render();

  return () => {
    cleanPickers();
    container.innerHTML = "";
  };
}

// layerTypeViews.js - HTML template generators for contour, wind, station, and tlogp layer types
import { BUILTIN_COLORMAP_PRESETS } from "./colorPresets.js";
import { escapeHtml } from "./formState.js";

/**
 * Generates the type-specific render HTML for a given layer.
 */
export function renderTypeSpecificSection(type, layer, r, customColormaps, activeColormap) {
  if (type === "contour") {
    const isobandOpacity = Math.round((r.opacity !== undefined ? r.opacity : 0.75) * 100);
    const interval = r.interval || {};

    return `
      <div class="config-card-nested">
        <h4>Contour Lines & Isobands</h4>

        <div class="config-row-group">
          <label class="config-checkbox-label">
            <input type="checkbox" id="layer-chk-fill" ${r.showFill ? "checked" : ""} />
            <span>Contour Fills (Isoband colorfill)</span>
          </label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="config-sublabel">Opacity:</span>
            <input type="range" id="layer-slider-opacity" min="10" max="100" value="${isobandOpacity}" />
            <span id="layer-opacity-val" class="config-sublabel" style="width: 32px;">${isobandOpacity}%</span>
          </div>
        </div>

        <div class="config-row-group" style="margin-top: 12px;">
          <label class="config-checkbox-label">
            <input type="checkbox" id="layer-chk-line" ${r.showLine !== false ? "checked" : ""} />
            <span>Contour Lines</span>
          </label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="config-sublabel">Width:</span>
            <input type="number" id="layer-inp-line-width" class="config-input" min="0.5" max="10" step="0.5" value="${r.lineWidth !== undefined ? r.lineWidth : 2}" style="width: 50px;" />
            <span class="config-sublabel">px</span>
          </div>
        </div>

        <div class="swatch-strip-field-container" style="margin-top: 8px;">
          <label class="config-label" style="font-size: 11px;">Line Color (20 Recommended Swatches)</label>
          <div id="layer-line-color-picker"></div>
        </div>

        <div class="config-field-row" style="margin-top: 12px; display: flex; gap: 12px; align-items: center;">
          <div style="flex: 1;">
            <label class="config-label">Bold Values (comma-separated)</label>
            <input type="text" id="layer-inp-bold-values" class="config-input" placeholder="5880, 588, 1010" value="${escapeHtml(Array.isArray(r.boldValues) ? r.boldValues.join(", ") : "")}" />
          </div>
          <div style="width: 110px;">
            <label class="config-label">Bold Width (px)</label>
            <input type="number" id="layer-inp-bold-width" class="config-input" min="1" max="12" step="0.5" value="${r.boldLineWidth !== undefined ? r.boldLineWidth : 4}" />
          </div>
        </div>

        <div class="config-field-row" style="margin-top: 12px; display: flex; gap: 8px; align-items: flex-end;">
          <div style="flex: 1;">
            <label class="config-label">Interval Start</label>
            <input type="number" step="any" id="layer-inp-int-start" class="config-input" placeholder="Start" value="${interval.start !== undefined && interval.start !== null ? interval.start : ""}" />
          </div>
          <div style="flex: 1;">
            <label class="config-label">Span / Step</label>
            <input type="number" step="any" id="layer-inp-int-step" class="config-input" placeholder="Span" value="${interval.step !== undefined && interval.step !== null ? interval.step : ""}" />
          </div>
          <div style="flex: 1;">
            <label class="config-label">End</label>
            <input type="number" step="any" id="layer-inp-int-end" class="config-input" placeholder="End" value="${interval.end !== undefined && interval.end !== null ? interval.end : ""}" />
          </div>
          <button type="button" id="layer-btn-int-auto" class="btn" style="height: 28px; font-size: 11px;">Auto</button>
        </div>

        <div class="config-field-group" style="margin-top: 12px;">
          <label class="config-label">Colormap (Palette Ramp)</label>
          <select id="layer-sel-colormap" class="config-select">
            <option value="">— Default Element Colormap —</option>
            <optgroup label="Built-in Defaults (8)">
              ${BUILTIN_COLORMAP_PRESETS.slice(0, 8).map((p) => `<option value="${escapeHtml(p.key)}" ${activeColormap === p.key ? "selected" : ""}>${escapeHtml(p.label)}</option>`).join("")}
            </optgroup>
            <optgroup label="Recommended Meteorological Ramps (12)">
              ${BUILTIN_COLORMAP_PRESETS.slice(8).map((p) => `<option value="${escapeHtml(p.key)}" ${activeColormap === p.key ? "selected" : ""}>${escapeHtml(p.label)}</option>`).join("")}
            </optgroup>
            ${
              customColormaps.length > 0
                ? `<optgroup label="Custom Colormaps in Config (${customColormaps.length})">
                    ${customColormaps.map((cm) => `<option value="${escapeHtml(cm)}" ${activeColormap === cm ? "selected" : ""}>${escapeHtml(cm)}</option>`).join("")}
                  </optgroup>`
                : ""
            }
          </select>
        </div>

        <div class="config-field" style="margin-top: 12px;">
          <label class="config-label">XML Palette Path (optional)</label>
          <input type="text" id="layer-inp-palette-path" class="config-input" placeholder="e.g. /palettes/RH/dark-850hpa.xml" value="${escapeHtml(r.palettePath || "")}" />
        </div>

        <div class="config-field-toggles" style="margin-top: 12px; display: flex; gap: 16px;">
          <label class="config-checkbox-label">
            <input type="checkbox" id="layer-chk-smooth" ${r.smooth !== false ? "checked" : ""} />
            <span>Smooth Contour Lines</span>
          </label>
          <label class="config-checkbox-label">
            <input type="checkbox" id="layer-chk-raster" ${r.showRaster ? "checked" : ""} />
            <span>Binary Raster Overlay</span>
          </label>
        </div>
      </div>
    `;
  }

  if (type === "wind") {
    return `
      <div class="config-card-nested">
        <h4>Wind Vector Display</h4>
        <div class="config-field-toggles" style="display: flex; gap: 16px;">
          <label class="config-checkbox-label">
            <input type="checkbox" id="layer-chk-show-wind" ${r.showWind !== false ? "checked" : ""} />
            <span>Wind Streamlines</span>
          </label>
          <label class="config-checkbox-label">
            <input type="checkbox" id="layer-chk-show-barbs" ${r.showBarbs ? "checked" : ""} />
            <span>Wind Barbs</span>
          </label>
          <label class="config-checkbox-label">
            <input type="checkbox" id="layer-chk-show-raster" ${r.showRaster ? "checked" : ""} />
            <span>Speed Color Raster</span>
          </label>
        </div>

        <div class="config-field-group" style="margin-top: 12px;">
          <label class="config-label">Wind Speed Colormap</label>
          <select id="layer-sel-colormap" class="config-select">
            <option value="WIND" ${activeColormap === "WIND" || !activeColormap ? "selected" : ""}>WIND (Default Speed Ramp)</option>
            <option value="WIND-jet" ${activeColormap === "WIND-jet" ? "selected" : ""}>WIND-jet (Jet Stream Focus)</option>
            ${
              customColormaps.length > 0
                ? `<optgroup label="Custom Colormaps (${customColormaps.length})">
                    ${customColormaps.map((cm) => `<option value="${escapeHtml(cm)}" ${activeColormap === cm ? "selected" : ""}>${escapeHtml(cm)}</option>`).join("")}
                  </optgroup>`
                : ""
            }
          </select>
        </div>

        <div class="config-field" style="margin-top: 12px;">
          <label class="config-label">XML Palette Path (optional)</label>
          <input type="text" id="layer-inp-palette-path" class="config-input" placeholder="e.g. /palettes/WIND/speed.xml" value="${escapeHtml(r.palettePath || "")}" />
        </div>
      </div>
    `;
  }

  if (type === "station") {
    return `
      <div class="config-card-nested">
        <h4>Station Symbology Plots</h4>
        <div class="config-checkbox-grid" style="grid-template-columns: repeat(3, 1fr);">
          <label class="config-checkbox-label"><input type="checkbox" id="chk-stn-temp" ${r.showTemp ? "checked" : ""} /><span>Temperature</span></label>
          <label class="config-checkbox-label"><input type="checkbox" id="chk-stn-dewpoint" ${r.showDewpoint ? "checked" : ""} /><span>Dewpoint</span></label>
          <label class="config-checkbox-label"><input type="checkbox" id="chk-stn-dtd" ${r.showDTD ? "checked" : ""} /><span>Dewpoint Depr (DTD)</span></label>
          <label class="config-checkbox-label"><input type="checkbox" id="chk-stn-slp" ${r.showPressure ? "checked" : ""} /><span>Pressure / SLP</span></label>
          <label class="config-checkbox-label"><input type="checkbox" id="chk-stn-wind" ${r.showWind ? "checked" : ""} /><span>Wind Barb</span></label>
          <label class="config-checkbox-label"><input type="checkbox" id="chk-stn-cloud" ${r.showCloud ? "checked" : ""} /><span>Total Cloud Cover</span></label>
          <label class="config-checkbox-label"><input type="checkbox" id="chk-stn-wx" ${r.showWeather ? "checked" : ""} /><span>Present Weather</span></label>
          <label class="config-checkbox-label"><input type="checkbox" id="chk-stn-tend" ${r.showTendency ? "checked" : ""} /><span>Pressure Tendency</span></label>
          <label class="config-checkbox-label"><input type="checkbox" id="chk-stn-vis" ${r.showVisibility ? "checked" : ""} /><span>Visibility</span></label>
          <label class="config-checkbox-label"><input type="checkbox" id="chk-stn-rain6" ${r.showRain6 ? "checked" : ""} /><span>6h Rain</span></label>
          <label class="config-checkbox-label"><input type="checkbox" id="chk-stn-stream" ${r.showStreamlines ? "checked" : ""} /><span>Streamlines</span></label>
        </div>
      </div>
    `;
  }

  if (type === "tlogp") {
    const currentParcel = String(layer.parcelLevel || layer.config?.parcelLevel || "surface").toLowerCase();
    const stnVal = layer.stationId || layer.defaultStation || layer.config?.stationId || "";

    return `
      <div class="config-card-nested">
        <h4>T-lnP Sounding Diagram Settings</h4>
        <div class="config-field-row" style="display: flex; gap: 12px;">
          <div style="flex: 1;">
            <label class="config-label">Default Station ID (5 digits)</label>
            <input type="text" id="layer-inp-station-id" class="config-input" placeholder="e.g. 54511" value="${escapeHtml(stnVal)}" />
          </div>
          <div style="flex: 1;">
            <label class="config-label">Convective Parcel Level</label>
            <select id="layer-sel-parcel" class="config-select">
              <option value="surface" ${currentParcel === "surface" ? "selected" : ""}>Surface Based (SBCAPE)</option>
              <option value="925" ${currentParcel === "925" ? "selected" : ""}>925 hPa</option>
              <option value="850" ${currentParcel === "850" ? "selected" : ""}>850 hPa (Low-Level Jet)</option>
              <option value="700" ${currentParcel === "700" ? "selected" : ""}>700 hPa</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }

  return "";
}

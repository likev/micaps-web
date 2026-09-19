// layerRowView.js - HTML templates for layer row, wind drawer, and station drawer
import { renderStationFilterSection } from "../stationFilterControl.js";
import { isWindRelated, isUpperAirStationLayer } from "./layerDefaults.js";
import { buildLevelsFromInterval } from "../../layers/contour/contourLevels.js";

export function renderWindDrawerHTML(layer) {
  return `
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
    <div class="config-row station-contour-selector-row wind-contour-selector-row" style="flex-direction: column; align-items: flex-start; gap: 4px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #30363d; width: 100%;">
      <label style="color: var(--text-secondary, #8b949e); font-size: 11px; display: flex; align-items: center; gap: 4px; font-weight: 600;">
        <span>📈 Add Contour Layer</span>
      </label>
      <div style="display: flex; gap: 4px; width: 100%;">
        <select class="sel-contour-element" style="flex: 1; height: 24px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; padding: 0 6px; font-size: 11px;">
          <option value="VOR">Relative Vorticity (VOR)</option>
          <option value="DIV">Divergence (DIV)</option>
        </select>
        <button class="btn-add-station-contour btn-add-contour" title="Generate and add contour layer" style="height: 24px; padding: 0 10px; font-size: 11px; font-weight: 500; background: #238636; color: #ffffff; border: 1px solid #2ea043; border-radius: 4px; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 2px;">
          ＋ Add
        </button>
      </div>
    </div>
  `;
}

export function renderTLogPDrawerHTML(layer) {
  const currentStn = layer.config?.stationId || layer.stationId || "58362";
  const currentParcel = layer.config?.parcelLevel || "surface";

  return `
    <div class="config-row" style="flex-direction: column; align-items: flex-start; gap: 6px; width: 100%;">
      <label style="color: var(--text-secondary, #8b949e); font-size: 11px; font-weight: 600;">
        📍 Station Selection:
      </label>
      <div style="display: flex; gap: 6px; width: 100%; align-items: center;">
        <input type="text" class="input-tlogp-station" 
               value="${currentStn}" 
               placeholder="Station ID (e.g. 58362)" 
               title="Enter 5-digit station ID and press Enter"
               style="width: 80px; height: 24px; background: #161b22; border: 1px solid #30363d; color: #58a6ff; font-weight: 600; border-radius: 4px; text-align: center; font-size: 12px;" />
        <button class="btn-tlogp-apply" style="height: 24px; padding: 0 10px; font-size: 11px; background: #238636; color: #fff; border: 1px solid #2ea043; border-radius: 4px; cursor: pointer;">
          Apply
        </button>
        <select class="sel-tlogp-quick-station" style="flex: 1; height: 24px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; font-size: 11px; padding: 0 4px;">
          <option value="">— Major Stations —</option>
          <option value="58362" ${currentStn === "58362" ? "selected" : ""}>58362 上海 (Shanghai)</option>
          <option value="54511" ${currentStn === "54511" ? "selected" : ""}>54511 北京 (Beijing)</option>
          <option value="59287" ${currentStn === "59287" ? "selected" : ""}>59287 广州 (Guangzhou)</option>
          <option value="57516" ${currentStn === "57516" ? "selected" : ""}>57516 重庆 (Chongqing)</option>
          <option value="57494" ${currentStn === "57494" ? "selected" : ""}>57494 武汉 (Wuhan)</option>
          <option value="51463" ${currentStn === "51463" ? "selected" : ""}>51463 乌鲁木齐 (Urumqi)</option>
          <option value="56778" ${currentStn === "56778" ? "selected" : ""}>56778 昆明 (Kunming)</option>
          <option value="50953" ${currentStn === "50953" ? "selected" : ""}>50953 哈尔滨 (Harbin)</option>
        </select>
      </div>
      <div class="tlogp-station-meta-badge" style="font-size: 11px; color: #8b949e; margin-top: 2px;">
        Active: <span style="color: #e3b341; font-weight: 600;">${layer.config?.stationName || currentStn + " 上海/宝山"}</span>
      </div>
    </div>

    <!-- 2. Parcel Ascent Starting Layer Row (Surface, 925, 850, 700 hPa) -->
    <div class="config-row" style="flex-direction: column; align-items: flex-start; gap: 4px; width: 100%; margin-top: 6px; padding-top: 6px; border-top: 1px solid #30363d;">
      <label style="color: var(--text-secondary, #8b949e); font-size: 11px; font-weight: 600;">
        🔺 Parcel Ascent Starting Level:
      </label>
      <div style="display: flex; gap: 6px; width: 100%; align-items: center;">
        <select class="sel-tlogp-parcel-level" style="flex: 1; height: 24px; background: #161b22; border: 1px solid #30363d; color: #e3b341; font-weight: 600; border-radius: 4px; font-size: 11px; padding: 0 6px;">
          <option value="surface" ${currentParcel === "surface" ? "selected" : ""}>Surface (Surface-Based Parcel)</option>
          <option value="925" ${currentParcel === "925" ? "selected" : ""}>925 hPa (Low-Level Inversion / Boundary)</option>
          <option value="850" ${currentParcel === "850" ? "selected" : ""}>850 hPa (Low-Level Jet / Elevated Convection)</option>
          <option value="700" ${currentParcel === "700" ? "selected" : ""}>700 hPa (Mid-Level Inflow / Overrunning)</option>
          <option value="custom" ${currentParcel === "custom" ? "selected" : ""}>Custom Level (Click Diagram to Set)</option>
        </select>
      </div>
    </div>

    <!-- 3. Curve Display Toggles -->
    <div class="config-grid-2col" style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #30363d;">
      <label class="config-checkbox-item">
        <input type="checkbox" class="chk-tlogp-temp" ${layer.config?.showTemp !== false ? "checked" : ""} />
        <span style="color: #f85149;">Temperature (T)</span>
      </label>
      <label class="config-checkbox-item">
        <input type="checkbox" class="chk-tlogp-dewpoint" ${layer.config?.showDewpoint !== false ? "checked" : ""} />
        <span style="color: #39c5bb;">Dew Point (Td)</span>
      </label>
      <label class="config-checkbox-item">
        <input type="checkbox" class="chk-tlogp-wind" ${layer.config?.showWind !== false ? "checked" : ""} />
        <span>Wind Barbs</span>
      </label>
      <label class="config-checkbox-item">
        <input type="checkbox" class="chk-tlogp-parcel" ${layer.config?.showParcel !== false ? "checked" : ""} />
        <span style="color: #e3b341;">Parcel & CAPE</span>
      </label>
    </div>
  `;
}

export function renderTimeHeightDrawerHTML(layer) {
  const cfg = layer.config || {};
  const lon = cfg.lon !== undefined ? Number(cfg.lon).toFixed(2) : "121.50";
  const lat = cfg.lat !== undefined ? Number(cfg.lat).toFixed(2) : "31.40";
  const start = cfg.startHour !== undefined ? cfg.startHour : 0;
  const end = cfg.endHour !== undefined ? cfg.endHour : 144;
  const step = cfg.stepHours !== undefined ? cfg.stepHours : 12;
  const dir = cfg.timeDirection || "ltr";

  return `
    <div class="config-row" style="flex-direction: column; align-items: flex-start; gap: 6px; width: 100%;">
      <label style="color: var(--text-secondary, #8b949e); font-size: 11px; font-weight: 600;">
        📍 Cross-Section Grid Point (Click Map):
      </label>
      <div style="display: flex; gap: 6px; width: 100%; align-items: center;">
        <span style="font-size: 11px; color: #58a6ff; font-weight: 600;">Lon:</span>
        <input type="number" class="input-th-lon" value="${lon}" step="0.25" style="width: 65px; height: 22px; background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; padding: 0 4px; font-size: 11px;" />
        <span style="font-size: 11px; color: #58a6ff; font-weight: 600;">Lat:</span>
        <input type="number" class="input-th-lat" value="${lat}" step="0.25" style="width: 65px; height: 22px; background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; padding: 0 4px; font-size: 11px;" />
        <button class="btn-th-point-apply" style="height: 22px; padding: 0 8px; font-size: 11px; background: #238636; color: #fff; border: 1px solid #2ea043; border-radius: 4px; cursor: pointer;">Apply</button>
      </div>
    </div>

    <div class="config-row" style="flex-direction: column; align-items: flex-start; gap: 4px; width: 100%; margin-top: 6px; padding-top: 6px; border-top: 1px solid #30363d;">
      <label style="color: var(--text-secondary, #8b949e); font-size: 11px; font-weight: 600;">
        ⏱ Forecast Lead Span & Direction:
      </label>
      <div style="display: flex; gap: 6px; width: 100%; align-items: center;">
        <input type="number" class="input-th-start" value="${start}" min="0" max="240" step="12" style="width: 44px; height: 22px; background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; text-align: center; font-size: 11px;" />
        <span style="font-size: 11px;">–</span>
        <input type="number" class="input-th-end" value="${end}" min="12" max="240" step="12" style="width: 44px; height: 22px; background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; text-align: center; font-size: 11px;" />
        <span style="font-size: 11px;">h</span>
        <select class="sel-th-step" style="height: 22px; background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 4px; font-size: 11px; padding: 0 4px;">
          ${[1, 3, 6, 12, 24].map((s) => `<option value="${s}" ${s === step ? "selected" : ""}>@${s}h</option>`).join("")}
        </select>
        <button class="btn-th-direction" style="height: 22px; padding: 0 6px; font-size: 11px; background: #21262d; border: 1px solid #30363d; color: #e3b341; border-radius: 4px; cursor: pointer;">
          ${dir === "rtl" ? "⇄ 144→0h" : "⇄ 0→144h"}
        </button>
      </div>
    </div>

    <div class="config-grid-2col" style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #30363d;">
      <label class="config-checkbox-item">
        <input type="checkbox" class="chk-th-rh" ${cfg.showRH !== false ? "checked" : ""} />
        <span style="color: #56d4dd;">RH Fill</span>
      </label>
      <label class="config-checkbox-item">
        <input type="checkbox" class="chk-th-temp" ${cfg.showTemp !== false ? "checked" : ""} />
        <span style="color: #f85149;">Temperature Lines</span>
      </label>
      <label class="config-checkbox-item">
        <input type="checkbox" class="chk-th-vvel" ${cfg.showVVel !== false ? "checked" : ""} />
        <span style="color: #39c5bb;">VVEL Lines</span>
      </label>
      <label class="config-checkbox-item">
        <input type="checkbox" class="chk-th-wind" ${cfg.showWind !== false ? "checked" : ""} />
        <span style="color: #58a6ff;">Wind Barbs</span>
      </label>
      <label class="config-checkbox-item">
        <input type="checkbox" class="chk-th-marker" ${cfg.showGridPointMarker !== false ? "checked" : ""} />
        <span>Map Point Marker</span>
      </label>
    </div>
  `;
}

export function renderStationDrawerHTML(layer) {
  const isTLogP = layer.element === "TLOGP" || (layer.path && layer.path.includes("TLOGP")) || layer.id?.includes("tlogp");
  const upper = isUpperAirStationLayer(layer);
  const items = upper
    ? [
        ["chk-station-temp", layer.config?.showTemp !== false, "Temperature (TT)"],
        ["chk-station-dewpoint", layer.config?.showDewpoint !== false, "Dew Point (Td)"],
        ["chk-station-dtd", Boolean(layer.config?.showDTD), "Dew-Pt Depres. (T−Td)"],
        ["chk-station-pressure", layer.config?.showPressure !== false, "Height (H)"],
        ["chk-station-wind", layer.config?.showWind !== false, "Wind Barbs (FF/dd)"],
      ]
    : [
        ["chk-station-temp", layer.config?.showTemp !== false, "Temperature (TT)"],
        ["chk-station-dewpoint", layer.config?.showDewpoint !== false, "Dew Point (Td)"],
        ["chk-station-dtd", Boolean(layer.config?.showDTD), "Dew-Pt Depres. (T−Td)"],
        ["chk-station-pressure", layer.config?.showPressure !== false, "Pressure (SLP)"],
        ["chk-station-wind", layer.config?.showWind !== false, "Wind Barbs (FF/dd)"],
        ["chk-station-cloud", Boolean(layer.config?.showCloud), "Cloud Cover (N)"],
        ["chk-station-weather", Boolean(layer.config?.showWeather), "Weather (ww)"],
        ["chk-station-tendency", Boolean(layer.config?.showTendency), "Tendency (ppa)"],
        ["chk-station-vis", Boolean(layer.config?.showVisibility), "Visibility (VV)"],
        ["chk-station-rain6", Boolean(layer.config?.showRain6), "6h Rain (R6)"],
      ];

  return `
    <div class="config-grid-2col">
      ${items.map(([cls, chk, label]) => `<label class="config-checkbox-item" title="${label}"><input type="checkbox" class="${cls}" ${chk ? "checked" : ""} /><span title="${label}">${label}</span></label>`).join("")}
      <label class="config-checkbox-item" style="grid-column: span 2; border-top: 1px solid #30363d; padding-top: 4px; margin-top: 2px;">
        <input type="checkbox" class="chk-station-streamlines" ${layer.config?.showStreamlines ? "checked" : ""} />
        <span style="color: #58a6ff; font-weight: 600;">Wind Streamlines (Flow Analysis)</span>
      </label>
    </div>
    ${isTLogP ? "" : `
    <div class="config-row station-contour-selector-row" style="flex-direction: column; align-items: flex-start; gap: 4px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #30363d; width: 100%;">
      <label style="color: var(--text-secondary, #8b949e); font-size: 11px; display: flex; align-items: center; gap: 4px; font-weight: 600;">
        <span>📈 Add Contour Layer</span>
      </label>
      <div style="display: flex; gap: 4px; width: 100%;">
        <select class="sel-contour-element" style="flex: 1; height: 24px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; padding: 0 6px; font-size: 11px;">
          ${upper ? `
            <option value="HGT">Geopotential Height (HGT)</option>
            <option value="TMP">Temperature (TMP)</option>
            <option value="TD">Dew Point (TD)</option>
            <option value="DTD">Dew-Pt Depression (DTD)</option>
            <option value="WIND">Wind Speed (WIND)</option>
            <option value="VOR">Relative Vorticity (VOR)</option>
            <option value="DIV">Divergence (DIV)</option>
          ` : `
            <option value="SLP">Sea Level Pressure (SLP)</option>
            <option value="TMP">Temperature (TMP)</option>
            <option value="TD">Dew Point (TD)</option>
            <option value="DTD">Dew-Pt Depression (DTD)</option>
            <option value="VIS">Visibility (VIS)</option>
            <option value="RAIN6">6h Precipitation (RAIN6)</option>
            <option value="WIND">Wind Speed (WIND)</option>
            <option value="VOR">Relative Vorticity (VOR)</option>
            <option value="DIV">Divergence (DIV)</option>
          `}
        </select>
        <button class="btn-add-station-contour" title="Generate and add contour layer" style="height: 24px; padding: 0 10px; font-size: 11px; font-weight: 500; background: #238636; color: #ffffff; border: 1px solid #2ea043; border-radius: 4px; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 2px;">
          ＋ Add
        </button>
      </div>
    </div>
    `}
    ${renderStationFilterSection(layer)}
  `;
}

export function renderLayerRow(layer) {
  const isContour = layer.type === "contour";
  const interval = layer.config?.interval;
  const intervalStart = interval?.start !== undefined && interval?.start !== null ? interval.start : "";
  const intervalStep = interval?.step !== undefined && interval?.step !== null ? interval.step : "";
  const intervalEnd = interval?.end !== undefined && interval?.end !== null ? interval.end : "";
  const intervalCount = Array.isArray(layer.config?.levels)
    ? layer.config.levels.length
    : (intervalStart !== "" && intervalStep !== "" && intervalEnd !== ""
      ? buildLevelsFromInterval(intervalStart, intervalStep, intervalEnd).levels?.length
      : null);
  const intervalTooltip = intervalCount ? `${intervalCount} levels` : null;

  return `
    <div class="layer-item" data-layer-id="${layer.id}" role="group" aria-label="${layer.name}">
      <div class="layer-row ${layer.visible ? "" : "layer-hidden"}" data-layer-id="${layer.id}" title="${layer.name} (Click to configure)" aria-expanded="${layer.isExpanded ? "true" : "false"}" aria-label="Configure ${layer.name}">
        <!-- Visibility Eye Toggle Button -->
        <button class="btn-vis ${layer.visible ? "active" : ""}" data-layer-id="${layer.id}" title="Toggle Visibility" aria-label="Toggle visibility for ${layer.name}" aria-pressed="${layer.visible ? "true" : "false"}">
          ${layer.visible ? "👁" : "🚫"}
        </button>

        <!-- Layer Color Dot -->
        <span class="layer-color-dot" style="background: ${layer.color || "#58a6ff"};" aria-hidden="true"></span>

        <!-- Layer Name (single row, guaranteed no overlap) -->
        <span class="layer-name" title="${layer.name}">${layer.name}</span>

        <!-- Config Button -->
        <button class="btn-config ${layer.isExpanded ? "open" : ""}" data-layer-id="${layer.id}" title="Configure Layer" aria-label="Configure ${layer.name}" aria-expanded="${layer.isExpanded ? "true" : "false"}">
          ⚙
        </button>

        <!-- Remove Layer Button -->
        ${
          layer.removable
            ? `<button class="btn-remove" data-layer-id="${layer.id}" title="Remove Layer" aria-label="Remove ${layer.name}">✕</button>`
            : `<button class="btn-remove" data-layer-id="${layer.id}" disabled aria-disabled="true" style="opacity: 0.25; cursor: not-allowed; width: 22px; flex-shrink: 0;" title="Layer cannot be removed" aria-label="${layer.name} cannot be removed">✕</button>`
        }
      </div>

      <!-- Collapsible Layer Configuration Drawer -->
      <div class="layer-config ${layer.isExpanded ? "" : "hidden"}" data-layer-id="${layer.id}">
        ${
          layer.type === "wind" || (isWindRelated(layer) && !isContour)
            ? renderWindDrawerHTML(layer)
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
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; max-width: 100%; box-sizing: border-box; flex-wrap: wrap; gap: 4px; min-width: 0;">
                <label style="display: flex; align-items: center; gap: 4px; min-width: 0;">
                  <input type="checkbox" class="chk-show-line" ${layer.config?.showLine ? "checked" : ""} />
                  <span>Contour Lines</span>
                </label>
                <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0; max-width: 100%;">
                  <input type="color" class="color-picker-line" value="${layer.config?.lineColor || (layer.element === 'HGT' ? '#58a6ff' : layer.element === 'TMP' ? '#f85149' : '#ffffff')}" title="Line Color" />
                  <span style="font-size: 11px; color: #8b949e;">Width</span>
                  <input type="number" class="input-line-width" min="0.5" max="10" step="0.5" value="${layer.config?.lineWidth !== undefined ? layer.config.lineWidth : 2.0}" style="width: 40px; min-width: 0; height: 20px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; text-align: center; font-size: 11px;" title="Standard Line Width" />
                  <span style="font-size: 11px; color: #8b949e;">px</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; max-width: 100%; box-sizing: border-box; padding-left: 20px; font-size: 11px; flex-wrap: wrap; gap: 4px; min-width: 0;">
                <span style="color: #8b949e; flex-shrink: 0;">Bold (5880m, 1010hPa):</span>
                <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0; max-width: 100%;">
                  <input type="text" class="input-bold-values" placeholder="5880, 1010" value="${(layer.config?.boldValues || (layer.element === 'HGT' ? [5880, 588] : layer.element === 'SLP' ? [1010] : layer.element === 'TMP' ? [0] : [])).join(', ')}" style="width: 64px; min-width: 0; height: 20px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; padding: 0 4px; font-size: 11px;" title="Values to render in bold (comma-separated)" />
                  <span style="color: #8b949e;">Width</span>
                  <input type="number" class="input-bold-line-width" min="1" max="12" step="0.5" value="${layer.config?.boldLineWidth !== undefined ? layer.config.boldLineWidth : 4.0}" style="width: 36px; min-width: 0; height: 20px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; text-align: center; font-size: 11px;" title="Bold Line Width" />
                  <span style="color: #8b949e;">px</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; max-width: 100%; box-sizing: border-box; padding-left: 20px; font-size: 11px; flex-wrap: wrap; gap: 4px; min-width: 0;" title="Contour interval sequence [Start, Start+Span, ... <= End]. Bold values apply only if included in sequence.">
                <span style="color: #8b949e; flex-shrink: 0;" title="Contour interval sequence [Start, Start+Span, ... <= End]. Bold values apply only if included in sequence.">Interval:</span>
                <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0; max-width: 100%;">
                  <input type="number" step="any" class="input-interval-start" placeholder="Start" value="${intervalStart}" style="width: 56px; min-width: 0; height: 20px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; text-align: center; font-size: 11px;" title="${intervalTooltip ? `${intervalTooltip}: Start` : 'First contour value (empty = auto)'}" />
                  <input type="number" step="any" class="input-interval-step" placeholder="Span" value="${intervalStep}" style="width: 48px; min-width: 0; height: 20px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; text-align: center; font-size: 11px;" title="${intervalTooltip ? `${intervalTooltip}: Span` : 'Interval spacing, > 0 (empty = auto)'}" />
                  <input type="number" step="any" class="input-interval-end" placeholder="End" value="${intervalEnd}" style="width: 56px; min-width: 0; height: 20px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; text-align: center; font-size: 11px;" title="${intervalTooltip ? `${intervalTooltip}: End` : 'Last contour value (empty = auto)'}" />
                  <button type="button" class="btn-interval-auto" style="height: 20px; background: #21262d; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; padding: 0 6px; font-size: 11px; cursor: pointer; line-height: 18px;" title="Reset to automatic levels">Auto</button>
                </div>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; max-width: 100%; box-sizing: border-box; padding-left: 20px; font-size: 11px; flex-wrap: wrap; gap: 4px; min-width: 0;">
                <span style="color: #8b949e; flex-shrink: 0;">Label Size:</span>
                <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0;">
                  <input type="number" class="input-label-size" min="9" max="24" step="1" value="${layer.config?.labelSize !== undefined ? layer.config.labelSize : 13}" style="width: 40px; min-width: 0; height: 20px; background: #161b22; border: 1px solid #30363d; color: #c9d1d9; border-radius: 4px; text-align: center; font-size: 11px;" title="Contour Value Label Font Size" />
                  <span style="color: #8b949e;">px</span>
                </div>
              </div>
            </div>


            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-smooth-lines" ${layer.config?.smooth !== false ? "checked" : ""} />
                <span>Smooth Contour Lines</span>
              </label>
            </div>

            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-show-raster" ${layer.config?.showRaster ? "checked" : ""} />
                <span>Binary Raster Overlay</span>
              </label>
            </div>
            <div class="config-row palette-picker-row" style="flex-direction: column; align-items: flex-start; gap: 4px; margin-top: 2px;">
              <label style="color: var(--text-secondary); font-size: 11px; display: flex; align-items: center; gap: 4px;">🎨 Raster Palette</label>
              <div style="display: flex; gap: 4px; width: 100%;">
                <select class="sel-palette" style="flex: 1; background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px; padding: 3px 6px; font-size: 11px;">
                  <option value="">— Built-in default —</option>
                </select>
                <div class="palette-gradient-preview" style="width: 40px; height: 22px; border-radius: 3px; border: 1px solid var(--border-color); flex-shrink: 0; background: linear-gradient(to right, #888, #fff);"></div>
              </div>
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
            ? renderStationDrawerHTML(layer)
            : (layer.type === "tlogp"
            ? renderTLogPDrawerHTML(layer)
            : (layer.type === "timeheight"
            ? renderTimeHeightDrawerHTML(layer)
            : `
            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-basemap-graticule" ${layer.config?.showGraticule !== false ? "checked" : ""} />
                <span>10° Lon/Lat Graticule Lines</span>
              </label>
            </div>
            <div class="config-row">
              <label>
                <input type="checkbox" class="chk-basemap-world" ${layer.config?.showWorld !== false ? "checked" : ""} />
                <span>World Country Boundaries</span>
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
                <span>City / County Boundaries</span>
              </label>
            </div>
            <div class="config-row" style="margin-top:4px; border-top: 1px solid var(--border-color); padding-top:6px;">
              <label style="color: var(--text-secondary); font-size:11px; display:flex; align-items:center; gap:4px;">🎨 Theme</label>
              <select class="sel-basemap-scheme" style="background: var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px; padding:3px 6px; font-size:11px; min-width:140px; max-width:100%;">
                <option value="dark" ${(layer.config?.scheme || "dark") === "dark" ? "selected" : ""}>🌙 Midnight Slate (Dark)</option>
                <option value="light" ${layer.config?.scheme === "light" ? "selected" : ""}>☀️ Daybreak Neutral (Light)</option>
                <option value="micaps" ${layer.config?.scheme === "micaps" ? "selected" : ""}>🌐 MICAPS Classic (Navy)</option>
              </select>
            </div>
            <div class="config-row" style="margin-top:4px;">
              <label style="color: var(--text-secondary); font-size:11px; display:flex; align-items:center; gap:4px;">🌐 Projection</label>
              <select class="sel-basemap-projection" style="background: var(--bg-secondary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px; padding:3px 6px; font-size:11px; min-width:140px; max-width:100%;">
                <option value="mercator" ${(layer.config?.projection || "mercator") === "mercator" ? "selected" : ""}>🗺️ Mercator (2D)</option>
                <option value="globe" ${layer.config?.projection === "globe" ? "selected" : ""}>🌍 Globe (3D)</option>
                <option value="vertical-perspective" ${layer.config?.projection === "vertical-perspective" ? "selected" : ""}>🪐 Perspective (3D)</option>
              </select>
            </div>
            `))))
        }
      </div>
    </div>
  `;
}

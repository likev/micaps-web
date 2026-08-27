// catalogDrawer.js - Multi-tier meteorological product catalog drawer
import { appState } from "../store/appState.js";
import { formatObsTimestamp } from "../utils/formatters.js";

export function initCatalogDrawer(containerId = "catalog-drawer", onLoadCallback) {
  const drawer = document.getElementById(containerId);
  if (!drawer) return;

  drawer.innerHTML = `
    <div class="drawer-header">
      <span>Meteorological Products</span>
      <button id="btn-close-drawer" class="btn" style="padding: 2px 8px;">✕</button>
    </div>
    <div class="drawer-body">
      <div class="form-group">
        <label>Product Category / Source</label>
        <select id="select-model" class="form-select">
          <optgroup label="Global NWP Forecast Models">
            <option value="ECMWF_HR" selected>ECMWF High Resolution (ECMWF_HR)</option>
            <option value="GRAPES_GFS">CMA GRAPES Global (GRAPES_GFS)</option>
            <option value="NWFD_SCMOC">National Guidance (NWFD_SCMOC)</option>
          </optgroup>
          <optgroup label="Synoptic & Upper Air Observations">
            <option value="SURFACE">Surface Observations (SURFACE)</option>
            <option value="UPPER_AIR">Upper Air Observations (UPPER_AIR)</option>
          </optgroup>
        </select>
      </div>

      <div class="form-group" id="group-element">
        <label>Variable / Product</label>
        <select id="select-element" class="form-select">
          <option value="TMP" selected>TMP - Temperature (°C)</option>
          <option value="HGT">HGT - Geopotential Height (gpm)</option>
          <option value="RAIN">RAIN - Precipitation (mm)</option>
          <option value="WIND">WIND - Wind Vectors (m/s)</option>
        </select>
      </div>

      <div class="form-group" id="group-level">
        <label>Isobaric Level (hPa)</label>
        <select id="select-catalog-level" class="form-select">
          <option value="1000">1000 hPa</option>
          <option value="925">925 hPa</option>
          <option value="850" selected>850 hPa</option>
          <option value="700">700 hPa</option>
          <option value="500">500 hPa</option>
          <option value="200">200 hPa</option>
        </select>
      </div>

      <!-- Forecast Lead Offset (Only for NWP Models) -->
      <div class="form-group" id="group-period">
        <label>Forecast Lead Offset (Discrete Hours)</label>
        <select id="select-period" class="form-select">
          <option value="0">000h (Analysis)</option>
          <option value="12">+012h</option>
          <option value="24" selected>+024h</option>
          <option value="36">+036h</option>
          <option value="48">+048h</option>
          <option value="72">+072h</option>
          <option value="96">+096h</option>
          <option value="120">+120h</option>
        </select>
      </div>

      <!-- Observation Time (Only for Observations) -->
      <div class="form-group" id="group-obs-time" style="display: none;">
        <label>Observation Time (UTC)</label>
        <select id="select-obs-time" class="form-select">
          <option value="20260827200000.000" selected>2026-08-27 20:00:00 UTC</option>
          <option value="20260827174000.000">2026-08-27 17:40:00 UTC</option>
          <option value="20260827170000.000">2026-08-27 17:00:00 UTC</option>
          <option value="20260827120000.000">2026-08-27 12:00:00 UTC</option>
          <option value="20260827080000.000">2026-08-27 08:00:00 UTC</option>
        </select>
      </div>

      <button id="btn-load-product" class="btn btn-primary" style="margin-top: 8px; justify-content: center;">
        Load Meteorological Data
      </button>
    </div>
  `;

  document.getElementById("btn-close-drawer").addEventListener("click", () => {
    drawer.classList.add("hidden");
  });

  const selectModel = document.getElementById("select-model");
  const selectElement = document.getElementById("select-element");
  const selectLevel = document.getElementById("select-catalog-level");
  const selectPeriod = document.getElementById("select-period");
  const selectObsTime = document.getElementById("select-obs-time");
  const groupLevel = document.getElementById("group-level");
  const groupPeriod = document.getElementById("group-period");
  const groupObsTime = document.getElementById("group-obs-time");
  const btnLoad = document.getElementById("btn-load-product");

  function updateFormVisibility() {
    const model = selectModel.value;

    if (model === "SURFACE") {
      groupLevel.style.display = "none";
      groupPeriod.style.display = "none"; // Observations do NOT have forecast offset
      groupObsTime.style.display = "flex";

      selectElement.innerHTML = `
        <option value="PLOT_GLOBAL_3H" selected>PLOT_GLOBAL_3H - Global 3-Hour Synoptic Plots</option>
        <option value="PLOT_10MIN">PLOT_10MIN - National Automatic Station 10-Min Plots</option>
        <option value="PLOT">PLOT - Standard Surface Plots</option>
      `;
    } else if (model === "UPPER_AIR") {
      groupLevel.style.display = "flex";
      groupPeriod.style.display = "none"; // Observations do NOT have forecast offset
      groupObsTime.style.display = "flex";

      selectElement.innerHTML = `
        <option value="PLOT" selected>PLOT - Upper Air Sounding Plots</option>
      `;
      selectLevel.innerHTML = `
        <option value="500" selected>500 hPa</option>
        <option value="700">700 hPa</option>
        <option value="850">850 hPa</option>
        <option value="200">200 hPa</option>
        <option value="100">100 hPa</option>
      `;
    } else {
      // NWP Model
      groupLevel.style.display = "flex";
      groupPeriod.style.display = "flex"; // NWP models have discrete forecast lead offsets
      groupObsTime.style.display = "none";

      selectElement.innerHTML = `
        <option value="TMP" selected>TMP - Temperature (°C)</option>
        <option value="HGT">HGT - Geopotential Height (gpm)</option>
        <option value="RAIN">RAIN - Precipitation (mm)</option>
        <option value="WIND">WIND - Wind Vectors (m/s)</option>
      `;
      selectLevel.innerHTML = `
        <option value="1000">1000 hPa</option>
        <option value="925">925 hPa</option>
        <option value="850" selected>850 hPa</option>
        <option value="700">700 hPa</option>
        <option value="500">500 hPa</option>
        <option value="200">200 hPa</option>
      `;
    }
  }

  selectModel.addEventListener("change", updateFormVisibility);

  btnLoad.addEventListener("click", async () => {
    btnLoad.disabled = true;
    btnLoad.textContent = "Loading...";

    const model = selectModel.value;
    const isObs = model === "SURFACE" || model === "UPPER_AIR";
    const element = selectElement.value;
    const level = groupLevel.style.display !== "none" ? parseFloat(selectLevel.value) : null;
    const period = !isObs ? parseInt(selectPeriod.value, 10) : null;
    const obsTime = isObs ? selectObsTime.value : null;

    appState.update({
      model,
      element,
      level: level !== null ? level : 850,
      period: period !== null ? period : 0,
      obsTime,
      isObservation: isObs,
    });

    try {
      if (onLoadCallback) {
        await onLoadCallback({
          model,
          element,
          level,
          period,
          obsTime,
          isObservation: isObs,
        });
      }
      drawer.classList.add("hidden");
    } catch (err) {
      console.error("[Catalog] Load error:", err);
    } finally {
      btnLoad.disabled = false;
      btnLoad.textContent = "Load Meteorological Data";
    }
  });
}

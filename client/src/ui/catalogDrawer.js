// catalogDrawer.js - Multi-tier meteorological product catalog drawer
import { appState } from "../store/appState.js";
import { fetchLatest, fetchTree, fetchLevels } from "../api/catalogApi.js";

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
        <label>NWP Model / Source</label>
        <select id="select-model" class="form-select">
          <option value="ECMWF_HR" selected>ECMWF High Resolution (ECMWF_HR)</option>
          <option value="GRAPES_GFS">CMA GRAPES Global (GRAPES_GFS)</option>
          <option value="NWFD_SCMOC">National Guidance (NWFD_SCMOC)</option>
          <option value="SURFACE">Synoptic Observations (SURFACE)</option>
        </select>
      </div>

      <div class="form-group">
        <label>Variable / Element</label>
        <select id="select-element" class="form-select">
          <option value="TMP" selected>TMP - Temperature (°C)</option>
          <option value="HGT">HGT - Geopotential Height (gpm)</option>
          <option value="RAIN">RAIN - Precipitation (mm)</option>
          <option value="WIND">WIND - Wind Vectors (m/s)</option>
        </select>
      </div>

      <div class="form-group" id="group-level">
        <label>Isobaric Level (hPa)</label>
        <select id="select-level" class="form-select">
          <option value="1000">1000 hPa</option>
          <option value="925">925 hPa</option>
          <option value="850" selected>850 hPa</option>
          <option value="700">700 hPa</option>
          <option value="500">500 hPa</option>
          <option value="200">200 hPa</option>
        </select>
      </div>

      <div class="form-group">
        <label>Forecast Offset (Hours)</label>
        <select id="select-period" class="form-select">
          <option value="0">000h (Analysis)</option>
          <option value="12">+012h</option>
          <option value="24" selected>+024h</option>
          <option value="36">+036h</option>
          <option value="48">+048h</option>
          <option value="72">+072h</option>
        </select>
      </div>

      <button id="btn-load-product" class="btn btn-primary" style="margin-top: 8px; justify-content: center;">
        Load Weather Field
      </button>
    </div>
  `;

  document.getElementById("btn-close-drawer").addEventListener("click", () => {
    drawer.classList.add("hidden");
  });

  const selectModel = document.getElementById("select-model");
  const selectElement = document.getElementById("select-element");
  const selectLevel = document.getElementById("select-level");
  const selectPeriod = document.getElementById("select-period");
  const btnLoad = document.getElementById("btn-load-product");

  selectModel.addEventListener("change", (e) => {
    const isSurface = e.target.value === "SURFACE";
    document.getElementById("group-level").style.display = isSurface ? "none" : "flex";
  });

  btnLoad.addEventListener("click", async () => {
    btnLoad.disabled = true;
    btnLoad.textContent = "Loading...";

    const model = selectModel.value;
    const element = selectElement.value;
    const level = parseFloat(selectLevel.value);
    const period = parseInt(selectPeriod.value, 10);

    appState.update({
      model,
      element,
      level,
      period,
    });

    try {
      if (onLoadCallback) {
        await onLoadCallback({ model, element, level, period });
      }
      drawer.classList.add("hidden");
    } catch (err) {
      console.error("[Catalog] Load error:", err);
    } finally {
      btnLoad.disabled = false;
      btnLoad.textContent = "Load Weather Field";
    }
  });
}

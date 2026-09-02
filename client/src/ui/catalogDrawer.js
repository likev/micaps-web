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
      <div class="form-group hidden" id="group-obs-time" data-visible="false">
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

  function closeDrawer() {
    drawer.classList.add("hidden");
  }

  document.getElementById("btn-close-drawer").addEventListener("click", () => {
    closeDrawer();
  });

  // Escape to close and outside-click to close
  const escHandler = (e) => {
    if (e.key === "Escape" && !drawer.classList.contains("hidden")) {
      closeDrawer();
    }
  };
  document.addEventListener("keydown", escHandler);

  // Outside-click: close when clicking outside drawer (ignore clicks on drawer itself)
  // Use capture to avoid interference with other handlers; check that drawer is visible
  const outsideClickHandler = (e) => {
    if (drawer.classList.contains("hidden")) return;
    if (drawer.contains(e.target)) return;
    // Don't close if click was on the button that opens the drawer (if any) – keep open then
    // Identify potential open triggers by data attribute or known ids
    const trigger = e.target.closest("#btn-open-catalog, #btn-toggle-catalog, [data-open-catalog]");
    if (trigger) return;
    closeDrawer();
  };
  // Delay binding to avoid immediate close from the same click that opened the drawer
  setTimeout(() => document.addEventListener("click", outsideClickHandler), 0);

  const selectModel = document.getElementById("select-model");
  const selectElement = document.getElementById("select-element");
  const selectLevel = document.getElementById("select-catalog-level");
  const selectPeriod = document.getElementById("select-period");
  const selectObsTime = document.getElementById("select-obs-time");
  const groupLevel = document.getElementById("group-level");
  const groupPeriod = document.getElementById("group-period");
  const groupObsTime = document.getElementById("group-obs-time");
  const btnLoad = document.getElementById("btn-load-product");

  // Ensure data-visible reflects initial hidden state
  groupLevel.dataset.visible = String(!groupLevel.classList.contains("hidden"));
  groupPeriod.dataset.visible = String(!groupPeriod.classList.contains("hidden"));
  groupObsTime.dataset.visible = String(!groupObsTime.classList.contains("hidden"));

  function setGroupVisible(groupEl, visible) {
    groupEl.classList.toggle("hidden", !visible);
    groupEl.dataset.visible = String(visible);
    // Keep style.display in sync for legacy CSS that may rely on it
    groupEl.style.display = visible ? "flex" : "none";
  }

  function updateFormVisibility() {
    const prevLevel = selectLevel.value;
    const prevElement = selectElement.value;
    const model = selectModel.value;

    if (model === "SURFACE") {
      setGroupVisible(groupLevel, false);
      setGroupVisible(groupPeriod, false);
      setGroupVisible(groupObsTime, true);

      selectElement.innerHTML = `
        <option value="PLOT_GLOBAL_3H" selected>PLOT_GLOBAL_3H - Global 3-Hour Synoptic Plots</option>
        <option value="PLOT_10MIN">PLOT_10MIN - National Automatic Station 10-Min Plots</option>
        <option value="PLOT">PLOT - Standard Surface Plots</option>
      `;
    } else if (model === "UPPER_AIR") {
      setGroupVisible(groupLevel, true);
      setGroupVisible(groupPeriod, false);
      setGroupVisible(groupObsTime, true);

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
      setGroupVisible(groupLevel, true);
      setGroupVisible(groupPeriod, true);
      setGroupVisible(groupObsTime, false);

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

    // Restore previous selections if still valid
    const levelOptions = Array.from(selectLevel.options).map((o) => o.value);
    if (prevLevel && levelOptions.includes(prevLevel)) {
      selectLevel.value = prevLevel;
    }
    const elementOptions = Array.from(selectElement.options).map((o) => o.value);
    if (prevElement && elementOptions.includes(prevElement)) {
      selectElement.value = prevElement;
    }
  }

  selectModel.addEventListener("change", updateFormVisibility);

  // Attempt to dynamically populate obs times via catalog API
  (async () => {
    try {
      const { fetchTree } = await import("../api/catalogApi.js");
      // Try known observation paths
      const candidatePaths = ["SURFACE/PLOT_10MIN", "SURFACE/PLOT", "UPPER_AIR/PLOT"];
      let files = null;
      for (const p of candidatePaths) {
        try {
          const res = await fetchTree(p);
          // fetchTree may return array of strings or object with files
          const arr = Array.isArray(res) ? res : res?.files || res?.data || null;
          if (Array.isArray(arr) && arr.length) {
            files = arr;
            break;
          }
        } catch (_) {
          continue;
        }
      }
      if (files && files.length) {
        // Filter to .000 files and sort descending (newest first)
        const obsFiles = files.filter((f) => typeof f === "string" && f.endsWith(".000")).sort().reverse();
        const toUse = obsFiles.length ? obsFiles.slice(0, 10) : files.slice(0, 10);
        if (toUse.length) {
          selectObsTime.innerHTML = toUse
            .map((f, idx) => {
              let label = f;
              try {
                label = formatObsTimestamp(f);
              } catch {
                label = f;
              }
              return `<option value="${f}" ${idx === 0 ? "selected" : ""}>${label}</option>`;
            })
            .join("");
        }
      }
    } catch (_) {
      // keep hard-coded fallback
    }
  })();

  btnLoad.addEventListener("click", async () => {
    btnLoad.disabled = true;
    btnLoad.textContent = "Loading...";

    const model = selectModel.value;
    const isObs = model === "SURFACE" || model === "UPPER_AIR";
    const element = selectElement.value;
    const levelVisible = groupLevel.dataset.visible === "true" && !groupLevel.classList.contains("hidden");
    const level = levelVisible ? parseFloat(selectLevel.value) : null;
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

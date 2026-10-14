// profilerLayer.js - Tropospheric wind profiler station network and vertical profile panel
import { addOrUpdateLayer, removeLayer, syncLayerControlForWindow } from "../ui/layers/layerStore.js";
import { getActiveWindow } from "../ui/tabs/tabsStore.js";
import { drawWindBarbCanvas } from "./station/stationSymbols.js";

const DEFAULT_STATION = "58362";

export function getProfilerDOMIds(layerId) {
  const safeId = (layerId || "profiler-layer").replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    srcId: `profiler-src-${safeId}`,
    pointLayerId: `profiler-point-${safeId}`,
    labelLayerId: `profiler-label-${safeId}`,
  };
}

class ProfilerPanelController {
  constructor() {
    this.container = null;
    this.activeStation = DEFAULT_STATION;
    this.activeProduct = "ROBS";
    this.activeFile = "";
    this.profileData = null;
    this.isVisible = true;
  }

  init(stationId = DEFAULT_STATION, product = "ROBS", file = "") {
    this.activeStation = stationId;
    this.activeProduct = product;
    this.activeFile = file;
    this._ensureDOM();
    this.fetchAndRender(stationId, product, file);
  }

  _findEl(selector, id) {
    if (this.container && typeof this.container.querySelector === "function") {
      const found = this.container.querySelector(selector);
      if (found) return found;
    }
    if (id && typeof document !== "undefined" && typeof document.getElementById === "function") {
      return document.getElementById(id);
    }
    return null;
  }

  _ensureDOM() {
    if (typeof document === "undefined" || typeof document.getElementById !== "function" || typeof document.createElement !== "function") return;
    let el = document.getElementById("profiler-panel");
    if (!el) {
      el = document.createElement("div");
      el.id = "profiler-panel";
      el.className = "profiler-subwindow";
      el.style.cssText = `
        position: absolute;
        bottom: 24px;
        right: 20px;
        width: 380px;
        height: 520px;
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 80px);
        background: #0d1117;
        border: 1px solid #30363d;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #c9d1d9;
      `;

      el.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:#161b22; border-bottom:1px solid #30363d;">
          <div style="font-weight:600; font-size:13px; display:flex; align-items:center; gap:6px;">
            <span>📡</span>
            <span id="profiler-title">Wind Profiler (Station 58362)</span>
          </div>
          <button id="profiler-close-btn" style="background:none; border:none; color:#8b949e; cursor:pointer; font-size:16px; padding:2px 6px;">✕</button>
        </div>
        <div id="profiler-meta" style="padding:4px 12px; font-size:11px; color:#8b949e; background:#0d1117; border-bottom:1px solid #21262d;">
          Loading vertical profile...
        </div>
        <div style="flex:1; position:relative; overflow:hidden; background:#040711;">
          <canvas id="profiler-canvas" style="width:100%; height:100%; display:block;"></canvas>
        </div>
      `;

      if (document.body && typeof document.body.appendChild === "function") {
        document.body.appendChild(el);
      }
    }
    this.container = el;
    const closeBtn = this._findEl("#profiler-close-btn", "profiler-close-btn");
    if (closeBtn) {
      closeBtn.onclick = () => this.hide();
    }
    if (this.container && this.container.style) {
      this.container.style.display = this.isVisible ? "flex" : "none";
    }
  }

  async fetchAndRender(stationId, product, file) {
    let url = `/api/data/windprofiler?station=${encodeURIComponent(stationId)}&product=${encodeURIComponent(product || "ROBS")}`;
    if (file) {
      url += `&file=${encodeURIComponent(file)}`;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.profileData = data;
      this.render();
    } catch (e) {
      console.warn(`[ProfilerPanel] Fetch failed for ${stationId}:`, e);
      const metaEl = this._findEl("#profiler-meta", "profiler-meta");
      if (metaEl) metaEl.textContent = `Station ${stationId} (${product}): No data available`;
    }
  }

  render() {
    if (!this.container || !this.profileData) return;
    const { station, product, file, levels } = this.profileData;

    const titleEl = this._findEl("#profiler-title", "profiler-title");
    if (titleEl) titleEl.textContent = `Wind Profiler (${station} ${product})`;

    const metaEl = this._findEl("#profiler-meta", "profiler-meta");
    if (metaEl) {
      metaEl.textContent = `Valid: ${file || "Latest"} | Levels: ${levels ? levels.length : 0} (0 - 10,000m)`;
    }

    const canvas = this._findEl("#profiler-canvas", "profiler-canvas");
    if (!canvas || !levels || levels.length === 0 || typeof canvas.getContext !== "function") return;

    const rect = canvas.getBoundingClientRect();
    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    canvas.width = (rect.width || 380) * dpr;
    canvas.height = (rect.height || 420) * dpr;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const w = rect.width || 380;
    const h = rect.height || 420;

    ctx.clearRect(0, 0, w, h);

    const padLeft = 60;
    const padRight = 30;
    const padTop = 20;
    const padBottom = 30;
    const plotH = h - padTop - padBottom;
    const maxHgt = 10000;

    // Grid lines for height (0..10km, every 1km)
    ctx.strokeStyle = "#1f242c";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#8b949e";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";

    for (let hgt = 0; hgt <= maxHgt; hgt += 1000) {
      const y = padTop + plotH * (1 - hgt / maxHgt);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
      ctx.fillText(`${hgt}m`, padLeft - 8, y + 3);
    }

    // Y Axis
    ctx.strokeStyle = "#30363d";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, h - padBottom);
    ctx.stroke();

    // Draw wind barbs for each level
    const cx = padLeft + (w - padLeft - padRight) / 2;
    for (const lvl of levels) {
      if (!lvl || lvl.height > maxHgt || lvl.speed === undefined || lvl.dir === undefined) continue;
      const y = padTop + plotH * (1 - lvl.height / maxHgt);

      // Color based on speed: cyan < 10m/s, green 10-20m/s, yellow 20-30m/s, red > 30m/s
      let barbColor = "#58a6ff";
      if (lvl.speed >= 30) barbColor = "#f85149";
      else if (lvl.speed >= 20) barbColor = "#e3b341";
      else if (lvl.speed >= 10) barbColor = "#3fb950";

      drawWindBarbCanvas(ctx, cx, y, lvl.speed, lvl.dir, 0.75, barbColor);

      // Label wind speed text on the right
      ctx.fillStyle = "#8b949e";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${lvl.speed.toFixed(0)}m/s`, w - padRight + 2, y + 3);
    }
  }

  show() {
    this.isVisible = true;
    if (this.container) this.container.style.display = "flex";
  }

  hide() {
    this.isVisible = false;
    if (this.container) this.container.style.display = "none";
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }
}

export const profilerController = new ProfilerPanelController();

export async function loadProfilerLayer(map, layer = {}, win = null) {
  if (!map) return;

  const layerId = layer.id || "profiler-layer";
  const product = layer.product || "ROBS";
  const stationId = layer.stationId || DEFAULT_STATION;
  const isVisible = layer.visible !== false;
  const { srcId, pointLayerId, labelLayerId } = getProfilerDOMIds(layerId);

  // 1. Fetch station list GeoJSON
  let geojson = { type: "FeatureCollection", features: [] };
  try {
    const res = await fetch(`/api/data/windprofiler?product=${encodeURIComponent(product)}`);
    if (res.ok) {
      geojson = await res.json();
    }
  } catch (err) {
    console.warn("[profilerLayer] Failed to fetch profiler stations:", err);
  }

  // 2. Remove existing map layers/source
  if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
  if (map.getLayer(pointLayerId)) map.removeLayer(pointLayerId);
  if (map.getSource(srcId)) map.removeSource(srcId);

  // 3. Add GeoJSON source
  map.addSource(srcId, {
    type: "geojson",
    data: geojson,
  });

  const visStr = isVisible ? "visible" : "none";

  // Station circles
  map.addLayer({
    id: pointLayerId,
    type: "circle",
    source: srcId,
    layout: { visibility: visStr },
    paint: {
      "circle-radius": 5,
      "circle-color": "#00e5ff",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.9,
    },
  });

  // Remove previous click listener if tracked
  if (map._profilerClickListener && typeof map.off === "function") {
    try {
      map.off("click", pointLayerId, map._profilerClickListener);
    } catch {}
    map._profilerClickListener = null;
  }

  // Station click listener: open profiler panel for clicked station
  const clickHandler = (e) => {
    if (e.features && e.features.length > 0) {
      const feat = e.features[0];
      const clickedStation = feat.properties?.station_id || feat.properties?.station || feat.id;
      if (clickedStation) {
        profilerController.init(String(clickedStation), product);
        profilerController.show();
      }
    }
  };
  if (typeof map.on === "function") {
    map.on("click", pointLayerId, clickHandler);
    map._profilerClickListener = clickHandler;
  }

  // Open the panel for the default station if visible
  if (isVisible) {
    profilerController.init(stationId, product);
    profilerController.show();
  }

  const layerDef = {
    id: layerId,
    name: layer.name || `Tropospheric Wind Profilers (${product})`,
    type: "profiler",
    model: "WIND_PROFILER",
    element: product,
    product,
    stationId,
    visible: isVisible,
    removable: layer.removable !== false,
    color: "#00e5ff",
    config: {
      product,
      stationId,
      stationCount: geojson.features.length,
      ...(layer.config || {}),
    },
    geojsonData: geojson,
  };

  addOrUpdateLayer(layerDef, win);
  if (win && typeof getActiveWindow === "function" && getActiveWindow() === win) {
    syncLayerControlForWindow(win);
  }

  return layerDef;
}

export function removeProfilerLayer(map, win = null, layerId = null) {
  const targetId = layerId || "profiler-layer";
  const { srcId, pointLayerId, labelLayerId } = getProfilerDOMIds(targetId);

  profilerController.destroy();

  if (map) {
    try {
      if (map._profilerClickListener && typeof map.off === "function") {
        map.off("click", pointLayerId, map._profilerClickListener);
        map._profilerClickListener = null;
      }
      if (typeof map.getLayer === "function" && map.getLayer(labelLayerId) && typeof map.removeLayer === "function") {
        map.removeLayer(labelLayerId);
      }
      if (typeof map.getLayer === "function" && map.getLayer(pointLayerId) && typeof map.removeLayer === "function") {
        map.removeLayer(pointLayerId);
      }
      if (typeof map.getSource === "function" && map.getSource(srcId) && typeof map.removeSource === "function") {
        map.removeSource(srcId);
      }
    } catch (e) {}
  }

  removeLayer(targetId, win);
  if (win && Array.isArray(win.layers)) {
    win.layers = win.layers.filter((l) => l && l.id !== targetId && l.type !== "profiler");
  }
}

export function setProfilerVisibility(map, visible, win = null, layerId = null) {
  const targetId = layerId || "profiler-layer";
  const { pointLayerId, labelLayerId } = getProfilerDOMIds(targetId);
  const visStr = visible ? "visible" : "none";

  if (map) {
    try {
      if (map.getLayer(pointLayerId)) map.setLayoutProperty(pointLayerId, "visibility", visStr);
      if (map.getLayer(labelLayerId)) map.setLayoutProperty(labelLayerId, "visibility", visStr);
    } catch (e) {}
  }

  if (visible) {
    profilerController.show();
  } else {
    profilerController.hide();
  }

  addOrUpdateLayer({ id: targetId, visible: Boolean(visible) }, win);
  if (win && typeof getActiveWindow === "function" && getActiveWindow() === win) {
    syncLayerControlForWindow(win);
  }
}

// windLayer.js - Animated physical particle streamlines with bilinear velocity interpolation (§8.8.2)
import { WIND_QC_BOUNDS } from "./soundingAnalysis.js";

/**
 * Unified wind layer cleanup for both streamlines and wind barbs (§8.8.2 P4-1).
 * Cancels active animation frames, removes map move/resize listeners, unbinds
 * visibility change handlers, and clears/removes overlay canvases.
 *
 * @param {Object} [map=null] - MapLibre map instance
 */
export function cleanupWindLayer(map = null) {
  stopWindAnimation(map);
  removeGridWindBarbs(map);
}

export function renderWindStreamlines(map, gridData, options = {}) {
  if (!map || !gridData || !gridData.u || !gridData.v || !gridData.header) return;

  // Clean up any existing streamline animation or listeners on this map
  stopWindAnimation(map);

  const header = gridData.header;
  const nLon = header.n_lon || header.LongitudeGridNumber || 100;
  const nLat = header.n_lat || header.LatitudeGridNumber || 80;
  const u = gridData.u;
  const v = gridData.v;
  const startLon = gridData.x ? gridData.x[0] : (header.start_lon ?? header.StartLongitude ?? 60.0);
  const endLon = gridData.x ? gridData.x[gridData.x.length - 1] : (header.end_lon ?? header.EndLongitude ?? (startLon + (nLon - 1) * 0.25));
  const dLon = Math.abs(header.d_lon ?? header.LongitudeGridSpace ?? (nLon > 1 ? Math.abs(endLon - startLon) / (nLon - 1) : 0.25));
  const startLat = gridData.y ? gridData.y[0] : (header.start_lat ?? header.StartLatitude ?? 60.0);
  const endLat = gridData.y ? gridData.y[gridData.y.length - 1] : (header.end_lat ?? header.EndLatitude ?? (startLat + (nLat - 1) * (header.d_lat || -0.25)));
  const dLat = Math.abs(header.d_lat ?? header.LatitudeGridSpace ?? (nLat > 1 ? Math.abs(endLat - startLat) / (nLat - 1) : 0.25));
  const isLatNorthToSouth = startLat > endLat;

  const container = map.getContainer();
  let streamCanvas = container?.querySelector(".streamline-canvas");
  if (!streamCanvas && container) {
    streamCanvas = document.createElement("canvas");
    streamCanvas.className = "streamline-canvas";
    if (streamCanvas.style) {
      streamCanvas.style.position = "absolute";
      streamCanvas.style.top = "0";
      streamCanvas.style.left = "0";
      streamCanvas.style.width = "100%";
      streamCanvas.style.height = "100%";
      streamCanvas.style.pointerEvents = "none";
      streamCanvas.style.zIndex = "400";
    }
    container.appendChild(streamCanvas);
  }

  if (!streamCanvas) return;

  const ctx = streamCanvas.getContext("2d");
  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;

  let cssWidth = 800;
  let cssHeight = 600;

  function resize() {
    if (!container) return;
    const rect = container.getBoundingClientRect ? container.getBoundingClientRect() : { width: 800, height: 600 };
    cssWidth = Math.round(rect.width) || 800;
    cssHeight = Math.round(rect.height) || 600;
    const targetW = Math.round(cssWidth * dpr);
    const targetH = Math.round(cssHeight * dpr);
    if (streamCanvas.width !== targetW || streamCanvas.height !== targetH) {
      streamCanvas.width = targetW;
      streamCanvas.height = targetH;
    }
  }
  resize();

  // Bilinear interpolation for wind velocity (u, v) in m/s at (lng, lat)
  function sampleWind(lng, lat) {
    const gx = (lng - startLon) / dLon;
    const gy = isLatNorthToSouth ? (startLat - lat) / dLat : (lat - startLat) / dLat;

    if (gx < 0 || gx >= nLon - 1 || gy < 0 || gy >= nLat - 1) return null;

    const x0 = Math.floor(gx);
    const x1 = Math.min(x0 + 1, nLon - 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(y0 + 1, nLat - 1);

    const fx = gx - x0;
    const fy = gy - y0;

    const idx00 = y0 * nLon + x0;
    const idx10 = y0 * nLon + x1;
    const idx01 = y1 * nLon + x0;
    const idx11 = y1 * nLon + x1;

    const uVal = (1 - fx) * (1 - fy) * (u[idx00] || 0) +
                 fx * (1 - fy) * (u[idx10] || 0) +
                 (1 - fx) * fy * (u[idx01] || 0) +
                 fx * fy * (u[idx11] || 0);

    const vVal = (1 - fx) * (1 - fy) * (v[idx00] || 0) +
                 fx * (1 - fy) * (v[idx10] || 0) +
                 (1 - fx) * fy * (v[idx01] || 0) +
                 fx * fy * (v[idx11] || 0);

    return [uVal, vVal];
  }

  // Adaptive particle count based on canvas area (§8.8.2 P4-2: clamp(area/1500, 400, 1600))
  const canvasArea = cssWidth * cssHeight;
  const numParticles = options.numParticles || Math.max(400, Math.min(1600, Math.round(canvasArea / 1500)));
  const particles = [];

  function resetParticle(p) {
    const bounds = typeof map.getBounds === "function" ? map.getBounds() : null;
    const west = bounds ? bounds.getWest() : startLon;
    const east = bounds ? bounds.getEast() : endLon;
    const south = bounds ? bounds.getSouth() : Math.min(startLat, endLat);
    const north = bounds ? bounds.getNorth() : Math.max(startLat, endLat);

    p.lng = west + Math.random() * (east - west);
    p.lat = south + Math.random() * (north - south);
    p.age = Math.random() * 40;
    p.maxAge = 40 + Math.random() * 50;
    const pt = typeof map.project === "function" ? map.project([p.lng, p.lat]) : { x: 0, y: 0 };
    p.x = pt.x;
    p.y = pt.y;
  }

  for (let i = 0; i < numParticles; i++) {
    const p = {};
    resetParticle(p);
    particles.push(p);
  }

  let animRunning = true;

  function animate() {
    if (!animRunning) return;
    if (container && !container.isConnected) return;

    if (typeof requestAnimationFrame === "function") {
      map._windAnimId = requestAnimationFrame(animate);
    }

    if (!ctx || typeof ctx.fillRect !== "function") return;

    // Gradual fade trail in buffer coordinates
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.fillStyle = "rgba(10, 13, 20, 0.92)";
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillRect(0, 0, streamCanvas.width, streamCanvas.height);
    ctx.globalCompositeOperation = "source-over";

    // Set DPR scale for particle drawing in CSS coordinates
    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";

    for (const p of particles) {
      const vel = sampleWind(p.lng, p.lat);
      if (!vel) {
        resetParticle(p);
        continue;
      }

      const [uVal, vVal] = vel;
      const speed = Math.hypot(uVal, vVal);
      if (speed < 0.3) {
        p.age += 2;
        if (p.age > p.maxAge) resetParticle(p);
        continue;
      }

      // Physical displacement with zoom-adaptive velocity normalization (2x faster animation):
      const latRad = (p.lat * Math.PI) / 180;
      const cosLat = Math.max(0.1, Math.cos(latRad));
      const currentZoom = typeof map.getZoom === "function" ? map.getZoom() : 4.5;
      const zoomFactor = Math.pow(2, (4.5 - currentZoom) * 0.85);
      const dt = 0.11 * zoomFactor;

      const dLng = (uVal * dt * 1000) / (111320 * cosLat);
      const dLat = (vVal * dt * 1000) / 110574;

      const nextLng = p.lng + dLng;
      const nextLat = p.lat + dLat;

      const currPt = typeof map.project === "function" ? map.project([p.lng, p.lat]) : { x: p.x, y: p.y };
      const nextPt = typeof map.project === "function" ? map.project([nextLng, nextLat]) : { x: p.x, y: p.y };

      // Color coding based on wind speed
      if (speed > 25) {
        ctx.strokeStyle = "rgba(240, 120, 40, 0.85)";
      } else if (speed > 15) {
        ctx.strokeStyle = "rgba(230, 210, 50, 0.8)";
      } else if (speed > 8) {
        ctx.strokeStyle = "rgba(100, 210, 140, 0.75)";
      } else {
        ctx.strokeStyle = "rgba(100, 180, 255, 0.65)";
      }

      ctx.beginPath();
      ctx.moveTo(currPt.x, currPt.y);
      ctx.lineTo(nextPt.x, nextPt.y);
      ctx.stroke();

      p.lng = nextLng;
      p.lat = nextLat;
      p.x = nextPt.x;
      p.y = nextPt.y;
      p.age++;

      if (
        p.age > p.maxAge ||
        p.x < 0 || p.x > cssWidth ||
        p.y < 0 || p.y > cssHeight
      ) {
        resetParticle(p);
      }
    }
  }

  // Pause requestAnimationFrame loop on document.hidden (§8.8.2 P4-2)
  const handleVisibility = () => {
    if (typeof document !== "undefined" && document.hidden) {
      animRunning = false;
      if (map._windAnimId) {
        cancelAnimationFrame(map._windAnimId);
        map._windAnimId = null;
      }
    } else {
      if (!animRunning && (!container || container.isConnected)) {
        animRunning = true;
        if (typeof requestAnimationFrame === "function") {
          map._windAnimId = requestAnimationFrame(animate);
        }
      }
    }
  };

  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", handleVisibility);
    map._windStreamlineVisibilityListener = handleVisibility;
  }

  animate();

  const onMove = () => {
    resize();
    for (const p of particles) {
      if (p.lng !== undefined && p.lat !== undefined && typeof map.project === "function") {
        const pt = map.project([p.lng, p.lat]);
        p.x = pt.x;
        p.y = pt.y;
      }
    }
  };

  map._windStreamlineMoveListener = onMove;
  map._windStreamlineResizeListener = resize;

  if (typeof map.on === "function") {
    map.on("resize", resize);
    map.on("move", onMove);
  }
}

export function stopWindAnimation(map = null) {
  if (map) {
    if (map._windAnimId) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(map._windAnimId);
      map._windAnimId = null;
    }
    if (map._windStreamlineMoveListener && typeof map.off === "function") {
      map.off("move", map._windStreamlineMoveListener);
      map._windStreamlineMoveListener = null;
    }
    if (map._windStreamlineResizeListener && typeof map.off === "function") {
      map.off("resize", map._windStreamlineResizeListener);
      map._windStreamlineResizeListener = null;
    }
    if (map._windStreamlineVisibilityListener && typeof document !== "undefined" && typeof document.removeEventListener === "function") {
      document.removeEventListener("visibilitychange", map._windStreamlineVisibilityListener);
      map._windStreamlineVisibilityListener = null;
    }
    const canvas = map.getContainer ? map.getContainer()?.querySelector(".streamline-canvas") : null;
    if (canvas) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.remove();
    }
  } else if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
    document.querySelectorAll(".streamline-canvas").forEach((canvas) => {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.remove();
    });
  }
}

export function renderGridWindBarbs(map, gridData) {
  if (!map || !gridData || !gridData.u || !gridData.v || !gridData.header) return;

  // Clean up any existing barb listeners
  removeGridWindBarbs(map);

  const header = gridData.header;
  const nLon = header.n_lon || header.LongitudeGridNumber || 100;
  const nLat = header.n_lat || header.LatitudeGridNumber || 80;
  const u = gridData.u;
  const v = gridData.v;
  const startLon = gridData.x ? gridData.x[0] : (header.start_lon ?? header.StartLongitude ?? 60.0);
  const endLon = gridData.x ? gridData.x[gridData.x.length - 1] : (header.end_lon ?? header.EndLongitude ?? (startLon + (nLon - 1) * 0.25));
  const dLon = Math.abs(header.d_lon ?? header.LongitudeGridSpace ?? (nLon > 1 ? Math.abs(endLon - startLon) / (nLon - 1) : 0.25));
  const startLat = gridData.y ? gridData.y[0] : (header.start_lat ?? header.StartLatitude ?? 60.0);
  const endLat = gridData.y ? gridData.y[gridData.y.length - 1] : (header.end_lat ?? header.EndLatitude ?? (startLat + (nLat - 1) * (header.d_lat || -0.25)));
  const dLat = Math.abs(header.d_lat ?? header.LatitudeGridSpace ?? (nLat > 1 ? Math.abs(endLat - startLat) / (nLat - 1) : 0.25));
  const isLatNorthToSouth = startLat > endLat;

  const container = map.getContainer ? map.getContainer() : null;
  let barbCanvas = container?.querySelector(".wind-barb-canvas");
  if (!barbCanvas && container) {
    barbCanvas = document.createElement("canvas");
    barbCanvas.className = "wind-barb-canvas";
    if (barbCanvas.style) {
      barbCanvas.style.position = "absolute";
      barbCanvas.style.top = "0";
      barbCanvas.style.left = "0";
      barbCanvas.style.width = "100%";
      barbCanvas.style.height = "100%";
      barbCanvas.style.pointerEvents = "none";
      barbCanvas.style.zIndex = "405";
    }
    container.appendChild(barbCanvas);
  }

  if (!barbCanvas) return;

  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;

  function sampleWind(lng, lat) {
    const gx = (lng - startLon) / dLon;
    const gy = isLatNorthToSouth ? (startLat - lat) / dLat : (lat - startLat) / dLat;
    if (gx < 0 || gx >= nLon - 1 || gy < 0 || gy >= nLat - 1) return null;
    const x0 = Math.floor(gx), x1 = Math.min(x0 + 1, nLon - 1);
    const y0 = Math.floor(gy), y1 = Math.min(y0 + 1, nLat - 1);
    const fx = gx - x0, fy = gy - y0;
    const idx00 = y0 * nLon + x0, idx10 = y0 * nLon + x1;
    const idx01 = y1 * nLon + x0, idx11 = y1 * nLon + x1;
    const uVal = (1 - fx) * (1 - fy) * (u[idx00] || 0) + fx * (1 - fy) * (u[idx10] || 0) + (1 - fx) * fy * (u[idx01] || 0) + fx * fy * (u[idx11] || 0);
    const vVal = (1 - fx) * (1 - fy) * (v[idx00] || 0) + fx * (1 - fy) * (v[idx10] || 0) + (1 - fx) * fy * (v[idx01] || 0) + fx * fy * (v[idx11] || 0);
    return [uVal, vVal];
  }

  function draw() {
    if (!container) return;
    const rect = container.getBoundingClientRect ? container.getBoundingClientRect() : { width: 800, height: 600 };
    const w = Math.round(rect.width) || 800;
    const h = Math.round(rect.height) || 600;
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);

    if (barbCanvas.width !== targetW || barbCanvas.height !== targetH) {
      barbCanvas.width = targetW;
      barbCanvas.height = targetH;
    }
    const ctx = barbCanvas.getContext("2d");
    if (!ctx || typeof ctx.clearRect !== "function") return;

    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.clearRect(0, 0, w, h);

    const step = 48; // Screen grid spacing for barbs (§8.8.2)

    for (let sx = step / 2; sx < w; sx += step) {
      for (let sy = step / 2; sy < h; sy += step) {
        if (typeof map.unproject !== "function") continue;
        const lngLat = map.unproject([sx, sy]);
        const vel = sampleWind(lngLat.lng, lngLat.lat);
        if (!vel) continue;
        const [uVal, vVal] = vel;
        const speed = Math.hypot(uVal, vVal);
        if (speed < 0.8) continue;

        const staffLen = 22;
        const dx = -uVal / speed;
        const dy = vVal / speed;
        const nx = -dy; // Right side normal when looking from grid point towards tail
        const ny = dx;

        const x0 = sx, y0 = sy;
        const x1 = x0 + dx * staffLen, y1 = y0 + dy * staffLen;

        // Color coding by speed
        if (speed > 25) {
          ctx.strokeStyle = "rgba(240, 100, 30, 0.9)";
          ctx.fillStyle = "rgba(240, 100, 30, 0.9)";
        } else if (speed > 15) {
          ctx.strokeStyle = "rgba(230, 200, 40, 0.9)";
          ctx.fillStyle = "rgba(230, 200, 40, 0.9)";
        } else if (speed > 8) {
          ctx.strokeStyle = "rgba(80, 220, 120, 0.85)";
          ctx.fillStyle = "rgba(80, 220, 120, 0.85)";
        } else {
          ctx.strokeStyle = "rgba(100, 190, 255, 0.8)";
          ctx.fillStyle = "rgba(100, 190, 255, 0.8)";
        }

        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(x0, y0, 1.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        let spd = speed;
        let pos = 0;
        const featherLen = 8;
        const barbSpacing = 3.5;

        // 20 m/s pennants (triangles) - CMA / MICAPS standard
        while (spd >= 18) {
          const px = x1 - dx * pos * barbSpacing;
          const py = y1 - dy * pos * barbSpacing;
          const px2 = x1 - dx * (pos + 1.5) * barbSpacing;
          const py2 = y1 - dy * (pos + 1.5) * barbSpacing;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + nx * featherLen, py + ny * featherLen);
          ctx.lineTo(px2, py2);
          ctx.closePath();
          ctx.fill();
          pos += 1.8;
          spd -= 20;
        }

        // 4 m/s full barbs
        while (spd >= 3.5) {
          const px = x1 - dx * pos * barbSpacing;
          const py = y1 - dy * pos * barbSpacing;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + nx * featherLen, py + ny * featherLen);
          ctx.stroke();
          pos += 1;
          spd -= 4;
        }

        // 2 m/s half barbs
        if (spd >= 1.5) {
          const px = x1 - dx * pos * barbSpacing;
          const py = y1 - dy * pos * barbSpacing;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + nx * (featherLen * 0.5), py + ny * (featherLen * 0.5));
          ctx.stroke();
        }
      }
    }
  }

  draw();

  map._windBarbMoveListener = draw;
  if (typeof map.on === "function") {
    map.on("move", draw);
    map.on("resize", draw);
  }
}

export function removeGridWindBarbs(map = null) {
  if (map) {
    if (map._windBarbMoveListener && typeof map.off === "function") {
      map.off("move", map._windBarbMoveListener);
      map.off("resize", map._windBarbMoveListener);
      map._windBarbMoveListener = null;
    }
    const canvas = map.getContainer ? map.getContainer()?.querySelector(".wind-barb-canvas") : null;
    if (canvas) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.remove();
    }
  } else if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
    document.querySelectorAll(".wind-barb-canvas").forEach((canvas) => {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.remove();
    });
  }
}

// Generate regular 2D (U, V) grid from sparse observation stations (Surface or Upper-Air)
export function generateStationWindGrid(stationsGeoJSON, level = null) {
  if (!stationsGeoJSON || !stationsGeoJSON.features || stationsGeoJSON.features.length < 3) {
    return null;
  }

  const numLvl = Number(level);
  const maxAllowedWs = (numLvl && WIND_QC_BOUNDS[numLvl]) ? WIND_QC_BOUNDS[numLvl][1] : 140;

  const points = [];
  const uVals = [];
  const vVals = [];

  for (const f of stationsGeoJSON.features) {
    if (!f.geometry || !f.geometry.coordinates) continue;
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties || {};

    let ws = null;
    const wsKeys = ["wind_speed", "windSpeed", "ws", "WIN_S_Avg", "WIN_S", "FF", "ff", "speed"];
    for (const k of wsKeys) {
      const v = p[k];
      if (v !== undefined && v !== null && v !== "" && v !== -9999 && v !== "-9999") {
        const num = typeof v === "number" ? v : parseFloat(v);
        if (!isNaN(num) && num >= 0 && num <= 900) {
          ws = num;
          break;
        }
      }
    }

    let wd = null;
    const wdKeys = ["wind_dir", "windDir", "wd", "WIN_D_Avg", "WIN_D", "DD", "dd", "dir"];
    for (const k of wdKeys) {
      const v = p[k];
      if (v !== undefined && v !== null && v !== "" && v !== -9999 && v !== "-9999") {
        const num = typeof v === "number" ? v : parseFloat(v);
        if (!isNaN(num) && num >= 0 && num <= 360) {
          wd = num;
          break;
        }
      }
    }

    // QC: reject speeds exceeding physical limits for level
    if (ws !== null && (ws < 0 || ws > maxAllowedWs)) {
      ws = null;
    }

    let u = null;
    let v = null;
    if (typeof p.u === "number" && typeof p.v === "number" && !isNaN(p.u) && !isNaN(p.v)) {
      u = p.u;
      v = p.v;
    } else if (ws !== null) {
      if (ws < 0.5) {
        // Calm wind: (u, v) = (0, 0)
        u = 0;
        v = 0;
      } else if (wd !== null && wd >= 0 && wd <= 360) {
        const rad = (wd * Math.PI) / 180;
        u = -ws * Math.sin(rad);
        v = -ws * Math.cos(rad);
      }
    }

    if (u !== null && v !== null && !isNaN(u) && !isNaN(v)) {
      points.push([lon, lat]);
      uVals.push(u);
      vVals.push(v);
    }
  }

  if (points.length < 3) return null;

  const minLon = Math.max(60, Math.min(...points.map((pt) => pt[0])) - 2.0);
  const maxLon = Math.min(145, Math.max(...points.map((pt) => pt[0])) + 2.0);
  const minLat = Math.max(10, Math.min(...points.map((pt) => pt[1])) - 2.0);
  const maxLat = Math.min(60, Math.max(...points.map((pt) => pt[1])) + 2.0);

  const dDeg = 1.0;
  const x = [];
  for (let lon = minLon; lon <= maxLon; lon += dDeg) x.push(lon);
  const y = [];
  for (let lat = minLat; lat <= maxLat; lat += dDeg) y.push(lat);

  const nCols = x.length;
  const nRows = y.length;
  const uGrid = new Float32Array(nCols * nRows);
  const vGrid = new Float32Array(nCols * nRows);

  for (let r = 0; r < nRows; r++) {
    const lat = y[r];
    for (let c = 0; c < nCols; c++) {
      const lon = x[c];
      let weightSum = 0;
      let uSum = 0;
      let vSum = 0;

      for (let i = 0; i < points.length; i++) {
        const [px, py] = points[i];
        const distSq = (lon - px) * (lon - px) + (lat - py) * (lat - py);
        if (distSq < 0.0001) {
          weightSum = 1;
          uSum = uVals[i];
          vSum = vVals[i];
          break;
        }
        const w = 1.0 / (distSq + 0.5);
        weightSum += w;
        uSum += uVals[i] * w;
        vSum += vVals[i] * w;
      }

      const idx = r * nCols + c;
      uGrid[idx] = weightSum > 0 ? uSum / weightSum : 0;
      vGrid[idx] = weightSum > 0 ? vSum / weightSum : 0;
    }
  }

  return {
    header: {
      start_lon: minLon,
      end_lon: maxLon,
      start_lat: minLat,
      end_lat: maxLat,
      n_lon: nCols,
      n_lat: nRows,
      d_lon: dDeg,
      d_lat: dDeg,
    },
    u: uGrid,
    v: vGrid,
  };
}

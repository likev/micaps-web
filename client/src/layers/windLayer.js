// windLayer.js - Animated physical particle streamlines with bilinear velocity interpolation
export function renderWindStreamlines(map, gridData) {
  if (!map || !gridData || !gridData.u || !gridData.v || !gridData.header) return;

  const header = gridData.header;
  const nLon = header.n_lon || header.LongitudeGridNumber || 100;
  const nLat = header.n_lat || header.LatitudeGridNumber || 80;
  const u = gridData.u;
  const v = gridData.v;
  const startLon = header.start_lon ?? header.StartLongitude ?? 60.0;
  const endLon = header.end_lon ?? header.EndLongitude ?? (startLon + (nLon - 1) * 0.25);
  const dLon = Math.abs(header.d_lon ?? header.LongitudeGridSpace ?? (nLon > 1 ? Math.abs(endLon - startLon) / (nLon - 1) : 0.25));
  const startLat = header.start_lat ?? header.StartLatitude ?? 60.0;
  const endLat = header.end_lat ?? header.EndLatitude ?? -10.0;
  const dLat = Math.abs(header.d_lat ?? header.LatitudeGridSpace ?? (nLat > 1 ? Math.abs(endLat - startLat) / (nLat - 1) : 0.25));
  const isLatNorthToSouth = startLat > endLat;

  const container = map.getContainer();
  let streamCanvas = container.querySelector(".streamline-canvas");
  if (!streamCanvas) {
    streamCanvas = document.createElement("canvas");
    streamCanvas.className = "streamline-canvas";
    streamCanvas.style.position = "absolute";
    streamCanvas.style.top = "0";
    streamCanvas.style.left = "0";
    streamCanvas.style.width = "100%";
    streamCanvas.style.height = "100%";
    streamCanvas.style.pointerEvents = "none";
    streamCanvas.style.zIndex = "400";
    container.appendChild(streamCanvas);
  }

  const ctx = streamCanvas.getContext("2d");

  function resize() {
    const rect = container.getBoundingClientRect();
    if (rect.width && rect.height) {
      if (streamCanvas.width !== Math.round(rect.width) || streamCanvas.height !== Math.round(rect.height)) {
        streamCanvas.width = Math.round(rect.width);
        streamCanvas.height = Math.round(rect.height);
      }
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

  const numParticles = 1200;
  const particles = [];

  function resetParticle(p) {
    const bounds = map.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();

    p.lng = west + Math.random() * (east - west);
    p.lat = south + Math.random() * (north - south);
    p.age = Math.random() * 40;
    p.maxAge = 40 + Math.random() * 50;
    const pt = map.project([p.lng, p.lat]);
    p.x = pt.x;
    p.y = pt.y;
  }

  for (let i = 0; i < numParticles; i++) {
    const p = {};
    resetParticle(p);
    particles.push(p);
  }

  if (map._windAnimId) {
    cancelAnimationFrame(map._windAnimId);
    map._windAnimId = null;
  }

  function animate() {
    if (!container.isConnected) return;

    // Gradual fade trail
    ctx.fillStyle = "rgba(10, 13, 20, 0.92)";
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillRect(0, 0, streamCanvas.width, streamCanvas.height);
    ctx.globalCompositeOperation = "source-over";

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

      const currPt = map.project([p.lng, p.lat]);
      const nextPt = map.project([nextLng, nextLat]);

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
        p.x < 0 || p.x > streamCanvas.width ||
        p.y < 0 || p.y > streamCanvas.height
      ) {
        resetParticle(p);
      }
    }

    map._windAnimId = requestAnimationFrame(animate);
  }

  animate();

  const onMove = () => {
    resize();
    for (const p of particles) {
      if (p.lng !== undefined && p.lat !== undefined) {
        const pt = map.project([p.lng, p.lat]);
        p.x = pt.x;
        p.y = pt.y;
      }
    }
  };

  map.on("resize", resize);
  map.on("move", onMove);
}

export function stopWindAnimation(map = null) {
  if (map) {
    if (map._windAnimId) {
      cancelAnimationFrame(map._windAnimId);
      map._windAnimId = null;
    }
    const canvas = map.getContainer()?.querySelector(".streamline-canvas");
    if (canvas) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.remove();
    }
  } else {
    document.querySelectorAll(".streamline-canvas").forEach((canvas) => {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.remove();
    });
  }
}

export function renderGridWindBarbs(map, gridData) {
  if (!map || !gridData || !gridData.u || !gridData.v || !gridData.header) return;

  const header = gridData.header;
  const nLon = header.n_lon || header.LongitudeGridNumber || 100;
  const nLat = header.n_lat || header.LatitudeGridNumber || 80;
  const u = gridData.u;
  const v = gridData.v;
  const startLon = header.start_lon ?? header.StartLongitude ?? 60.0;
  const endLon = header.end_lon ?? header.EndLongitude ?? (startLon + (nLon - 1) * 0.25);
  const dLon = Math.abs(header.d_lon ?? header.LongitudeGridSpace ?? (nLon > 1 ? Math.abs(endLon - startLon) / (nLon - 1) : 0.25));
  const startLat = header.start_lat ?? header.StartLatitude ?? 60.0;
  const endLat = header.end_lat ?? header.EndLatitude ?? -10.0;
  const dLat = Math.abs(header.d_lat ?? header.LatitudeGridSpace ?? (nLat > 1 ? Math.abs(endLat - startLat) / (nLat - 1) : 0.25));
  const isLatNorthToSouth = startLat > endLat;

  const container = map.getContainer();
  let barbCanvas = container.querySelector(".wind-barb-canvas");
  if (!barbCanvas) {
    barbCanvas = document.createElement("canvas");
    barbCanvas.className = "wind-barb-canvas";
    barbCanvas.style.position = "absolute";
    barbCanvas.style.top = "0";
    barbCanvas.style.left = "0";
    barbCanvas.style.width = "100%";
    barbCanvas.style.height = "100%";
    barbCanvas.style.pointerEvents = "none";
    barbCanvas.style.zIndex = "405";
    container.appendChild(barbCanvas);
  }

  const ctx = barbCanvas.getContext("2d");

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
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (barbCanvas.width !== Math.round(rect.width) || barbCanvas.height !== Math.round(rect.height)) {
      barbCanvas.width = Math.round(rect.width);
      barbCanvas.height = Math.round(rect.height);
    }
    ctx.clearRect(0, 0, barbCanvas.width, barbCanvas.height);

    const step = 48; // Screen grid spacing for barbs
    const w = barbCanvas.width;
    const h = barbCanvas.height;

    for (let sx = step / 2; sx < w; sx += step) {
      for (let sy = step / 2; sy < h; sy += step) {
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

        ctx.strokeStyle = speed > 25 ? "#f85149" : (speed > 15 ? "#d29922" : (speed > 8 ? "#58a6ff" : "#79c0ff"));
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x0, y0, 1.8, 0, Math.PI * 2);
        ctx.fill();

        let s = speed;
        let pos = 0;
        const barbLen = 8;
        const space = 3.5;
        // 110° angle relative to inward staff: bOffN (perpendicular), bOffD (slanted back towards tail)
        const bOffN = barbLen * 0.940;
        const bOffD = barbLen * 0.342;

        while (s >= 18) {
          const bx = x1 - dx * pos, by = y1 - dy * pos;
          const ex = x1 - dx * (pos + 4.5), ey = y1 - dy * (pos + 4.5);
          const tx = bx + nx * bOffN + dx * bOffD, ty = by + ny * bOffN + dy * bOffD;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(tx, ty);
          ctx.lineTo(ex, ey);
          ctx.closePath();
          ctx.fill();
          pos += space + 2;
          s -= 20;
        }

        while (s >= 3.5) {
          const bx = x1 - dx * pos, by = y1 - dy * pos;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + nx * bOffN + dx * bOffD, by + ny * bOffN + dy * bOffD);
          ctx.stroke();
          pos += space;
          s -= 4;
        }

        if (s >= 1.5) {
          // If only 1 short barb, indent from staff tip per WMO/NOAA standard
          const barbPos = pos === 0 ? space : pos;
          const bx = x1 - dx * barbPos, by = y1 - dy * barbPos;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + nx * (bOffN * 0.52) + dx * (bOffD * 0.52), by + ny * (bOffN * 0.52) + dy * (bOffD * 0.52));
          ctx.stroke();
        }
      }
    }
  }

  draw();

  if (map._windBarbMoveListener) {
    map.off("move", map._windBarbMoveListener);
    map.off("resize", map._windBarbMoveListener);
  }
  map._windBarbMoveListener = draw;
  map.on("move", draw);
  map.on("resize", draw);
}

export function removeGridWindBarbs(map = null) {
  if (map) {
    if (map._windBarbMoveListener) {
      map.off("move", map._windBarbMoveListener);
      map.off("resize", map._windBarbMoveListener);
      map._windBarbMoveListener = null;
    }
    const canvas = map.getContainer()?.querySelector(".wind-barb-canvas");
    if (canvas) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.remove();
    }
  } else {
    document.querySelectorAll(".wind-barb-canvas").forEach((canvas) => {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.remove();
    });
  }
}

// Generate regular 2D (U, V) grid from sparse observation stations (Surface or Upper-Air)
export function generateStationWindGrid(stationsGeoJSON) {
  if (!stationsGeoJSON || !stationsGeoJSON.features || stationsGeoJSON.features.length < 3) {
    return null;
  }

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
        if (!isNaN(num) && num >= 0 && num <= 150) {
          ws = num > 100 ? num / 10.0 : num;
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

    let u = null;
    let v = null;
    if (typeof p.u === "number" && typeof p.v === "number" && !isNaN(p.u) && !isNaN(p.v)) {
      u = p.u;
      v = p.v;
    } else if (ws !== null && wd !== null) {
      const rad = (wd * Math.PI) / 180;
      u = -ws * Math.sin(rad);
      v = -ws * Math.cos(rad);
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

// windLayer.js - Animated physical particle streamlines with bilinear velocity interpolation
export function renderWindStreamlines(map, gridData) {
  if (!map || !gridData || !gridData.u || !gridData.v || !gridData.header) return;

  const header = gridData.header;
  const nLon = header.n_lon || header.LongitudeGridNumber || 100;
  const nLat = header.n_lat || header.LatitudeGridNumber || 80;
  const u = gridData.u;
  const v = gridData.v;
  const startLon = header.start_lon ?? header.StartLongitude ?? 70.0;
  const dLon = Math.abs(header.d_lon ?? header.LongitudeGridSpace ?? 0.25);
  const startLat = header.start_lat ?? header.StartLatitude ?? 15.0;
  const dLat = Math.abs(header.d_lat ?? header.LatitudeGridSpace ?? 0.25);
  const isLatNorthToSouth = header.end_lat !== undefined && header.start_lat > header.end_lat;

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

      // Physical displacement in degrees
      const latRad = (p.lat * Math.PI) / 180;
      const cosLat = Math.max(0.1, Math.cos(latRad));
      const dt = 0.08;

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
    if (canvas && canvas.getContext) {
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    }
  } else {
    document.querySelectorAll(".streamline-canvas").forEach((canvas) => {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    });
  }
}

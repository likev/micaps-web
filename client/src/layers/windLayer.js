// windLayer.js - Animated particle streamlines and wind barb vectors

let animId = null;
let streamCanvas = null;
let particles = [];

export function renderWindStreamlines(map, gridData) {
  if (!map || !gridData || !gridData.u || !gridData.v) return;

  const nLon = gridData.header.n_lon;
  const nLat = gridData.header.n_lat;
  const u = gridData.u;
  const v = gridData.v;
  const slon = gridData.header.start_lon;
  const dlon = gridData.header.d_lon;
  const slat = gridData.header.start_lat;
  const dlat = gridData.header.d_lat;

  if (!streamCanvas) {
    streamCanvas = document.createElement("canvas");
    streamCanvas.className = "streamline-canvas";
    streamCanvas.style.position = "absolute";
    streamCanvas.style.top = "0";
    streamCanvas.style.left = "0";
    streamCanvas.style.pointerEvents = "none";
    streamCanvas.style.zIndex = "400";
    map.getContainer().appendChild(streamCanvas);
  }

  function resize() {
    const rect = map.getContainer().getBoundingClientRect();
    streamCanvas.width = rect.width;
    streamCanvas.height = rect.height;
  }
  resize();

  const ctx = streamCanvas.getContext("2d");
  const numParticles = 800;
  particles = [];

  for (let i = 0; i < numParticles; i++) {
    particles.push({
      x: Math.random() * streamCanvas.width,
      y: Math.random() * streamCanvas.height,
      age: Math.random() * 60,
      maxAge: 40 + Math.random() * 40,
    });
  }

  function getVelocity(px, py) {
    const lngLat = map.unproject([px, py]);
    const col = Math.round((lngLat.lng - slon) / dlon);
    const row = Math.round((lngLat.lat - slat) / dlat);
    if (col < 0 || col >= nLon || row < 0 || row >= nLat) return [0, 0];
    const idx = row * nLon + col;
    return [u[idx] || 0, v[idx] || 0];
  }

  if (animId) cancelAnimationFrame(animId);

  function animate() {
    ctx.fillStyle = "rgba(10, 13, 20, 0.08)";
    ctx.fillRect(0, 0, streamCanvas.width, streamCanvas.height);
    ctx.strokeStyle = "rgba(121, 192, 255, 0.7)";
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    for (const p of particles) {
      const [uVal, vVal] = getVelocity(p.x, p.y);
      const nextX = p.x + uVal * 0.4;
      const nextY = p.y - vVal * 0.4; // Screen Y is inverted

      ctx.moveTo(p.x, p.y);
      ctx.lineTo(nextX, nextY);

      p.x = nextX;
      p.y = nextY;
      p.age++;

      if (p.age > p.maxAge || p.x < 0 || p.x > streamCanvas.width || p.y < 0 || p.y > streamCanvas.height) {
        p.x = Math.random() * streamCanvas.width;
        p.y = Math.random() * streamCanvas.height;
        p.age = 0;
      }
    }
    ctx.stroke();

    animId = requestAnimationFrame(animate);
  }

  animate();
  map.on("resize", resize);
  map.on("move", resize);
}

export function stopWindAnimation() {
  if (animId) {
    cancelAnimationFrame(animId);
    animId = null;
  }
  if (streamCanvas && streamCanvas.getContext) {
    streamCanvas.getContext("2d").clearRect(0, 0, streamCanvas.width, streamCanvas.height);
  }
}

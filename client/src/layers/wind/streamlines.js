// streamlines.js - Animated physical particle streamlines with bilinear velocity interpolation (§8.8.2)
import { normalizeHeader, createBilinearSampler } from "./windSampling.js";
import { ensureOverlayCanvas, fitCanvasToContainer, clearAndRemoveCanvas } from "./canvasOverlay.js";

export function renderWindStreamlines(map, gridData, options = {}) {
  if (!map || !gridData || !gridData.u || !gridData.v || !gridData.header) return;

  stopWindAnimation(map);

  const normHeader = normalizeHeader(gridData);
  const sampleWind = createBilinearSampler(gridData, normHeader);
  const { gridWest, gridEast, gridSouth, gridNorth } = normHeader;

  const container = map.getContainer ? map.getContainer() : null;
  const streamCanvas = ensureOverlayCanvas(container, "streamline-canvas", 400);
  if (!streamCanvas) return;

  const ctx = streamCanvas.getContext ? streamCanvas.getContext("2d") : null;
  let { cssWidth, cssHeight, dpr } = fitCanvasToContainer(streamCanvas, container);

  function resize() {
    if (!container) return;
    const dims = fitCanvasToContainer(streamCanvas, container);
    cssWidth = dims.cssWidth;
    cssHeight = dims.cssHeight;
    dpr = dims.dpr;
  }

  const canvasArea = cssWidth * cssHeight;
  const numParticles = options.numParticles || Math.max(300, Math.min(1200, Math.round(canvasArea / 1800)));
  const particles = [];

  let spawnWest = gridWest;
  let spawnEast = gridEast;
  let spawnSouth = gridSouth;
  let spawnNorth = gridNorth;

  function updateSpawnBounds() {
    const bounds = typeof map.getBounds === "function" ? map.getBounds() : null;
    if (bounds) {
      spawnWest = Math.max(gridWest, bounds.getWest());
      spawnEast = Math.min(gridEast, bounds.getEast());
      spawnSouth = Math.max(gridSouth, bounds.getSouth());
      spawnNorth = Math.min(gridNorth, bounds.getNorth());
      if (spawnWest >= spawnEast) { spawnWest = gridWest; spawnEast = gridEast; }
      if (spawnSouth >= spawnNorth) { spawnSouth = gridSouth; spawnNorth = gridNorth; }
    }
  }

  function resetParticle(p) {
    p.lng = spawnWest + Math.random() * (spawnEast - spawnWest);
    p.lat = spawnSouth + Math.random() * (spawnNorth - spawnSouth);
    p.age = Math.random() * 100;
    p.maxAge = 100 + Math.random() * 100;
    if (typeof map.project === "function") {
      const pt = map.project([p.lng, p.lat]);
      p.x = pt ? pt.x : 0;
      p.y = pt ? pt.y : 0;
    } else {
      p.x = 0;
      p.y = 0;
    }
  }

  for (let i = 0; i < numParticles; i++) {
    const p = {};
    resetParticle(p);
    particles.push(p);
  }

  let animRunning = true;
  const bucketLines = [[], [], [], []];
  const STROKE_COLORS = [
    "rgba(100, 180, 255, 0.65)",
    "rgba(100, 210, 140, 0.75)",
    "rgba(230, 210, 50, 0.8)",
    "rgba(240, 120, 40, 0.85)",
  ];

  function animate() {
    if (!animRunning) return;
    if (container && !container.isConnected) return;

    if (typeof requestAnimationFrame === "function") {
      map._windAnimId = requestAnimationFrame(animate);
    }

    if (!ctx || typeof ctx.fillRect !== "function") return;

    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.fillStyle = "rgba(10, 13, 20, 0.965)";
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillRect(0, 0, streamCanvas.width, streamCanvas.height);
    ctx.globalCompositeOperation = "source-over";

    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";

    updateSpawnBounds();
    const currentZoom = typeof map.getZoom === "function" ? map.getZoom() : 4.5;
    const zoomFactor = Math.pow(2, (4.5 - currentZoom) * 0.85);
    const dt = 0.22 * zoomFactor;
    const dtU = (dt * 1000) / 111320;
    const dtV = (dt * 1000) / 110574;

    bucketLines[0].length = 0;
    bucketLines[1].length = 0;
    bucketLines[2].length = 0;
    bucketLines[3].length = 0;

    const hasProject = typeof map.project === "function";

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
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

      const latRad = (p.lat * Math.PI) / 180;
      const cosLat = Math.max(0.1, Math.cos(latRad));

      const dLng = (uVal * dtU) / cosLat;
      const dLat = vVal * dtV;

      const nextLng = p.lng + dLng;
      const nextLat = p.lat + dLat;

      const currX = p.x;
      const currY = p.y;
      let nextX = currX;
      let nextY = currY;

      if (hasProject) {
        const nextPt = map.project([nextLng, nextLat]);
        if (nextPt) {
          nextX = nextPt.x;
          nextY = nextPt.y;
        }
      }

      const bIdx = speed > 25 ? 3 : (speed > 15 ? 2 : (speed > 8 ? 1 : 0));
      const bArr = bucketLines[bIdx];
      bArr.push(currX, currY, nextX, nextY);

      p.lng = nextLng;
      p.lat = nextLat;
      p.x = nextX;
      p.y = nextY;
      p.age++;

      if (
        p.age > p.maxAge ||
        p.x < 0 || p.x > cssWidth ||
        p.y < 0 || p.y > cssHeight
      ) {
        resetParticle(p);
      }
    }

    for (let b = 0; b < 4; b++) {
      const bArr = bucketLines[b];
      const len = bArr.length;
      if (len === 0) continue;
      ctx.strokeStyle = STROKE_COLORS[b];
      ctx.beginPath();
      for (let i = 0; i < len; i += 4) {
        ctx.moveTo(bArr[i], bArr[i + 1]);
        ctx.lineTo(bArr[i + 2], bArr[i + 3]);
      }
      ctx.stroke();
    }
  }

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

  let moveAnimPending = false;
  const updateParticlePositions = () => {
    moveAnimPending = false;
    map._windMoveAnimId = null;
    if (typeof map.project !== "function") return;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.lng !== undefined && p.lat !== undefined) {
        const pt = map.project([p.lng, p.lat]);
        if (pt) {
          p.x = pt.x;
          p.y = pt.y;
        }
      }
    }
  };

  const onMove = () => {
    if (!moveAnimPending) {
      moveAnimPending = true;
      if (typeof requestAnimationFrame === "function") {
        map._windMoveAnimId = requestAnimationFrame(updateParticlePositions);
      } else {
        updateParticlePositions();
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
    if (map._windMoveAnimId) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(map._windMoveAnimId);
      map._windMoveAnimId = null;
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
    const container = map.getContainer ? map.getContainer() : null;
    const canvas = container?.querySelector ? container.querySelector(".streamline-canvas") : null;
    if (canvas) {
      clearAndRemoveCanvas(canvas, container);
    }
  } else if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
    document.querySelectorAll(".streamline-canvas").forEach((canvas) => {
      clearAndRemoveCanvas(canvas, canvas.parentNode);
    });
  }
}

// gridBarbs.js - Grid-based wind barbs Canvas2D rendering and lifecycle management
import { normalizeHeader, createBilinearSampler } from "./windSampling.js";
import { ensureOverlayCanvas, fitCanvasToContainer, clearAndRemoveCanvas } from "./canvasOverlay.js";
import { drawBarbFeathers } from "./barbGlyph.js";

export function renderGridWindBarbs(map, gridData) {
  if (!map || !gridData || !gridData.u || !gridData.v || !gridData.header) return;

  removeGridWindBarbs(map);

  const normHeader = normalizeHeader(gridData);
  const sampleWind = createBilinearSampler(gridData, normHeader);

  const container = map.getContainer ? map.getContainer() : null;
  const barbCanvas = ensureOverlayCanvas(container, "wind-barb-canvas", 405);
  if (!barbCanvas) return;

  let { cssWidth: w, cssHeight: h, dpr } = fitCanvasToContainer(barbCanvas, container);

  function updateDimensions() {
    if (!container) return;
    const dims = fitCanvasToContainer(barbCanvas, container);
    w = dims.cssWidth;
    h = dims.cssHeight;
    dpr = dims.dpr;
  }

  function draw() {
    if (!container) return;
    const ctx = barbCanvas.getContext ? barbCanvas.getContext("2d") : null;
    if (!ctx || typeof ctx.clearRect !== "function") return;

    if (typeof ctx.setTransform === "function") {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.clearRect(0, 0, w, h);

    const step = 48; // Screen grid spacing for barbs (§8.8.2)
    const hasUnproject = typeof map.unproject === "function";
    if (!hasUnproject) return;

    for (let sx = step / 2; sx < w; sx += step) {
      for (let sy = step / 2; sy < h; sy += step) {
        const lngLat = map.unproject([sx, sy]);
        if (!lngLat) continue;
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

        drawBarbFeathers(ctx, x1, y1, dx, dy, nx, ny, speed, 8, 3.5);
      }
    }
  }

  let barbAnimPending = false;
  const throttledDraw = () => {
    if (barbAnimPending) return;
    barbAnimPending = true;
    if (typeof requestAnimationFrame === "function") {
      map._windBarbAnimId = requestAnimationFrame(() => {
        barbAnimPending = false;
        map._windBarbAnimId = null;
        draw();
      });
    } else {
      barbAnimPending = false;
      draw();
    }
  };

  const onMoveEnd = () => {
    throttledDraw();
  };

  const onResize = () => {
    updateDimensions();
    throttledDraw();
  };

  draw();

  map._windBarbMoveListener = throttledDraw;
  map._windBarbMoveEndListener = onMoveEnd;
  map._windBarbResizeListener = onResize;

  if (typeof map.on === "function") {
    map.on("move", throttledDraw);
    map.on("moveend", onMoveEnd);
    map.on("resize", onResize);
  }
}

export function removeGridWindBarbs(map = null) {
  if (map) {
    if (map._windBarbAnimId) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(map._windBarbAnimId);
      map._windBarbAnimId = null;
    }
    if (map._windBarbMoveListener && typeof map.off === "function") {
      map.off("move", map._windBarbMoveListener);
      map._windBarbMoveListener = null;
    }
    if (map._windBarbMoveEndListener && typeof map.off === "function") {
      map.off("moveend", map._windBarbMoveEndListener);
      map._windBarbMoveEndListener = null;
    }
    if (map._windBarbResizeListener && typeof map.off === "function") {
      map.off("resize", map._windBarbResizeListener);
      map._windBarbResizeListener = null;
    }
    const container = map.getContainer ? map.getContainer() : null;
    const canvas = container?.querySelector ? container.querySelector(".wind-barb-canvas") : null;
    if (canvas) {
      clearAndRemoveCanvas(canvas, container);
    }
  } else if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
    document.querySelectorAll(".wind-barb-canvas").forEach((canvas) => {
      clearAndRemoveCanvas(canvas, canvas.parentNode);
    });
  }
}

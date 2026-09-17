// canvasOverlay.js - Shared Canvas2D overlay creation, resizing, and cleanup helpers

export function ensureOverlayCanvas(container, className, zIndex = "400") {
  if (!container) return null;
  let canvas = container.querySelector ? container.querySelector(`.${className}`) : null;
  if (!canvas && typeof document !== "undefined" && typeof document.createElement === "function") {
    canvas = document.createElement("canvas");
    canvas.className = className;
    if (canvas.style) {
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = String(zIndex);
    }
    if (container.appendChild) {
      container.appendChild(canvas);
    }
  }
  return canvas;
}

export function fitCanvasToContainer(canvas, container, customDpr = null) {
  if (!canvas || !container) return { cssWidth: 800, cssHeight: 600, dpr: 1 };
  const rect = container.getBoundingClientRect ? container.getBoundingClientRect() : { width: 800, height: 600 };
  const cssWidth = Math.round(rect.width) || 800;
  const cssHeight = Math.round(rect.height) || 600;
  const dpr = customDpr !== null
    ? customDpr
    : (typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1);
  const targetW = Math.round(cssWidth * dpr);
  const targetH = Math.round(cssHeight * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  return { cssWidth, cssHeight, dpr };
}

export function clearAndRemoveCanvas(canvas, container) {
  if (!canvas) return;
  if (canvas.getContext) {
    const ctx = canvas.getContext("2d");
    if (ctx && typeof ctx.clearRect === "function") {
      ctx.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
    }
  }
  if (container && canvas.parentNode === container) {
    container.removeChild(canvas);
  } else if (canvas.remove) {
    canvas.remove();
  }
}

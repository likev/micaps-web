// mockCanvas.js - Canvas2D and HTMLCanvasElement mock for headless tests

export function createMockCtx() {
  const calls = {
    clearRect: [],
    beginPath: 0,
    moveTo: [],
    lineTo: [],
    arc: [],
    stroke: 0,
    fill: 0,
    closePath: 0,
    fillText: [],
    strokeText: [],
    save: 0,
    restore: 0,
    setTransform: [],
    setLineDash: [],
    fillRect: [],
  };

  return {
    calls,
    canvas: null,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "10px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    globalCompositeOperation: "source-over",
    clearRect: (x, y, w, h) => calls.clearRect.push({ x, y, w, h }),
    fillRect: (x, y, w, h) => calls.fillRect.push({ x, y, w, h }),
    beginPath: () => calls.beginPath++,
    moveTo: (x, y) => calls.moveTo.push({ x, y }),
    lineTo: (x, y) => calls.lineTo.push({ x, y }),
    arc: (x, y, r, sa, ea) => calls.arc.push({ x, y, r, sa, ea }),
    stroke: () => calls.stroke++,
    fill: () => calls.fill++,
    closePath: () => calls.closePath++,
    fillText: (text, x, y) => calls.fillText.push({ text, x, y }),
    strokeText: (text, x, y) => calls.strokeText.push({ text, x, y }),
    save: () => calls.save++,
    restore: () => calls.restore++,
    setTransform: (a, b, c, d, e, f) => calls.setTransform.push({ a, b, c, d, e, f }),
    setLineDash: (d) => calls.setLineDash.push(d),
  };
}

export function createMockCanvas(ctx = null) {
  const actualCtx = ctx || createMockCtx();
  const style = {
    position: "",
    top: "",
    left: "",
    width: "",
    height: "",
    pointerEvents: "",
    zIndex: "",
    display: "block",
  };
  const canvas = {
    className: "",
    style,
    width: 800,
    height: 600,
    parentNode: null,
    getContext: (type) => (type === "2d" ? actualCtx : null),
    remove: () => {
      if (canvas.parentNode && canvas.parentNode.removeChild) {
        canvas.parentNode.removeChild(canvas);
      }
    },
  };
  actualCtx.canvas = canvas;
  return canvas;
}

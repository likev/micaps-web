async function notify(kind, message) {
  try {
    const mod = await import("../lib/stores/ui.svelte.js");
    if (typeof mod.showToast === "function") {
      mod.showToast(kind, message);
    }
  } catch {}
}

export function captureScreenshot(doc = (typeof document !== "undefined" ? document : null)) {
  if (!doc) return false;
  try {
    const activePanel = doc.querySelector?.(".window-panel.active") || doc.querySelector?.(".window-panel");
    const container = activePanel || doc.querySelector?.("#workspace-container") || doc.body;
    const canvasElements = (container && typeof container.querySelectorAll === "function")
      ? Array.from(container.querySelectorAll("canvas"))
      : (typeof doc.querySelectorAll === "function" ? Array.from(doc.querySelectorAll("canvas")) : []);

    const canvases = canvasElements.filter(
      (c) => c && typeof c.toDataURL === "function" && c.width > 0 && c.height > 0
    );

    if (canvases.length === 0) {
      notify("warning", "No canvas found to capture screenshot");
      return false;
    }

    let targetCanvas;
    if (canvases.length === 1) {
      targetCanvas = canvases[0];
    } else {
      const containerRect = container && typeof container.getBoundingClientRect === "function"
        ? container.getBoundingClientRect()
        : null;

      const hasValidRects = containerRect && containerRect.width > 0 && containerRect.height > 0 &&
        canvases.some((c) => typeof c.getBoundingClientRect === "function" && c.getBoundingClientRect()?.width > 0);

      if (hasValidRects) {
        const scale = (typeof window !== "undefined" && window.devicePixelRatio) ? Math.max(1, window.devicePixelRatio) : 1;
        const compW = Math.round(containerRect.width * scale);
        const compH = Math.round(containerRect.height * scale);
        const composite = doc.createElement("canvas");
        composite.width = compW;
        composite.height = compH;
        const ctx = composite.getContext("2d");
        if (ctx) {
          for (const c of canvases) {
            try {
              const cRect = typeof c.getBoundingClientRect === "function" ? c.getBoundingClientRect() : null;
              if (cRect && cRect.width > 0 && cRect.height > 0) {
                const dx = Math.round((cRect.left - containerRect.left) * scale);
                const dy = Math.round((cRect.top - containerRect.top) * scale);
                const dw = Math.round(cRect.width * scale);
                const dh = Math.round(cRect.height * scale);
                ctx.drawImage(c, dx, dy, dw, dh);
              } else {
                ctx.drawImage(c, 0, 0, compW, compH);
              }
            } catch {}
          }
        }
        targetCanvas = composite;
      } else {
        const w = Math.max(...canvases.map((c) => c.width));
        const h = Math.max(...canvases.map((c) => c.height));
        const composite = doc.createElement("canvas");
        composite.width = w;
        composite.height = h;
        const ctx = composite.getContext("2d");
        if (ctx) {
          for (const c of canvases) {
            try {
              ctx.drawImage(c, 0, 0, w, h);
            } catch {}
          }
        }
        targetCanvas = composite;
      }
    }

    const dataUrl = targetCanvas.toDataURL("image/png");
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const filename = `micaps-screenshot-${dateStr}.png`;

    const a = doc.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    notify("info", `Screenshot downloaded: ${filename}`);
    return true;
  } catch (err) {
    console.error("Screenshot capture error:", err);
    notify("error", "Failed to capture screenshot");
    return false;
  }
}

export function handlePrint() {
  try {
    if (typeof window !== "undefined") {
      window.print();
    }
  } catch (err) {
    console.error("Print error:", err);
  }
}

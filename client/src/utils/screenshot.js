async function notify(kind, message) {
  try {
    const mod = await import("../lib/stores/ui.svelte.js");
    if (typeof mod.showToast === "function") {
      mod.showToast(kind, message);
    }
  } catch {}
}

export function drawRoundedRect(ctx, x, y, w, h, r, fill = true, stroke = false) {
  if (w <= 0 || h <= 0) return;
  const radius = Math.min(r, w / 2, h / 2);
  if (typeof ctx.beginPath === "function") {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, radius);
    } else {
      ctx.moveTo?.(x + radius, y);
      ctx.lineTo?.(x + w - radius, y);
      ctx.quadraticCurveTo?.(x + w, y, x + w, y + radius);
      ctx.lineTo?.(x + w, y + h - radius);
      ctx.quadraticCurveTo?.(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo?.(x + radius, y + h);
      ctx.quadraticCurveTo?.(x, y + h, x, y + h - radius);
      ctx.lineTo?.(x, y + radius);
      ctx.quadraticCurveTo?.(x, y, x + radius, y);
      ctx.closePath?.();
    }
    if (fill && typeof ctx.fill === "function") ctx.fill();
    if (stroke && typeof ctx.stroke === "function") ctx.stroke();
  }
}

export function drawColorBar(ctx, x, y, w, h, gradientStr) {
  if (w <= 0 || h <= 0) return;
  ctx.save?.();

  let drawnGradient = false;
  if (typeof ctx.createLinearGradient === "function" && gradientStr && typeof gradientStr === "string") {
    try {
      const grad = ctx.createLinearGradient(x, y, x + w, y);
      const inner = gradientStr.includes("(")
        ? gradientStr.slice(gradientStr.indexOf("(") + 1, gradientStr.lastIndexOf(")"))
        : gradientStr;
      const cleanInner = inner.replace(/^to\s+[a-z\s]+,\s*/i, "");

      const stopRegex = /(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)(?:\s+([\d.]+)%?)?(?:\s+([\d.]+)%?)?/g;
      const rawStops = [];
      let m;

      while ((m = stopRegex.exec(cleanInner)) !== null) {
        const color = m[1].trim();
        if (/^(to|right|left|top|bottom|deg)$/i.test(color)) continue;
        const pct1 = m[2] !== undefined ? parseFloat(m[2]) : null;
        const pct2 = m[3] !== undefined ? parseFloat(m[3]) : null;
        rawStops.push({ color, pct1, pct2 });
      }

      if (rawStops.length > 0) {
        if (rawStops.some((s) => s.pct1 !== null)) {
          for (const s of rawStops) {
            if (s.pct1 !== null) {
              const offset1 = Math.min(1, Math.max(0, s.pct1 / 100));
              grad.addColorStop(offset1, s.color);
            }
            if (s.pct2 !== null) {
              const offset2 = Math.min(1, Math.max(0, s.pct2 / 100));
              grad.addColorStop(offset2, s.color);
            }
          }
        } else {
          const n = rawStops.length;
          rawStops.forEach((s, idx) => {
            const offset = n === 1 ? 0 : idx / (n - 1);
            grad.addColorStop(offset, s.color);
          });
        }
        ctx.fillStyle = grad;
        if (typeof ctx.fillRect === "function") {
          ctx.fillRect(x, y, w, h);
          drawnGradient = true;
        }
      }
    } catch {}
  }

  if (!drawnGradient) {
    if (typeof ctx.createLinearGradient === "function") {
      try {
        const grad = ctx.createLinearGradient(x, y, x + w, y);
        grad.addColorStop(0, "#388bfd");
        grad.addColorStop(0.5, "#2ea043");
        grad.addColorStop(1, "#f85149");
        ctx.fillStyle = grad;
        ctx.fillRect?.(x, y, w, h);
        drawnGradient = true;
      } catch {}
    }
    if (!drawnGradient && typeof ctx.fillRect === "function") {
      ctx.fillStyle = "rgba(56, 139, 253, 0.6)";
      ctx.fillRect(x, y, w, h);
    }
  }

  if (typeof ctx.strokeRect === "function") {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  ctx.restore?.();
}

export function drawWindowHeaders(ctx, container, containerRect, scale, doc) {
  if (!ctx) return;
  const compW = ctx.canvas?.width || 800;
  const compH = ctx.canvas?.height || 600;

  let headers = container && typeof container.querySelectorAll === "function"
    ? Array.from(container.querySelectorAll(".win-header"))
    : [];

  if (headers.length === 0 && container?.classList?.contains?.("win-header")) {
    headers = [container];
  }

  if (headers.length === 0 && doc && typeof doc.querySelectorAll === "function") {
    headers = Array.from(doc.querySelectorAll(".window-panel.active .win-header, .win-header"));
  }

  headers = [...new Set(headers)].filter(Boolean);
  if (headers.length === 0) return;

  for (const header of headers) {
    try {
      if (header.classList?.contains?.("hidden") || header.style?.display === "none") {
        continue;
      }
      if (header.offsetParent === null && header.getBoundingClientRect?.()?.width === 0) {
        continue;
      }

      const badgeEl = header.querySelector?.(".win-badge");
      const titleEl = header.querySelector?.(".win-title");
      const badgeText = badgeEl?.textContent?.trim?.() || "";
      const titleText = titleEl?.textContent?.trim?.() || (!badgeEl ? header.textContent?.trim?.() : "");

      if (!badgeText && !titleText) continue;

      const hRect = typeof header.getBoundingClientRect === "function" ? header.getBoundingClientRect() : null;
      let hX, hY, hW, hH;

      if (hRect && hRect.width > 0 && hRect.height > 0 && containerRect && containerRect.width > 0) {
        hX = Math.round((hRect.left - containerRect.left) * scale);
        hY = Math.round((hRect.top - containerRect.top) * scale);
        hW = Math.round(hRect.width * scale);
        hH = Math.round(hRect.height * scale);
      } else {
        hW = Math.min(Math.round(260 * scale), Math.round(compW * 0.7));
        hH = Math.round(32 * scale);
        hX = Math.round((compW - hW) / 2);
        hY = Math.round(10 * scale);
      }

      if (hX < 0 || hX + hW > compW || hY < 0 || hY + hH > compH) {
        hW = Math.min(hW, Math.round(compW * 0.85));
        hH = Math.min(hH, Math.round(compH * 0.2));
        hX = Math.round((compW - hW) / 2);
        hY = Math.round(10 * scale);
      }

      ctx.save?.();

      ctx.fillStyle = "rgba(18, 24, 36, 0.88)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.lineWidth = Math.max(1, Math.round(1 * scale));
      drawRoundedRect(ctx, hX, hY, hW, hH, Math.round(hH / 2), true, true);

      let currentX = hX + Math.round(10 * scale);
      const centerY = hY + Math.round(hH / 2);

      if (badgeText) {
        const badgeFontSize = Math.round(11 * scale);
        ctx.font = `bold ${badgeFontSize}px monospace, sans-serif`;
        const textMetrics = typeof ctx.measureText === "function" ? ctx.measureText(badgeText) : { width: badgeText.length * 7 * scale };
        const badgeTextW = textMetrics?.width || (badgeText.length * 7 * scale);
        const badgeW = Math.round(badgeTextW + 12 * scale);
        const badgeH = Math.round(hH - 12 * scale);
        const badgeY = centerY - Math.round(badgeH / 2);

        ctx.fillStyle = "#1f6feb";
        drawRoundedRect(ctx, currentX, badgeY, badgeW, badgeH, Math.round(badgeH / 2), true, false);

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText?.(badgeText, currentX + Math.round(badgeW / 2), centerY);

        currentX += badgeW + Math.round(8 * scale);
      }

      if (titleText) {
        const titleFontSize = Math.round(13 * scale);
        ctx.font = `600 ${titleFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = "#f0f6fc";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const maxTitleW = hX + hW - currentX - Math.round(10 * scale);
        let displayTitle = titleText;
        if (maxTitleW > 20 && typeof ctx.measureText === "function") {
          while (displayTitle.length > 3 && ctx.measureText(displayTitle).width > maxTitleW) {
            displayTitle = displayTitle.slice(0, -2) + "…";
          }
        }
        ctx.fillText?.(displayTitle, currentX, centerY);
      }

      ctx.restore?.();
    } catch {}
  }
}

export function drawLegendOverlay(ctx, container, containerRect, scale, doc) {
  if (!ctx) return;
  const compW = ctx.canvas?.width || 800;
  const compH = ctx.canvas?.height || 600;

  const legendPanel = (container && typeof container.querySelector === "function" && (container.querySelector("#legend-panel") || container.querySelector("#legend") || container.querySelector(".legend-panel")))
    || (doc && typeof doc.querySelector === "function" && (doc.querySelector("#legend-panel") || doc.querySelector("#legend") || doc.querySelector(".legend-panel")));

  if (!legendPanel) return;

  if (legendPanel.classList?.contains?.("hidden") || legendPanel.style?.display === "none") {
    return;
  }
  if (legendPanel.offsetParent === null && legendPanel.getBoundingClientRect?.()?.width === 0) {
    return;
  }

  let itemEls = legendPanel.querySelectorAll ? Array.from(legendPanel.querySelectorAll(".legend-item")) : [];
  if (itemEls.length === 0 && (legendPanel.querySelector?.(".legend-bar") || legendPanel.querySelector?.(".legend-ticks"))) {
    itemEls = [legendPanel];
  }
  if (itemEls.length === 0) return;

  const lRect = typeof legendPanel.getBoundingClientRect === "function" ? legendPanel.getBoundingClientRect() : null;
  let lx, ly, lw, lh;

  const padX = Math.round(12 * scale);
  const padY = Math.round(8 * scale);
  const gap = Math.round(16 * scale);

  if (lRect && lRect.width > 0 && lRect.height > 0 && containerRect && containerRect.width > 0) {
    lx = Math.round((lRect.left - containerRect.left) * scale);
    ly = Math.round((lRect.top - containerRect.top) * scale);
    lw = Math.round(lRect.width * scale);
    lh = Math.round(lRect.height * scale);
  } else {
    const itemW = Math.round(200 * scale);
    lw = Math.min(Math.round(compW * 0.9), itemEls.length * itemW + (itemEls.length - 1) * gap + padX * 2);
    lh = Math.round(58 * scale);
    lx = Math.round((compW - lw) / 2);
    ly = Math.round(compH - lh - 16 * scale);
  }

  if (lx < 0 || lx + lw > compW || ly < 0 || ly + lh > compH) {
    lw = Math.min(lw, Math.round(compW * 0.9));
    lh = Math.min(lh, Math.round(compH * 0.3));
    lx = Math.round((compW - lw) / 2);
    ly = Math.round(compH - lh - 16 * scale);
  }

  ctx.save?.();

  ctx.fillStyle = "rgba(18, 24, 36, 0.88)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = Math.max(1, Math.round(1 * scale));
  drawRoundedRect(ctx, lx, ly, lw, lh, Math.round(6 * scale), true, true);

  const availableW = lw - padX * 2 - (itemEls.length - 1) * gap;
  const itemW = Math.max(Math.round(150 * scale), Math.floor(availableW / itemEls.length));

  for (let i = 0; i < itemEls.length; i++) {
    const itemEl = itemEls[i];
    const ix = lx + padX + i * (itemW + gap);
    const iy = ly + padY;

    const titleEl = itemEl.querySelector?.(".legend-title");
    const unitEl = itemEl.querySelector?.(".legend-unit");
    const timeEl = itemEl.querySelector?.(".legend-time-text") || itemEl.querySelector?.(".legend-time-badge");

    const titleText = titleEl?.textContent?.trim?.() || "";
    const unitText = unitEl?.textContent?.trim?.() || "";
    const timeText = timeEl?.textContent?.trim?.() || "";

    const headerY = iy + Math.round(8 * scale);
    if (titleText) {
      ctx.fillStyle = "#e6edf3";
      ctx.font = `600 ${Math.round(11 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      let fullTitle = titleText;
      if (timeText) fullTitle += `  ${timeText}`;
      ctx.fillText?.(fullTitle, ix, headerY);
    }

    if (unitText) {
      ctx.fillStyle = "#8b949e";
      ctx.font = `${Math.round(10 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText?.(unitText, ix + itemW, headerY);
    }

    const barEl = itemEl.querySelector?.(".legend-bar");
    const barY = headerY + Math.round(8 * scale);
    const barH = Math.round(10 * scale);
    const barW = itemW;
    const gradientStr = barEl?.style?.background || barEl?.style?.backgroundImage || barEl?.getAttribute?.("style") || "";

    drawColorBar(ctx, ix, barY, barW, barH, gradientStr);

    const ticksY = barY + barH;
    const tickEls = Array.from(itemEl.querySelectorAll?.(".legend-tick") || []);
    const parsedTicks = [];

    if (tickEls.length > 0) {
      for (let tIdx = 0; tIdx < tickEls.length; tIdx++) {
        const tEl = tickEls[tIdx];
        const styleStr = tEl.style?.left || tEl.getAttribute?.("style") || "";
        const m = String(styleStr).match(/([\d.]+)%/);
        const pct = m ? parseFloat(m[1]) : (tIdx / Math.max(1, tickEls.length - 1)) * 100;
        const lblEl = tEl.querySelector?.(".tick-label") || tEl;
        const label = lblEl?.textContent?.trim?.() || "";
        const isFirst = tEl.classList?.contains?.("tick-first") || tIdx === 0;
        const isLast = tEl.classList?.contains?.("tick-last") || tIdx === tickEls.length - 1;
        parsedTicks.push({ pct, label, isFirst, isLast });
      }
    } else {
      const spanEls = Array.from(itemEl.querySelectorAll?.(".legend-ticks span") || []);
      for (let sIdx = 0; sIdx < spanEls.length; sIdx++) {
        const sEl = spanEls[sIdx];
        const pct = spanEls.length > 1 ? (sIdx / (spanEls.length - 1)) * 100 : 50;
        const label = sEl.textContent?.trim?.() || "";
        parsedTicks.push({ pct, label, isFirst: sIdx === 0, isLast: sIdx === spanEls.length - 1 });
      }
    }

    if (parsedTicks.length > 0) {
      for (const tick of parsedTicks) {
        const tx = ix + Math.round((tick.pct / 100) * barW);

        ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath?.();
        ctx.moveTo?.(tx, ticksY);
        ctx.lineTo?.(tx, ticksY + Math.round(3 * scale));
        ctx.stroke?.();

        if (tick.label) {
          ctx.fillStyle = "#8b949e";
          ctx.font = `${Math.round(9.5 * scale)}px monospace, sans-serif`;
          ctx.textAlign = tick.isFirst ? "left" : (tick.isLast ? "right" : "center");
          ctx.textBaseline = "top";
          ctx.fillText?.(tick.label, tx, ticksY + Math.round(4 * scale));
        }
      }
    }
  }

  ctx.restore?.();
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

    // Sort canvases by z-index to composite layers in correct visual order
    const sortedCanvases = [...canvases].sort((a, b) => {
      try {
        const za = a.style?.zIndex || (typeof window !== "undefined" && window.getComputedStyle ? window.getComputedStyle(a)?.zIndex : 0);
        const zb = b.style?.zIndex || (typeof window !== "undefined" && window.getComputedStyle ? window.getComputedStyle(b)?.zIndex : 0);
        const pa = parseInt(za, 10);
        const pb = parseInt(zb, 10);
        return (isNaN(pa) ? 0 : pa) - (isNaN(pb) ? 0 : pb);
      } catch {
        return 0;
      }
    });

    const containerRect = container && typeof container.getBoundingClientRect === "function"
      ? container.getBoundingClientRect()
      : null;

    const hasValidRects = containerRect && containerRect.width > 0 && containerRect.height > 0 &&
      sortedCanvases.some((c) => typeof c.getBoundingClientRect === "function" && c.getBoundingClientRect()?.width > 0);

    const scale = (typeof window !== "undefined" && window.devicePixelRatio) ? Math.max(1, window.devicePixelRatio) : 1;
    let compW = 0;
    let compH = 0;

    if (hasValidRects) {
      compW = Math.round(containerRect.width * scale);
      compH = Math.round(containerRect.height * scale);
    } else {
      compW = Math.max(...sortedCanvases.map((c) => c.width || 800));
      compH = Math.max(...sortedCanvases.map((c) => c.height || 600));
    }

    const composite = typeof doc.createElement === "function" ? doc.createElement("canvas") : null;
    if (composite) {
      composite.width = compW;
      composite.height = compH;
    }
    const ctx = composite && typeof composite.getContext === "function" ? composite.getContext("2d") : null;

    let targetCanvas;
    if (ctx) {
      for (const c of sortedCanvases) {
        try {
          const cRect = typeof c.getBoundingClientRect === "function" ? c.getBoundingClientRect() : null;
          if (hasValidRects && cRect && cRect.width > 0 && cRect.height > 0) {
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

      try {
        drawWindowHeaders(ctx, container, containerRect, scale, doc);
      } catch {}

      try {
        drawLegendOverlay(ctx, container, containerRect, scale, doc);
      } catch {}

      targetCanvas = composite;
    } else if (sortedCanvases.length === 1) {
      targetCanvas = sortedCanvases[0];
    } else {
      notify("warning", "Failed to create 2D canvas context for screenshot");
      return false;
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

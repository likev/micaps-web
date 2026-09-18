// colormapStops.js - Colormap gradient preview and stop editor table
import { renderSwatchStrip, hexToRgb, rgbToHex } from "./swatchPicker.js";
import { escapeHtml } from "./formState.js";

/**
 * Computes a linear-gradient CSS string from a list of stops.
 */
export function stopsToCSSGradient(stops) {
  if (!Array.isArray(stops) || stops.length === 0) return "linear-gradient(to right, #888, #fff)";
  const min = stops[0].val;
  const max = stops[stops.length - 1].val;
  const span = max - min || 1;
  const parts = stops.map((s) => {
    const pct = Math.max(0, Math.min(100, Math.round(((s.val - min) / span) * 100)));
    const a = (s.color[3] !== undefined ? s.color[3] / 255 : 1).toFixed(2);
    return `rgba(${s.color[0]}, ${s.color[1]}, ${s.color[2]}, ${a}) ${pct}%`;
  });
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

/**
 * Mounts the colormap stop table and gradient preview into container.
 * @param {HTMLElement} container
 * @param {string} activeColormap
 * @param {Object} formState
 * @param {Function} onStopsMutated - callback when stops change
 * @returns {{ unmount: Function, update: Function }}
 */
export function mountColormapStops(container, activeColormap, formState, onStopsMutated) {
  if (!container || !activeColormap || !formState) {
    return { unmount: () => {}, update: () => {} };
  }

  let swatchCleanups = [];

  function cleanPickers() {
    swatchCleanups.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    swatchCleanups = [];
  }

  function getStops() {
    return formState.getDraft().colormaps?.[activeColormap] || [];
  }

  function updatePreview() {
    const stops = getStops();
    const bar = container.querySelector(".colormap-gradient-bar");
    const minLbl = container.querySelector(".gradient-val-label.min");
    const maxLbl = container.querySelector(".gradient-val-label.max");
    if (bar) bar.style.background = stopsToCSSGradient(stops);
    if (minLbl) minLbl.textContent = stops[0]?.val ?? "—";
    if (maxLbl) maxLbl.textContent = stops[stops.length - 1]?.val ?? "—";
  }

  function render() {
    cleanPickers();
    const stops = getStops();
    const gradientCSS = stopsToCSSGradient(stops);
    const minVal = stops[0]?.val ?? "—";
    const maxVal = stops[stops.length - 1]?.val ?? "—";
    const validation = formState.getValidation();
    const cmErrors = validation.colormapErrors?.get(activeColormap) || [];

    container.innerHTML = `
      <!-- Gradient Preview Bar -->
      <div class="colormap-gradient-card">
        <div class="colormap-gradient-bar" style="background: ${gradientCSS};"></div>
        <div class="colormap-gradient-labels">
          <span class="gradient-val-label min">${escapeHtml(minVal)}</span>
          <span class="gradient-hint-label">Live gradient preview (CSS interpolated)</span>
          <span class="gradient-val-label max">${escapeHtml(maxVal)}</span>
        </div>
      </div>

      ${
        cmErrors.length > 0
          ? `<div class="config-banner error" style="margin: 10px 0;">
              <strong>Validation Errors:</strong>
              <ul>${cmErrors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
            </div>`
          : ""
      }

      <div class="colormap-table-toolbar" style="display: flex; justify-content: space-between; align-items: center; margin: 12px 0 8px 0;">
        <span class="config-sublabel">${stops.length} color stops (sorted ascending by value)</span>
        <div style="display: flex; gap: 8px;">
          <button type="button" id="btn-sort-stops" class="btn" style="font-size: 11px;" title="Sort stops by value">Sort Stops</button>
          <button type="button" id="btn-reverse-ramp" class="btn" style="font-size: 11px;" title="Invert color direction">Reverse Colors</button>
          <button type="button" id="btn-add-stop" class="btn btn-primary" style="font-size: 11px;" title="Add a new color stop">+ Add Stop</button>
        </div>
      </div>

      <!-- Stop Table -->
      <div class="colormap-table-container">
        <table class="config-table colormap-table">
          <thead>
            <tr>
              <th style="width: 32px;">#</th>
              <th style="width: 110px;">Value</th>
              <th style="min-width: 240px;">Color (Swatches & Custom)</th>
              <th style="width: 140px;">Opacity / Alpha</th>
              <th style="width: 50px; text-align: center;">✕</th>
            </tr>
          </thead>
          <tbody id="colormap-stops-tbody">
            ${stops
              .map((stop, sIdx) => {
                const hex = rgbToHex(stop.color[0], stop.color[1], stop.color[2]);
                const alpha = stop.color[3] !== undefined ? stop.color[3] : 255;

                return `
              <tr data-stop-idx="${sIdx}">
                <td class="col-idx" style="color: var(--text-secondary, #8b949e); font-family: monospace;">${sIdx + 1}</td>
                <td>
                  <input
                    type="number"
                    step="any"
                    class="config-input input-stop-val"
                    data-idx="${sIdx}"
                    value="${stop.val}"
                    style="width: 90px; text-align: right;"
                  />
                </td>
                <td>
                  <div class="swatch-strip-cell-mount" data-idx="${sIdx}" data-hex="${hex}"></div>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value="${alpha}"
                      class="slider-stop-alpha"
                      data-idx="${sIdx}"
                      style="flex: 1;"
                    />
                    <input
                      type="number"
                      min="0"
                      max="255"
                      value="${alpha}"
                      class="config-input input-stop-alpha"
                      data-idx="${sIdx}"
                      style="width: 48px; text-align: right; padding: 2px 4px; font-size: 11px;"
                    />
                  </div>
                </td>
                <td style="text-align: center;">
                  <button
                    type="button"
                    class="btn-row-del btn-del-stop"
                    data-idx="${sIdx}"
                    ${stops.length <= 2 ? "disabled" : ""}
                    title="${stops.length <= 2 ? "Colormap must have at least 2 stops" : "Delete stop"}"
                  >✕</button>
                </td>
              </tr>
            `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    bindEvents();
    mountPickers();
  }

  function mountPickers() {
    const stops = getStops();
    container.querySelectorAll(".swatch-strip-cell-mount").forEach((mountEl) => {
      const idx = parseInt(mountEl.dataset.idx, 10);
      const hex = mountEl.dataset.hex;
      if (Number.isFinite(idx) && stops[idx]) {
        const picker = renderSwatchStrip(mountEl, {
          value: hex,
          compact: true,
          showRecent: false,
          showNative: true,
          onPick: (newHex) => {
            const [r, g, b] = hexToRgb(newHex);
            const currAlpha = stops[idx].color[3] !== undefined ? stops[idx].color[3] : 255;
            formState.updateDraft((d) => {
              if (d.colormaps?.[activeColormap]?.[idx]) {
                d.colormaps[activeColormap][idx].color = [r, g, b, currAlpha];
              }
            });
            updatePreview();
            onStopsMutated?.();
          },
        });
        swatchCleanups.push(() => picker.destroy());
      }
    });
  }

  function bindEvents() {
    // Value input
    container.querySelectorAll(".input-stop-val").forEach((inp) => {
      inp.addEventListener("change", (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const val = parseFloat(e.target.value);
        if (Number.isFinite(val)) {
          formState.updateDraft((d) => {
            if (d.colormaps?.[activeColormap]?.[idx]) {
              d.colormaps[activeColormap][idx].val = val;
            }
          });
          updatePreview();
          onStopsMutated?.();
        }
      });
    });

    // Alpha slider & input
    container.querySelectorAll(".slider-stop-alpha").forEach((slider) => {
      const idx = parseInt(slider.dataset.idx, 10);
      const partnerInput = container.querySelector(`.input-stop-alpha[data-idx="${idx}"]`);
      slider.addEventListener("input", (e) => {
        const a = parseInt(e.target.value, 10);
        if (partnerInput) partnerInput.value = a;
        formState.updateDraft((d) => {
          const stop = d.colormaps?.[activeColormap]?.[idx];
          if (stop && Array.isArray(stop.color)) {
            stop.color[3] = a;
          }
        });
        updatePreview();
        onStopsMutated?.();
      });
    });

    container.querySelectorAll(".input-stop-alpha").forEach((inp) => {
      const idx = parseInt(inp.dataset.idx, 10);
      const partnerSlider = container.querySelector(`.slider-stop-alpha[data-idx="${idx}"]`);
      inp.addEventListener("change", (e) => {
        const a = Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0));
        inp.value = a;
        if (partnerSlider) partnerSlider.value = a;
        formState.updateDraft((d) => {
          const stop = d.colormaps?.[activeColormap]?.[idx];
          if (stop && Array.isArray(stop.color)) {
            stop.color[3] = a;
          }
        });
        updatePreview();
        onStopsMutated?.();
      });
    });

    // Delete stop
    container.querySelectorAll(".btn-del-stop").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        formState.updateDraft((d) => {
          const list = d.colormaps?.[activeColormap];
          if (list && list.length > 2) {
            list.splice(idx, 1);
          }
        });
        render();
        onStopsMutated?.();
      });
    });

    // Add stop
    const btnAdd = container.querySelector("#btn-add-stop");
    btnAdd?.addEventListener("click", () => {
      formState.updateDraft((d) => {
        const list = d.colormaps?.[activeColormap];
        if (list) {
          const last = list[list.length - 1];
          const nextVal = last ? Math.round((last.val + 5) * 10) / 10 : 0;
          list.push({
            val: nextVal,
            color: [120, 160, 240, 255],
          });
        }
      });
      render();
      onStopsMutated?.();
    });

    // Sort stops
    const btnSort = container.querySelector("#btn-sort-stops");
    btnSort?.addEventListener("click", () => {
      formState.updateDraft((d) => {
        const list = d.colormaps?.[activeColormap];
        if (list) {
          list.sort((a, b) => a.val - b.val);
        }
      });
      render();
      onStopsMutated?.();
    });

    // Reverse colors
    const btnReverse = container.querySelector("#btn-reverse-ramp");
    btnReverse?.addEventListener("click", () => {
      formState.updateDraft((d) => {
        const list = d.colormaps?.[activeColormap];
        if (list && list.length >= 2) {
          const reversedColors = list.map((s) => [...s.color]).reverse();
          list.forEach((s, i) => {
            s.color = reversedColors[i];
          });
        }
      });
      render();
      onStopsMutated?.();
    });
  }

  render();

  return {
    unmount() {
      cleanPickers();
      container.innerHTML = "";
    },
    update() {
      render();
    },
  };
}

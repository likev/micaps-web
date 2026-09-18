// swatchPicker.js - Shared 20-swatch strip, recent colors, and custom picker component
import { MET_LINE_COLORS, getRecentColors, addRecentColor, getRecommendedLineColor } from "./colorPresets.js";
import { escapeHtml } from "./formState.js";

/**
 * Converts #rrggbb to [r, g, b].
 */
export function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return [255, 255, 255];
  const clean = hex.replace(/^#/, "");
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return [r, g, b];
  }
  return [255, 255, 255];
}

/**
 * Converts r, g, b numbers to #rrggbb.
 */
export function rgbToHex(r, g, b) {
  const toHex = (n) => {
    const clamped = Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
    return clamped.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Renders a friendly swatch picker strip inside container.
 * @param {HTMLElement} container
 * @param {Object} options
 * @param {string} options.value - Current hex color (e.g. "#58a6ff")
 * @param {Function} options.onPick - Callback (hex: string) => void
 * @param {boolean} [options.showRecent=true]
 * @param {boolean} [options.showNative=true]
 * @param {string} [options.elementHint] - Optional element (e.g. "HGT")
 * @param {boolean} [options.compact=false] - If true, displays compact swatches for table cells
 * @returns {{ update: (val: string) => void, destroy: () => void }}
 */
export function renderSwatchStrip(container, options = {}) {
  if (!container) return { update: () => {}, destroy: () => {} };

  let currentValue = (options.value || "#58a6ff").toLowerCase();
  const onPick = options.onPick || (() => {});
  const showRecent = options.showRecent !== false;
  const showNative = options.showNative !== false;
  const elementHint = options.elementHint || null;
  const compact = Boolean(options.compact);

  function render() {
    const recColor = elementHint ? getRecommendedLineColor(elementHint) : null;
    const recent = showRecent ? getRecentColors() : [];

    let html = `
      <div class="swatch-strip-root ${compact ? "compact" : ""}">
        <div class="swatch-controls-row">
          ${
            showNative
              ? `<input type="color" class="swatch-native-picker" value="${escapeHtml(currentValue)}" title="Custom color picker" />`
              : ""
          }
          <div class="swatch-preview-dot" style="background: ${escapeHtml(currentValue)};" title="${escapeHtml(currentValue)}"></div>
          ${
            recColor && recColor.toLowerCase() !== currentValue
              ? `<button type="button" class="swatch-hint-chip" title="Apply recommended color for ${escapeHtml(elementHint)}">
                  <span>${escapeHtml(elementHint)} →</span>
                  <span class="chip-color-dot" style="background: ${escapeHtml(recColor)};"></span>
                  <span>${escapeHtml(recColor)}</span>
                </button>`
              : ""
          }
        </div>

        <!-- 20 Recommended Swatches Grid -->
        <div class="swatch-grid" role="listbox" aria-label="Recommended meteorological colors">
          ${MET_LINE_COLORS.map(
            (swatch) => `
            <button
              type="button"
              class="swatch-btn ${swatch.hex.toLowerCase() === currentValue ? "active" : ""}"
              data-hex="${escapeHtml(swatch.hex)}"
              title="${escapeHtml(swatch.name)} (${escapeHtml(swatch.hex)}) — ${escapeHtml(swatch.use)}"
              style="background: ${escapeHtml(swatch.hex)};"
              role="option"
              aria-selected="${swatch.hex.toLowerCase() === currentValue ? "true" : "false"}"
            ></button>
          `
          ).join("")}
        </div>

        <!-- Recent Colors Strip -->
        ${
          recent.length > 0
            ? `
          <div class="swatch-recent-row">
            <span class="swatch-recent-label">Recent:</span>
            <div class="swatch-recent-grid">
              ${recent
                .map(
                  (hex) => `
                <button
                  type="button"
                  class="swatch-btn mini ${hex.toLowerCase() === currentValue ? "active" : ""}"
                  data-hex="${escapeHtml(hex)}"
                  title="Recent: ${escapeHtml(hex)}"
                  style="background: ${escapeHtml(hex)};"
                ></button>
              `
                )
                .join("")}
            </div>
          </div>
        `
            : ""
        }
      </div>
    `;

    container.innerHTML = html;
    bindEvents();
  }

  function handlePick(hex) {
    if (!hex) return;
    const lower = hex.toLowerCase();
    currentValue = lower;
    addRecentColor(lower);
    onPick(lower);
    render();
  }

  function bindEvents() {
    // Native picker
    const nativePicker = container.querySelector(".swatch-native-picker");
    if (nativePicker) {
      nativePicker.addEventListener("input", (e) => {
        handlePick(e.target.value);
      });
    }

    // Swatch buttons
    container.querySelectorAll(".swatch-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const hex = btn.dataset.hex;
        if (hex) handlePick(hex);
      });
    });

    // Hint chip
    const hintChip = container.querySelector(".swatch-hint-chip");
    if (hintChip && elementHint) {
      hintChip.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rec = getRecommendedLineColor(elementHint);
        if (rec) handlePick(rec);
      });
    }
  }

  render();

  return {
    update(newVal) {
      if (newVal && newVal.toLowerCase() !== currentValue) {
        currentValue = newVal.toLowerCase();
        render();
      }
    },
    destroy() {
      container.innerHTML = "";
    },
  };
}

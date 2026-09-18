// fullscreenControl.js - Floating fullscreen toggle button control for meteorological map canvas
export const ENTER_FULLSCREEN_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>`;

export const EXIT_FULLSCREEN_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path></svg>`;

/**
 * Checks whether the document is currently in fullscreen mode.
 * Supports standard and vendor-prefixed properties.
 *
 * @param {Document} [doc]
 * @returns {boolean}
 */
export function isFullscreen(doc = (typeof document !== "undefined" ? document : null)) {
  if (!doc) return false;
  return Boolean(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement
  );
}

/**
 * Requests fullscreen mode on the target element.
 *
 * @param {Element} [target]
 * @returns {Promise<boolean>}
 */
export async function enterFullscreen(target = (typeof document !== "undefined" ? document.documentElement : null)) {
  if (!target) return false;
  try {
    if (typeof target.requestFullscreen === "function") {
      await target.requestFullscreen();
      return true;
    } else if (typeof target.webkitRequestFullscreen === "function") {
      await target.webkitRequestFullscreen();
      return true;
    } else if (typeof target.mozRequestFullScreen === "function") {
      await target.mozRequestFullScreen();
      return true;
    } else if (typeof target.msRequestFullscreen === "function") {
      await target.msRequestFullscreen();
      return true;
    }
  } catch (err) {
    console.warn("[FullscreenControl] Failed to enter fullscreen:", err);
    return false;
  }
  return false;
}

/**
 * Exits fullscreen mode.
 *
 * @param {Document} [doc]
 * @returns {Promise<boolean>}
 */
export async function exitFullscreen(doc = (typeof document !== "undefined" ? document : null)) {
  if (!doc) return false;
  try {
    if (typeof doc.exitFullscreen === "function") {
      await doc.exitFullscreen();
      return true;
    } else if (typeof doc.webkitExitFullscreen === "function") {
      await doc.webkitExitFullscreen();
      return true;
    } else if (typeof doc.mozCancelFullScreen === "function") {
      await doc.mozCancelFullScreen();
      return true;
    } else if (typeof doc.msExitFullscreen === "function") {
      await doc.msExitFullscreen();
      return true;
    }
  } catch (err) {
    console.warn("[FullscreenControl] Failed to exit fullscreen:", err);
    return false;
  }
  return false;
}

/**
 * Toggles fullscreen mode.
 *
 * @param {Element} [target]
 * @param {Document} [doc]
 * @returns {Promise<boolean>}
 */
export async function toggleFullscreen(
  target = (typeof document !== "undefined" ? document.documentElement : null),
  doc = (typeof document !== "undefined" ? document : null)
) {
  if (isFullscreen(doc)) {
    return await exitFullscreen(doc);
  } else {
    return await enterFullscreen(target);
  }
}

/**
 * Updates button DOM attributes and SVG icon based on fullscreen state.
 *
 * @param {HTMLButtonElement} btn
 * @param {boolean} inFullscreen
 */
export function updateFullscreenButton(btn, inFullscreen) {
  if (!btn) return;
  if (inFullscreen) {
    btn.classList.add("is-fullscreen");
    btn.setAttribute("aria-pressed", "true");
    btn.setAttribute("title", "Exit Fullscreen");
    btn.setAttribute("aria-label", "Exit Fullscreen");
    btn.innerHTML = EXIT_FULLSCREEN_SVG;
  } else {
    btn.classList.remove("is-fullscreen");
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("title", "Toggle Fullscreen");
    btn.setAttribute("aria-label", "Toggle Fullscreen");
    btn.innerHTML = ENTER_FULLSCREEN_SVG;
  }
}

/**
 * Initializes the fullscreen toggle button control.
 *
 * @param {string} [buttonId="btn-fullscreen-toggle"]
 * @param {Object} [options={}]
 * @param {Document} [options.document]
 * @param {Element} [options.target]
 * @returns {Object|null} Control handle with toggle, sync, and destroy methods.
 */
export function initFullscreenControl(buttonId = "btn-fullscreen-toggle", options = {}) {
  const doc = options.document || (typeof document !== "undefined" ? document : null);
  if (!doc) return null;

  let btn = doc.getElementById(buttonId);
  if (!btn) {
    const parent = doc.getElementById("main-content") || doc.body;
    if (parent) {
      btn = doc.createElement("button");
      btn.id = buttonId;
      btn.className = "btn-fullscreen-toggle";
      btn.type = "button";
      parent.appendChild(btn);
    }
  }
  if (!btn) return null;

  const target = options.target || doc.documentElement;

  const syncState = () => {
    const inFs = isFullscreen(doc);
    updateFullscreenButton(btn, inFs);

    // Notify MapLibre canvases to update dimensions
    const winObj = (doc && doc.defaultView) || (typeof window !== "undefined" ? window : null);
    if (winObj && typeof winObj.dispatchEvent === "function") {
      try {
        winObj.dispatchEvent(new Event("resize"));
      } catch (_) {}
    }
  };

  // Sync initial state
  syncState();

  const handleClick = async (e) => {
    e?.preventDefault?.();
    await toggleFullscreen(target, doc);
    syncState();
  };

  btn.addEventListener("click", handleClick);

  const fsEvents = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"];
  const handleFsChange = () => {
    syncState();
  };

  fsEvents.forEach((evt) => {
    doc.addEventListener(evt, handleFsChange);
  });

  return {
    button: btn,
    toggle: () => toggleFullscreen(target, doc),
    sync: syncState,
    destroy() {
      btn.removeEventListener("click", handleClick);
      fsEvents.forEach((evt) => {
        doc.removeEventListener(evt, handleFsChange);
      });
    },
  };
}

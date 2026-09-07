// keyboardShortcuts.js - Global keyboard navigation for forecast periods, pressure levels, and split view

function isTextInput(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el.type || "text").toLowerCase();
    // Allow shortcuts when a checkbox or button-type input is focused
    return !["checkbox", "button", "submit", "reset"].includes(type);
  }
  // If user is editing in the config editor modal
  if (el.closest?.("#config-editor-panel")) {
    return true;
  }
  return false;
}

let lastKeyTime = 0;
const REPEAT_THROTTLE_MS = 150;

export function initKeyboardShortcuts({ onPeriodStep, onLevelStep, onToggleSplit }) {
  if (typeof window === "undefined") return;
  window.addEventListener(
    "keydown",
    async (e) => {
      if (isTextInput(e.target)) return;

      const isLeft = e.key === "ArrowLeft" || e.key === "Left" || e.code === "ArrowLeft";
      const isRight = e.key === "ArrowRight" || e.key === "Right" || e.code === "ArrowRight";
      const isUp = e.key === "ArrowUp" || e.key === "Up" || e.code === "ArrowUp";
      const isDown = e.key === "ArrowDown" || e.key === "Down" || e.code === "ArrowDown";
      const isSplit = e.key === "F4" || (e.altKey && (e.key === "s" || e.key === "S" || e.code === "KeyS"));

      if (!isLeft && !isRight && !isUp && !isDown && !isSplit) {
        return;
      }

      // Throttle key repeat to avoid overwhelming network and rendering pipelines
      if (e.repeat) {
        const now = Date.now();
        if (now - lastKeyTime < REPEAT_THROTTLE_MS) {
          e.preventDefault();
          return;
        }
      }
      lastKeyTime = Date.now();

      if (isLeft) {
        e.preventDefault();
        await onPeriodStep?.(-1);
      } else if (isRight) {
        e.preventDefault();
        await onPeriodStep?.(1);
      } else if (isUp) {
        e.preventDefault();
        await onLevelStep?.(1);
      } else if (isDown) {
        e.preventDefault();
        await onLevelStep?.(-1);
      } else if (isSplit) {
        e.preventDefault();
        onToggleSplit?.();
      }
    },
    { capture: true }
  );
}

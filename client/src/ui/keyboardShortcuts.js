// keyboardShortcuts.js - Global keyboard navigation for forecast periods, pressure levels, and split view
export function initKeyboardShortcuts({ onPeriodStep, onLevelStep, onToggleSplit }) {
  window.addEventListener("keydown", async (e) => {
    const tag = e.target && e.target.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    if (e.target?.isContentEditable) return;
    if (e.repeat) return;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      await onPeriodStep?.(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      await onPeriodStep?.(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      await onLevelStep?.(1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      await onLevelStep?.(-1);
    } else if (e.key === "F4" || (e.altKey && (e.key === "s" || e.key === "S"))) {
      e.preventDefault();
      onToggleSplit?.();
    }
  });
}

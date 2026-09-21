// keyboardShortcuts.js - Svelte action and helper for global/scoped keyboard navigation

export function isTextInput(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el.type || "text").toLowerCase();
    return !["checkbox", "button", "submit", "reset"].includes(type);
  }
  if (el.closest?.(".config-editor-modal") || el.closest?.("#config-editor-panel")) {
    return true;
  }
  return false;
}

export function keyboardShortcuts(node, options = {}) {
  let opts = options || {};
  let lastKeyTime = 0;
  const REPEAT_THROTTLE_MS = 150;

  const handleKeyDown = async (e) => {
    if (isTextInput(e.target)) return;

    const isLeft = e.key === "ArrowLeft" || e.key === "Left" || e.code === "ArrowLeft";
    const isRight = e.key === "ArrowRight" || e.key === "Right" || e.code === "ArrowRight";
    const isUp = e.key === "ArrowUp" || e.key === "Up" || e.code === "ArrowUp";
    const isDown = e.key === "ArrowDown" || e.key === "Down" || e.code === "ArrowDown";
    const isSplit = e.key === "F4" || (e.altKey && (e.key === "s" || e.key === "S" || e.code === "KeyS"));
    const isSpace = e.code === "Space" || e.key === " " || e.key === "Spacebar";
    const isEsc = e.key === "Escape" || e.key === "Esc";

    if (!isLeft && !isRight && !isUp && !isDown && !isSplit && !isSpace && !isEsc) {
      return;
    }

    if (isSpace && (e.target?.id === "sl-btn-play" || e.target?.tagName === "BUTTON")) {
      return;
    }

    if (e.repeat) {
      const now = Date.now();
      if (now - lastKeyTime < REPEAT_THROTTLE_MS) {
        e.preventDefault();
        return;
      }
    }
    lastKeyTime = Date.now();

    if (isEsc) {
      opts.onEscape?.(e);
    } else if (isSpace) {
      e.preventDefault();
      opts.onTogglePlay?.(e);
    } else if (isLeft) {
      e.preventDefault();
      await opts.onPeriodStep?.(-1, e);
    } else if (isRight) {
      e.preventDefault();
      await opts.onPeriodStep?.(1, e);
    } else if (isUp) {
      e.preventDefault();
      await opts.onLevelStep?.(1, e);
    } else if (isDown) {
      e.preventDefault();
      await opts.onLevelStep?.(-1, e);
    } else if (isSplit) {
      e.preventDefault();
      opts.onToggleSplit?.(e);
    }
  };

  const target = node || (typeof window !== "undefined" ? window : null);
  if (target) {
    target.addEventListener("keydown", handleKeyDown, { capture: true });
  }

  return {
    destroy() {
      if (target) {
        target.removeEventListener("keydown", handleKeyDown, { capture: true });
      }
    },
    update(newOptions) {
      opts = newOptions || {};
    },
  };
}

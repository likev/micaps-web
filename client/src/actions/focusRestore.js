// focusRestore.js - Svelte action for restoring focus upon unmount
export function focusRestore(node, options = {}) {
  const previousActiveElement = typeof document !== "undefined" ? document.activeElement : null;
  const autofocus = options?.autofocus ?? true;

  if (autofocus && node) {
    const focusable = node.querySelector?.("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (focusable && typeof focusable.focus === "function") {
      requestAnimationFrame(() => {
        focusable.focus();
      });
    }
  }

  return {
    destroy() {
      if (previousActiveElement && typeof previousActiveElement.focus === "function" && document.body.contains(previousActiveElement)) {
        previousActiveElement.focus();
      }
    },
  };
}

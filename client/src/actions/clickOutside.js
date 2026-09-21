// clickOutside.js - Svelte action for outside click dismissal
export function clickOutside(node, params = {}) {
  let onOutside = typeof params === "function" ? params : params?.onOutside;
  let exclude = params?.exclude || [];

  const handleClick = (event) => {
    const target = event.target;
    if (node && !node.contains(target)) {
      for (const el of exclude) {
        if (typeof el === "string") {
          const match = document.querySelector(el);
          if (match && match.contains(target)) return;
        } else if (el && el.contains && el.contains(target)) {
          return;
        }
      }
      if (typeof onOutside === "function") {
        onOutside(event);
      }
    }
  };

  document.addEventListener("pointerdown", handleClick, true);

  return {
    destroy() {
      document.removeEventListener("pointerdown", handleClick, true);
    },
    update(newParams) {
      onOutside = typeof newParams === "function" ? newParams : newParams?.onOutside;
      exclude = newParams?.exclude || [];
    },
  };
}

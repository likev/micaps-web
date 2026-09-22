// navBar.js - Live value-sync helpers for the Svelte top header bar.
//
// The Svelte component (components/NavBar.svelte) owns all navbar DOM and
// derives options reactively; the legacy full-DOM builder (initNavBar),
// status poller, and preset rewriter were removed with it. What remains are
// tiny value syncs services call after loads — plain property sets, no
// structural writes, so they cannot fight Svelte reconciliation.

export function setNavBarLevel(level) {
  if (typeof document === "undefined") return;
  const select = document.getElementById("select-nav-level");
  if (!select) return;
  const strVal = level !== null && level !== undefined && level !== "" ? String(level) : "";
  if (select.value !== strVal) {
    select.value = strVal;
  }
}

export function setNavBarPreset(groupId) {
  if (typeof document === "undefined") return;
  const select = document.getElementById("select-preset");
  if (select) {
    select.value = groupId || "";
    const btn = document.getElementById("btn-load-data");
    if (btn) btn.disabled = !select.value;
  }
}

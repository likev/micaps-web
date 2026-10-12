// svelteRunesPolyfill.js - Mock Svelte 5 runes for headless test environments importing .svelte.js
if (typeof globalThis.$state === "undefined") {
  globalThis.$state = (initial) => initial;
  globalThis.$state.raw = (initial) => initial;
}
if (typeof globalThis.$derived === "undefined") {
  globalThis.$derived = (fnOrVal) => (typeof fnOrVal === "function" ? fnOrVal() : fnOrVal);
  globalThis.$derived.by = (fn) => (typeof fn === "function" ? fn() : fn);
}
if (typeof globalThis.$effect === "undefined") {
  globalThis.$effect = (fn) => {};
  globalThis.$effect.root = (fn) => fn();
}

// Polyfill localStorage if absent
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

// Polyfill document.documentElement if absent
if (typeof globalThis.document === "undefined") {
  globalThis.document = {};
}
if (!globalThis.document.documentElement) {
  const attrs = new Map();
  globalThis.document.documentElement = {
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) || null,
  };
}

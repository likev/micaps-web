// proxy-sync.test.js - Map sync under faithful Svelte $state identity semantics.
//
// Production topology: App.svelte holds a $state proxy of the core store and
// passes PROXY windows to registerWindowMapSync, while windowMaps.js reads
// the RAW core store. Proxy !== raw under ===/includes, so identity must be
// by stable win.id. This harness models that with real ES Proxies (cached
// wrappers, write-through) plus MapLibre-faithful synchronous move events
// from jumpTo, including re-entrancy convergence (no ping-pong storms).
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { registerWindowMapSync } from "../src/ui/tabs/windowMaps.js";
import { tabsState, createDefaultTab, createDefaultWindow } from "../src/lib/stores/tabsCore.js";

// Minimal deep-proxy with Svelte-$state-like identity semantics: stable
// cached wrappers per target, reads/writes through to the shared target.
function deepProxy(target, cache = new Map()) {
  if (target === null || typeof target !== "object") return target;
  if (cache.has(target)) return cache.get(target);
  const p = new Proxy(target, {
    get(t, k, r) {
      if (k === "__isProxy") return true;
      return deepProxy(Reflect.get(t, k, r), cache);
    },
    set(t, k, v) {
      return Reflect.set(t, k, v);
    },
    has(t, k) {
      return Reflect.has(t, k);
    },
    ownKeys(t) {
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, k) {
      const d = Reflect.getOwnPropertyDescriptor(t, k);
      if (d) d.configurable = true;
      return d;
    },
  });
  cache.set(target, p);
  return p;
}

// MapLibre-faithful mock: jumpTo applies the camera AND fires move
// listeners synchronously (real jumpTo is synchronous).
function makeMap(center = [0, 0], zoom = 1) {
  const listeners = { move: [] };
  const st = { center: [...center], zoom, pitch: 0, bearing: 0, jumps: 0 };
  return {
    _st: st,
    isStyleLoaded: () => true,
    getCenter: () => [...st.center],
    getZoom: () => st.zoom,
    getPitch: () => st.pitch,
    getBearing: () => st.bearing,
    jumpTo(opts) {
      st.jumps++;
      if (opts.center) st.center = [...opts.center];
      if (opts.zoom !== undefined) st.zoom = opts.zoom;
      if (opts.pitch !== undefined) st.pitch = opts.pitch;
      if (opts.bearing !== undefined) st.bearing = opts.bearing;
      [...listeners.move].forEach((fn) => fn());
    },
    on: (ev, cb) => { if (ev === "move") listeners.move.push(cb); },
    off: (ev, cb) => { if (ev === "move") listeners.move.splice(listeners.move.indexOf(cb), 1); },
    fireUserMove(center, zoom) {
      st.center = [...center];
      st.zoom = zoom;
      [...listeners.move].forEach((fn) => fn());
    },
  };
}

describe("Map sync under Svelte proxy identity + sync MapLibre events", () => {
  let cleanups = [];

  beforeEach(() => {
    cleanups = [];
    const testTab = createDefaultTab(1);
    testTab.layout = "1x2";
    testTab.syncMap = true;
    testTab.activeWinIdx = 0;
    const win1 = createDefaultWindow(1, 1);
    testTab.windows.push(win1);
    tabsState.tabs = [testTab];
    tabsState.activeTabId = 1;
    tabsState.syncingTabs.clear();
  });

  afterEach(() => {
    cleanups.forEach((fn) => { try { fn(); } catch {} });
    tabsState.syncingTabs.clear();
  });

  it("syncs a user drag across split maps registered via proxies", async () => {
    const proxied = deepProxy(tabsState);
    const activeTab = proxied.tabs.find((t) => t.id === proxied.activeTabId);
    const win0p = activeTab.windows[0];
    const win1p = activeTab.windows[1];
    // Sanity: harness really models the mismatch (proxy !== raw).
    expect(win0p === tabsState.tabs[0].windows[0]).toBe(false);
    expect(win0p.id).toBe(tabsState.tabs[0].windows[0].id);

    const mapA = makeMap([116.4, 39.9], 4);
    const mapB = makeMap([0, 0], 1);
    // Production assigns win.map in handleMapCreated; the sync engine reads it.
    tabsState.tabs[0].windows[0].map = mapA;
    tabsState.tabs[0].windows[1].map = mapB;
    cleanups.push(registerWindowMapSync(win0p, mapA));
    cleanups.push(registerWindowMapSync(win1p, mapB));

    mapA.fireUserMove([121.5, 31.2], 6);
    await new Promise((r) => setTimeout(r, 80));

    expect(mapB._st.center).toEqual([121.5, 31.2]);
    expect(mapB._st.zoom).toBe(6);
  });

  it("converges without ping-pong storms on continuous drags", async () => {
    const proxied = deepProxy(tabsState);
    const activeTab = proxied.tabs.find((t) => t.id === proxied.activeTabId);
    const mapA = makeMap([116.4, 39.9], 4);
    const mapB = makeMap([0, 0], 1);
    tabsState.tabs[0].windows[0].map = mapA;
    tabsState.tabs[0].windows[1].map = mapB;
    cleanups.push(registerWindowMapSync(activeTab.windows[0], mapA));
    cleanups.push(registerWindowMapSync(activeTab.windows[1], mapB));

    for (let i = 0; i < 10; i++) {
      mapA.fireUserMove([110 + i, 30 + i], 4);
    }
    await new Promise((r) => setTimeout(r, 150));

    expect(mapB._st.center).toEqual([119, 39]);
    expect(mapB._st.zoom).toBe(4);
    // Bounded fan-out: ~1 jumpTo per drag frame + final settle, not a storm.
    expect(mapA._st.jumps + mapB._st.jumps).toBeLessThan(40);
  });

  it("does not sync when syncMap is false, even via proxies", async () => {
    const proxied = deepProxy(tabsState);
    proxied.tabs[0].syncMap = false;
    const activeTab = proxied.tabs.find((t) => t.id === proxied.activeTabId);
    const mapA = makeMap([116.4, 39.9], 4);
    const mapB = makeMap([0, 0], 1);
    tabsState.tabs[0].windows[0].map = mapA;
    tabsState.tabs[0].windows[1].map = mapB;
    cleanups.push(registerWindowMapSync(activeTab.windows[0], mapA));
    cleanups.push(registerWindowMapSync(activeTab.windows[1], mapB));

    mapA.fireUserMove([100, 30], 5);
    await new Promise((r) => setTimeout(r, 80));

    expect(mapB._st.center).toEqual([0, 0]);
  });
});

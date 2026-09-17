// mockMap.js - Unified headless MapLibre GL mock for unit tests

export function createMockMap(options = {}) {
  const sources = new Map();
  const layers = new Map();
  const eventListeners = new Map();
  const children = [];

  const defaultBounds = options.bounds || {
    west: 70,
    east: 140,
    south: 15,
    north: 55,
  };

  const container = {
    children,
    querySelector: (sel) => {
      const cls = sel.startsWith(".") ? sel.slice(1) : sel;
      return children.find((c) => c.className === cls || c.tagName === sel.toUpperCase()) || null;
    },
    appendChild: (el) => {
      children.push(el);
      el.parentNode = container;
      return el;
    },
    removeChild: (el) => {
      const idx = children.indexOf(el);
      if (idx !== -1) children.splice(idx, 1);
      el.parentNode = null;
      return el;
    },
    getBoundingClientRect: () => ({ width: 1000, height: 700, left: 0, top: 0 }),
    isConnected: true,
  };

  const mapCanvas = { style: { cursor: "" } };

  const map = {
    sources,
    layers,
    eventListeners,
    container,
    _listeners: eventListeners,
    isStyleLoaded: () => true,
    loaded: () => true,
    addSource: (id, src) => sources.set(id, { ...src, _data: src.data }),
    getSource: (id) => {
      const src = sources.get(id);
      if (!src) return null;
      return {
        ...src,
        setData: (d) => {
          src.data = d;
          src._data = d;
        },
      };
    },
    removeSource: (id) => sources.delete(id),
    addLayer: (layer) => layers.set(layer.id, { ...layer }),
    getLayer: (id) => layers.get(id) || null,
    removeLayer: (id) => layers.delete(id),
    setLayoutProperty: (id, prop, val) => {
      const l = layers.get(id);
      if (l) {
        if (!l.layout) l.layout = {};
        l.layout[prop] = val;
      }
    },
    setPaintProperty: (id, prop, val) => {
      const l = layers.get(id);
      if (l) {
        if (!l.paint) l.paint = {};
        l.paint[prop] = val;
      }
    },
    getBounds: () => ({
      getWest: () => defaultBounds.west,
      getEast: () => defaultBounds.east,
      getSouth: () => defaultBounds.south,
      getNorth: () => defaultBounds.north,
      toArray: () => [
        [defaultBounds.west, defaultBounds.south],
        [defaultBounds.east, defaultBounds.north],
      ],
    }),
    getZoom: () => (options.zoom !== undefined ? options.zoom : 5.5),
    project: ([lon, lat]) => ({
      x: (lon - defaultBounds.west) * 10,
      y: (defaultBounds.north - lat) * 10,
    }),
    unproject: ([x, y]) => ({
      lng: defaultBounds.west + x / 10,
      lat: defaultBounds.north - y / 10,
    }),
    on: (evt, handler) => {
      if (!eventListeners.has(evt)) eventListeners.set(evt, []);
      eventListeners.get(evt).push(handler);
    },
    off: (evt, handler) => {
      if (!eventListeners.has(evt)) return;
      if (!handler) {
        eventListeners.delete(evt);
        return;
      }
      const list = eventListeners.get(evt).filter((h) => h !== handler);
      eventListeners.set(evt, list);
    },
    once: (evt, handler) => {
      const wrapper = (...args) => {
        map.off(evt, wrapper);
        handler(...args);
      };
      map.on(evt, wrapper);
    },
    fire: (evt, data = {}) => {
      const handlers = eventListeners.get(evt) || [];
      handlers.forEach((h) => h(data));
    },
    trigger: (evt, data = {}) => map.fire(evt, data),
    getContainer: () => container,
    getCanvas: () => mapCanvas,
  };

  return map;
}

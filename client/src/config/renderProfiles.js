// renderProfiles.js - Shared render-option profiles for config.json.
//
// config.json keeps a top-level `renderProfiles` map ({ name: renderOptions }).
// A layer may reference one via `renderRef`; its own `render` then only stores the
// keys that differ from the profile. The client expands this at load time (so the
// rest of the app always sees complete `layer.render` objects) and re-compacts it
// before saving.

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function eachLayer(config, fn) {
  const groups = Array.isArray(config) ? config : config?.presets;
  if (!Array.isArray(groups)) return;
  for (const group of groups) {
    if (!group || !Array.isArray(group.layers)) continue;
    for (const layer of group.layers) {
      if (layer && typeof layer === "object") fn(layer);
    }
  }
}

/** Merge each layer's referenced profile into layer.render (in place). */
export function expandRenderProfiles(config) {
  const profiles = isPlainObject(config) ? config.renderProfiles : null;
  if (!isPlainObject(profiles)) return config;
  eachLayer(config, (layer) => {
    const profile = layer.renderRef ? profiles[layer.renderRef] : null;
    if (!isPlainObject(profile)) return;
    const own = isPlainObject(layer.render) ? layer.render : {};
    layer.render = { ...JSON.parse(JSON.stringify(profile)), ...own };
  });
  return config;
}

/**
 * Produce a serializable copy of `config` for persistence:
 *  - `colormaps` is dropped (stored in colormaps.json)
 *  - render keys equal to the referenced profile are omitted
 */
export function compactConfigForSave(config) {
  if (!isPlainObject(config)) return config;
  const copy = JSON.parse(JSON.stringify(config));
  delete copy.colormaps;
  const profiles = isPlainObject(copy.renderProfiles) ? copy.renderProfiles : {};
  eachLayer(copy, (layer) => {
    if (!layer.renderRef) return;
    const profile = profiles[layer.renderRef];
    if (!isPlainObject(profile)) {
      delete layer.renderRef;
      return;
    }
    const own = isPlainObject(layer.render) ? layer.render : {};
    const diff = {};
    for (const [k, v] of Object.entries(own)) {
      if (!(k in profile) || !sameValue(profile[k], v)) diff[k] = v;
    }
    // A key removed from layer.render but present in the profile cannot be
    // expressed as an override, so fall back to the full render in that case.
    const dropped = Object.keys(profile).some((k) => !(k in own));
    if (dropped) {
      delete layer.renderRef;
      layer.render = own;
    } else if (Object.keys(diff).length > 0) {
      layer.render = diff;
    } else {
      delete layer.render;
    }
  });
  return copy;
}

/**
 * Build shared profiles from fully expanded layer renders (used by the generator
 * script). Mutates `config`: sets `renderProfiles`, `renderRef`, and shrinks
 * each layer.render. Idempotent: existing profiles are expanded first.
 */
export function buildRenderProfiles(config, { minLayers = 2, refCost = 24 } = {}) {
  expandRenderProfiles(config);
  eachLayer(config, (l) => { delete l.renderRef; });
  delete config.renderProfiles;

  const byType = new Map();
  eachLayer(config, (layer) => {
    if (!isPlainObject(layer.render) || Object.keys(layer.render).length === 0) return;
    const t = layer.type || "";
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(layer);
  });

  const size = (o) => JSON.stringify(o).length;
  const contains = (render, prof) =>
    Object.entries(prof).every(([k, v]) => k in render && sameValue(render[k], v));
  const intersect = (a, b) => {
    const out = {};
    for (const [k, v] of Object.entries(a)) if (k in b && sameValue(b[k], v)) out[k] = v;
    return out;
  };

  const profiles = {};
  for (const [type, layers] of byType) {
    let pool = layers.slice();
    let n = 0;
    for (;;) {
      const cands = new Map();
      const add = (o) => { if (Object.keys(o).length) cands.set(JSON.stringify(o), o); };
      const uniq = [...new Map(pool.map((l) => [JSON.stringify(l.render), l.render])).values()];
      for (const r of uniq) add(r);
      for (let i = 0; i < uniq.length; i++)
        for (let j = i + 1; j < uniq.length; j++) add(intersect(uniq[i], uniq[j]));
      let best = null;
      let bestGain = 0;
      for (const c of cands.values()) {
        const users = pool.filter((l) => contains(l.render, c));
        if (users.length < minLayers) continue;
        const gain = users.length * (size(c) - refCost) - (size(c) + type.length + 8);
        if (gain > bestGain) { bestGain = gain; best = { c, users }; }
      }
      if (!best) break;
      const name = `${type || "layer"}-${++n}`;
      profiles[name] = best.c;
      for (const l of best.users) {
        l.renderRef = name;
        const rest = {};
        for (const [k, v] of Object.entries(l.render)) {
          if (!(k in best.c)) rest[k] = v;
        }
        if (Object.keys(rest).length) l.render = rest; else delete l.render;
      }
      pool = pool.filter((l) => !l.renderRef);
    }
  }
  config.renderProfiles = profiles;
  return config;
}

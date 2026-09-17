// layerSnapshots.js - Snapshot and restore helpers for window layer state across level/time changes

export function snapshotWindowLayers(win, layers) {
  if (!win || !Array.isArray(layers)) return null;
  const snapshots = layers.map((l) => ({
    id: l.id,
    type: l.type,
    element: l.element,
    model: l.model,
    level: l.level,
    visible: l.visible !== false,
    config: { ...(l.config || {}) },
    derivedFrom: l.derivedFrom,
    isRaster: Boolean(l.isRaster),
  }));
  win.layerSnapshots = snapshots;
  return snapshots;
}

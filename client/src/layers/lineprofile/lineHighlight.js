// lineHighlight.js - Amber A->B overlay + draw preview (ids lp-line-*, no th-* collision)
const SOURCE_ID = "lp-line-source";
const HALO_LAYER_ID = "lp-line-halo";
const LINE_LAYER_ID = "lp-line-line";
const A_LAYER_ID = "lp-line-a";
const B_LAYER_ID = "lp-line-b";
const PENDING_SOURCE_ID = "lp-line-pending";
const PREVIEW_SOURCE_ID = "lp-line-preview";

function ensureSource(map, id, data) {
  const existing = map.getSource(id);
  if (existing && typeof existing.setData === "function") {
    existing.setData(data);
    return;
  }
  map.addSource(id, { type: "geojson", data });
}

function ensureCircleLayer(map, id, source, paint, filter = null) {
  if (!map.getLayer(id)) {
    map.addLayer({ id, type: "circle", source, ...(filter ? { filter } : {}), paint });
  }
}

export function showLineHighlight(map, a, b) {
  if (!map || typeof map.getSource !== "function" || !a || !b) return;
  ensureSource(map, SOURCE_ID, {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "LineString", coordinates: [[a.lon, a.lat], [b.lon, b.lat]] }, properties: { kind: "lp-line" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [a.lon, a.lat] }, properties: { kind: "lp-a" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [b.lon, b.lat] }, properties: { kind: "lp-b" } },
    ],
  });
  if (!map.getLayer(HALO_LAYER_ID)) {
    map.addLayer({
      id: HALO_LAYER_ID, type: "line", source: SOURCE_ID,
      filter: ["==", ["get", "kind"], "lp-line"],
      paint: { "line-color": "rgba(227,179,65,0.30)", "line-width": 9 },
    });
  }
  if (!map.getLayer(LINE_LAYER_ID)) {
    map.addLayer({
      id: LINE_LAYER_ID, type: "line", source: SOURCE_ID,
      filter: ["==", ["get", "kind"], "lp-line"],
      paint: { "line-color": "#e3b341", "line-width": 2.5, "line-dasharray": [1, 0] },
    });
  }
  ensureCircleLayer(map, A_LAYER_ID, SOURCE_ID, {
    "circle-radius": 6, "circle-color": "#e3b341", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff",
  }, ["==", ["get", "kind"], "lp-a"]);
  ensureCircleLayer(map, B_LAYER_ID, SOURCE_ID, {
    "circle-radius": 6, "circle-color": "#e3b341", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff",
  }, ["==", ["get", "kind"], "lp-b"]);
  // Idempotent re-show fallback for maps that dropped filters:
  try {
    if (map.getLayer(A_LAYER_ID) && !map.getLayer(A_LAYER_ID).filter) {
      map.setFilter?.(A_LAYER_ID, ["==", ["get", "kind"], "lp-a"]);
    }
    if (map.getLayer(B_LAYER_ID) && !map.getLayer(B_LAYER_ID).filter) {
      map.setFilter?.(B_LAYER_ID, ["==", ["get", "kind"], "lp-b"]);
    }
  } catch { /* mock maps may lack setFilter */ }
}

export function showPendingA(map, a) {
  if (!map || typeof map.getSource !== "function" || !a) return;
  ensureSource(map, PENDING_SOURCE_ID, {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "Point", coordinates: [a.lon, a.lat] }, properties: {} }],
  });
  ensureCircleLayer(map, PENDING_SOURCE_ID, PENDING_SOURCE_ID, {
    "circle-radius": 6, "circle-color": "#e3b341", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff",
  });
}

export function showPreviewLine(map, a, cursor) {
  if (!map || typeof map.getSource !== "function" || !a || !cursor) return;
  ensureSource(map, PREVIEW_SOURCE_ID, {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[a.lon, a.lat], [cursor.lon, cursor.lat]] }, properties: {} }],
  });
  if (!map.getLayer(PREVIEW_SOURCE_ID)) {
    map.addLayer({
      id: PREVIEW_SOURCE_ID, type: "line", source: PREVIEW_SOURCE_ID,
      paint: { "line-color": "#e3b341", "line-width": 2, "line-dasharray": [4, 3] },
    });
  }
}

export function removePreview(map) {
  if (!map || typeof map.removeLayer !== "function") return;
  if (map.getLayer(PREVIEW_SOURCE_ID)) map.removeLayer(PREVIEW_SOURCE_ID);
  if (map.getSource(PREVIEW_SOURCE_ID)) map.removeSource(PREVIEW_SOURCE_ID);
  if (map.getLayer(PENDING_SOURCE_ID)) map.removeLayer(PENDING_SOURCE_ID);
  if (map.getSource(PENDING_SOURCE_ID)) map.removeSource(PENDING_SOURCE_ID);
}

export function removeLineHighlight(map = null) {
  if (!map || typeof map.removeLayer !== "function") return;
  for (const id of [HALO_LAYER_ID, LINE_LAYER_ID, A_LAYER_ID, B_LAYER_ID]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  removePreview(map);
}

export function setLineHighlightVisible(map = null, visible = true) {
  if (!map || typeof map.getLayer !== "function") return;
  const val = visible ? "visible" : "none";
  for (const id of [HALO_LAYER_ID, LINE_LAYER_ID, A_LAYER_ID, B_LAYER_ID]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", val);
  }
}

// visibilityActions.js - Layer visibility toggle handling
import {
  setLayerIsobandVisibility,
  setLayerIsolineVisibility,
  getLayerDOMIds,
} from "../../layers/contourLayer.js";
import { setStationVisibility } from "../../layers/stationLayer.js";
import { setRasterVisibility, getRasterDOMIds } from "../../layers/rasterLayer.js";
import { stopWindAnimation, removeGridWindBarbs } from "../../layers/windLayer.js";
import {
  getSourceFeatures,
  triggerIsobandOverlay,
  triggerRasterOverlay,
  triggerWindStreamlines,
  triggerWindBarbs,
  triggerStationStreamlines,
} from "../../services/overlayTriggers.js";
import { syncLegendForLayer } from "./legendSync.js";
import { getLayerById } from "./layerStore.js";

export function handleVisibilityAction(map, layerId, value, layer, winObj) {
  if (!layer) return;

  // The Svelte layer panel works with a reactive copy of the core layer list.
  // Keep the live object and the canonical window store in sync before the
  // panel is refreshed; otherwise syncLayersState() restores the old value
  // and the next eye click repeats the hide action instead of showing it.
  const isVisible = Boolean(value);
  layer.visible = isVisible;
  if (layerId && winObj) {
    try {
      const canonical = getLayerById(layerId, winObj);
      if (canonical && canonical !== layer) canonical.visible = isVisible;
    } catch { /* best-effort store synchronization */ }

    for (const snapshots of [winObj.layerSnapshots, winObj.derivedContourSnapshots]) {
      if (!Array.isArray(snapshots)) continue;
      const snapshot = snapshots.find((entry) => entry?.id === layerId);
      if (snapshot) snapshot.visible = isVisible;
    }
  }

  if (layer.type === "contour" || layer.type === "wind") {
    if (layer.config?.showFill) {
      if (isVisible) {
        const { isobandSrcId } = getLayerDOMIds(layerId);
        const isobandSrc = map.getSource(isobandSrcId);
        const features = getSourceFeatures(isobandSrc);
        if (features.length > 0) {
          setLayerIsobandVisibility(map, layerId, true);
        } else {
          triggerIsobandOverlay(map, layer, winObj);
        }
      } else {
        setLayerIsobandVisibility(map, layerId, false);
      }
    } else {
      setLayerIsobandVisibility(map, layerId, false);
    }

    setLayerIsolineVisibility(map, layerId, isVisible && layer.config?.showLine);

    if (layer.config?.showRaster) {
      if (isVisible) {
        const { rasterLayerId } = getRasterDOMIds(layerId);
        if (map.getLayer(rasterLayerId)) {
          setRasterVisibility(map, true, layerId);
        } else {
          triggerRasterOverlay(map, layer, winObj);
        }
      } else {
        setRasterVisibility(map, false, layerId);
      }
    }

    if (layer.type === "wind" || layer.config?.showWind) {
      if (isVisible && layer.config?.showWind !== false) {
        triggerWindStreamlines(map, layer, winObj);
      } else {
        stopWindAnimation(map);
      }
    }

    if (layer.type === "wind" || layer.config?.showBarbs) {
      if (isVisible && layer.config?.showBarbs) {
        triggerWindBarbs(map, layer, winObj);
      } else {
        removeGridWindBarbs(map);
      }
    }
  } else if (layer.type === "station") {
    setStationVisibility(map, isVisible);
    if (layer.config?.showStreamlines) {
      if (isVisible) {
        triggerStationStreamlines(map, layer, winObj);
      } else {
        stopWindAnimation(map);
      }
    }
  } else if (layer.type === "pmtiles") {
    const showGraticule = isVisible && layer.config?.showGraticule !== false;
    const showWorld = isVisible && layer.config?.showWorld !== false;
    const showProvinces = isVisible && layer.config?.showProvinces !== false;
    const showCities = isVisible && layer.config?.showCities !== false;

    const worldLayers = ["world-fill", "world-boundary"];
    const chinaLayers = ["china-fill", "china-boundary"];
    const provLayers = ["provinces-bg-fill", "provinces-boundary", "provinces-fill", "provinces-detail-boundary"];
    const cityLayers = ["citys-fill", "citys-boundary", "county-fill", "county-boundary"];

    worldLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showWorld ? "visible" : "none");
    });
    chinaLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", value ? "visible" : "none");
    });
    provLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showProvinces ? "visible" : "none");
    });
    cityLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showCities ? "visible" : "none");
    });
    if (map.getLayer("graticule-lines")) {
      map.setLayoutProperty("graticule-lines", "visibility", showGraticule ? "visible" : "none");
    }
  } else if (layer.type === "tlogp") {
    import("../../layers/tlogp/tlogpLayer.js").then(({ setTLogPVisibility }) => {
      setTLogPVisibility(map, isVisible, winObj);
    });
  } else if (layer.type === "timeheight") {
    import("../../layers/timeheight/timeHeightLayer.js").then(({ setTimeHeightVisibility }) => {
      setTimeHeightVisibility(map, isVisible, winObj);
    });
  } else if (layer.type === "lineheight") {
    import("../../layers/lineprofile/lineProfileLayer.js").then(({ setLineHeightVisibility }) => {
      setLineHeightVisibility(map, isVisible, winObj);
    });
  } else if (layer.type === "hovmoller") {
    import("../../layers/lineprofile/lineProfileLayer.js").then(({ setHovmollerVisibility }) => {
      setHovmollerVisibility(map, isVisible, winObj);
    });
  }

  // Synchronize legend lifecycle on layer visibility change (contour/wind only)
  syncLegendForLayer(layer, winObj, isVisible);
}

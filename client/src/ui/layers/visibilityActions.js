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

export function handleVisibilityAction(map, layerId, value, layer, winObj) {
  if (!layer) return;

  if (layer.type === "contour" || layer.type === "wind") {
    if (layer.config?.showFill) {
      if (value) {
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

    setLayerIsolineVisibility(map, layerId, value && layer.config?.showLine);

    if (layer.config?.showRaster) {
      if (value) {
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
      if (value && layer.config?.showWind !== false) {
        triggerWindStreamlines(map, layer, winObj);
      } else {
        stopWindAnimation(map);
      }
    }

    if (layer.type === "wind" || layer.config?.showBarbs) {
      if (value && layer.config?.showBarbs) {
        triggerWindBarbs(map, layer, winObj);
      } else {
        removeGridWindBarbs(map);
      }
    }
  } else if (layer.type === "station") {
    setStationVisibility(map, value);
    if (layer.config?.showStreamlines) {
      if (value) {
        triggerStationStreamlines(map, layer, winObj);
      } else {
        stopWindAnimation(map);
      }
    }
  } else if (layer.type === "pmtiles") {
    const showGraticule = value && layer.config?.showGraticule !== false;
    const showWorld = value && layer.config?.showWorld !== false;
    const showProvinces = value && layer.config?.showProvinces !== false;
    const showCities = value && layer.config?.showCities !== false;

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
  }

  // Synchronize legend lifecycle on layer visibility change (contour/wind only)
  syncLegendForLayer(layer, winObj, value);
}

// layerActions.js - Dispatcher for layer control toggle, visibility, and aux actions
import {
  setLayerIsobandVisibility,
  setLayerIsolineVisibility,
  setLayerIsobandOpacity,
  setLayerIsolineColor,
  removeContourLayer,
} from "../layers/contourLayer.js";
import { setStationVisibility } from "../layers/stationLayer.js";
import { renderBinaryRaster, setRasterVisibility } from "../layers/rasterLayer.js";
import { renderWindStreamlines, stopWindAnimation } from "../layers/windLayer.js";
import { fetchGridBinaryStream } from "../api/catalogApi.js";
import { appState } from "../store/appState.js";
import { getActiveWindow } from "./tabWindowManager.js";

export function handleLayerAction(map, action, layerId, value, layer, win = getActiveWindow()) {
  if (action === "visibility") {
    if (layer.type === "contour") {
      setLayerIsobandVisibility(map, layerId, value && layer.config.showFill);
      setLayerIsolineVisibility(map, layerId, value && layer.config.showLine);
    } else if (layer.type === "station") {
      setStationVisibility(map, value);
    } else if (layer.type === "pmtiles") {
      const vis = value ? "visible" : "none";
      const pmtilesLayerIds = [
        "china-fill", "china-boundary",
        "provinces-bg-fill", "provinces-boundary",
        "provinces-fill", "provinces-detail-boundary",
        "citys-fill", "citys-boundary",
        "graticule-lines",
      ];
      pmtilesLayerIds.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
      });
    }
  } else if (action === "config") {
    if (layer.type === "contour") {
      setLayerIsobandVisibility(map, layerId, layer.visible && value.showFill);
      setLayerIsolineVisibility(map, layerId, layer.visible && value.showLine);
      setLayerIsobandOpacity(map, layerId, value.opacity);
      setLayerIsolineColor(map, layerId, value.lineColor);
    }
  } else if (action === "remove") {
    if (layer.type === "contour") {
      removeContourLayer(map, layerId);
    } else if (layer.type === "station") {
      setStationVisibility(map, false);
    }
  } else if (action === "aux") {
    if (layerId === "raster") {
      if (value && !map.getLayer("raster-layer")) {
        const model = win?.model || "ECMWF_HR";
        const element = win?.element || "TMP";
        const level = win?.level || 850;
        const period = win?.period ?? 24;
        const file = `26082708.${String(period).padStart(3, "0")}`;
        const path = `${model}/${element}/${level}`;
        fetchGridBinaryStream(path, file).then((bin) => {
          renderBinaryRaster(map, bin, element, win?.colormap || element);
        });
      } else {
        setRasterVisibility(map, value);
      }
    } else if (layerId === "wind") {
      if (value) {
        let grid = win?.gridData || appState.get("gridData");
        if (!grid || !grid.u || !grid.v) {
          grid = {
            header: (grid && grid.header) ? grid.header : { start_lon: 60, d_lon: 0.5, n_lon: 100, start_lat: 10, d_lat: 0.5, n_lat: 80 },
            u: new Float32Array(8000).fill(6),
            v: new Float32Array(8000).fill(4),
          };
        }
        renderWindStreamlines(map, grid);
      } else {
        stopWindAnimation(map);
      }
    }
  }
}

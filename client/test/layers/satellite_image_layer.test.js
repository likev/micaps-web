import { describe, it, expect, beforeEach } from "bun:test";
import {
  boundsToCoordinates,
  getImageDOMIds,
  loadImageLayer,
  removeImageLayer,
  setImageLayerVisibility,
  setImageLayerOpacity,
} from "../../src/layers/imageLayer.js";
import { getColormap, createColorResolver, COLORMAPS } from "../../src/utils/colormaps.js";
import config from "../../config.json";

describe("Satellite & Image Layer Subsystem", () => {
  describe("imageLayer Bounds and Coordinates", () => {
    it("converts [minLon, minLat, maxLon, maxLat] to 4-corner coordinates clockwise", () => {
      const coords = boundsToCoordinates([45.0, 5.0, 155.0, 55.0]);
      expect(coords).toEqual([
        [45.0, 55.0],  // top-left
        [155.0, 55.0], // top-right
        [155.0, 5.0],  // bottom-right
        [45.0, 5.0],   // bottom-left
      ]);
    });

    it("falls back to default East Asia bounds on missing or invalid bounds input", () => {
      const coords = boundsToCoordinates(null);
      expect(coords).toEqual([
        [45.0, 55.0],
        [155.0, 55.0],
        [155.0, 5.0],
        [45.0, 5.0],
      ]);
    });

    it("produces deterministic sanitized DOM IDs", () => {
      const ids = getImageDOMIds("dust-rgb-2026/10/15.bmp");
      expect(ids.srcId).toBe("image-src-dust-rgb-2026_10_15_bmp");
      expect(ids.layerId).toBe("image-raster-dust-rgb-2026_10_15_bmp");
    });
  });

  describe("imageLayer MapLibre Lifecycle & Flicker Prevention", () => {
    let mockMap;
    let addedSources;
    let addedLayers;
    let updatedImages;

    beforeEach(() => {
      addedSources = {};
      addedLayers = {};
      updatedImages = {};

      mockMap = {
        getSource: (id) => addedSources[id] || null,
        getLayer: (id) => addedLayers[id] || null,
        addSource: (id, def) => {
          addedSources[id] = {
            ...def,
            updateImage: (opts) => {
              updatedImages[id] = opts;
            },
          };
        },
        addLayer: (layerDef, beforeId) => {
          addedLayers[layerDef.id] = { ...layerDef, beforeId };
        },
        removeLayer: (id) => {
          delete addedLayers[id];
        },
        removeSource: (id) => {
          delete addedSources[id];
        },
        setLayoutProperty: (layerId, prop, val) => {
          if (addedLayers[layerId]) {
            addedLayers[layerId].layout = addedLayers[layerId].layout || {};
            addedLayers[layerId].layout[prop] = val;
          }
        },
        setPaintProperty: (layerId, prop, val) => {
          if (addedLayers[layerId]) {
            addedLayers[layerId].paint = addedLayers[layerId].paint || {};
            addedLayers[layerId].paint[prop] = val;
          }
        },
      };
    });

    it("creates an image source and raster layer positioned below boundary layers", async () => {
      // Mock existing boundary layer
      addedLayers["citys-boundary"] = { id: "citys-boundary" };

      const layer = {
        id: "fy2g-dust",
        type: "image",
        path: "SATELLITE/FY2G/L2/DUST",
        bounds: [45.0, 5.0, 155.0, 55.0],
        opacity: 0.8,
      };

      await loadImageLayer(mockMap, layer);

      const { srcId, layerId } = getImageDOMIds("fy2g-dust");
      expect(addedSources[srcId]).toBeDefined();
      expect(addedSources[srcId].type).toBe("image");
      expect(addedSources[srcId].coordinates).toEqual([
        [45.0, 55.0],
        [155.0, 55.0],
        [155.0, 5.0],
        [45.0, 5.0],
      ]);

      expect(addedLayers[layerId]).toBeDefined();
      expect(addedLayers[layerId].type).toBe("raster");
      expect(addedLayers[layerId].beforeId).toBe("citys-boundary");
      expect(addedLayers[layerId].paint["raster-opacity"]).toBe(0.8);
    });

    it("updates existing source via updateImage without tearing down layers (no flicker)", async () => {
      const layer = {
        id: "fy2g-dust",
        type: "image",
        path: "SATELLITE/FY2G/L2/DUST",
        file: "time_step_1.bmp",
      };

      await loadImageLayer(mockMap, layer);
      const { srcId } = getImageDOMIds("fy2g-dust");

      // Advance timeline
      const layer2 = {
        ...layer,
        file: "time_step_2.bmp",
      };
      await loadImageLayer(mockMap, layer2);

      expect(updatedImages[srcId]).toBeDefined();
      expect(updatedImages[srcId].url).toContain("time_step_2.bmp");
    });

    it("controls visibility and opacity without errors", async () => {
      const layer = { id: "test-img", type: "image" };
      await loadImageLayer(mockMap, layer);

      setImageLayerVisibility(mockMap, "test-img", false);
      const { layerId } = getImageDOMIds("test-img");
      expect(addedLayers[layerId].layout.visibility).toBe("none");

      setImageLayerVisibility(mockMap, "test-img", true);
      expect(addedLayers[layerId].layout.visibility).toBe("visible");

      setImageLayerOpacity(mockMap, "test-img", 0.5);
      expect(addedLayers[layerId].paint["raster-opacity"]).toBe(0.5);

      removeImageLayer(mockMap, null, "test-img");
      expect(addedLayers[layerId]).toBeUndefined();
    });
  });

  describe("Satellite Colormaps & Physical Scaling", () => {
    it("provides valid IR_TEMP, ALBEDO, WV, CTT, and DUST colormaps", () => {
      expect(COLORMAPS.IR_TEMP).toBeDefined();
      expect(COLORMAPS.ALBEDO).toBeDefined();
      expect(COLORMAPS.WV).toBeDefined();
      expect(COLORMAPS.CTT).toBeDefined();
      expect(COLORMAPS.DUST).toBeDefined();

      expect(getColormap("IR_TEMP")).toBeDefined();
      expect(getColormap("ALBEDO")).toBeDefined();
      expect(getColormap("WV")).toBeDefined();
      expect(getColormap("CTT")).toBeDefined();
      expect(getColormap("DUST")).toBeDefined();
    });

    it("ALBEDO colormap uses 0-100% reflectance scale and does not blow out at > 1%", () => {
      const albedoMap = getColormap("ALBEDO");
      const maxStop = albedoMap[albedoMap.length - 1].val;
      expect(maxStop).toBe(100);

      const resolver = createColorResolver("ALBEDO", "ALBEDO");
      const out = new Uint8ClampedArray(4);

      // Low reflectance (10%): dark gray
      resolver(10.0, out, 0);
      expect(out[0]).toBeLessThan(60);

      // Moderate reflectance (50%): middle gray, NOT saturated white
      resolver(50.0, out, 0);
      expect(out[0]).toBeGreaterThan(100);
      expect(out[0]).toBeLessThan(200);

      // High reflectance (100%): white
      resolver(100.0, out, 0);
      expect(out[0]).toBe(255);
    });

    it("supports fractional 0-1 albedo inputs when max <= 1.0", () => {
      const resolver = createColorResolver("ALBEDO", "ALBEDO", 0.0, 1.0);
      const out = new Uint8ClampedArray(4);

      // 0.25 fractional = 25% reflectance
      resolver(0.25, out, 0);
      expect(out[0]).toBeGreaterThan(50);
      expect(out[0]).toBeLessThan(120);
    });

    it("IR_TEMP and CTT map cloud-top brightness temperatures accurately", () => {
      const irResolver = createColorResolver("IR_TEMP", "IR_TEMP");
      const out = new Uint8ClampedArray(4);

      // Deep convective core (190 K = -83°C): bright purple/white
      irResolver(190.0, out, 0);
      expect(out[3]).toBe(255);

      // Warm surface (300 K = +27°C): dark gray
      irResolver(300.0, out, 0);
      expect(out[0]).toBeLessThan(120);
    });
  });

  describe("Satellite Presets in Configuration", () => {
    it("includes grouped FY-4B CHINA and DISK presets with channels 1 to 15", () => {
      const chinaGroup = config.presets.find((p) => p.id === "preset-fy4b_china_grouped");
      expect(chinaGroup).toBeDefined();
      expect(chinaGroup.hasLevel).toBe(true);
      expect(chinaGroup.defaultLevel).toBe(12);
      expect(chinaGroup.levels).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

      const diskGroup = config.presets.find((p) => p.id === "preset-fy4b_disk_grouped");
      expect(diskGroup).toBeDefined();
      expect(diskGroup.hasLevel).toBe(true);
      expect(diskGroup.defaultLevel).toBe(12);
      expect(diskGroup.levels).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    });

    it("includes FY-2G AMV presets with vertical pressure level selection", () => {
      const amv1 = config.presets.find((p) => p.id === "preset-fy2g_amv_ir1");
      expect(amv1).toBeDefined();
      expect(amv1.hasLevel).toBe(true);
      expect(amv1.defaultLevel).toBe(200);
      expect(amv1.levels).toEqual([200, 300, 500, 700, 850]);

      const amv3 = config.presets.find((p) => p.id === "preset-fy2g_amv_ir3");
      expect(amv3).toBeDefined();
      expect(amv3.hasLevel).toBe(true);
      expect(amv3.defaultLevel).toBe(200);
      expect(amv3.levels).toEqual([200, 300, 500, 700, 850]);
    });

    it("includes FY-2G DUST RGB image preset with valid geographic bounds", () => {
      const dustPreset = config.presets.find((p) => p.id === "preset-fy2g_dust");
      expect(dustPreset).toBeDefined();
      expect(dustPreset.layers[0].type).toBe("image");
      expect(dustPreset.layers[0].bounds).toEqual([45, 5, 155, 55]);
    });
  });
});

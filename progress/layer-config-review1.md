# Layer Config Save/Load Review1

## 1. Flow

* Load: `client/src/config/presets.js:13 loadPresetGroups` GET `config.json` → fallback `/api/config`, sets `CURRENT_CONFIG/PRESET_GROUPS/colormaps`, persists basemap `scheme` to `localStorage`.
* Apply: `client/src/main.js:596 loadPresetGroup` → `356 loadWeatherField` (`...render + id + resolveColormap`) → `client/src/ui/layerControl.js:105 addOrUpdateLayer` → `windowLayersMap` per-window store. Station branch `main.js:654-663` calls `loadObservationProduct` without `render`.
* Edit: `layerControl.js:354-364,379,410,453,471` + `stationFilterControl.js:184` mutate `layer.config` + call `autoSaveLayerConfig`.
* Autosave: `presets.js:73 autoSaveLayerConfig` debounced 400ms POST `/api/config` via `53 savePresetConfig`.
* Manual: `client/src/ui/configEditor.js:289` validate → `savePresetConfig` → `loadPresetGroups` → `refreshPresetControls/refreshNavBarPresets/onConfigChanged`.
* Server: `server/handler/static_handler.go:75 ConfigHandler` GET first-found candidate, POST only `<StaticDir>/config.json`.

## 2. Layer identity / match

`presets.js:79-92`:

```js
// basemap
layer.type==="pmtiles" || layer.id==="pmtiles-base" || layer.id==="basemap"
// preset
pLayer.id===layer.id ||
(pLayer.model===layer.model && pLayer.element===layer.element &&
 (pLayer.level===layer.level || pLayer.level==null))
```

* `type`, `path` never compared for presets.
* `level`: exact OR wildcard when preset `level` is `null/undefined` (all current `public/config.json` preset layers) → cross-preset match.
* Runtime: `layerControl.js:89,121 getLayerById/addOrUpdateLayer` match only `l.id===layerId` within `windowLayersMap`.
* Load: `main.js:638-653` positional iteration, `targetLevel = layer.level || group.defaultLevel`, forwards `id`. `resolveColormap` (`utils/colormaps.js:281`) uses only `render/group.colormap[ByLevel]`.

## 3. Defects

1. **Over-broad autosave match (Moderate):** wildcard `level==null` means HGT/TMP/WIND edit in one composite overwrites same `model+element` in all other composites. No scoping by `preset.id/group.id`.
2. **Station `render` write-only (Major):** saved `showTemp/filterRules/...` (`presets.js:111-129`) never loaded; `loadPresetGroup:654` drops `layer.render`.
3. **Create-path clobber `layerControl.js:186`:** `{..., config:normalized, ...layerDef}` trailing spread replaces normalized config with partial input. Update path `:124` merges correctly.
4. **Basemap never restored:** `createDefaultLayers:53` hardcodes `showGraticule/Provinces/Cities`; `loadPresetGroups:36-40` restores only `scheme` to `localStorage`.
5. **Server GET/POST asymmetry `static_handler.go:88-143`:** GET 6 candidates (`dist`→`public`), POST only `dist/config.json`. Dev edits appear lost.
6. **Incomplete fields:** `colormap/colormapByLevel/visible/color` not autosaved; `palettePath` saved but runtime `palette:${id}` key (`layerActions.js:194`, `main.js:396`) transient — reload needs XML refetch.
7. **Concurrency:** single global `autoSaveTimer:11`, no ETag/version; pending autosave can overwrite manual Config-tab save. `opacity || 0.75` (`layerControl.js:176`) maps `0→0.75`.

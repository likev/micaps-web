// palettePicker.js - XML Palette loader and select dropdown populator
import { getPaletteCategory, listPaletteFiles, loadXMLPalette } from "../../utils/paletteLoader.js";

// Per-layer palette load guard: abort token via incrementing sequence + isConnected check
export const paletteLoadSeq = new Map();

export async function populatePaletteSelect(configDrawer, layer) {
  if (!configDrawer || !layer) return;
  const paletteSel = configDrawer.querySelector(".sel-palette");
  const gradientPreview = configDrawer.querySelector(".palette-gradient-preview");
  if (!paletteSel) return;

  const seq = (paletteLoadSeq.get(layer.id) || 0) + 1;
  paletteLoadSeq.set(layer.id, seq);

  const elem = (layer.element || "").toUpperCase();
  const category = getPaletteCategory(elem) || elem;
  if (!category) return;

  try {
    const files = await listPaletteFiles(category);
    if (!paletteSel.isConnected || paletteLoadSeq.get(layer.id) !== seq) return;

    const xmlFiles = files.filter((f) => f.name.endsWith(".xml"));
    while (paletteSel.options.length > 1) paletteSel.remove(1);
    if (xmlFiles.length === 0) {
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "No palettes";
      emptyOpt.disabled = true;
      paletteSel.appendChild(emptyOpt);
    } else {
      for (const { name, path } of xmlFiles) {
        const opt = document.createElement("option");
        opt.value = path;
        const base = name.replace(/\.xml$/, "");
        const themeMatch = base.match(/^(dark|light|micaps)-(.+)$/i);
        opt.textContent = themeMatch
          ? `${themeMatch[2].replace(/-/g, " ")} (${themeMatch[1]})`
          : base.replace(/-/g, " ");
        if (layer.config?.palettePath === path) opt.selected = true;
        paletteSel.appendChild(opt);
      }
    }

    if (layer.config?.palettePath) {
      const targetPath = layer.config.palettePath;
      const cleanTarget = targetPath.replace(/^\//, "");
      const matchingOpt = Array.from(paletteSel.options).find(
        (o) => o.value === targetPath || (o.value && o.value.replace(/^\//, "") === cleanTarget)
      );
      if (matchingOpt) {
        paletteSel.value = matchingOpt.value;
        layer.config.palettePath = matchingOpt.value;
        const stops = await loadXMLPalette(matchingOpt.value);
        if (paletteLoadSeq.get(layer.id) !== seq) return;
        if (stops && gradientPreview && gradientPreview.isConnected) {
          const colors = stops.map(
            (s) => `rgba(${s.color.slice(0, 3).join(",")},${((s.color[3] ?? 255) / 255).toFixed(2)})`
          ).join(", ");
          gradientPreview.style.background = `linear-gradient(to right, ${colors})`;
        }
      } else {
        if (gradientPreview) gradientPreview.style.background = "linear-gradient(to right, #888, #fff)";
      }
    } else {
      if (gradientPreview) gradientPreview.style.background = "linear-gradient(to right, #888, #fff)";
    }
  } catch (err) {
    console.error(`[Palette] Failed to populate palettes for ${category}:`, err);
  }
}

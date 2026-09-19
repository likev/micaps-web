// lineProfileDrawerBindings.js - Drawer bindings for lineheight + hovmoller layers
import { lineHeightController } from "../../layers/lineprofile/lineHeightController.js";
import { hovmollerController } from "../../layers/lineprofile/hovmollerController.js";
import { autoSaveLayerConfig } from "../../config/presets.js";

function bindShowToggles(configDrawer, layer, controller, prefix, win) {
  const pairs = [
    [`.chk-${prefix}-rh`, "RH", "showRH"],
    [`.chk-${prefix}-temp`, "TMP", "showTemp"],
    [`.chk-${prefix}-vvel`, "VVEL", "showVVel"],
    [`.chk-${prefix}-wind`, "WIND", "showWind"],
  ];
  for (const [sel, el, key] of pairs) {
    const cb = configDrawer.querySelector(sel);
    cb?.addEventListener("change", (e) => {
      const st = controller._getState(win);
      st.panel?.canvasRenderer?.setOptions({ [key]: e.target.checked });
      st.panel?.syncElementCheckbox(el, e.target.checked);
      if (layer.config) layer.config[key] = e.target.checked;
      autoSaveLayerConfig();
    });
  }
}

export function bindLineHeightDrawerEvents(layer, configDrawer, win = null) {
  if (!configDrawer || layer.type !== "lineheight") return;
  const q = (s) => configDrawer.querySelector(s);
  const applyLine = () => {
    const a = { lon: parseFloat(q(".input-lh-alon")?.value), lat: parseFloat(q(".input-lh-alat")?.value) };
    const b = { lon: parseFloat(q(".input-lh-blon")?.value), lat: parseFloat(q(".input-lh-blat")?.value) };
    const n = parseInt(q(".sel-lh-n")?.value, 10) || 41;
    lineHeightController.setLine(a, b, n, win);
  };
  q(".btn-lh-apply")?.addEventListener("click", (e) => { e.stopPropagation(); applyLine(); });
  q(".sel-lh-n")?.addEventListener("change", (e) => {
    const st = lineHeightController._getState(win);
    lineHeightController.setLine(st.line.a, st.line.b, parseInt(e.target.value, 10), win);
  });
  q(".btn-lh-draw")?.addEventListener("click", (e) => { e.stopPropagation(); lineHeightController.startDraw(win); });
  q(".btn-lh-seta")?.addEventListener("click", (e) => { e.stopPropagation(); lineHeightController.setAFromMap(win); });
  q(".btn-lh-setb")?.addEventListener("click", (e) => { e.stopPropagation(); lineHeightController.setBFromMap(win); });
  q(".btn-lh-flip")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const cur = lineHeightController._getState(win).flipDirection;
    lineHeightController.setFlip(!cur, win);
    e.target.textContent = !cur ? "⇄ B→A" : "⇄ A→B";
  });
  bindShowToggles(configDrawer, layer, lineHeightController, "lh", win);
}

export function bindHovmollerDrawerEvents(layer, configDrawer, win = null) {
  if (!configDrawer || layer.type !== "hovmoller") return;
  const q = (s) => configDrawer.querySelector(s);
  const applyLine = () => {
    const a = { lon: parseFloat(q(".input-hov-alon")?.value), lat: parseFloat(q(".input-hov-alat")?.value) };
    const b = { lon: parseFloat(q(".input-hov-blon")?.value), lat: parseFloat(q(".input-hov-blat")?.value) };
    const n = parseInt(q(".sel-hov-n")?.value, 10) || 41;
    hovmollerController.setLine(a, b, n, win);
  };
  q(".btn-hov-apply")?.addEventListener("click", (e) => { e.stopPropagation(); applyLine(); });
  q(".sel-hov-n")?.addEventListener("change", (e) => {
    const st = hovmollerController._getState(win);
    hovmollerController.setLine(st.line.a, st.line.b, parseInt(e.target.value, 10), win);
  });
  q(".btn-hov-draw")?.addEventListener("click", (e) => { e.stopPropagation(); hovmollerController.startDraw(win); });
  q(".btn-hov-seta")?.addEventListener("click", (e) => { e.stopPropagation(); hovmollerController.setAFromMap(win); });
  q(".btn-hov-setb")?.addEventListener("click", (e) => { e.stopPropagation(); hovmollerController.setBFromMap(win); });
  q(".sel-hov-level")?.addEventListener("change", (e) => hovmollerController.setLevel(parseInt(e.target.value, 10), win));
  const applySpan = () => {
    const s = parseInt(q(".input-hov-start")?.value, 10) || 0;
    const e = parseInt(q(".input-hov-end")?.value, 10) || 144;
    const st = parseInt(q(".sel-hov-step")?.value, 10) || 12;
    hovmollerController.setSpan(s, e, st, win);
  };
  q(".btn-hov-span")?.addEventListener("click", (e) => { e.stopPropagation(); applySpan(); });
  q(".input-hov-start")?.addEventListener("change", applySpan);
  q(".input-hov-end")?.addEventListener("change", applySpan);
  q(".sel-hov-step")?.addEventListener("change", applySpan);
  q(".btn-hov-swap")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const cur = hovmollerController._getState(win).axisSwap;
    hovmollerController.setAxisSwap(cur === "dist-x" ? "time-x" : "dist-x", win);
  });
  q(".btn-hov-rev")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const cur = hovmollerController._getState(win).timeDir;
    hovmollerController.setTimeDir(cur === "fwd" ? "rev" : "fwd", win);
  });
  bindShowToggles(configDrawer, layer, hovmollerController, "hov", win);
}

export function bindLineProfileDrawerEvents(layer, configDrawer, win = null) {
  if (layer.type === "lineheight") bindLineHeightDrawerEvents(layer, configDrawer, win);
  else if (layer.type === "hovmoller") bindHovmollerDrawerEvents(layer, configDrawer, win);
}

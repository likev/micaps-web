// config-render-profiles.test.js - shared render profiles + colormaps split out of config.json
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  expandRenderProfiles,
  compactConfigForSave,
  buildRenderProfiles,
} from "../src/config/renderProfiles.js";

const CONFIG_PATH = resolve(import.meta.dir, "../config.json");

function layersOf(cfg) {
  return cfg.presets.flatMap((g) => g.layers || []);
}

describe("renderProfiles helpers", () => {
  const make = () => ({
    renderProfiles: { "contour-1": { lineWidth: 2, showLine: true, smooth: true } },
    presets: [
      {
        id: "g",
        layers: [
          { id: "a", type: "contour", renderRef: "contour-1", render: { lineColor: "#fff" } },
          { id: "b", type: "contour", renderRef: "contour-1" },
          { id: "c", type: "contour", render: { showLine: false } },
        ],
      },
    ],
  });

  it("expand merges profile under layer overrides", () => {
    const cfg = expandRenderProfiles(make());
    const [a, b, c] = layersOf(cfg);
    expect(a.render).toEqual({ lineWidth: 2, showLine: true, smooth: true, lineColor: "#fff" });
    expect(b.render).toEqual({ lineWidth: 2, showLine: true, smooth: true });
    expect(c.render).toEqual({ showLine: false });
  });

  it("expand does not share profile object between layers", () => {
    const cfg = expandRenderProfiles(make());
    const [a, b] = layersOf(cfg);
    a.render.lineWidth = 9;
    expect(b.render.lineWidth).toBe(2);
    expect(cfg.renderProfiles["contour-1"].lineWidth).toBe(2);
  });

  it("compact keeps only differences and drops colormaps", () => {
    const cfg = expandRenderProfiles(make());
    cfg.colormaps = { TMP: [] };
    layersOf(cfg)[0].render.lineWidth = 3;
    const out = compactConfigForSave(cfg);
    expect(out.colormaps).toBeUndefined();
    const [a, b, c] = layersOf(out);
    expect(a.render).toEqual({ lineColor: "#fff", lineWidth: 3 });
    expect(b.render).toBeUndefined();
    expect(b.renderRef).toBe("contour-1");
    expect(c.render).toEqual({ showLine: false });
    // source config is untouched
    expect(layersOf(cfg)[1].render).toEqual({ lineWidth: 2, showLine: true, smooth: true });
  });

  it("expand(compact(x)) round-trips", () => {
    const cfg = expandRenderProfiles(make());
    const back = expandRenderProfiles(compactConfigForSave(cfg));
    expect(layersOf(back).map((l) => l.render)).toEqual(layersOf(cfg).map((l) => l.render));
  });

  it("buildRenderProfiles is lossless", () => {
    const cfg = {
      presets: [
        {
          id: "g",
          layers: [1, 2, 3].map((i) => ({
            id: `l${i}`,
            type: "contour",
            render: { lineWidth: 2, smooth: true, showLine: true, showLabels: true, lineColor: `#00${i}` },
          })),
        },
      ],
    };
    const before = JSON.parse(JSON.stringify(layersOf(cfg).map((l) => l.render)));
    buildRenderProfiles(cfg);
    expect(Object.keys(cfg.renderProfiles).length).toBeGreaterThan(0);
    expandRenderProfiles(cfg);
    expect(layersOf(cfg).map((l) => l.render)).toEqual(before);
  });
});

describe("config.json structure", () => {
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));

  it("no longer embeds colormaps", () => {
    expect(cfg.colormaps).toBeUndefined();
  });

  it("every renderRef points at an existing profile", () => {
    for (const l of layersOf(cfg)) {
      if (l.renderRef) expect(cfg.renderProfiles[l.renderRef]).toBeDefined();
    }
  });

  it("every colormap referenced by a render resolves in colormaps.json", () => {
    const colormaps = JSON.parse(readFileSync(resolve(import.meta.dir, "../colormaps.json"), "utf8"));
    const copy = expandRenderProfiles(JSON.parse(JSON.stringify(cfg)));
    for (const l of layersOf(copy)) {
      const name = l.render?.colormap;
      if (typeof name === "string") expect(colormaps[name]).toBeDefined();
    }
  });
});

// cssText.js - Read live app CSS (global stylesheets + Svelte component <style> blocks) for string assertions
import fs from "fs";
import path from "path";

const SRC_DIR = path.resolve(import.meta.dir, "../../src");
const GLOBAL_CSS = ["styles/tokens.css", "styles/polish.css"];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".svelte")) out.push(p);
  }
  return out;
}

export function readStyleCss() {
  let css = GLOBAL_CSS.map((f) => fs.readFileSync(path.join(SRC_DIR, f), "utf-8")).join("\n");
  for (const file of walk(SRC_DIR)) {
    const text = fs.readFileSync(file, "utf-8");
    const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
    let m;
    while ((m = re.exec(text)) !== null) css += "\n" + m[1];
  }
  return css;
}

export function readSrcText(relPath) {
  return fs.readFileSync(path.join(SRC_DIR, relPath), "utf-8");
}

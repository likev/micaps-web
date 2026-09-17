// cssText.js - Read style.css with @import barrel inlined for string assertions
import fs from "fs";
import path from "path";

const SRC_DIR = path.resolve(import.meta.dir, "../../src");

export function readStyleCss() {
  let css = fs.readFileSync(path.join(SRC_DIR, "style.css"), "utf-8");
  const importRe = /@import\s+["']\.\/styles\/([^"']+)["']\s*;/g;
  let m;
  while ((m = importRe.exec(css)) !== null) {
    try {
      css += "\n" + fs.readFileSync(path.join(SRC_DIR, "styles", m[1]), "utf-8");
    } catch {}
  }
  return css;
}

export function readSrcText(relPath) {
  return fs.readFileSync(path.join(SRC_DIR, relPath), "utf-8");
}

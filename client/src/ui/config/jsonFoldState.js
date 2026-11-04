// jsonFoldState.js - Pure state machine and helpers for document & intra-item JSON folding

/**
 * Checks if a value is a primitive (scalar) array (numbers, strings, booleans, null).
 */
export function isPrimitiveArray(arr) {
  if (!Array.isArray(arr)) return false;
  return arr.every((item) => {
    const t = typeof item;
    return t === "number" || t === "string" || t === "boolean" || item === null;
  });
}

/**
 * Checks if a value is a colormap stop object ({ val: number, color: [r, g, b, a] }).
 */
export function isStopObject(val) {
  return (
    val !== null &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    typeof val.val === "number" &&
    Array.isArray(val.color) &&
    isPrimitiveArray(val.color)
  );
}

/**
 * Checks if a value is a small flat scalar object (e.g. interval or stop).
 */
export function isSmallFlatObject(val) {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  const entries = Object.entries(val);
  if (entries.length > 5) return false;
  return entries.every(([_, v]) => {
    if (v === null || typeof v !== "object") return true;
    if (Array.isArray(v) && isPrimitiveArray(v) && v.length <= 4) return true;
    return false;
  });
}

/**
 * Formats JSON.parse error with relative line and column diagnostics.
 */
export function formatJsonError(errMsg, text) {
  if (!errMsg) return "";
  const match = errMsg.match(/at position (\d+)/i);
  if (match && typeof text === "string") {
    const pos = parseInt(match[1], 10);
    const lines = text.slice(0, pos).split("\n");
    const lineNum = lines.length;
    const colNum = lines[lines.length - 1].length + 1;
    return `${errMsg} (line ${lineNum}, column ${colNum})`;
  }
  return errMsg;
}

/**
 * Formats a single level value or preset into standard display badge text.
 */
export function formatPresetLevel(preset) {
  if (!preset) return "";
  const lvl = preset.defaultLevel ?? preset.level;
  if (lvl === undefined || lvl === null) {
    if (preset.hasLevel) return "Multi-Lvl";
    return "Sfc";
  }
  const id = (preset.id || "").toLowerCase();
  const name = (preset.name || "").toLowerCase();
  if (id.includes("fy4b") || id.includes("fy2g") || name.includes("fy-4b") || name.includes("fy-2g") || name.includes("channel")) {
    return `C${String(lvl).padStart(3, "0")}`;
  }
  if (id.includes("radar") || id.includes("tdmosaic") || name.includes("radar") || name.includes("mosaic") || (typeof lvl === "number" && lvl >= 1000 && lvl % 500 === 0 && !id.includes("1000hpa"))) {
    return `${lvl} m`;
  }
  if (lvl === 0 || String(lvl).toLowerCase() === "sfc" || String(lvl).toLowerCase() === "surface") {
    return "Sfc";
  }
  return `${lvl} hPa`;
}

/**
 * Formats a layer level into display badge text.
 */
export function formatLayerLevel(layer) {
  if (!layer) return "";
  const lvl = layer.level;
  if (lvl === undefined || lvl === null) return "Sfc";
  const id = (layer.id || "").toLowerCase();
  const model = (layer.model || "").toLowerCase();
  if (model.includes("satellite") || id.includes("fy4b") || id.includes("c0")) {
    return `C${String(lvl).padStart(3, "0")}`;
  }
  if (model.includes("radar") || id.includes("radar") || (typeof lvl === "number" && lvl >= 1000 && lvl % 500 === 0 && lvl !== 1000)) {
    return `${lvl} m`;
  }
  return `${lvl} hPa`;
}

/**
 * Traverses item value to collect all collapsible keys/paths at depth >= 1.
 * @param {Object} itemVal
 * @returns {Array<{ path: string, keyName: string, depth: number, kind: string, count?: number, label: string }>}
 */
export function collectItemCollapsibleKeys(itemVal) {
  const result = [];
  if (!itemVal || typeof itemVal !== "object") return result;

  function walk(val, parentPath, depth) {
    if (!val || typeof val !== "object") return;

    if (Array.isArray(val)) {
      // If array contains stop objects, stops are atomic 1-line elements; do not drill into them
      if (val.some(isStopObject)) {
        return;
      }
      val.forEach((elem, idx) => {
        const elemPath = parentPath ? `${parentPath}[${idx}]` : `[${idx}]`;
        if (elem && typeof elem === "object") {
          const id = elem.id || elem.element || elem.name || idx;
          result.push({
            path: elemPath,
            keyName: `[${idx}]`,
            depth,
            kind: Array.isArray(elem) ? "array" : "object",
            label: `${parentPath ? `${parentPath.split(".").pop()}` : ""}[${idx}] (${id})`,
          });
          walk(elem, elemPath, depth + 1);
        }
      });
      return;
    }

    for (const [key, propVal] of Object.entries(val)) {
      if (!propVal || typeof propVal !== "object") continue;
      const curPath = parentPath ? `${parentPath}.${key}` : key;

      if (Array.isArray(propVal)) {
        const isPrim = isPrimitiveArray(propVal);
        result.push({
          path: curPath,
          keyName: key,
          depth,
          kind: isPrim ? "primitive-array" : "array",
          count: propVal.length,
          label: `${key} (${propVal.length})`,
        });
        if (!isPrim) {
          walk(propVal, curPath, depth + 1);
        }
      } else {
        result.push({
          path: curPath,
          keyName: key,
          depth,
          kind: "object",
          count: Object.keys(propVal).length,
          label: key,
        });
        walk(propVal, curPath, depth + 1);
      }
    }
  }

  walk(itemVal, "", 1);
  return result;
}

/**
 * Folds all collapsible keys inside an item.
 * @param {Object} itemVal
 * @returns {Set<string>}
 */
export function foldAllItemKeys(itemVal) {
  const keys = collectItemCollapsibleKeys(itemVal);
  return new Set(keys.map((k) => k.path));
}

/**
 * Unfolds all collapsible keys inside an item.
 * @returns {Set<string>}
 */
export function unfoldAllItemKeys() {
  return new Set();
}

/**
 * Returns ancestor path list for a given path (e.g. "layers[1].render" -> ["layers", "layers[1]"]).
 */
export function getAncestorPaths(path) {
  const ancestors = [];
  let cur = "";
  // Split tokens like "layers", "[1]", "render"
  const tokens = path.match(/([a-zA-Z0-9_-]+|\[\d+\])/g) || [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const tok = tokens[i];
    cur = cur ? (tok.startsWith("[") ? `${cur}${tok}` : `${cur}.${tok}`) : tok;
    ancestors.push(cur);
  }
  return ancestors;
}

/**
 * Unfolds a specific key or key path inside an item while folding sibling subtrees.
 * @param {Object} itemVal
 * @param {string} targetKeyOrPath
 * @returns {Set<string>} updated foldedKeyPaths set
 */
export function unfoldItemKey(itemVal, targetKeyOrPath) {
  const allKeys = collectItemCollapsibleKeys(itemVal);
  const folded = new Set(allKeys.map((k) => k.path));

  if (!targetKeyOrPath) return folded;

  // Find all keys matching targetKeyOrPath either by exact path or by key name
  const matches = allKeys.filter(
    (k) =>
      k.path === targetKeyOrPath ||
      k.keyName === targetKeyOrPath ||
      k.path.endsWith(`.${targetKeyOrPath}`) ||
      k.path.endsWith(`[${targetKeyOrPath}]`)
  );

  for (const m of matches) {
    folded.delete(m.path);
    // Unfold all ancestors so the target key is visible
    for (const anc of getAncestorPaths(m.path)) {
      folded.delete(anc);
    }
    // If target is "layers", keep layers[*] items folded on single lines
    if (m.keyName === "layers" || m.path === "layers") {
      allKeys
        .filter((k) => k.path.startsWith("layers[") && !k.path.includes("."))
        .forEach((k) => folded.add(k.path));
    }
  }

  return folded;
}

/**
 * Formats a value as a single compact line of JSON safely without regex string mutation.
 */
export function toCompactOneLine(val) {
  if (val === null || typeof val !== "object") {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";
    return "[" + val.map(toCompactOneLine).join(", ") + "]";
  }
  const entries = Object.entries(val);
  if (entries.length === 0) return "{}";
  return "{ " + entries.map(([k, v]) => `${JSON.stringify(k)}: ${toCompactOneLine(v)}`).join(", ") + " }";
}

/**
 * Formats an item's JSON according to folded key paths and produces line-to-key metadata.
 * @param {*} val - item value to format
 * @param {Set<string>} [foldedPaths=new Set()]
 * @param {number} [indent=2]
 * @returns {{ text: string, lineKeys: Map<number, Object> }}
 */
export function formatItemWithFoldedKeys(val, foldedPaths = new Set(), indent = 2) {
  const lines = [];
  const lineKeys = new Map();

  function stringifyNode(node, curPath, depth, keyName = null, isLast = true) {
    const spaces = " ".repeat(depth * indent);
    const keyPrefix = keyName !== null ? `"${keyName}": ` : "";
    const comma = isLast ? "" : ",";

    if (node === null || typeof node !== "object") {
      lines.push(`${spaces}${keyPrefix}${JSON.stringify(node)}${comma}`);
      return;
    }

    const isFolded = foldedPaths.has(curPath);

    // Primitive arrays: always single line
    if (isPrimitiveArray(node)) {
      const lineNum = lines.length + 1;
      const formatted = toCompactOneLine(node);
      lines.push(`${spaces}${keyPrefix}${formatted}${comma}`);
      if (curPath) {
        lineKeys.set(lineNum, { path: curPath, keyName: keyName || curPath, isFolded: true, isCollapsible: true });
      }
      return;
    }

    // Colormap stop objects: always single line
    if (isStopObject(node)) {
      const lineNum = lines.length + 1;
      const formatted = toCompactOneLine(node);
      lines.push(`${spaces}${keyPrefix}${formatted}${comma}`);
      return;
    }

    // Small flat scalar objects (e.g. interval) when folded: single line
    if (isSmallFlatObject(node) && (isFolded || curPath.endsWith(".interval"))) {
      const lineNum = lines.length + 1;
      const formatted = toCompactOneLine(node);
      lines.push(`${spaces}${keyPrefix}${formatted}${comma}`);
      if (curPath) {
        lineKeys.set(lineNum, { path: curPath, keyName: keyName || curPath, isFolded: true, isCollapsible: true });
      }
      return;
    }

    // Folded sub-tree: format entire object/array onto a single line
    if (isFolded && curPath) {
      const lineNum = lines.length + 1;
      const formatted = toCompactOneLine(node);
      lines.push(`${spaces}${keyPrefix}${formatted}${comma}`);
      lineKeys.set(lineNum, { path: curPath, keyName: keyName || curPath, isFolded: true, isCollapsible: true });
      return;
    }

    // Unfolded array or object
    if (Array.isArray(node)) {
      const lineNum = lines.length + 1;
      lines.push(`${spaces}${keyPrefix}[`);
      if (curPath) {
        lineKeys.set(lineNum, { path: curPath, keyName: keyName || curPath, isFolded: false, isCollapsible: true });
      }
      node.forEach((item, idx) => {
        const itemPath = curPath ? `${curPath}[${idx}]` : `[${idx}]`;
        const last = idx === node.length - 1;
        stringifyNode(item, itemPath, depth + 1, null, last);
      });
      lines.push(`${spaces}]${comma}`);
    } else {
      const lineNum = lines.length + 1;
      lines.push(`${spaces}${keyPrefix}{`);
      if (curPath) {
        lineKeys.set(lineNum, { path: curPath, keyName: keyName || curPath, isFolded: false, isCollapsible: true });
      }
      const entries = Object.entries(node);
      entries.forEach(([k, propVal], idx) => {
        const propPath = curPath ? `${curPath}.${k}` : k;
        const last = idx === entries.length - 1;
        stringifyNode(propVal, propPath, depth + 1, k, last);
      });
      lines.push(`${spaces}}${comma}`);
    }
  }

  stringifyNode(val, "", 0, null, true);
  return {
    text: lines.join("\n"),
    lineKeys,
  };
}

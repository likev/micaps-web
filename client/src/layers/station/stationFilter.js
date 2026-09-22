// stationFilter.js - Station meteorological filter rules and JIT filter compiler
import { getFieldValue } from "./stationExtract.js";

// ViewOnly per-element match mode ("filterLogic": "VIEW"). Stations are
// never hidden; each rule gates only its own plotted element, and elements
// without rules default to visible.
export const VIEW_LOGIC = "VIEW";

export function isViewOnly(cfg) {
  return String(cfg?.filterLogic ?? "").toUpperCase() === VIEW_LOGIC;
}

const VIEW_FIELD_ALIASES = {
  TT: "TT",
  TD: "Td",
  DTD: "DTD",
  WIND: "Wind",
  RAIN: "Rain",
  RAIN6: "Rain6",
  RAIN6H: "Rain6",
  VISIBILITY: "Visibility",
  VIS: "Visibility",
  VV: "Visibility",
  SLP: "SLP",
  HEIGHT: "Height",
  HGT: "Height",
};

export function normalizeFilterField(field) {
  if (field === undefined || field === null) return null;
  const key = String(field).trim().toUpperCase();
  if (!key || key === "NONE") return null;
  return VIEW_FIELD_ALIASES[key] || null;
}

function ruleIsActive(r) {
  return Boolean(
    r && r.field && r.field !== "none" &&
    r.val !== undefined && r.val !== null && r.val !== "" &&
    !isNaN(Number(r.val))
  );
}

// Active rules in normalized { field, op, val, val2 } shape, from either the
// modern filterRules array or the legacy filterField1/filterField2 shape.
export function collectActiveRules(cfg) {
  const out = [];
  if (!cfg) return out;
  if (Array.isArray(cfg.filterRules)) {
    for (const r of cfg.filterRules) {
      if (ruleIsActive(r)) {
        out.push({ field: r.field, op: r.op || ">", val: r.val, val2: r.val2 });
      }
    }
    return out;
  }
  if (
    cfg.filterField1 && cfg.filterField1 !== "none" &&
    cfg.filterVal1 !== undefined && cfg.filterVal1 !== null && cfg.filterVal1 !== "" &&
    !isNaN(Number(cfg.filterVal1))
  ) {
    out.push({ field: cfg.filterField1, op: cfg.filterOp1 || ">", val: cfg.filterVal1 });
  }
  if (
    cfg.filterField2 && cfg.filterField2 !== "none" &&
    cfg.filterVal2 !== undefined && cfg.filterVal2 !== null && cfg.filterVal2 !== "" &&
    !isNaN(Number(cfg.filterVal2))
  ) {
    out.push({ field: cfg.filterField2, op: cfg.filterOp2 || "<", val: cfg.filterVal2 });
  }
  return out;
}

// ViewOnly element gate: an element is drawn iff every active rule on its
// own field passes. Fields without rules (or unknown fields) default to
// visible, so e.g. a Wind rule hides only wind barbs while visibility,
// temperature, etc. keep showing.
export function isFieldVisibleInView(p, cfg, field) {
  const canonical = normalizeFilterField(field);
  if (!canonical) return true;
  const mine = collectActiveRules(cfg).filter((r) => normalizeFilterField(r.field) === canonical);
  if (mine.length === 0) return true;
  for (const r of mine) {
    if (!evaluateSingleRule(p, r)) return false;
  }
  return true;
}

// Plot-element display toggle (layer.config flag) driven by a filter field.
// Used to auto-check an element when its first ViewOnly rule appears, so a
// new rule (e.g. vis<1km) has a visible effect instead of gating a hidden
// element. Fields without a plotted toggle (Cloud/Weather/Tendency) map
// to null.
const FIELD_CONFIG_FLAGS = {
  TT: "showTemp",
  Td: "showDewpoint",
  DTD: "showDTD",
  Wind: "showWind",
  Rain: "showRain6",
  Rain6: "showRain6",
  Visibility: "showVisibility",
  SLP: "showPressure",
  Height: "showPressure",
};

export function filterFieldToConfigFlag(field) {
  return FIELD_CONFIG_FLAGS[normalizeFilterField(field)] || null;
}

// ViewOnly auto-check patch: { flag: true } for every ruled element that is
// currently off. Pure (does not mutate cfg); callers assign the result to
// the layer config and forward it in the config-change payload. Only
// complete (active) rules trigger; empty rows never flip toggles.
export function getViewAutoCheckPatch(cfg) {
  if (!isViewOnly(cfg)) return {};
  const patch = {};
  for (const r of collectActiveRules(cfg)) {
    const flag = filterFieldToConfigFlag(r.field);
    if (flag && !cfg?.[flag]) patch[flag] = true;
  }
  return patch;
}

export function evaluateSingleRule(p, rule) {
  if (!rule || !rule.field || rule.field === "none") return true;
  const actual = getFieldValue(p, rule.field);
  if (actual === null || isNaN(actual)) return false;

  const op = rule.op || ">";
  const val1 = rule.val !== undefined && rule.val !== null && rule.val !== "" ? Number(rule.val) : null;
  const val2 = rule.val2 !== undefined && rule.val2 !== null && rule.val2 !== "" ? Number(rule.val2) : null;

  if (val1 === null || isNaN(val1)) return true;

  if (op === "between" || op === "BETWEEN" || op === "..") {
    if (val2 === null || isNaN(val2)) return actual >= val1;
    const min = Math.min(val1, val2);
    const max = Math.max(val1, val2);
    return actual >= min && actual <= max;
  }

  switch (op) {
    case ">":
      return actual > val1;
    case ">=":
      return actual >= val1;
    case "<":
      return actual < val1;
    case "<=":
      return actual <= val1;
    case "==":
    case "=":
      return Math.abs(actual - val1) < 0.05;
    case "!=":
      return Math.abs(actual - val1) >= 0.05;
    default:
      return true;
  }
}

export function matchesStationFilters(p, cfg) {
  if (!cfg) return true;
  // ViewOnly never hides stations; per-element gating happens at render.
  if (isViewOnly(cfg)) return true;

  if (Array.isArray(cfg.filterRules)) {
    const activeRules = cfg.filterRules.filter(
      (r) => r.field && r.field !== "none" && r.val !== undefined && r.val !== null && r.val !== "" && !isNaN(Number(r.val))
    );
    if (activeRules.length === 0) return true;

    const logic = (cfg.filterLogic || "AND").toUpperCase();
    if (logic === "NONE") {
      return evaluateSingleRule(p, activeRules[0]);
    }
    if (logic === "OR") {
      return activeRules.some((r) => evaluateSingleRule(p, r));
    }
    return activeRules.every((r) => evaluateSingleRule(p, r));
  }

  const f1 = cfg.filterField1 || "none";
  const op1 = cfg.filterOp1 || ">";
  const val1 = cfg.filterVal1;

  const logic = cfg.filterLogic || "none";

  const f2 = cfg.filterField2 || "none";
  const op2 = cfg.filterOp2 || "<";
  const val2 = cfg.filterVal2;

  const has1 = f1 !== "none" && val1 !== undefined && val1 !== null && val1 !== "" && !isNaN(Number(val1));
  const has2 = f2 !== "none" && val2 !== undefined && val2 !== null && val2 !== "" && !isNaN(Number(val2));

  if (!has1 && !has2) return true;
  if (logic === "none" || !has2) return has1 ? evaluateSingleRule(p, { field: f1, op: op1, val: val1, val2: cfg.filterVal1_2 ?? cfg.filterVal2 }) : true;
  if (!has1 && has2) return evaluateSingleRule(p, { field: f2, op: op2, val: val2, val2: cfg.filterVal2_2 });

  const res1 = evaluateSingleRule(p, { field: f1, op: op1, val: val1, val2: cfg.filterVal1_2 ?? cfg.filterVal2 });
  const res2 = evaluateSingleRule(p, { field: f2, op: op2, val: val2, val2: cfg.filterVal2_2 });

  if (logic === "OR" || logic === "or") {
    return res1 || res2;
  }
  return res1 && res2;
}

export function compileStationFilter(cfg) {
  if (!cfg) return () => true;
  // ViewOnly never hides stations; per-element gating happens at render.
  if (isViewOnly(cfg)) return () => true;

  if (Array.isArray(cfg.filterRules)) {
    const active = [];
    for (let i = 0; i < cfg.filterRules.length; i++) {
      const r = cfg.filterRules[i];
      if (r && r.field && r.field !== "none" && r.val !== undefined && r.val !== null && r.val !== "") {
        const numVal = Number(r.val);
        if (!isNaN(numVal)) {
          active.push({
            field: r.field,
            op: r.op || ">",
            val: numVal,
            val2: r.val2 !== undefined && r.val2 !== null && r.val2 !== "" ? Number(r.val2) : undefined,
          });
        }
      }
    }

    if (active.length === 0) return () => true;

    const logic = (cfg.filterLogic || "AND").toUpperCase();
    if (logic === "NONE") {
      const r0 = active[0];
      return (p) => evaluateSingleRule(p, r0);
    }
    if (logic === "OR") {
      return (p) => {
        for (let i = 0; i < active.length; i++) {
          if (evaluateSingleRule(p, active[i])) return true;
        }
        return false;
      };
    }
    return (p) => {
      for (let i = 0; i < active.length; i++) {
        if (!evaluateSingleRule(p, active[i])) return false;
      }
      return true;
    };
  }

  return (p) => matchesStationFilters(p, cfg);
}

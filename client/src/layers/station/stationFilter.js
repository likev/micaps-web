// stationFilter.js - Station meteorological filter rules and JIT filter compiler
import { getFieldValue } from "./stationExtract.js";

// ViewOnly per-element match mode ("filterLogic": "VIEW"). Stations are
// never hidden; each rule gates only its own plotted element, and elements
// without rules default to visible.
export const VIEW_LOGIC = "VIEW";

export function isViewOnly(cfg) {
  const logic = cfg?.filterData?.filterLogic ?? cfg?.filterLogic;
  return String(logic ?? "").toUpperCase() === VIEW_LOGIC;
}

const VIEW_FIELD_ALIASES = {
  TT: "TT",
  TEMP: "TT",
  TMP: "TT",
  TEMPERATURE: "TT",
  TEM: "TT",
  TD: "Td",
  DEW: "Td",
  DEWPOINT: "Td",
  DEW_POINT: "Td",
  DPT: "Td",
  DTD: "DTD",
  WIND: "Wind",
  WIN: "Wind",
  WS: "Wind",
  WIND_SPEED: "Wind",
  WINDSPEED: "Wind",
  RAIN: "Rain",
  RAIN6: "Rain6",
  RAIN6H: "Rain6",
  VISIBILITY: "Visibility",
  VIS: "Visibility",
  VV: "Visibility",
  SLP: "SLP",
  PRS: "SLP",
  PRESSURE: "SLP",
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
    r && r.field && String(r.field).trim().toLowerCase() !== "none" &&
    r.val !== undefined && r.val !== null && r.val !== "" &&
    !isNaN(Number(r.val))
  );
}

// Active rules in normalized { field, op, val, val2 } shape, from either the
// modern filterRules array or the legacy filterField1/filterField2 shape.
export function collectActiveRules(cfg) {
  const out = [];
  if (!cfg) return out;
  const rules = (Array.isArray(cfg.filterRules) && cfg.filterRules.length > 0)
    ? cfg.filterRules
    : (Array.isArray(cfg.filterData?.filterRules) && cfg.filterData.filterRules.length > 0
        ? cfg.filterData.filterRules
        : (Array.isArray(cfg.filterRules) ? cfg.filterRules : (Array.isArray(cfg.filterData?.filterRules) ? cfg.filterData.filterRules : null)));
  if (rules) {
    for (const r of rules) {
      if (ruleIsActive(r)) {
        out.push({ field: r.field, op: r.op || ">", val: r.val, val2: r.val2 });
      }
    }
    if (out.length > 0) return out;
  }
  const f1 = cfg.filterField1 ?? cfg.filterData?.filterField1;
  const val1 = cfg.filterVal1 ?? cfg.filterData?.filterVal1;
  const op1 = cfg.filterOp1 ?? cfg.filterData?.filterOp1 ?? ">";
  if (
    f1 && String(f1).trim().toLowerCase() !== "none" &&
    val1 !== undefined && val1 !== null && val1 !== "" &&
    !isNaN(Number(val1))
  ) {
    out.push({ field: f1, op: op1, val: val1 });
  }
  const f2 = cfg.filterField2 ?? cfg.filterData?.filterField2;
  const val2 = cfg.filterVal2 ?? cfg.filterData?.filterVal2;
  const op2 = cfg.filterOp2 ?? cfg.filterData?.filterOp2 ?? "<";
  if (
    f2 && String(f2).trim().toLowerCase() !== "none" &&
    val2 !== undefined && val2 !== null && val2 !== "" &&
    !isNaN(Number(val2))
  ) {
    out.push({ field: f2, op: op2, val: val2 });
  }
  return out;
}

export function hasActiveStationFilters(cfg) {
  if (!cfg || isViewOnly(cfg)) return false;
  return collectActiveRules(cfg).length > 0;
}

export const hasActiveFilters = hasActiveStationFilters;

export function hasActiveRules(cfg) {
  if (!cfg) return false;
  return collectActiveRules(cfg).length > 0;
}

export function isFieldFiltered(cfg, field) {
  const canonical = normalizeFilterField(field);
  if (!canonical) return false;
  return collectActiveRules(cfg).some((r) => {
    const rc = normalizeFilterField(r.field);
    if (rc === canonical) return true;
    if ((canonical === "Rain" || canonical === "Rain6") && (rc === "Rain" || rc === "Rain6")) return true;
    if ((canonical === "SLP" || canonical === "Height") && (rc === "SLP" || rc === "Height")) return true;
    return false;
  });
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
  if (!rule || !rule.field || String(rule.field).trim().toLowerCase() === "none") return true;
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

  const rules = (Array.isArray(cfg.filterRules) && cfg.filterRules.length > 0)
    ? cfg.filterRules
    : (Array.isArray(cfg.filterData?.filterRules) && cfg.filterData.filterRules.length > 0
        ? cfg.filterData.filterRules
        : (Array.isArray(cfg.filterRules) ? cfg.filterRules : (Array.isArray(cfg.filterData?.filterRules) ? cfg.filterData.filterRules : null)));

  if (rules) {
    const activeRules = rules.filter(ruleIsActive);
    if (activeRules.length === 0) return true;

    const logic = ((cfg.filterLogic ?? cfg.filterData?.filterLogic) || "AND").toUpperCase();
    if (logic === "NONE") {
      return evaluateSingleRule(p, activeRules[0]);
    }
    if (logic === "OR") {
      return activeRules.some((r) => evaluateSingleRule(p, r));
    }
    return activeRules.every((r) => evaluateSingleRule(p, r));
  }

  const f1 = cfg.filterField1 ?? cfg.filterData?.filterField1 ?? "none";
  const op1 = cfg.filterOp1 ?? cfg.filterData?.filterOp1 ?? ">";
  const val1 = cfg.filterVal1 ?? cfg.filterData?.filterVal1;

  const logic = String(cfg.filterLogic ?? cfg.filterData?.filterLogic ?? "none").toLowerCase();

  const f2 = cfg.filterField2 ?? cfg.filterData?.filterField2 ?? "none";
  const op2 = cfg.filterOp2 ?? cfg.filterData?.filterOp2 ?? "<";
  const val2 = cfg.filterVal2 ?? cfg.filterData?.filterVal2;

  const has1 = String(f1).trim().toLowerCase() !== "none" && val1 !== undefined && val1 !== null && val1 !== "" && !isNaN(Number(val1));
  const has2 = String(f2).trim().toLowerCase() !== "none" && val2 !== undefined && val2 !== null && val2 !== "" && !isNaN(Number(val2));

  if (!has1 && !has2) return true;
  if (logic === "none" || !has2) return has1 ? evaluateSingleRule(p, { field: f1, op: op1, val: val1, val2: cfg.filterVal1_2 ?? cfg.filterVal2 ?? cfg.filterData?.filterVal1_2 ?? cfg.filterData?.filterVal2 }) : true;
  if (!has1 && has2) return evaluateSingleRule(p, { field: f2, op: op2, val: val2, val2: cfg.filterVal2_2 ?? cfg.filterData?.filterVal2_2 });

  const res1 = evaluateSingleRule(p, { field: f1, op: op1, val: val1, val2: cfg.filterVal1_2 ?? cfg.filterVal2 ?? cfg.filterData?.filterVal1_2 ?? cfg.filterData?.filterVal2 });
  const res2 = evaluateSingleRule(p, { field: f2, op: op2, val: val2, val2: cfg.filterVal2_2 ?? cfg.filterData?.filterVal2_2 });

  if (logic === "or") {
    return res1 || res2;
  }
  return res1 && res2;
}

export function compileStationFilter(cfg) {
  if (!cfg) return () => true;
  // ViewOnly never hides stations; per-element gating happens at render.
  if (isViewOnly(cfg)) return () => true;

  const rules = (Array.isArray(cfg.filterRules) && cfg.filterRules.length > 0)
    ? cfg.filterRules
    : (Array.isArray(cfg.filterData?.filterRules) && cfg.filterData.filterRules.length > 0
        ? cfg.filterData.filterRules
        : (Array.isArray(cfg.filterRules) ? cfg.filterRules : (Array.isArray(cfg.filterData?.filterRules) ? cfg.filterData.filterRules : null)));

  if (rules) {
    const active = [];
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (ruleIsActive(r)) {
        active.push({
          field: r.field,
          op: r.op || ">",
          val: Number(r.val),
          val2: r.val2 !== undefined && r.val2 !== null && r.val2 !== "" && !isNaN(Number(r.val2)) ? Number(r.val2) : undefined,
        });
      }
    }

    if (active.length === 0) return () => true;

    const logic = ((cfg.filterLogic ?? cfg.filterData?.filterLogic) || "AND").toUpperCase();
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

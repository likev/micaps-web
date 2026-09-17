// stationFilter.js - Station meteorological filter rules and JIT filter compiler
import { getFieldValue } from "./stationExtract.js";

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

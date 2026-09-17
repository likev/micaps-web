// stationExtract.js - Meteorological field key definitions, value extraction, and station hashing

export const FIELD_KEYS = {
  TEMP: ["temperature", "temp", "TEM", "TT", "T", "TMP", "t", "temp_max", "tem"],
  DEW: ["dewpoint", "dew_point", "DPT", "TD", "Td", "td", "dew", "dpt"],
  WIND_SPEED: ["wind_speed", "windSpeed", "ws", "WIN_S_Avg", "WIN_S", "FF", "ff", "speed"],
  WIND_DIR: ["wind_dir", "windDir", "wd", "WIN_D_Avg", "WIN_D", "DD", "dd", "dir"],
  SLP: ["slp", "SLP", "press_slp", "PRS_Sea", "press_stn", "stn_press", "PRS", "slp_encoded"],
  VISIBILITY: ["visibility", "VIS", "vis", "VV", "vv", "VIS_Avg", "VIS_Min"],
  RAIN_1H: ["rain_1h", "RAIN_1H", "rain1h", "PRE_1h", "RAIN_1h", "RAIN"],
  RAIN_3H: ["rain_3h", "RAIN_3H", "rain3h", "PRE_3h", "RAIN_3h"],
  RAIN_6H: ["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h", "rain_3h", "rain_1h", "rain_12h", "rain_24h", "rain"],
  RAIN_12H: ["rain_12h", "RAIN_12H", "rain12h", "PRE_12h", "RAIN_12h"],
  RAIN_24H: ["rain_24h", "RAIN_24H", "rain24h", "PRE_24h", "RAIN_24h"],
  RAIN_GEN: ["rain", "RAIN"],
  HEIGHT: ["height", "HGT", "hgt", "Height", "GH"],
};

export function extractRawNumber(props, keys, minValid = -Infinity, maxValid = Infinity) {
  if (!props) return null;
  for (const k of keys) {
    const v = props[k];
    if (v !== undefined && v !== null && v !== "" && v !== -9999 && v !== "-9999") {
      const num = typeof v === "number" ? v : parseFloat(v);
      if (!isNaN(num) && num > -9000 && num < 9000) {
        if (num >= minValid && num <= maxValid) {
          return num;
        }
      }
    }
  }
  return null;
}

export function extractTemp(props, keys, minValid = -90, maxValid = 90) {
  if (!props) return null;
  for (const k of keys) {
    const v = props[k];
    if (v !== undefined && v !== null && v !== "" && v !== -9999 && v !== "-9999") {
      let num = typeof v === "number" ? v : parseFloat(v);
      if (!isNaN(num) && num > -9000 && num < 9000) {
        if (num > 150 && num < 373.15) {
          num = num - 273.15; // Kelvin to Celsius
        } else if ((num > 60 && num <= 600) || (num < -60 && num >= -600)) {
          num = num / 10.0; // Tenths of °C
        } else if (num > 600 && num <= 6000) {
          num = num / 100.0; // Hundredths of °C
        }
        if (num >= minValid && num <= maxValid) {
          return num;
        }
      }
    }
  }
  return null;
}

export function extractPressureOrHeight(props) {
  if (!props) return "";

  // 1. Surface observation with SLP / station pressure
  for (const k of FIELD_KEYS.SLP) {
    const v = props[k];
    if (v !== undefined && v !== null && v !== "" && v !== "---" && v !== -9999 && v !== "-9999") {
      if (typeof v === "string" && v.length === 3 && !isNaN(parseInt(v, 10))) {
        const enc = parseInt(v, 10);
        const dec = enc <= 600 ? enc / 10.0 + 1000.0 : enc / 10.0 + 900.0;
        const rounded = Math.round(dec * 10) / 10;
        return rounded.toString();
      }
      let num = typeof v === "number" ? v : parseFloat(v);
      if (!isNaN(num) && num > 0 && num < 110000) {
        if (num > 8000 && num < 110000) num = num / 100.0;
        else if (num > 8000 && num < 11000) num = num / 10.0;
        if (num >= 800 && num <= 1100) {
          const rounded = Math.round(num * 10) / 10;
          return rounded.toString();
        }
      }
    }
  }

  // 2. Upper-air sounding with geopotential height
  if (props.height !== undefined && props.height !== null && props.height !== -9999 && props.height !== "-9999") {
    let num = typeof props.height === "number" ? props.height : parseFloat(props.height);
    if (!isNaN(num) && num > -500 && num < 45000) {
      if (num >= 1000) {
        const dam = Math.round(num / 10);
        return String(dam % 1000).padStart(3, "0");
      } else if (num >= 100) {
        return String(Math.round(num)).padStart(3, "0");
      } else if (num >= 0) {
        return String(Math.round(num * 10)).padStart(3, "0");
      }
      return Math.round(num).toString();
    }
  }

  return "";
}

export function hashStation(id, lon, lat) {
  let h = 2166136261;
  const str = `${id || ""}_${lon.toFixed(4)}_${lat.toFixed(4)}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

export function getFieldValue(p, field) {
  switch (field) {
    case "TT":
      return extractTemp(p, FIELD_KEYS.TEMP);
    case "Td":
      return extractTemp(p, FIELD_KEYS.DEW);
    case "DTD": {
      const t = extractTemp(p, FIELD_KEYS.TEMP);
      const td = extractTemp(p, FIELD_KEYS.DEW);
      if (t === null || td === null) return null;
      if (td > 50) return null;
      if (td > t + 0.5) return null;
      let dtd = t - td;
      if (dtd < 0) dtd = 0;
      if (dtd > 45) return null;
      return dtd;
    }
    case "Wind": {
      const ws = extractRawNumber(p, FIELD_KEYS.WIND_SPEED, 0, 150);
      return ws !== null ? (ws > 100 ? ws / 10.0 : ws) : null;
    }
    case "Rain": {
      const r1 = extractRawNumber(p, FIELD_KEYS.RAIN_1H);
      const r3 = extractRawNumber(p, FIELD_KEYS.RAIN_3H);
      const r6 = extractRawNumber(p, ["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h"]);
      const r12 = extractRawNumber(p, FIELD_KEYS.RAIN_12H);
      const r24 = extractRawNumber(p, FIELD_KEYS.RAIN_24H);
      const rGen = extractRawNumber(p, FIELD_KEYS.RAIN_GEN);
      return Math.max(r1 || 0, r3 || 0, r6 || 0, r12 || 0, r24 || 0, rGen || 0);
    }
    case "Rain6":
    case "Rain6h":
    case "rain_6h": {
      return extractRawNumber(p, FIELD_KEYS.RAIN_6H, 0, 1000);
    }
    case "Visibility":
    case "Vis":
    case "VV":
    case "vis": {
      const v = extractRawNumber(p, FIELD_KEYS.VISIBILITY, 0, 150000);
      return v !== null ? (v > 150 ? v / 1000.0 : v) : null;
    }
    case "SLP": {
      const slp = extractRawNumber(p, ["slp", "SLP", "press_slp", "PRS_Sea", "press_stn", "stn_press", "PRS"]);
      if (slp !== null && slp > 8000) return slp / 10.0;
      return slp;
    }
    case "Height":
    case "HGT": {
      return extractRawNumber(p, FIELD_KEYS.HEIGHT, -500, 45000);
    }
    default:
      return null;
  }
}

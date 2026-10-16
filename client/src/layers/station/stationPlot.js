// stationPlot.js - High-performance 9-point meteorological station weather plot canvas renderer
import { getWeatherSymbol, getPressureTendencyGlyph } from "../../utils/weatherSymbols.js";
import {
  extractRawNumber,
  extractTemp,
  extractPressureOrHeight,
} from "./stationExtract.js";
import {
  drawWindBarbCanvas,
  drawSkyCoverCanvas,
} from "./stationSymbols.js";
import {
  isViewOnly,
  isFieldVisibleInView,
} from "./stationFilter.js";
import { getPlotTokens } from "../../map/themeTokens.js";

export function renderStationPlotToCanvas(ctx, p, cx, cy, cfg = {}, scale = 1.0, allowedFields = null) {
  if (typeof cx === "object" && cx !== null) {
    allowedFields = typeof scale === "object" ? scale : null;
    scale = typeof cy === "number" ? cy : 1.0;
    cfg = cx;
    cx = p?.x || 0;
    cy = p?.y || 0;
  }

  const rawT = extractTemp(p, ["temperature", "temp", "TEM", "TT", "T", "TMP", "t", "temp_max", "tem"]);
  const tt = rawT !== null ? Math.round(rawT).toString() : "";

  const rawTd = extractTemp(p, ["dewpoint", "dew_point", "DPT", "TD", "Td", "td", "dew", "dpt"]);
  const td = rawTd !== null ? Math.round(rawTd).toString() : "";

  const ppp = extractPressureOrHeight(p);

  const rawWs = extractRawNumber(p, ["wind_speed", "windSpeed", "ws", "WIN_S_Avg", "WIN_S", "FF", "ff", "speed"], 0, 150);
  const ws = rawWs !== null ? (rawWs > 100 ? rawWs / 10.0 : rawWs) : null;
  const wd = extractRawNumber(p, ["wind_dir", "windDir", "wd", "WIN_D_Avg", "WIN_D", "DD", "dd", "dir"], 0, 360);

  const rawCloud = extractRawNumber(p, ["cloud_cover", "cloudCover", "cloud", "CLO_Cov", "N", "n"], 0, 9);
  const cloudCover = rawCloud !== null ? Math.round(rawCloud) : 0;

  const weatherCode = extractRawNumber(p, ["weather_code", "weatherCode", "weather", "Ww", "ww", "WEA"], 0, 99) || 0;

  const pDiffRaw = extractRawNumber(p, ["press_diff_3h", "pDiff3h", "pDiff", "press_diff", "PRS_Change_3h", "p3", "press_change_3h"], -500, 500);
  const pDiff = pDiffRaw !== null && Math.abs(pDiffRaw) > 0.05
    ? `${pDiffRaw > 0 ? "+" : ""}${Math.abs(pDiffRaw) > 30 ? Math.round(pDiffRaw) : (Math.abs(pDiffRaw) < 10 && !Number.isInteger(pDiffRaw) ? pDiffRaw.toFixed(1) : Math.round(pDiffRaw * 10))}`
    : "";

  const pDiff24Raw = extractRawNumber(p, ["press_diff_24h", "pDiff24h", "pDiff24", "press_diff_24", "PRS_Change_24h", "p24", "press_change_24h"], -500, 500);
  const pDiff24 = pDiff24Raw !== null && Math.abs(pDiff24Raw) > 0.05
    ? `${pDiff24Raw > 0 ? "+" : ""}${Math.abs(pDiff24Raw) > 30 ? Math.round(pDiff24Raw) : (Math.abs(pDiff24Raw) < 10 && !Number.isInteger(pDiff24Raw) ? pDiff24Raw.toFixed(1) : Math.round(pDiff24Raw * 10))}`
    : "";

  const rawSnow = extractRawNumber(p, ["snow_depth", "snowDepth", "snow", "SNOW", "sno", "SD", "sd", "snod"], 0, 10000);
  const snowDepth = rawSnow !== null ? Math.round(rawSnow).toString() : "";

  const pTendCode = extractRawNumber(p, ["press_tend", "pTend", "PRS_Tendency", "a"], 0, 8);
  const pTend = pTendCode !== null ? getPressureTendencyGlyph(pTendCode) : "";

  const showTemp = cfg.showTemp !== undefined ? Boolean(cfg.showTemp) : true;
  const showDewpoint = cfg.showDewpoint !== undefined ? Boolean(cfg.showDewpoint) : true;
  const showWind = cfg.showWind !== undefined ? Boolean(cfg.showWind) : true;
  const showDTD = Boolean(cfg.showDTD);
  const showCloud = Boolean(cfg.showCloud);
  const showWeather = Boolean(cfg.showWeather);
  const showPressure = Boolean(cfg.showPressure);
  const showTendency = cfg.showTendency !== undefined
    ? Boolean(cfg.showTendency)
    : Boolean(cfg.showPressureChange || cfg.showPressDiff3h || cfg.showPressDiff24h);
  const showVisibility = Boolean(cfg.showVisibility);
  const showRain6 = Boolean(cfg.showRain6);
  const showSnowDepth = cfg.showSnowDepth !== undefined ? Boolean(cfg.showSnowDepth) : true;

  let dtd = "";
  if (rawT !== null && rawTd !== null && rawTd <= 50 && rawTd <= rawT + 0.5) {
    const dVal = rawT - rawTd;
    if (dVal >= 0 && dVal <= 45) {
      dtd = Math.round(dVal).toString();
    }
  }

  const rawVis = extractRawNumber(p, ["visibility", "VIS", "vis", "VV", "vv", "VIS_Avg", "VIS_Min"], 0, 150000);
  const vis = rawVis !== null
    ? (rawVis >= 1000 ? Math.round(rawVis / 1000).toString() : Math.round(rawVis).toString())
    : "";

  const rawRain6 = extractRawNumber(p, ["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h", "rain_3h", "rain_1h", "rain_12h", "rain_24h", "rain"], 0, 1000);
  const rain6 = rawRain6 !== null && rawRain6 > 0 ? Math.round(rawRain6).toString() : "";

  const theme = getPlotTokens(cfg.__themeId || cfg.scheme || "dark");

  const ww = getWeatherSymbol(weatherCode);
  // ViewOnly match mode: each rule gates only its own plotted element;
  // elements without rules default to visible. SLP/Height share the PPP
  // slot (surface vs upper-air) and Rain/Rain6 share the R6 slot, so both
  // aliases must pass for those slots to draw.
  const viewMode = isViewOnly(cfg);
  const allowField = (field) => !viewMode || isFieldVisibleInView(p, cfg, field);

  // Per-element zoom culling and grid decluttering gate
  const effectiveAllowed = allowedFields || cfg?._allowedFields || null;
  const isAllowed = (field) => {
    if (!effectiveAllowed) return true;
    if (effectiveAllowed instanceof Set) return effectiveAllowed.has(field);
    if (Array.isArray(effectiveAllowed)) return effectiveAllowed.includes(field);
    if (typeof effectiveAllowed === "function") return effectiveAllowed(field);
    return true;
  };

  const hasDTDPlot = Boolean(showDTD && dtd && isAllowed("DTD") && allowField("DTD"));
  const hasVisPlot = Boolean(showVisibility && vis && isAllowed("Visibility") && allowField("Visibility"));

  // 1. Wind Barb
  if (showWind && isAllowed("Wind") && allowField("Wind") && ws !== null && ws >= 1.5) {
    if (wd !== null && wd >= 0 && wd <= 360) {
      drawWindBarbCanvas(ctx, cx, cy, ws, wd, scale, theme.wind.color);
    }
  }

  // 2. Center Sky Cover or Station Dot
  if (showCloud && isAllowed("Cloud")) {
    drawSkyCoverCanvas(ctx, cx, cy, cloudCover, scale, theme.sky);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5 * scale, 0, Math.PI * 2);
    ctx.fillStyle = theme.dot.fill;
    ctx.fill();
    ctx.strokeStyle = theme.dot.stroke;
    ctx.lineWidth = 0.8 * scale;
    ctx.stroke();
  }

  function drawPlotText(text, x, y, tokenKey, align = "left") {
    if (!text) return;
    const t = theme[tokenKey];
    ctx.font = `${t.weight} ${Math.round(t.size * scale)}px ${theme.font}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.strokeStyle = theme.halo;
    ctx.lineWidth = theme.haloWidth * scale;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = t.color;
    ctx.fillText(text, x, y);
  }

  // 3. TT (Temperature) - Top-Left
  if (showTemp && isAllowed("TT") && allowField("TT") && tt) {
    drawPlotText(tt, cx - 8 * scale, cy - 12 * scale, "tt", "right");
  }

  // 4. DTD (Dew-Point Depression) - Middle-Left
  if (hasDTDPlot) {
    drawPlotText(dtd, cx - 8 * scale, cy, "dtd", "right");
  }

  // 5. TdTd (Dew Point) - Bottom-Left
  if (showDewpoint && isAllowed("Td") && allowField("Td") && td) {
    drawPlotText(td, cx - 8 * scale, cy + 12 * scale, "td", "right");
  }

  // 6. Weather (ww) and Visibility (VV) with DTD displacement collision rules
  if (hasDTDPlot) {
    if (!hasVisPlot && showWeather && ww && isAllowed("Weather")) {
      drawPlotText(ww, cx - 22 * scale, cy, "ww", "center");
    } else if (hasVisPlot) {
      drawPlotText(vis, cx - 22 * scale, cy, "vis", "right");
    }
  } else {
    if (showWeather && ww && isAllowed("Weather")) {
      drawPlotText(ww, cx - 8 * scale, cy, "ww", "center");
    }
    if (hasVisPlot) {
      drawPlotText(vis, cx - 22 * scale, cy, "vis", "right");
    }
  }

  // 7. PPP (Pressure or Height) - Top-Right
  if (showPressure && ppp && (isAllowed("SLP") || isAllowed("Height")) && allowField("SLP") && allowField("Height")) {
    drawPlotText(ppp, cx + 8 * scale, cy - 12 * scale, "ppp", "left");
  }

  // 8. R6 (6h Rain) - Middle-Right
  if (showRain6 && rain6 && (isAllowed("Rain") || isAllowed("Rain6")) && allowField("Rain") && allowField("Rain6")) {
    drawPlotText(rain6, cx + 8 * scale, cy, "rain", "left");
  }

  // Snow Depth (Top-Right if no PPP, otherwise Middle-Right)
  if (showSnowDepth && snowDepth && isAllowed("SnowDepth") && allowField("SnowDepth")) {
    const snowToken = theme.snow ? "snow" : (theme.rain ? "rain" : "ppp");
    if (!ppp || !showPressure) {
      drawPlotText(snowDepth, cx + 8 * scale, cy - 12 * scale, snowToken, "left");
    } else if (!rain6 || !showRain6) {
      drawPlotText(snowDepth, cx + 8 * scale, cy, snowToken, "left");
    } else {
      drawPlotText(snowDepth, cx + 8 * scale, cy + 12 * scale, snowToken, "left");
    }
  }

  // 9. ppa (3h / 24h Pressure Tendency & Diff) - Bottom-Right
  const effectivePDiff = pDiff || pDiff24;
  if (showTendency && (effectivePDiff || pTend) && (isAllowed("Tendency") || isAllowed("PressDiff") || isAllowed("PressureChange"))) {
    drawPlotText(`${effectivePDiff}${pTend}`, cx + 8 * scale, cy + 12 * scale, "tend", "left");
  }
}

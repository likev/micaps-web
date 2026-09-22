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

export function renderStationPlotToCanvas(ctx, p, cx, cy, cfg = {}, scale = 1.0) {
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

  const pDiffRaw = extractRawNumber(p, ["press_diff_3h", "pDiff3h", "press_diff", "PRS_Change_3h", "p3"], -500, 500);
  const pDiff = pDiffRaw !== null && Math.abs(pDiffRaw) > 0.05
    ? `${pDiffRaw > 0 ? "+" : ""}${Math.abs(pDiffRaw) > 30 ? Math.round(pDiffRaw) : Math.round(pDiffRaw * 10)}`
    : "";

  const pTendCode = extractRawNumber(p, ["press_tend", "pTend", "PRS_Tendency", "a"], 0, 8);
  const pTend = pTendCode !== null ? getPressureTendencyGlyph(pTendCode) : "";

  const showTemp = cfg.showTemp !== undefined ? Boolean(cfg.showTemp) : true;
  const showDewpoint = cfg.showDewpoint !== undefined ? Boolean(cfg.showDewpoint) : true;
  const showWind = cfg.showWind !== undefined ? Boolean(cfg.showWind) : true;
  const showDTD = Boolean(cfg.showDTD);
  const showCloud = Boolean(cfg.showCloud);
  const showWeather = Boolean(cfg.showWeather);
  const showPressure = Boolean(cfg.showPressure);
  const showTendency = Boolean(cfg.showTendency);
  const showVisibility = Boolean(cfg.showVisibility);
  const showRain6 = Boolean(cfg.showRain6);

  let dtd = "";
  if (rawT !== null && rawTd !== null && rawTd <= 50 && rawTd <= rawT + 0.5) {
    const dVal = rawT - rawTd;
    if (dVal >= 0 && dVal <= 45) {
      dtd = Math.round(dVal).toString();
    }
  }

  const rawVis = extractRawNumber(p, ["visibility", "VIS", "vis", "VV", "vv", "VIS_Avg", "VIS_Min"], 0, 150000);
  const vis = rawVis !== null ? (rawVis >= 1000 ? (rawVis / 1000).toFixed(rawVis % 1000 === 0 ? 0 : 1) : (rawVis < 10 ? rawVis.toFixed(1) : Math.round(rawVis).toString())) : "";

  const rawRain6 = extractRawNumber(p, ["rain_6h", "RAIN_6H", "rain6h", "PRE_6h", "RAIN_6h", "rain_3h", "rain_1h", "rain_12h", "rain_24h", "rain"], 0, 1000);
  const rain6 = rawRain6 !== null && rawRain6 > 0 ? (rawRain6 < 10 ? rawRain6.toFixed(1) : Math.round(rawRain6).toString()) : "";

  const ww = getWeatherSymbol(weatherCode);
  // ViewOnly match mode: each rule gates only its own plotted element;
  // elements without rules default to visible. SLP/Height share the PPP
  // slot (surface vs upper-air) and Rain/Rain6 share the R6 slot, so both
  // aliases must pass for those slots to draw.
  const viewMode = isViewOnly(cfg);
  const allowField = (field) => !viewMode || isFieldVisibleInView(p, cfg, field);
  const hasDTDPlot = Boolean(showDTD && dtd && allowField("DTD"));
  const hasVisPlot = Boolean(showVisibility && vis && allowField("Visibility"));

  // 1. Wind Barb
  if (showWind && allowField("Wind") && ws !== null && ws >= 0) {
    if (ws < 1.5) {
      drawWindBarbCanvas(ctx, cx, cy, 0, 0, scale);
    } else if (wd !== null && wd >= 0 && wd <= 360) {
      drawWindBarbCanvas(ctx, cx, cy, ws, wd, scale);
    }
  }

  // 2. Center Sky Cover or Station Dot
  if (showCloud) {
    drawSkyCoverCanvas(ctx, cx, cy, cloudCover, scale);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5 * scale, 0, Math.PI * 2);
    ctx.fillStyle = "#e3b341";
    ctx.fill();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 0.8 * scale;
    ctx.stroke();
  }

  function drawPlotText(text, x, y, color, fontSize, align = "left", weight = "700") {
    if (!text) return;
    ctx.font = `${weight} ${Math.round(fontSize * scale)}px 'SF Mono', -apple-system, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.lineWidth = 2.5 * scale;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // 3. TT (Temperature) - Top-Left in Bold Red
  if (showTemp && allowField("TT") && tt) {
    drawPlotText(tt, cx - 8 * scale, cy - 12 * scale, "#f85149", 13, "right", "700");
  }

  // 4. DTD (Dew-Point Depression) - Middle-Left in Bold Orange
  if (hasDTDPlot) {
    drawPlotText(dtd, cx - 8 * scale, cy, "#f0883e", 12, "right", "700");
  }

  // 5. TdTd (Dew Point) - Bottom-Left in Emerald Green
  if (showDewpoint && allowField("Td") && td) {
    drawPlotText(td, cx - 8 * scale, cy + 12 * scale, "#56d364", 13, "right", "700");
  }

  // 6. Weather (ww) and Visibility (VV) with DTD displacement collision rules
  if (hasDTDPlot) {
    if (!hasVisPlot && showWeather && ww) {
      drawPlotText(ww, cx - 22 * scale, cy, "#e3b341", 15, "center", "normal");
    } else if (hasVisPlot) {
      drawPlotText(vis, cx - 22 * scale, cy, "#ffd33d", 12, "right", "700");
    }
  } else {
    if (showWeather && ww) {
      drawPlotText(ww, cx - 8 * scale, cy, "#e3b341", 15, "center", "normal");
    }
    if (hasVisPlot) {
      drawPlotText(vis, cx - 22 * scale, cy, "#ffd33d", 12, "right", "700");
    }
  }

  // 7. PPP (Pressure or Height) - Top-Right in Cyan/Blue
  if (showPressure && ppp && allowField("SLP") && allowField("Height")) {
    drawPlotText(ppp, cx + 8 * scale, cy - 12 * scale, "#79c0ff", 13, "left", "700");
  }

  // 8. R6 (6h Rain) - Middle-Right in Sky Blue
  if (showRain6 && rain6 && allowField("Rain") && allowField("Rain6")) {
    drawPlotText(rain6, cx + 8 * scale, cy, "#38bdf8", 12, "left", "700");
  }

  // 9. ppa (3h Pressure Tendency & Diff) - Bottom-Right in Light Blue
  if (showTendency && (pDiff || pTend)) {
    drawPlotText(`${pDiff}${pTend}`, cx + 8 * scale, cy + 12 * scale, "#a5d6ff", 11, "left", "600");
  }
}

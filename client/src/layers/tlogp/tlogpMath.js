// tlogpMath.js - Skew-T coordinate transforms and multi-level convective thermodynamic calculations

export const P_BOTTOM = 1050; // hPa
export const P_TOP = 100;     // hPa
// Horizontal temperature range at diagram base. Skewed isotherms tilt up and to the right by SKEW_FACTOR * yNorm,
// allowing cold upper-tropospheric isotherms down to -80°C to be visualized in the diagram interior.
export const T_MIN = -45;     // °C at bottom
export const T_MAX = 45;      // °C at bottom
export const SKEW_FACTOR = 0.85; // Classic ~45° Skew-T slope factor

export const RD = 287.058;    // J/(kg*K) Gas constant for dry air
export const CPD = 1005.7;    // J/(kg*K) Specific heat at constant pressure
export const KAPPA = RD / CPD; // ~0.2854
export const EPSILON = 0.622; // Rd / Rv

/**
 * Pressure to normalized Y coordinate (0 at bottom P_BOTTOM, 1 at top P_TOP)
 */
export function pressureToYNorm(p, pBottom = P_BOTTOM, pTop = P_TOP) {
  if (p <= 0) return 1.0;
  const clampedP = Math.max(pTop, Math.min(pBottom, p));
  return (Math.log(pBottom) - Math.log(clampedP)) / (Math.log(pBottom) - Math.log(pTop));
}

/**
 * Normalized Y coordinate to pressure
 */
export function yNormToPressure(yNorm, pBottom = P_BOTTOM, pTop = P_TOP) {
  const clampedY = Math.max(0, Math.min(1, yNorm));
  return pBottom * Math.pow(pTop / pBottom, clampedY);
}

/**
 * Pressure to pixel Y on canvas
 */
export function pressureToY(p, rect, pBottom = P_BOTTOM, pTop = P_TOP) {
  const yNorm = pressureToYNorm(p, pBottom, pTop);
  return rect.y + (1 - yNorm) * rect.height;
}

/**
 * Pixel Y on canvas to pressure
 */
export function yToPressure(y, rect, pBottom = P_BOTTOM, pTop = P_TOP) {
  const yNorm = 1 - (y - rect.y) / rect.height;
  return yNormToPressure(yNorm, pBottom, pTop);
}

/**
 * Temperature and pressure to pixel X on canvas with Skew-T shift
 */
export function tempAndPressureToX(
  t,
  p,
  rect,
  tMin = T_MIN,
  tMax = T_MAX,
  skewFactor = SKEW_FACTOR,
  pBottom = P_BOTTOM,
  pTop = P_TOP
) {
  const yNorm = pressureToYNorm(p, pBottom, pTop);
  // Linear position at base
  const xNormBase = (t - tMin) / (tMax - tMin);
  // Skew offset shifts right as altitude increases (yNorm increases)
  const xNorm = xNormBase + skewFactor * yNorm;
  return rect.x + xNorm * rect.width;
}

/**
 * Pixel X and Y on canvas to temperature
 */
export function xAndYToTemp(
  x,
  y,
  rect,
  tMin = T_MIN,
  tMax = T_MAX,
  skewFactor = SKEW_FACTOR,
  pBottom = P_BOTTOM,
  pTop = P_TOP
) {
  const p = yToPressure(y, rect, pBottom, pTop);
  const yNorm = pressureToYNorm(p, pBottom, pTop);
  const xNorm = (x - rect.x) / rect.width;
  const xNormBase = xNorm - skewFactor * yNorm;
  return tMin + xNormBase * (tMax - tMin);
}

/**
 * Saturation vapor pressure (hPa) using Bolton (1980) formula
 */
export function saturationVaporPressure(tCelsius) {
  return 6.112 * Math.exp((17.67 * tCelsius) / (tCelsius + 243.5));
}

/**
 * Saturation mixing ratio (g/kg)
 */
export function saturationMixingRatio(tCelsius, p) {
  const es = saturationVaporPressure(tCelsius);
  if (p <= es) return 999.0;
  return 622.0 * (es / (p - es));
}

/**
 * Temperature (°C) corresponding to a saturation mixing ratio w (g/kg) at pressure p (hPa)
 */
export function tempFromSaturationMixingRatio(w, p) {
  const es = (w * p) / (622.0 + w);
  if (es <= 0 || es >= p) return -999.0;
  const val = Math.log(es / 6.112);
  return (243.5 * val) / (17.67 - val);
}

/**
 * Potential temperature theta (°C)
 */
export function potentialTemperature(tCelsius, p) {
  const tk = tCelsius + 273.15;
  const thetaK = tk * Math.pow(1000.0 / p, KAPPA);
  return thetaK - 273.15;
}

/**
 * Temperature (°C) given potential temperature theta (°C) and pressure p (hPa)
 */
export function tempFromPotentialTemperature(thetaCelsius, p) {
  const thetaK = thetaCelsius + 273.15;
  const tk = thetaK * Math.pow(p / 1000.0, KAPPA);
  return tk - 273.15;
}

/**
 * Virtual temperature Tv (°C)
 */
export function virtualTemperature(tCelsius, wGramsPerKg) {
  const tk = tCelsius + 273.15;
  const w = Math.max(0, wGramsPerKg || 0) / 1000.0;
  const tvK = tk * (1.0 + 0.608 * w);
  return tvK - 273.15;
}

/**
 * Saturated adiabatic lapse rate dT/dp (K/hPa)
 */
export function saturatedLapseRate(tCelsius, p) {
  const tk = tCelsius + 273.15;
  const ws = (saturationMixingRatio(tCelsius, p) || 0) / 1000.0; // kg/kg
  const lv = 2.501e6 - 2370.0 * tCelsius; // J/kg Latent heat of vaporization

  const num = (RD * tk + lv * ws);
  const den = p * (CPD + (lv * lv * ws * EPSILON) / (RD * tk * tk));
  return num / den;
}

/**
 * Lifting Condensation Level (LCL) using Bolton (1980)
 */
export function calculateLCL(tCelsius, tdCelsius, p) {
  if (tdCelsius >= tCelsius) {
    return { pLCL: p, tLCL: tCelsius };
  }
  const tk = tCelsius + 273.15;
  const tdk = tdCelsius + 273.15;

  const tLclK = 1.0 / (1.0 / (tdk - 56.0) + Math.log(tk / tdk) / 800.0) + 56.0;
  const tLCL = tLclK - 273.15;

  const pLCL = p * Math.pow(tLclK / tk, 1.0 / KAPPA);
  return {
    pLCL: Math.min(p, pLCL),
    tLCL,
  };
}

/**
 * Trace saturated pseudoadiabat from (tInit, pInit) up to pEnd using RK4
 */
export function traceMoistAdiabat(tInit, pInit, pEnd = P_TOP, dpStep = -5) {
  const points = [{ p: pInit, t: tInit }];
  let curP = pInit;
  let curT = tInit;

  while (curP > pEnd) {
    let dp = dpStep;
    if (curP + dp < pEnd) {
      dp = pEnd - curP;
    }

    // Runge-Kutta 4th Order
    const k1 = dp * saturatedLapseRate(curT, curP);
    const k2 = dp * saturatedLapseRate(curT + 0.5 * k1, curP + 0.5 * dp);
    const k3 = dp * saturatedLapseRate(curT + 0.5 * k2, curP + 0.5 * dp);
    const k4 = dp * saturatedLapseRate(curT + k3, curP + dp);

    curT += (k1 + 2 * k2 + 2 * k3 + k4) / 6.0;
    curP += dp;

    points.push({ p: Math.round(curP * 10) / 10, t: Math.round(curT * 100) / 100 });
  }

  return points;
}

/**
 * Interpolate temperature and dewpoint from sounding at target pressure
 */
export function interpolateSoundingAtPressure(soundingLevels, targetP) {
  if (!soundingLevels || soundingLevels.length === 0) return null;

  // Filter valid levels
  const valid = soundingLevels.filter((l) => l.pressure > 0 && l.temp > -9000);
  if (valid.length === 0) return null;

  // Exact match
  const exact = valid.find((l) => Math.abs(l.pressure - targetP) < 0.2);
  if (exact) {
    return {
      pressure: targetP,
      temp: exact.temp,
      dewPoint: exact.dewPoint > -9000 ? Math.min(exact.temp, exact.dewPoint) : exact.temp - 5,
      height: exact.height > -9000 ? exact.height : 0,
      windDir: exact.windDir >= 0 ? exact.windDir : 0,
      windSpeed: exact.windSpeed >= 0 ? exact.windSpeed : 0,
    };
  }

  // Sort descending by pressure (surface to top)
  const sorted = [...valid].sort((a, b) => b.pressure - a.pressure);

  if (targetP >= sorted[0].pressure) {
    const l = sorted[0];
    return {
      pressure: targetP,
      temp: l.temp,
      dewPoint: l.dewPoint > -9000 ? Math.min(l.temp, l.dewPoint) : l.temp - 5,
      height: l.height > -9000 ? l.height : 0,
      windDir: l.windDir >= 0 ? l.windDir : 0,
      windSpeed: l.windSpeed >= 0 ? l.windSpeed : 0,
    };
  }

  if (targetP <= sorted[sorted.length - 1].pressure) {
    const l = sorted[sorted.length - 1];
    return {
      pressure: targetP,
      temp: l.temp,
      dewPoint: l.dewPoint > -9000 ? Math.min(l.temp, l.dewPoint) : l.temp - 5,
      height: l.height > -9000 ? l.height : 0,
      windDir: l.windDir >= 0 ? l.windDir : 0,
      windSpeed: l.windSpeed >= 0 ? l.windSpeed : 0,
    };
  }

  // Interpolate between p1 and p2 using ln(p)
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i].pressure;
    const p2 = sorted[i + 1].pressure;
    if (targetP <= p1 && targetP >= p2) {
      const lnP1 = Math.log(p1);
      const lnP2 = Math.log(p2);
      const lnP = Math.log(targetP);
      const factor = (lnP1 - lnP) / (lnP1 - lnP2);

      const t = sorted[i].temp + factor * (sorted[i + 1].temp - sorted[i].temp);
      let td1 = sorted[i].dewPoint > -9000 ? sorted[i].dewPoint : sorted[i].temp - 5;
      let td2 = sorted[i + 1].dewPoint > -9000 ? sorted[i + 1].dewPoint : sorted[i + 1].temp - 5;
      const td = Math.min(t, td1 + factor * (td2 - td1));

      return {
        pressure: targetP,
        temp: Math.round(t * 100) / 100,
        dewPoint: Math.round(td * 100) / 100,
        height: sorted[i].height + factor * (sorted[i + 1].height - sorted[i].height),
        windDir: sorted[i].windDir >= 0 ? sorted[i].windDir : sorted[i + 1].windDir,
        windSpeed: sorted[i].windSpeed >= 0 ? sorted[i].windSpeed + factor * (sorted[i + 1].windSpeed - sorted[i].windSpeed) : 0,
      };
    }
  }

  return null;
}

/**
 * Multi-Level Convective Parcel Ascent
 * Starts from Surface, 925, 850, 700, or a custom pressure
 */
export function computeParcelAscent(soundingLevels, parcelOption = "surface", customPressure = null) {
  if (!soundingLevels || soundingLevels.length === 0) {
    return null;
  }

  // Find lowest valid observation level for surface (reuse pre-sorted array if provided)
  const sorted = soundingLevels._sorted || [...soundingLevels]
    .filter((l) => l.pressure > 0 && l.temp > -9000)
    .sort((a, b) => b.pressure - a.pressure);

  if (sorted.length === 0) return null;

  let targetP;
  if (parcelOption === "925") targetP = 925;
  else if (parcelOption === "850") targetP = 850;
  else if (parcelOption === "700") targetP = 700;
  else if (typeof parcelOption === "number") targetP = parcelOption;
  else if (parcelOption === "custom") targetP = customPressure || 700;
  else targetP = sorted[0].pressure; // surface default

  // Don't lift from below surface
  if (targetP > sorted[0].pressure) {
    targetP = sorted[0].pressure;
  }

  const initObs = interpolateSoundingAtPressure(sorted, targetP);
  if (!initObs) return null;

  const pInit = initObs.pressure;
  const tInit = initObs.temp;
  const tdInit = initObs.dewPoint > -9000 ? Math.min(tInit, initObs.dewPoint) : tInit - 4.0;

  // 1. Elevated LCL
  const { pLCL, tLCL } = calculateLCL(tInit, tdInit, pInit);
  const wInit = saturationMixingRatio(tdInit, pInit);

  // 2. Trajectory points upward to P_TOP
  const trajectory = [];
  const dp = 5.0; // 5 hPa integration intervals
  let curT = tInit;

  for (let p = pInit; p >= P_TOP; p -= dp) {
    let tParcel;
    let wParcel;

    if (p >= pLCL) {
      // Dry adiabatic ascent
      tParcel = tempFromPotentialTemperature(potentialTemperature(tInit, pInit), p);
      wParcel = wInit;
    } else {
      // Moist pseudoadiabatic ascent
      if (trajectory.length > 0 && trajectory[trajectory.length - 1].p > pLCL) {
        // Just crossed LCL, anchor to tLCL
        curT = tLCL;
      }
      const dt_dp = saturatedLapseRate(curT, p - dp * 0.5);
      curT -= dt_dp * dp;
      tParcel = curT;
      wParcel = saturationMixingRatio(tParcel, p);
    }

    // Environmental temperature & moisture at this level
    const env = interpolateSoundingAtPressure(sorted, p);
    const tEnv = env ? env.temp : tParcel;
    const tdEnv = env ? env.dewPoint : tEnv - 10;
    const wEnv = saturationMixingRatio(tdEnv, p);

    const tvParcel = virtualTemperature(tParcel, wParcel);
    const tvEnv = virtualTemperature(tEnv, wEnv);

    trajectory.push({
      p: Math.round(p * 10) / 10,
      tParcel: Math.round(tParcel * 100) / 100,
      tEnv: Math.round(tEnv * 100) / 100,
      tvParcel: Math.round(tvParcel * 100) / 100,
      tvEnv: Math.round(tvEnv * 100) / 100,
      buoyancy: tvParcel - tvEnv,
    });
  }

  // 3. Elevated LFC and EL
  let pLFC = null;
  let tLFC = null;
  let pEL = null;
  let tEL = null;

  // Search above LCL for LFC (where buoyancy turns positive)
  for (let i = 0; i < trajectory.length; i++) {
    const pt = trajectory[i];
    if (pt.p <= pLCL) {
      if (pt.buoyancy > 0) {
        pLFC = pt.p;
        tLFC = pt.tParcel;
        break;
      }
    }
  }

  // Search above LFC for EL (where buoyancy turns negative again)
  if (pLFC !== null) {
    for (let i = 0; i < trajectory.length; i++) {
      const pt = trajectory[i];
      if (pt.p < pLFC) {
        if (pt.buoyancy <= 0) {
          pEL = pt.p;
          tEL = pt.tParcel;
          break;
        }
      }
    }
    // If parcel remains buoyant up to 100 hPa, EL is 100 hPa
    if (pEL === null && trajectory.length > 0) {
      const topPt = trajectory[trajectory.length - 1];
      pEL = topPt.p;
      tEL = topPt.tParcel;
    }
  }

  // 4. Elevated CAPE and CIN
  let cape = 0;
  let cin = 0;

  for (let i = 0; i < trajectory.length - 1; i++) {
    const p1 = trajectory[i].p;
    const p2 = trajectory[i + 1].p;
    const dlnP = Math.log(p1) - Math.log(p2); // positive as p1 > p2
    const avgBuoy = 0.5 * (trajectory[i].buoyancy + trajectory[i + 1].buoyancy);

    // Below LFC: negative buoyancy is CIN
    if (pLFC !== null && p1 >= pLFC) {
      if (avgBuoy < 0) {
        cin += RD * (-avgBuoy) * dlnP;
      }
    } else if (pLFC === null && avgBuoy < 0) {
      cin += RD * (-avgBuoy) * dlnP;
    }

    // Between LFC and EL: positive buoyancy is CAPE
    if (pLFC !== null && pEL !== null) {
      if (p1 <= pLFC && p2 >= pEL) {
        if (avgBuoy > 0) {
          cape += RD * avgBuoy * dlnP;
        }
      }
    }
  }

  // 5. Instability indices
  const indices = calculateThermodynamicIndices(sorted, {
    cape: Math.round(cape),
    cin: Math.round(cin),
    pLCL: Math.round(pLCL),
    tLCL: Math.round(tLCL * 10) / 10,
    pLFC: pLFC ? Math.round(pLFC) : null,
    pEL: pEL ? Math.round(pEL) : null,
    pInit,
    tInit,
    tdInit,
  });

  return {
    pInit,
    initialPressure: pInit,
    initialTemp: tInit,
    initialDewpoint: tdInit,
    pLCL: Math.round(pLCL),
    tLCL: Math.round(tLCL * 10) / 10,
    pLFC: pLFC ? Math.round(pLFC) : null,
    tLFC: tLFC ? Math.round(tLFC * 10) / 10 : null,
    pEL: pEL ? Math.round(pEL) : null,
    tEL: tEL ? Math.round(tEL * 10) / 10 : null,
    cape: Math.round(cape),
    cin: Math.round(cin),
    trajectory,
    indices,
  };
}

/**
 * Standard Meteorological Instability Indices (K, TT, SI, PW)
 */
export function calculateThermodynamicIndices(soundingLevels, baseParams = {}) {
  const obs850 = interpolateSoundingAtPressure(soundingLevels, 850);
  const obs700 = interpolateSoundingAtPressure(soundingLevels, 700);
  const obs500 = interpolateSoundingAtPressure(soundingLevels, 500);

  let kIndex = null;
  let totalTotals = null;
  let showalterIndex = null;

  if (obs850 && obs700 && obs500) {
    const t850 = obs850.temp;
    const td850 = obs850.dewPoint;
    const t700 = obs700.temp;
    const td700 = obs700.dewPoint;
    const t500 = obs500.temp;

    // K-Index = (T850 - T500) + Td850 - (T700 - Td700)
    kIndex = Math.round(((t850 - t500) + td850 - (t700 - td700)) * 10) / 10;

    // Total Totals = (T850 + Td850) - 2 * T500
    totalTotals = Math.round(((t850 + td850) - 2 * t500) * 10) / 10;

    // Showalter Index = T500 - Tparcel_lifted_from_850_to_500
    const lcl850 = calculateLCL(t850, td850, 850);
    let tParcel500;
    if (lcl850.pLCL <= 500) {
      tParcel500 = tempFromPotentialTemperature(potentialTemperature(t850, 850), 500);
    } else {
      const adiabat = traceMoistAdiabat(lcl850.tLCL, lcl850.pLCL, 500, -5);
      tParcel500 = adiabat[adiabat.length - 1].t;
    }
    showalterIndex = Math.round((t500 - tParcel500) * 10) / 10;
  }

  // Precipitable Water PW = (1/g) * sum(w * dp) in mm
  let pw = 0;
  const sorted = [...soundingLevels]
    .filter((l) => l.pressure > 0 && l.temp > -9000)
    .sort((a, b) => b.pressure - a.pressure);

  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i].pressure;
    const p2 = sorted[i + 1].pressure;
    if (p1 <= 200) break; // Most moisture is below 200 hPa

    const td1 = sorted[i].dewPoint > -9000 ? sorted[i].dewPoint : sorted[i].temp - 10;
    const td2 = sorted[i + 1].dewPoint > -9000 ? sorted[i + 1].dewPoint : sorted[i + 1].temp - 10;

    const w1 = saturationMixingRatio(td1, p1);
    const w2 = saturationMixingRatio(td2, p2);
    const avgW = 0.5 * (w1 + w2); // g/kg

    const dp = p1 - p2; // hPa
    // 1 hPa = 100 Pa, g = 9.80665 m/s^2, w in g/kg = 0.001 kg/kg
    // PW = 100 / (9.80665 * 1000) * w * dp = 0.010197 * w * dp (mm)
    pw += 0.010197 * avgW * dp;
  }

  return {
    ...baseParams,
    kIndex,
    totalTotals,
    showalterIndex,
    precipitableWater: Math.round(pw * 10) / 10,
  };
}

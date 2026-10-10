package handler

import (
	"math"
)

// DewpointFromRH calculates dewpoint temperature in °C from temperature (°C) and relative humidity (%)
// using the Magnus-Tetens formula (valid for -45°C to 60°C).
func DewpointFromRH(temp float64, rh float64) float64 {
	if rh <= 0.01 {
		rh = 0.01
	} else if rh > 100.0 {
		rh = 100.0
	}
	const a = 17.27
	const b = 237.7
	alpha := ((a * temp) / (b + temp)) + math.Log(rh/100.0)
	td := (b * alpha) / (a - alpha)
	return td
}

// RHFromDewpoint calculates relative humidity (%) from temperature (°C) and dewpoint (°C).
func RHFromDewpoint(temp float64, td float64) float64 {
	if td > temp {
		td = temp
	}
	const a = 17.27
	const b = 237.7
	val := a*td/(b+td) - a*temp/(b+temp)
	rh := 100.0 * math.Exp(val)
	if rh > 100.0 {
		rh = 100.0
	} else if rh < 0.0 {
		rh = 0.0
	}
	return rh
}

// LiftParcel calculates the temperature (°C) of a parcel lifted from pStart (hPa) with
// initial temperature tStart (°C) and dewpoint tdStart (°C) to pTarget (hPa).
// It lifts dry-adiabatically to the Lifting Condensation Level (LCL), then ascends
// moist-adiabatically along the pseudo-adiabat to pTarget.
func LiftParcel(pStart, tStart, tdStart, pTarget float64) float64 {
	if pStart <= pTarget {
		return tStart
	}

	tK := tStart + 273.15
	tdK := tdStart + 273.15
	if tdK > tK {
		tdK = tK
	}
	if tdK < 173.15 {
		tdK = 173.15
	}
	if tK < 173.15 {
		tK = 173.15
	}

	// Bolton (1980) empirical formula for LCL temperature in Kelvin
	tLCL_K := 1.0/(1.0/(tdK-56.0)+math.Log(tK/tdK)/800.0) + 56.0

	// Potential temperature (conserved during dry adiabatic ascent)
	const gamma = 0.286 // Rd / cp
	theta := tK * math.Pow(1000.0/pStart, gamma)

	// LCL pressure in hPa
	pLCL := 1000.0 * math.Pow(tLCL_K/theta, 1.0/gamma)

	// Case 1: LCL is at or above pTarget (parcel remains unsaturated throughout ascent to pTarget)
	if pLCL <= pTarget {
		tTargetK := theta * math.Pow(pTarget/1000.0, gamma)
		return tTargetK - 273.15
	}

	// Case 2: Parcel reaches saturation at pLCL and ascends moist-adiabatically to pTarget
	pCurrent := pLCL
	tCurrentK := tLCL_K
	const dp = 5.0 // hPa numerical integration step

	const Rd = 287.058
	const cp = 1005.7
	const Lv = 2.501e6
	const Rv = 461.5

	for pCurrent > pTarget {
		step := dp
		if pCurrent-step < pTarget {
			step = pCurrent - pTarget
		}

		// Saturation vapor pressure es (hPa) via Tetens
		tC := tCurrentK - 273.15
		es := 6.112 * math.Exp((17.67*tC)/(tCurrentK-29.65))
		if es > pCurrent*0.8 {
			es = pCurrent * 0.8
		}
		// Saturation mixing ratio rs (kg/kg)
		rs := 0.622 * (es / (pCurrent - es))

		// Moist adiabatic lapse rate dT/dp (K/hPa)
		num := (Rd * tCurrentK / (cp * pCurrent)) * (1.0 + (Lv*rs)/(Rd*tCurrentK))
		den := 1.0 + (Lv*Lv*rs)/(cp*Rv*tCurrentK*tCurrentK)
		dT_dp := num / den

		pCurrent -= step
		tCurrentK -= dT_dp * step
	}

	return tCurrentK - 273.15
}

// CalculateKIndex computes the George K-Index:
// K = (T850 - T500) + Td850 - (T700 - Td700)
func CalculateKIndex(t850, td850, t700, td700, t500 float64) float64 {
	return (t850 - t500) + td850 - (t700 - td700)
}

// CalculateShowalter computes the Showalter Stability Index (SSI):
// SSI = T500 - Tparcel_at_500 (parcel lifted from 850 hPa)
func CalculateShowalter(t850, td850, t500 float64) float64 {
	tParcel500 := LiftParcel(850.0, t850, td850, 500.0)
	return t500 - tParcel500
}

// CalculateLiftedIndex computes the Lifted Index (LI):
// LI = T500 - Tparcel_at_500 (parcel lifted from pLow, e.g. surface or 850 hPa)
func CalculateLiftedIndex(tLow, tdLow, pLow, t500 float64) float64 {
	if pLow <= 500.0 {
		pLow = 850.0
	}
	tParcel500 := LiftParcel(pLow, tLow, tdLow, 500.0)
	return t500 - tParcel500
}

// CalculateTotalTotals computes the Total Totals Index:
// TT = VT + CT = (T850 - T500) + (Td850 - T500) = T850 + Td850 - 2*T500
func CalculateTotalTotals(t850, td850, t500 float64) float64 {
	return t850 + td850 - 2.0*t500
}

// CalculateSWEAT computes the Severe Weather Threat Index (Miller 1972):
// SWEAT = 12*Td850 + 20*(TT - 49) + 2*f850 + f500 + 125*(sin(d500 - d850) + 0.2)
// with wind speeds in knots and meteorological threshold rules applied.
func CalculateSWEAT(t850, td850, t500, ws850_ms, wd850_deg, ws500_ms, wd500_deg float64) float64 {
	// Wind speed in knots (1 m/s = 1.94384 kt)
	f850 := ws850_ms * 1.94384
	f500 := ws500_ms * 1.94384

	// Term 1: 12 * Td850 (if Td850 > 0)
	term1 := 0.0
	if td850 > 0 {
		term1 = 12.0 * td850
	}

	// Term 2: 20 * (TT - 49) (if TT > 49)
	tt := t850 + td850 - 2.0*t500
	term2 := 0.0
	if tt > 49.0 {
		term2 = 20.0 * (tt - 49.0)
	}

	// Term 3 & 4: Wind speeds
	term3 := 2.0 * f850
	term4 := f500

	// Term 5: Directional shear term
	term5 := 0.0
	dDiff := wd500_deg - wd850_deg
	if wd850_deg >= 130.0 && wd850_deg <= 250.0 &&
		wd500_deg >= 210.0 && wd500_deg <= 310.0 &&
		dDiff > 0.0 &&
		f850 >= 15.0 && f500 >= 15.0 {
		radDiff := dDiff * math.Pi / 180.0
		term5 = 125.0 * (math.Sin(radDiff) + 0.2)
		if term5 < 0 {
			term5 = 0
		}
	}

	sweat := term1 + term2 + term3 + term4 + term5
	if sweat < 0 {
		sweat = 0
	}
	return sweat
}

// CalculateWindShear computes vector vertical wind shear magnitude between two levels in m/s:
// Shear = sqrt((u1 - u2)^2 + (v1 - v2)^2)
func CalculateWindShear(u1, v1, u2, v2 float64) float64 {
	du := u1 - u2
	dv := v1 - v2
	return math.Hypot(du, dv)
}

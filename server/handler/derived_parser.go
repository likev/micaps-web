package handler

import (
	"fmt"
	"regexp"
	"strings"
)

// DerivedRequest contains all parsed metadata from a derived virtual path
type DerivedRequest struct {
	IsDerived      bool
	IsStation      bool   // true for UPPER_AIR/PLOT or SURFACE station data
	IsTimeDerived  bool   // true for multi-time derived layer (e.g. 24h or 48h variation)
	TimeDeltaHours int    // e.g. 24 or 48
	Model          string // e.g. "ECMWF_HR", "JAPAN_MR", "UPPER_AIR", "SURFACE"
	SubPath        string // e.g. "PLOT", "PLOT_GLOBAL_3H"
	Element        string // e.g. "TMP", "HGT", "RH", "WIND", "K-INDEX", "SHOWALTER", "LIFTED", "SWEAT", "TT", "SHEAR", "PRMSL", "SLP", "TMP_2M"
	DerivedType    string // "DIFF", "K-INDEX", "SHOWALTER", "LIFTED", "SWEAT", "TT", "SHEAR", "T-VARIATION-24H", "T-VARIATION-48H", "SLP-VARIATION-24H", "SLP-VARIATION-48H"
	Level1         string // e.g. "850", "SURFACE", "0"
	Level2         string // e.g. "500"
	File           string // e.g. "26100920.012" or "20261010080000.000"
	RawPath        string
}

var levelRangeRegex = regexp.MustCompile(`^(?:([A-Za-z]+)[-_]?)?(\d+)[-_](\d+)$`)

func parseLevelRange(str string) (string, string, string, bool) {
	m := levelRangeRegex.FindStringSubmatch(strings.TrimSpace(str))
	if len(m) == 4 {
		return strings.ToUpper(m[1]), m[2], m[3], true
	}
	return "", "", "", false
}

func isNumericLevel(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// NormalizeIndexName maps variants of weather index names to standard keys
func NormalizeIndexName(elem string) string {
	u := strings.ToUpper(strings.TrimSpace(elem))
	switch u {
	case "K", "K_INDEX", "KINDEX", "K-INDEX":
		return "K-INDEX"
	case "SHOWALTER", "SHOWALTER_INDEX", "SSI", "SI":
		return "SHOWALTER"
	case "LIFTED", "LIFTED_INDEX", "LI":
		return "LIFTED"
	case "SWEAT", "SWEAT_INDEX", "SEVERE_WEATHER_THREAT":
		return "SWEAT"
	case "TT", "TOTAL_TOTALS", "TOTAL_TOTALS_INDEX":
		return "TT"
	case "SHEAR", "WIND_SHEAR", "VERTICAL_SHEAR":
		return "SHEAR"
	case "THICKNESS", "HGT_DIFF":
		return "THICKNESS"
	case "TMP_DIFF", "T_DIFF":
		return "TMP_DIFF"
	case "T-VARIATION-24H", "T_VARIATION_24H", "TVAR-24H", "TVAR24", "TMP-VAR-24H", "T-VAR-24H", "TMP_VAR_24H", "T24H", "VAR-24H-T", "T-VARIATION-24", "TVAR-24", "TMP-VAR-24":
		return "T-VARIATION-24H"
	case "T-VARIATION-48H", "T_VARIATION_48H", "TVAR-48H", "TVAR48", "TMP-VAR-48H", "T-VAR-48H", "TMP_VAR_48H", "T48H", "VAR-48H-T", "T-VARIATION-48", "TVAR-48", "TMP-VAR-48":
		return "T-VARIATION-48H"
	case "SLP-VARIATION-24H", "SLP_VARIATION_24H", "SLPVAR-24H", "SLPVAR24", "SLP-VAR-24H", "PRMSL-VAR-24H", "P-VARIATION-24H", "PRMSL_VAR_24H", "SLP24H", "VAR-24H-SLP", "VAR-24H-PRMSL", "SLP-VARIATION-24", "SLPVAR-24", "SLP-VAR-24":
		return "SLP-VARIATION-24H"
	case "SLP-VARIATION-48H", "SLP_VARIATION_48H", "SLPVAR-48H", "SLPVAR48", "SLP-VAR-48H", "PRMSL-VAR-48H", "P-VARIATION-48H", "PRMSL_VAR_48H", "SLP48H", "VAR-48H-SLP", "VAR-48H-PRMSL", "SLP-VARIATION-48", "SLPVAR-48", "SLP-VAR-48":
		return "SLP-VARIATION-48H"
	default:
		return u
	}
}

// ParseTimeVariation checks if a token represents a multi-time variation and returns its metadata
func ParseTimeVariation(val string) (derivedType string, deltaHours int, isT bool, isSLP bool, ok bool) {
	norm := NormalizeIndexName(val)
	switch norm {
	case "T-VARIATION-24H":
		return "T-VARIATION-24H", 24, true, false, true
	case "T-VARIATION-48H":
		return "T-VARIATION-48H", 48, true, false, true
	case "SLP-VARIATION-24H":
		return "SLP-VARIATION-24H", 24, false, true, true
	case "SLP-VARIATION-48H":
		return "SLP-VARIATION-48H", 48, false, true, true
	}

	u := strings.ToUpper(strings.TrimSpace(val))
	if u == "24H" || u == "VAR-24H" || u == "VAR_24H" || u == "24" {
		return "VARIATION-24H", 24, false, false, true
	}
	if u == "48H" || u == "VAR-48H" || u == "VAR_48H" || u == "48" {
		return "VARIATION-48H", 48, false, false, true
	}
	return "", 0, false, false, false
}

// NormalizeModelName maps model aliases (e.g. CMA_GFS, GFS) to standard database model tables
func NormalizeModelName(model string) string {
	u := strings.ToUpper(strings.TrimSpace(model))
	switch u {
	case "CMA_GFS", "CMA-GFS", "CMAGFS", "GFS":
		return "GRAPES_GFS"
	default:
		return model
	}
}

// IsWeatherIndex returns true if the normalized element is a recognized weather index
func IsWeatherIndex(elem string) bool {
	norm := NormalizeIndexName(elem)
	switch norm {
	case "K-INDEX", "SHOWALTER", "LIFTED", "SWEAT", "TT", "SHEAR", "THICKNESS", "TMP_DIFF",
		"T-VARIATION-24H", "T-VARIATION-48H", "SLP-VARIATION-24H", "SLP-VARIATION-48H":
		return true
	default:
		return false
	}
}

// ParseDerivedPath inspects a path and optional file parameter to determine if it is a derived virtual path
func ParseDerivedPath(pathStr string, fileStr string) (*DerivedRequest, bool) {
	clean := strings.TrimSpace(pathStr)
	clean = strings.ReplaceAll(clean, "\x00", "")
	clean = strings.Trim(clean, "/")

	hasDerivedPrefix := false
	if strings.HasPrefix(strings.ToLower(clean), "api/derived/") {
		hasDerivedPrefix = true
		clean = clean[len("api/derived/"):]
		clean = strings.Trim(clean, "/")
	} else if strings.EqualFold(clean, "api/derived") {
		hasDerivedPrefix = true
		clean = ""
	}

	parts := strings.Split(clean, "/")
	validParts := make([]string, 0, len(parts))
	for _, p := range parts {
		lp := strings.ToLower(strings.TrimSpace(p))
		if lp != "" && lp != "null" && lp != "undefined" {
			validParts = append(validParts, p)
		}
	}

	if len(validParts) == 0 {
		return nil, false
	}

	extractedFile := strings.TrimSpace(fileStr)
	// Check if the last part is a file name (contains '.' and date/lead digits, or is "latest")
	if extractedFile == "" && len(validParts) >= 2 {
		lastPart := validParts[len(validParts)-1]
		if (strings.Contains(lastPart, ".") && len(lastPart) >= 8) || strings.EqualFold(lastPart, "latest") {
			extractedFile = lastPart
			validParts = validParts[:len(validParts)-1]
		}
	}

	// Case 0: SURFACE station derived path
	// e.g. SURFACE/T-VARIATION-24H, SURFACE/PLOT_GLOBAL_3H/T-VARIATION-24H, SURFACE/TMP/T-VARIATION-24H, SURFACE/SLP/SLP-VARIATION-48H
	if len(validParts) >= 2 && strings.EqualFold(validParts[0], "SURFACE") {
		req := &DerivedRequest{
			IsDerived:     true,
			IsStation:     true,
			IsTimeDerived: true,
			Model:         "SURFACE",
			SubPath:       "PLOT_GLOBAL_3H",
			Level1:        "SURFACE",
			File:          extractedFile,
			RawPath:       pathStr,
		}

		varIdx := -1
		var dType string
		var hours int
		var isSLP bool
		for i := 1; i < len(validParts); i++ {
			if dt, h, _, slp, ok := ParseTimeVariation(validParts[i]); ok {
				varIdx = i
				dType = dt
				hours = h
				isSLP = slp
				break
			}
		}

		if varIdx != -1 {
			req.TimeDeltaHours = hours
			req.DerivedType = dType
			for i := 1; i < len(validParts); i++ {
				if i == varIdx {
					continue
				}
				upper := strings.ToUpper(validParts[i])
				if strings.Contains(upper, "PLOT") {
					req.SubPath = validParts[i]
				} else if strings.Contains(upper, "SLP") || strings.Contains(upper, "PRS") {
					isSLP = true
				} else if strings.Contains(upper, "TMP") || strings.Contains(upper, "TEMP") || upper == "T" {
					isSLP = false
				}
			}
			if isSLP {
				req.Element = "SLP"
				if dType == "VARIATION-24H" || dType == "VARIATION-48H" {
					req.DerivedType = fmt.Sprintf("SLP-VARIATION-%dH", hours)
				}
			} else {
				req.Element = "TMP"
				if dType == "VARIATION-24H" || dType == "VARIATION-48H" {
					req.DerivedType = fmt.Sprintf("T-VARIATION-%dH", hours)
				}
			}
			return req, true
		}
	}

	// Case 1: UPPER_AIR / PLOT station derived path
	// e.g. UPPER_AIR/PLOT/TMP/850-500, UPPER_AIR/PLOT/T850-500, UPPER_AIR/PLOT/K-INDEX, or UPPER_AIR/PLOT/T-VARIATION-24H/850
	if len(validParts) >= 2 && strings.EqualFold(validParts[0], "UPPER_AIR") && strings.EqualFold(validParts[1], "PLOT") {
		req := &DerivedRequest{
			IsDerived: true,
			IsStation: true,
			Model:     "UPPER_AIR",
			SubPath:   "PLOT",
			File:      extractedFile,
			RawPath:   pathStr,
		}

		if len(validParts) == 2 {
			if !hasDerivedPrefix {
				return nil, false
			}
			req.Element = "TMP"
			req.DerivedType = "DIFF"
			req.Level1 = "850"
			req.Level2 = "500"
			return req, true
		}

		// Check for time-derived variations on UPPER_AIR/PLOT
		if len(validParts) >= 3 {
			varIdx := -1
			var dType string
			var hours int
			var isSLP bool
			for i := 2; i < len(validParts); i++ {
				if dt, h, _, slp, ok := ParseTimeVariation(validParts[i]); ok {
					varIdx = i
					dType = dt
					hours = h
					isSLP = slp
					break
				}
			}

			if varIdx != -1 {
				req.IsTimeDerived = true
				req.TimeDeltaHours = hours
				req.Level1 = "850"
				for i := 2; i < len(validParts); i++ {
					if i == varIdx {
						continue
					}
					p := validParts[i]
					upper := strings.ToUpper(p)
					if isNumericLevel(p) {
						req.Level1 = p
					} else if strings.Contains(upper, "SLP") || strings.Contains(upper, "PRS") {
						isSLP = true
					} else if strings.Contains(upper, "TMP") || strings.Contains(upper, "TEMP") || upper == "T" {
						isSLP = false
					}
				}
				if isSLP {
					req.Element = "SLP"
					if dType == "VARIATION-24H" || dType == "VARIATION-48H" {
						req.DerivedType = fmt.Sprintf("SLP-VARIATION-%dH", hours)
					} else {
						req.DerivedType = dType
					}
				} else {
					req.Element = "TMP"
					if dType == "VARIATION-24H" || dType == "VARIATION-48H" {
						req.DerivedType = fmt.Sprintf("T-VARIATION-%dH", hours)
					} else {
						req.DerivedType = dType
					}
				}
				return req, true
			}
		}

		// Check if validParts[2] is a combined level range (e.g. UPPER_AIR/PLOT/T850-500 or UPPER_AIR/PLOT/850-500)
		if pfx, l1, l2, okRange := parseLevelRange(validParts[2]); okRange {
			req.Level1 = l1
			req.Level2 = l2
			if pfx == "HGT" {
				req.Element = "HGT"
				if (l1 == "1000" && l2 == "500") || (l1 == "500" && l2 == "1000") {
					req.DerivedType = "THICKNESS"
				} else {
					req.DerivedType = "DIFF"
				}
			} else if pfx == "WIND" || pfx == "SHEAR" {
				req.Element = "SHEAR"
				req.DerivedType = "SHEAR"
			} else {
				req.Element = "TMP"
				req.DerivedType = "DIFF"
			}
			return req, true
		}

		elem := NormalizeIndexName(validParts[2])
		if IsWeatherIndex(elem) {
			req.Element = elem
			req.DerivedType = elem
			if elem == "THICKNESS" {
				req.Level1 = "1000"
				req.Level2 = "500"
			} else if elem == "TMP_DIFF" {
				req.Element = "TMP"
				req.DerivedType = "DIFF"
				req.Level1 = "850"
				req.Level2 = "500"
			} else {
				req.Level1 = "850"
				req.Level2 = "500"
			}
			if len(validParts) >= 4 {
				if _, l1, l2, okRange := parseLevelRange(validParts[3]); okRange {
					req.Level1 = l1
					req.Level2 = l2
				}
			}
			return req, true
		}

		// Scalar element with level range: e.g. UPPER_AIR/PLOT/TMP/850-500
		req.Element = strings.ToUpper(validParts[2])
		if len(validParts) >= 4 {
			if _, l1, l2, okRange := parseLevelRange(validParts[3]); okRange {
				req.Level1 = l1
				req.Level2 = l2
				if req.Element == "SHEAR" || req.Element == "WIND_SHEAR" {
					req.DerivedType = "SHEAR"
				} else if req.Element == "HGT" && ((l1 == "1000" && l2 == "500") || (l1 == "500" && l2 == "1000")) {
					req.DerivedType = "THICKNESS"
				} else {
					req.DerivedType = "DIFF"
				}
				return req, true
			}
		}

		if hasDerivedPrefix {
			req.DerivedType = "DIFF"
			req.Level1 = "850"
			req.Level2 = "500"
			return req, true
		}

		return nil, false
	}

	// Case 2: Gridded NWP Model derived path
	// e.g. ECMWF_HR/TMP/850-500, ECMWF_HR/T850-500, ECMWF_HR/K-INDEX, JAPAN_MR/TMP/850-500, ECMWF_HR/T-VARIATION-24H/850
	if len(validParts) >= 2 {
		modelName := NormalizeModelName(validParts[0])
		part1 := validParts[1]

		// Check if any part is time variation
		varIdx := -1
		var dType string
		var hours int
		var isSLP bool
		for i := 1; i < len(validParts); i++ {
			if dt, h, _, slp, ok := ParseTimeVariation(validParts[i]); ok {
				varIdx = i
				dType = dt
				hours = h
				isSLP = slp
				break
			}
		}

		if varIdx != -1 {
			lvl := "0"
			elem := "TMP_2M"
			if isSLP {
				elem = "PRMSL"
			}
			for i := 1; i < len(validParts); i++ {
				if i == varIdx {
					continue
				}
				p := validParts[i]
				upper := strings.ToUpper(p)
				if isNumericLevel(p) {
					lvl = p
				} else if strings.EqualFold(p, "SURFACE") {
					lvl = "0"
				} else if strings.Contains(upper, "SLP") || strings.Contains(upper, "PRMSL") || strings.Contains(upper, "PRS") {
					isSLP = true
					elem = "PRMSL"
				} else if strings.Contains(upper, "TMP") || strings.Contains(upper, "TEMP") || upper == "T" {
					isSLP = false
					if upper == "TMP_2M" {
						elem = "TMP_2M"
						lvl = "0"
					} else {
						elem = "TMP"
					}
				}
			}

			if isSLP {
				elem = "PRMSL"
				lvl = "0"
				if dType == "VARIATION-24H" || dType == "VARIATION-48H" {
					dType = fmt.Sprintf("SLP-VARIATION-%dH", hours)
				}
			} else {
				if lvl != "0" && lvl != "" {
					elem = "TMP"
				} else {
					elem = "TMP_2M"
					lvl = "0"
				}
				if dType == "VARIATION-24H" || dType == "VARIATION-48H" {
					dType = fmt.Sprintf("T-VARIATION-%dH", hours)
				}
			}

			req := &DerivedRequest{
				IsDerived:      true,
				IsStation:      false,
				IsTimeDerived:  true,
				TimeDeltaHours: hours,
				Model:          modelName,
				Element:        elem,
				DerivedType:    dType,
				Level1:         lvl,
				File:           extractedFile,
				RawPath:        pathStr,
			}
			return req, true
		}

		// Check if part1 is a level range like T850-500 or 850-500
		if pfx, l1, l2, okRange := parseLevelRange(part1); okRange {
			elem := "TMP"
			dType := "DIFF"
			if pfx == "HGT" {
				elem = "HGT"
				if (l1 == "1000" && l2 == "500") || (l1 == "500" && l2 == "1000") {
					dType = "THICKNESS"
				}
			} else if pfx == "WIND" || pfx == "SHEAR" {
				elem = "SHEAR"
				dType = "SHEAR"
			}
			req := &DerivedRequest{
				IsDerived:   true,
				IsStation:   false,
				Model:       modelName,
				Element:     elem,
				DerivedType: dType,
				Level1:      l1,
				Level2:      l2,
				File:        extractedFile,
				RawPath:     pathStr,
			}
			return req, true
		}

		norm1 := NormalizeIndexName(part1)
		if IsWeatherIndex(norm1) {
			req := &DerivedRequest{
				IsDerived:   true,
				IsStation:   false,
				Model:       modelName,
				Element:     norm1,
				DerivedType: norm1,
				Level1:      "850",
				Level2:      "500",
				File:        extractedFile,
				RawPath:     pathStr,
			}
			if norm1 == "THICKNESS" {
				req.Level1 = "1000"
				req.Level2 = "500"
			} else if norm1 == "TMP_DIFF" {
				req.Element = "TMP"
				req.DerivedType = "DIFF"
			}
			if len(validParts) >= 3 {
				if _, l1, l2, okRange := parseLevelRange(validParts[2]); okRange {
					req.Level1 = l1
					req.Level2 = l2
				}
			}
			return req, true
		}

		// Element + Level range: e.g. ECMWF_HR/TMP/850-500
		if len(validParts) >= 3 {
			if _, l1, l2, okRange := parseLevelRange(validParts[2]); okRange {
				req := &DerivedRequest{
					IsDerived:   true,
					IsStation:   false,
					Model:       modelName,
					Element:     strings.ToUpper(part1),
					DerivedType: "DIFF",
					Level1:      l1,
					Level2:      l2,
					File:        extractedFile,
					RawPath:     pathStr,
				}
				if req.Element == "SHEAR" || req.Element == "WIND_SHEAR" {
					req.DerivedType = "SHEAR"
				} else if req.Element == "HGT" && ((l1 == "1000" && l2 == "500") || (l1 == "500" && l2 == "1000")) {
					req.DerivedType = "THICKNESS"
				}
				return req, true
			}
		}

		if hasDerivedPrefix {
			req := &DerivedRequest{
				IsDerived:   true,
				IsStation:   false,
				Model:       modelName,
				Element:     strings.ToUpper(part1),
				DerivedType: "DIFF",
				Level1:      "850",
				Level2:      "500",
				File:        extractedFile,
				RawPath:     pathStr,
			}
			if len(validParts) >= 3 {
				req.Level1 = validParts[2]
			}
			return req, true
		}
	}

	return nil, false
}

// ResolveUnderlyingCatalogPath maps a derived path to the underlying primary real data directory
// so that treeview catalog listing and latest cycle queries succeed directly.
func ResolveUnderlyingCatalogPath(req *DerivedRequest) string {
	if req.IsTimeDerived {
		if req.IsStation {
			if strings.EqualFold(req.Model, "SURFACE") {
				sub := req.SubPath
				if sub == "" {
					sub = "PLOT_GLOBAL_3H"
				}
				return req.Model + "/" + sub
			}
			lvl := req.Level1
			if lvl == "" {
				lvl = "850"
			}
			sub := req.SubPath
			if sub == "" {
				sub = "PLOT"
			}
			return req.Model + "/" + sub + "/" + lvl
		}

		// Gridded NWP
		if req.DerivedType == "SLP-VARIATION-24H" || req.DerivedType == "SLP-VARIATION-48H" || req.Element == "PRMSL" || req.Element == "SLP" {
			return req.Model + "/PRMSL"
		}
		if req.Level1 != "" && req.Level1 != "0" && !strings.EqualFold(req.Level1, "SURFACE") {
			return req.Model + "/TMP/" + req.Level1
		}
		return req.Model + "/TMP_2M"
	}

	lvl := req.Level1
	if lvl == "" {
		if req.DerivedType == "THICKNESS" {
			lvl = "1000"
		} else {
			lvl = "850"
		}
	}

	if req.IsStation {
		return req.Model + "/" + req.SubPath + "/" + lvl
	}

	elem := req.Element
	if req.DerivedType == "SHEAR" || elem == "SHEAR" {
		elem = "WIND"
	} else if req.DerivedType == "THICKNESS" || elem == "THICKNESS" {
		elem = "HGT"
	} else if IsWeatherIndex(elem) || elem == "DIFF" {
		elem = "TMP"
	}
	return req.Model + "/" + elem + "/" + lvl
}


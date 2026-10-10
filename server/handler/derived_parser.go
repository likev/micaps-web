package handler

import (
	"regexp"
	"strings"
)

// DerivedRequest contains all parsed metadata from a derived virtual path
type DerivedRequest struct {
	IsDerived   bool
	IsStation   bool   // true for UPPER_AIR/PLOT station data
	Model       string // e.g. "ECMWF_HR", "JAPAN_MR", "UPPER_AIR"
	SubPath     string // e.g. "PLOT"
	Element     string // e.g. "TMP", "HGT", "RH", "WIND", "K-INDEX", "SHOWALTER", "LIFTED", "SWEAT", "TT", "SHEAR"
	DerivedType string // "DIFF", "K-INDEX", "SHOWALTER", "LIFTED", "SWEAT", "TT", "SHEAR"
	Level1      string // e.g. "850"
	Level2      string // e.g. "500"
	File        string // e.g. "26100920.012" or "20261010080000.000"
	RawPath     string
}

var levelRangeRegex = regexp.MustCompile(`^(?:([A-Za-z]+)[-_]?)?(\d+)[-_](\d+)$`)

func parseLevelRange(str string) (string, string, string, bool) {
	m := levelRangeRegex.FindStringSubmatch(strings.TrimSpace(str))
	if len(m) == 4 {
		return strings.ToUpper(m[1]), m[2], m[3], true
	}
	return "", "", "", false
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
	default:
		return u
	}
}

// IsWeatherIndex returns true if the normalized element is a recognized weather index
func IsWeatherIndex(elem string) bool {
	norm := NormalizeIndexName(elem)
	switch norm {
	case "K-INDEX", "SHOWALTER", "LIFTED", "SWEAT", "TT", "SHEAR", "THICKNESS", "TMP_DIFF":
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

	// Case 1: UPPER_AIR / PLOT station derived path
	// e.g. UPPER_AIR/PLOT/TMP/850-500, UPPER_AIR/PLOT/T850-500, or UPPER_AIR/PLOT/K-INDEX
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
	// e.g. ECMWF_HR/TMP/850-500, ECMWF_HR/T850-500, ECMWF_HR/K-INDEX, JAPAN_MR/TMP/850-500
	if len(validParts) >= 2 {
		modelName := validParts[0]
		part1 := validParts[1]

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


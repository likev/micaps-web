package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"micaps-web/db"
	"micaps-web/filecache"
	"micaps-web/mock"
	"micaps-web/model"
	"micaps-web/parser"
)

// GridHandler processes gridded data requests
type GridHandler struct {
	Client   *db.CQLClient
	Cache    *filecache.Cache
	MockMode bool
	Derived  *DerivedHandler
}

// JSONHandler handles /api/data/grid
func (h *GridHandler) JSONHandler(w http.ResponseWriter, r *http.Request) {
	dataPath := sanitizeGridPath(r.URL.Query().Get("path"))
	cleanPath := strings.Trim(strings.ToLower(dataPath), "/")
	if strings.HasPrefix(cleanPath, "derived/") || cleanPath == "derived" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "route /derived/ has been removed; use /api/derived/"})
		return
	}

	w.Header().Set("Content-Type", "application/json")

	gridResp, err := h.fetchGrid(r)
	if err != nil {
		if h.MockMode {
			log.Printf("[GridHandler] Error fetching grid: %v. Mock fallback.", err)
			gridResp = h.getFallbackGrid(r)
		} else {
			log.Printf("[GridHandler] Grid data not found: %v", err)
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
	}

	json.NewEncoder(w).Encode(gridResp)
}

// BinaryHandler handles /api/data/grid/binary
func (h *GridHandler) BinaryHandler(w http.ResponseWriter, r *http.Request) {
	dataPath := sanitizeGridPath(r.URL.Query().Get("path"))
	cleanPath := strings.Trim(strings.ToLower(dataPath), "/")
	if strings.HasPrefix(cleanPath, "derived/") || cleanPath == "derived" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "route /derived/ has been removed; use /api/derived/"})
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")

	gridResp, err := h.fetchGrid(r)
	if err != nil {
		if h.MockMode {
			log.Printf("[GridHandler] Error fetching binary grid: %v. Mock fallback.", err)
			gridResp = h.getFallbackGrid(r)
		} else {
			log.Printf("[GridHandler] Binary grid data not found: %v", err)
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte(err.Error()))
			return
		}
	}

	bin := parser.EncodeBinaryStream(gridResp)
	w.Header().Set("Content-Length", strconv.Itoa(len(bin)))
	w.Write(bin)
}

func (h *GridHandler) fetchGrid(r *http.Request) (*model.GridResponse, error) {
	dataPath := sanitizeGridPath(r.URL.Query().Get("path"))
	if lvl := strings.TrimSpace(r.URL.Query().Get("level")); lvl != "" {
		if (strings.Contains(dataPath, "FY4B/L1/CHINA") || strings.Contains(dataPath, "FY4B/L1/DISK")) && !strings.Contains(dataPath, "/C0") {
			if num, err := strconv.Atoi(lvl); err == nil && num >= 1 && num <= 15 {
				dataPath = fmt.Sprintf("%s/C%03d", dataPath, num)
			}
		}
	}
	file := sanitizeFile(r.URL.Query().Get("file"))

	// Check if this is a derived grid path (e.g. /api/derived/ECMWF_HR/TMP/850-500)
	if dReq, ok := ParseDerivedPath(dataPath, file); ok && dReq != nil && !dReq.IsStation {
		if dReq.File == "" {
			dReq.File = file
		}
		if dReq.File == "" || dReq.File == "latest" {
			underlying := ResolveUnderlyingCatalogPath(dReq)
			if h.Client != nil && !h.MockMode {
				latest, err := db.GetLatestCycle(h.Client, underlying, "")
				if err == nil && latest != "" {
					dReq.File = latest
				}
			}
			if dReq.File == "" || dReq.File == "latest" {
				dReq.File = "26100920.012"
			}
		}
		if h.Derived != nil {
			return h.Derived.CalculateDerivedGrid(dReq)
		}
		dH := &DerivedHandler{Client: h.Client, Cache: h.Cache, MockMode: h.MockMode}
		return dH.CalculateDerivedGrid(dReq)
	}

	levelStr := strings.TrimSpace(r.URL.Query().Get("level"))
	if levelStr != "" {
		if (strings.Contains(dataPath, "FY4B/L1/CHINA") || strings.Contains(dataPath, "FY4B/L1/DISK")) && !strings.Contains(dataPath, "/C0") {
			if l, err := strconv.Atoi(levelStr); err == nil && l >= 1 && l <= 15 {
				dataPath = fmt.Sprintf("%s/C%03d", dataPath, l)
			}
		}
	} else if (strings.HasSuffix(dataPath, "FY4B/L1/CHINA") || strings.HasSuffix(dataPath, "FY4B/L1/DISK")) && !strings.Contains(dataPath, "/C0") {
		dataPath = fmt.Sprintf("%s/C012", dataPath)
	}

	if h.Client != nil && !h.MockMode && dataPath != "" && (file == "" || file == "latest") {
		latest, err := db.GetLatestCycle(h.Client, dataPath, "")
		if err == nil && latest != "" {
			file = latest
		} else {
			files, fErr := db.GetFileList(h.Client, dataPath, 1)
			if fErr == nil && len(files) > 0 {
				file = files[0].Name
			}
		}
	}

	// Defensive channel prefix normalization for FY-4B:
	// If dataPath contains "/C0xx" and file starts with "C0yy_", rewrite prefix to "C0xx_"
	if strings.Contains(dataPath, "FY4B") && strings.Contains(dataPath, "/C0") {
		pList := strings.Split(dataPath, "/")
		targetChannel := pList[len(pList)-1]
		if strings.HasPrefix(targetChannel, "C0") && len(targetChannel) == 4 {
			if len(file) > 5 && strings.HasPrefix(file, "C0") && file[4] == '_' {
				fileChannel := file[0:4]
				if fileChannel != targetChannel {
					file = targetChannel + file[4:]
				}
			}
		}
	}

	if h.Client == nil || dataPath == "" || file == "" {
		if h.MockMode {
			return h.getFallbackGrid(r), nil
		}
		return nil, fmt.Errorf("missing query parameter 'path' or 'file' (or CQL client not connected)")
	}

	if h.MockMode {
		return h.getFallbackGrid(r), nil
	}

	cleanDir := dataPath
	parts := strings.Split(cleanDir, "/")
	table := parts[0]
	var subDataPath string
	if len(parts) > 1 {
		subDataPath = strings.Join(parts[1:], "/")
	}
	if strings.Contains(cleanDir, "TLOGP") {
		table = "UPPER_AIR"
		subDataPath = "TLOGP"
	}

	// Check file cache
	if h.Cache != nil {
		if cachedBlob, _, ok := h.Cache.Get(table, subDataPath, file); ok {
			return decodeGridPayload(cachedBlob, r)
		}
	}

	var rawBlob []byte
	if h.Cache != nil && h.Cache.Singleflight() != nil {
		cacheKey := filecache.Key(table, subDataPath, file)
		b, err := h.Cache.Singleflight().Do(cacheKey, func() ([]byte, error) {
			if cachedBlob, _, ok := h.Cache.Get(table, subDataPath, file); ok {
				return cachedBlob, nil
			}
			blob, err := db.GetBlob(h.Client, dataPath, file)
			if err != nil {
				return nil, err
			}
			_ = h.Cache.Put(table, subDataPath, file, blob, nil)
			return blob, nil
		})
		if err != nil {
			return nil, err
		}
		rawBlob = b
	} else {
		blob, err := db.GetBlob(h.Client, dataPath, file)
		if err != nil {
			return nil, err
		}
		if h.Cache != nil {
			_ = h.Cache.Put(table, subDataPath, file, blob, nil)
		}
		rawBlob = blob
	}

	return decodeGridPayload(rawBlob, r)
}

func decodeGridPayload(payload []byte, r *http.Request) (*model.GridResponse, error) {
	unwrapped, err := parser.UnwrapPayload(payload)
	if err != nil {
		return nil, err
	}

	trimmed := bytes.TrimSpace(unwrapped)
	lowerTrimmed := bytes.ToLower(trimmed)
	if bytes.HasPrefix(lowerTrimmed, []byte("diamond 131")) {
		var targetLevel float64
		if lvlStr := r.URL.Query().Get("level"); lvlStr != "" {
			if l, err := strconv.ParseFloat(lvlStr, 64); err == nil {
				targetLevel = l
			}
		}
		return parser.ParseDiamond131(unwrapped, targetLevel)
	}

	if bytes.HasPrefix(lowerTrimmed, []byte("diamond 11 ")) ||
		bytes.HasPrefix(lowerTrimmed, []byte("diamond 11\t")) ||
		bytes.HasPrefix(lowerTrimmed, []byte("diamond 11\r")) ||
		bytes.HasPrefix(lowerTrimmed, []byte("diamond 11\n")) {
		return parser.ParseDiamond11Grid(unwrapped)
	}

	if parser.IsAWX(unwrapped) {
		step := 0
		if stepStr := r.URL.Query().Get("step"); stepStr != "" {
			if s, err := strconv.Atoi(stepStr); err == nil && s > 0 {
				step = s
			}
		}
		return parser.ParseAWXGrid(unwrapped, step)
	}

	return parser.ParseGridData(unwrapped)
}

func SanitizeGridPath(p string) string {
	clean := strings.TrimSpace(p)
	clean = strings.ReplaceAll(clean, "\x00", "")
	clean = strings.Trim(clean, "/")
	for strings.Contains(clean, "..") {
		clean = strings.ReplaceAll(clean, "..", "")
		clean = strings.Trim(clean, "/")
	}
	parts := strings.Split(clean, "/")
	validParts := make([]string, 0, len(parts))
	for _, part := range parts {
		lp := strings.ToLower(strings.TrimSpace(part))
		if lp != "" && lp != "null" && lp != "undefined" {
			validParts = append(validParts, part)
		}
	}
	if len(validParts) > 0 && (strings.Contains(clean, "FY4B/L1/CHINA") || strings.Contains(clean, "FY4B/L1/DISK")) {
		last := validParts[len(validParts)-1]
		if num, err := strconv.Atoi(last); err == nil && num >= 1 && num <= 15 {
			validParts[len(validParts)-1] = fmt.Sprintf("C%03d", num)
		} else if strings.HasPrefix(strings.ToUpper(last), "C") {
			if num, err := strconv.Atoi(last[1:]); err == nil && num >= 1 && num <= 15 {
				validParts[len(validParts)-1] = fmt.Sprintf("C%03d", num)
			}
		}
	}
	return strings.Join(validParts, "/")
}

func sanitizeGridPath(p string) string {
	return SanitizeGridPath(p)
}

func SanitizeFile(f string) string {
	clean := strings.TrimSpace(f)
	clean = strings.ReplaceAll(clean, "\x00", "")
	for strings.Contains(clean, "..") {
		clean = strings.ReplaceAll(clean, "..", "")
	}
	clean = strings.Trim(clean, "/")
	lower := strings.ToLower(clean)
	if lower == "null" || lower == "undefined" {
		return ""
	}
	return clean
}

func sanitizeFile(f string) string {
	return SanitizeFile(f)
}

func (h *GridHandler) getFallbackGrid(r *http.Request) *model.GridResponse {
	dataPath := sanitizeGridPath(r.URL.Query().Get("path"))
	file := sanitizeFile(r.URL.Query().Get("file"))
	element := "TMP"
	var level float32 = 850
	var period int32 = 24

	parts := strings.Split(dataPath, "/")
	if len(parts) >= 3 {
		if l, err := strconv.ParseFloat(parts[2], 32); err == nil {
			level = float32(l)
		}
	}

	if strings.Contains(dataPath, "HGT") {
		element = "HGT"
		if len(parts) < 3 {
			level = 500
		}
	} else if strings.Contains(dataPath, "RAIN") {
		element = "RAIN"
		if len(parts) < 3 {
			level = 0
		}
	} else if strings.Contains(dataPath, "WIND") || strings.Contains(dataPath, "UV") {
		element = "WIND"
		if len(parts) < 3 {
			level = 850
		}
	} else if strings.Contains(dataPath, "VVEL") {
		element = "VVEL"
		if len(parts) < 3 {
			level = 500
		}
	} else if strings.Contains(dataPath, "RH") {
		element = "RH"
		if len(parts) < 3 {
			level = 850
		}
	}

	if pStr := r.URL.Query().Get("period"); pStr != "" {
		if p, err := strconv.Atoi(pStr); err == nil {
			period = int32(p)
		}
	} else if file != "" {
		fileParts := strings.Split(file, ".")
		if len(fileParts) >= 2 {
			if p, err := strconv.Atoi(fileParts[len(fileParts)-1]); err == nil {
				period = int32(p)
			}
		}
	}

	if strings.HasPrefix(dataPath, "SATELLITE/") {
		step := 2
		if stepStr := r.URL.Query().Get("step"); stepStr != "" {
			if s, err := strconv.Atoi(stepStr); err == nil && s > 0 {
				step = s
			}
		}
		return mock.GenerateMockSatelliteGrid(dataPath, step)
	}

	return mock.GenerateMockGrid(element, level, period)
}

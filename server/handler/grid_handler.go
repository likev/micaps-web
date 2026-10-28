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
	Source   *BlobSource
}

func (h *GridHandler) getSource() *BlobSource {
	if h.Source != nil {
		return h.Source
	}
	return &BlobSource{
		Fetcher: &DBBlobFetcher{Client: h.Client},
		Cache:   h.Cache,
	}
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
		if strings.Contains(err.Error(), "invalid date format") {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
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
		if strings.Contains(err.Error(), "invalid date format") {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(err.Error()))
			return
		}
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
	file := sanitizeFile(r.URL.Query().Get("file"))
	levelStr := strings.TrimSpace(r.URL.Query().Get("level"))

	beforeDate, pErr := ParseHistoryDateParam(r)
	if pErr != nil {
		return nil, pErr
	}

	// Check if this is a derived grid path (e.g. /api/derived/ECMWF_HR/TMP/850-500)
	if dReq, ok := ParseDerivedPath(dataPath, file); ok && dReq != nil && !dReq.IsStation {
		dReq.DateCutoff = beforeDate
		if dReq.File == "" {
			dReq.File = file
		}
		if dReq.File == "" || dReq.File == "latest" {
			underlying := ResolveUnderlyingCatalogPath(dReq)
			if h.Client != nil && !h.MockMode {
				latest, err := db.GetLatestCycle(h.Client, underlying, "", beforeDate)
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

	if h.Client != nil && !h.MockMode && dataPath != "" && (file == "" || file == "latest") {
		// If FY4B without channel in dataPath, resolve channel first for latest query
		queryPath := dataPath
		if (strings.Contains(queryPath, "FY4B/L1/CHINA") || strings.Contains(queryPath, "FY4B/L1/DISK")) && !strings.Contains(queryPath, "/C0") {
			ch := 12
			if levelStr != "" {
				if upper := strings.ToUpper(levelStr); strings.HasPrefix(upper, "C") && len(upper) == 4 {
					if n, err := strconv.Atoi(upper[1:]); err == nil && n >= 1 && n <= 15 {
						ch = n
					}
				} else if n, err := strconv.Atoi(levelStr); err == nil && n >= 1 && n <= 15 {
					ch = n
				}
			}
			queryPath = fmt.Sprintf("%s/C%03d", queryPath, ch)
		}
		latest, err := db.GetLatestCycle(h.Client, queryPath, "", beforeDate)
		if err == nil && latest != "" {
			file = latest
		} else {
			files, fErr := db.GetFileList(h.Client, queryPath, 1, beforeDate)
			if fErr == nil && len(files) > 0 {
				file = files[0].Name
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

	ref, err := CanonicalGridRef(dataPath, file, levelStr)
	if err != nil {
		return nil, err
	}

	rawBlob, err := h.getSource().GetOrFetch(ref)
	if err != nil {
		return nil, err
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
		if r != nil && r.URL != nil {
			if stepStr := r.URL.Query().Get("step"); stepStr != "" {
				if s, err := strconv.Atoi(stepStr); err == nil && s > 0 {
					step = s
				}
			}
		}
		resp, err := parser.ParseAWXGrid(unwrapped, step)
		if err != nil {
			return nil, err
		}
		if resp != nil && r != nil && r.URL != nil {
			var chanNum int
			p := r.URL.Query().Get("path")
			for _, part := range strings.Split(strings.Trim(p, "/"), "/") {
				upper := strings.ToUpper(part)
				if strings.HasPrefix(upper, "C") && len(upper) == 4 {
					if n, err := strconv.Atoi(upper[1:]); err == nil && n >= 1 && n <= 15 {
						chanNum = n
						break
					}
				}
			}
			if chanNum == 0 {
				lvl := strings.TrimSpace(r.URL.Query().Get("level"))
				if upper := strings.ToUpper(lvl); strings.HasPrefix(upper, "C") && len(upper) == 4 {
					if n, err := strconv.Atoi(upper[1:]); err == nil && n >= 1 && n <= 15 {
						chanNum = n
					}
				} else if n, err := strconv.Atoi(lvl); err == nil && n >= 1 && n <= 15 {
					chanNum = n
				}
			}
			if chanNum == 0 {
				file := strings.ToUpper(r.URL.Query().Get("file"))
				if strings.HasPrefix(file, "C") && len(file) >= 4 {
					if n, err := strconv.Atoi(file[1:4]); err == nil && n >= 1 && n <= 15 {
						chanNum = n
					}
				}
			}
			if chanNum >= 1 && chanNum <= 15 {
				resp.Header.Element = fmt.Sprintf("C%03d", chanNum)
			}
		}
		return resp, nil
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
	if (strings.Contains(dataPath, "FY4B/L1/CHINA") || strings.Contains(dataPath, "FY4B/L1/DISK")) && !strings.Contains(dataPath, "/C0") {
		var chanNum int
		if lvl := strings.TrimSpace(r.URL.Query().Get("level")); lvl != "" {
			if upper := strings.ToUpper(lvl); strings.HasPrefix(upper, "C") && len(upper) == 4 {
				if n, err := strconv.Atoi(upper[1:]); err == nil && n >= 1 && n <= 15 {
					chanNum = n
				}
			} else if n, err := strconv.Atoi(lvl); err == nil && n >= 1 && n <= 15 {
				chanNum = n
			}
		}
		if chanNum == 0 && file != "" {
			upperFile := strings.ToUpper(file)
			if strings.HasPrefix(upperFile, "C") && len(upperFile) >= 4 {
				if n, err := strconv.Atoi(upperFile[1:4]); err == nil && n >= 1 && n <= 15 {
					chanNum = n
				}
			}
		}
		if chanNum >= 1 && chanNum <= 15 {
			dataPath = fmt.Sprintf("%s/C%03d", dataPath, chanNum)
		}
	}
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

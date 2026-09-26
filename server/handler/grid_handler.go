package handler

import (
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
}

// JSONHandler handles /api/data/grid
func (h *GridHandler) JSONHandler(w http.ResponseWriter, r *http.Request) {
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
	file := sanitizeFile(r.URL.Query().Get("file"))

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
			decompressed, err := parser.DecompressGzip(cachedBlob)
			if err == nil {
				return parser.ParseGridData(decompressed)
			}
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

	decompressed, err := parser.DecompressGzip(rawBlob)
	if err != nil {
		return nil, err
	}

	return parser.ParseGridData(decompressed)
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

	return mock.GenerateMockGrid(element, level, period)
}

package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"micaps-web/db"
)

// CatalogHandler manages /api/catalog/* requests
type CatalogHandler struct {
	Client   *db.CQLClient
	MockMode bool
}

// ModelsHandler returns categorized tables
func (h *CatalogHandler) ModelsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(db.SupportedModels())
}

// TreeHandler returns files from treeview table
func (h *CatalogHandler) TreeHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	dataPath := r.URL.Query().Get("path")
	if dataPath == "" {
		http.Error(w, `{"error":"path query param required"}`, http.StatusBadRequest)
		return
	}

	cleanPath := strings.Trim(strings.ToLower(dataPath), "/")
	if strings.HasPrefix(cleanPath, "derived/") || cleanPath == "derived" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "route /derived/ has been removed; use /api/derived/"})
		return
	}

	if dReq, ok := ParseDerivedPath(dataPath, ""); ok && dReq != nil {
		dataPath = ResolveUnderlyingCatalogPath(dReq)
	}
	dataPath = SanitizeGridPath(dataPath)
	if lvlStr := strings.TrimSpace(r.URL.Query().Get("level")); lvlStr != "" {
		if (strings.Contains(dataPath, "FY4B/L1/CHINA") || strings.Contains(dataPath, "FY4B/L1/DISK")) && !strings.Contains(dataPath, "/C0") {
			if l, err := strconv.Atoi(lvlStr); err == nil && l >= 1 && l <= 15 {
				dataPath = fmt.Sprintf("%s/C%03d", dataPath, l)
			}
		}
	} else if (strings.HasSuffix(dataPath, "FY4B/L1/CHINA") || strings.HasSuffix(dataPath, "FY4B/L1/DISK")) && !strings.Contains(dataPath, "/C0") {
		dataPath = fmt.Sprintf("%s/C012", dataPath)
	}

	if h.MockMode {
		if strings.HasPrefix(dataPath, "SATELLITE") {
			ext := ".AWX"
			if strings.Contains(dataPath, "DUST") {
				ext = ".BMP"
			}
			mockSatFiles := make([]map[string]interface{}, 0, 48)
			t := time.Date(2026, 8, 29, 20, 0, 0, 0, time.UTC)
			for i := 0; i < 40; i++ {
				fname := t.Format("20060102150405") + ext
				mockSatFiles = append(mockSatFiles, map[string]interface{}{
					"name": fname,
					"size": 524288,
				})
				t = t.Add(-15 * time.Minute)
			}
			json.NewEncoder(w).Encode(mockSatFiles)
			return
		}
		isObs := strings.HasPrefix(dataPath, "SURFACE") || strings.HasPrefix(dataPath, "UPPER_AIR")
		if isObs {
			mockObsFiles := make([]map[string]interface{}, 0, 60)
			t := time.Date(2026, 8, 29, 20, 0, 0, 0, time.UTC)
			for i := 0; i < 55; i++ {
				fname := t.Format("20060102150405") + ".000"
				mockObsFiles = append(mockObsFiles, map[string]interface{}{
					"name": fname,
					"size": 180000 + (i%5)*15000,
				})
				t = t.Add(-3 * time.Hour)
			}
			json.NewEncoder(w).Encode(mockObsFiles)
			return
		}

		mockFiles := []map[string]interface{}{
			{"name": "26082708.000", "size": 405764},
			{"name": "26082708.012", "size": 405764},
			{"name": "26082708.024", "size": 405764},
			{"name": "26082708.036", "size": 405764},
			{"name": "26082708.048", "size": 405764},
		}
		json.NewEncoder(w).Encode(mockFiles)
		return
	}

	if h.Client == nil {
		http.Error(w, `{"error":"CQL client not connected"}`, http.StatusServiceUnavailable)
		return
	}

	limit := 100
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	files, err := db.GetFileList(h.Client, dataPath, limit)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(files)
}

// LevelsHandler returns pressure levels
func (h *CatalogHandler) LevelsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	dataPath := r.URL.Query().Get("path")
	if dataPath == "" {
		dataPath = "ECMWF_HR/TMP"
	}

	cleanPath := strings.Trim(strings.ToLower(dataPath), "/")
	if strings.HasPrefix(cleanPath, "derived/") || cleanPath == "derived" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "route /derived/ has been removed; use /api/derived/"})
		return
	}

	if dReq, ok := ParseDerivedPath(dataPath, ""); ok && dReq != nil {
		dataPath = ResolveUnderlyingCatalogPath(dReq)
	}

	if strings.Contains(dataPath, "TDMOSAIC") {
		json.NewEncoder(w).Encode([]int{500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 7000, 8000, 9000, 10000, 12000, 14000, 15500, 17000, 19000})
		return
	}

	if strings.Contains(dataPath, "PVORT") {
		json.NewEncoder(w).Encode([]int{10, 20, 50, 70, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 850, 900, 925, 950, 1000})
		return
	}

	if strings.Contains(dataPath, "FY4B") {
		json.NewEncoder(w).Encode([]int{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15})
		return
	}

	if strings.Contains(dataPath, "AMV") {
		json.NewEncoder(w).Encode([]int{200, 300, 500, 700, 850})
		return
	}

	if h.MockMode {
		json.NewEncoder(w).Encode([]int{1000, 925, 850, 700, 500, 400, 300, 250, 200, 100})
		return
	}

	if h.Client == nil {
		http.Error(w, `{"error":"CQL client not connected"}`, http.StatusServiceUnavailable)
		return
	}

	levels, err := db.GetPressureLevels(h.Client, dataPath)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(levels)
}

// LatestHandler returns the latest available cycle
func (h *CatalogHandler) LatestHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	dataPath := r.URL.Query().Get("path")
	if dataPath == "" {
		http.Error(w, `{"error":"path query param required"}`, http.StatusBadRequest)
		return
	}

	cleanPath := strings.Trim(strings.ToLower(dataPath), "/")
	if strings.HasPrefix(cleanPath, "derived/") || cleanPath == "derived" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "route /derived/ has been removed; use /api/derived/"})
		return
	}

	rawPath := dataPath
	if dReq, ok := ParseDerivedPath(dataPath, ""); ok && dReq != nil {
		dataPath = ResolveUnderlyingCatalogPath(dReq)
	}
	dataPath = SanitizeGridPath(dataPath)
	if lvlStr := strings.TrimSpace(r.URL.Query().Get("level")); lvlStr != "" {
		if (strings.Contains(dataPath, "FY4B/L1/CHINA") || strings.Contains(dataPath, "FY4B/L1/DISK")) && !strings.Contains(dataPath, "/C0") {
			if l, err := strconv.Atoi(lvlStr); err == nil && l >= 1 && l <= 15 {
				dataPath = fmt.Sprintf("%s/C%03d", dataPath, l)
			}
		}
	} else if (strings.HasSuffix(dataPath, "FY4B/L1/CHINA") || strings.HasSuffix(dataPath, "FY4B/L1/DISK")) && !strings.Contains(dataPath, "/C0") {
		dataPath = fmt.Sprintf("%s/C012", dataPath)
	}

	suffix := r.URL.Query().Get("suffix")
	if suffix == "" {
		if strings.Contains(dataPath, "DUST") {
			suffix = "*.BMP"
		} else if strings.HasPrefix(dataPath, "SATELLITE") {
			suffix = "*.AWX"
		} else if strings.Contains(dataPath, "SWAN") {
			suffix = "*.BZ2"
		} else if strings.Contains(dataPath, "SURFACE") || strings.Contains(dataPath, "CLDAS") || strings.Contains(dataPath, "MARINE") {
			suffix = "*.000"
		} else {
			suffix = "*.024"
		}
	}

	if h.MockMode {
		json.NewEncoder(w).Encode(map[string]string{
			"dataPath": rawPath,
			"latest":   "26082708.024",
		})
		return
	}

	if h.Client == nil {
		http.Error(w, `{"error":"CQL client not connected"}`, http.StatusServiceUnavailable)
		return
	}

	latest, err := db.GetLatestCycle(h.Client, dataPath, suffix)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"dataPath": rawPath,
		"latest":   latest,
	})
}

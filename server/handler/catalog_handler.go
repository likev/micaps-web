package handler

import (
	"encoding/json"
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

	if h.MockMode {
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

	suffix := r.URL.Query().Get("suffix")
	if suffix == "" {
		suffix = "*.024"
	}

	if h.MockMode {
		json.NewEncoder(w).Encode(map[string]string{
			"dataPath": dataPath,
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
		"dataPath": dataPath,
		"latest":   latest,
	})
}

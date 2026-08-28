package handler

import (
	"encoding/json"
	"net/http"
	"strings"

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

	if h.MockMode || h.Client == nil {
		isObs := strings.HasPrefix(dataPath, "SURFACE") || strings.HasPrefix(dataPath, "UPPER_AIR")
		if isObs {
			mockObsFiles := []map[string]interface{}{
				{"name": "20260828170000.000", "size": 133979},
				{"name": "20260828140000.000", "size": 169853},
				{"name": "20260828110000.000", "size": 183551},
				{"name": "20260828080000.000", "size": 207819},
				{"name": "20260828050000.000", "size": 180591},
				{"name": "20260828020000.000", "size": 249496},
				{"name": "20260827200000.000", "size": 241557},
				{"name": "20260827170000.000", "size": 125870},
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

	files, err := db.GetFileList(h.Client, dataPath)
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

	if h.MockMode || h.Client == nil {
		json.NewEncoder(w).Encode([]int{1000, 925, 850, 700, 500, 400, 300, 250, 200, 100})
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

	if h.MockMode || h.Client == nil {
		json.NewEncoder(w).Encode(map[string]string{
			"dataPath": dataPath,
			"latest":   "26082708.024",
		})
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

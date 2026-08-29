package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"micaps-web/db"
	"micaps-web/mock"
	"micaps-web/model"
	"micaps-web/parser"
)

// StationHandler processes station observation requests
type StationHandler struct {
	Client   *db.CQLClient
	MockMode bool
}

// StationGeoJSONHandler handles /api/data/station returning GeoJSON Point FeatureCollection
func (h *StationHandler) StationGeoJSONHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	stations, err := h.fetchStations(r)
	if err != nil {
		if h.MockMode {
			log.Printf("[StationHandler] Error fetching stations: %v. Mock fallback.", err)
			stations = mock.GenerateMockStations()
		} else {
			log.Printf("[StationHandler] Station data not found: %v", err)
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"type":     "FeatureCollection",
				"features": []interface{}{},
				"error":    err.Error(),
			})
			return
		}
	}

	json.NewEncoder(w).Encode(stations)
}

func (h *StationHandler) fetchStations(r *http.Request) (*model.GeoJSONFeatureCollection, error) {
	dataPath := r.URL.Query().Get("path")
	file := r.URL.Query().Get("file")

	if h.Client == nil || dataPath == "" || file == "" {
		if h.MockMode {
			return mock.GenerateMockStations(), nil
		}
		return nil, fmt.Errorf("missing query parameter 'path' or 'file' (or CQL client not connected)")
	}

	if h.MockMode {
		return mock.GenerateMockStations(), nil
	}

	rawBlob, err := db.GetBlob(h.Client, dataPath, file)
	if err != nil {
		return nil, err
	}

	decompressed, err := parser.DecompressGzip(rawBlob)
	if err != nil {
		return nil, err
	}

	return parser.ParseStationData(decompressed)
}

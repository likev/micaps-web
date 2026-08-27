package handler

import (
	"encoding/json"
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
		log.Printf("[StationHandler] Error fetching stations: %v. Falling back to mock.", err)
		stations = mock.GenerateMockStations()
	}

	json.NewEncoder(w).Encode(stations)
}

func (h *StationHandler) fetchStations(r *http.Request) (*model.GeoJSONFeatureCollection, error) {
	dataPath := r.URL.Query().Get("path")
	file := r.URL.Query().Get("file")

	if h.MockMode || h.Client == nil || dataPath == "" || file == "" {
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

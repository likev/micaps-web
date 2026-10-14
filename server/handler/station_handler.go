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
	"micaps-web/mock"
	"micaps-web/model"
	"micaps-web/parser"
)

// StationHandler processes station observation requests
type StationHandler struct {
	Client   *db.CQLClient
	MockMode bool
	Derived  *DerivedHandler
}

// StationGeoJSONHandler handles /api/data/station returning GeoJSON Point FeatureCollection
func (h *StationHandler) StationGeoJSONHandler(w http.ResponseWriter, r *http.Request) {
	dataPath := SanitizeGridPath(r.URL.Query().Get("path"))
	cleanPath := strings.Trim(strings.ToLower(dataPath), "/")
	if strings.HasPrefix(cleanPath, "derived/") || cleanPath == "derived" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"type":     "FeatureCollection",
			"features": []interface{}{},
			"error":    "route /derived/ has been removed; use /api/derived/",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")

	stations, err := h.fetchStations(r)
	if err != nil {
		if h.MockMode {
			log.Printf("[StationHandler] Error fetching stations: %v. Mock fallback.", err)
			stations = mock.GenerateMockStationsForPath(r.URL.Query().Get("path"))
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
	dataPath := SanitizeGridPath(r.URL.Query().Get("path"))
	file := SanitizeFile(r.URL.Query().Get("file"))

	// Check if this is a derived station path (e.g. /api/derived/UPPER_AIR/PLOT/TMP/850-500)
	if dReq, ok := ParseDerivedPath(dataPath, file); ok && dReq != nil && dReq.IsStation {
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
				dReq.File = "20261010080000.000"
			}
		}
		if h.Derived != nil {
			return h.Derived.CalculateDerivedStation(dReq)
		}
		dH := &DerivedHandler{Client: h.Client, MockMode: h.MockMode}
		return dH.CalculateDerivedStation(dReq)
	}

	if strings.Contains(dataPath, "TLOGP") {
		dataPath = "UPPER_AIR/TLOGP"
	}

	if dataPath == "" {
		if h.MockMode {
			return mock.GenerateMockStationsForPath(dataPath), nil
		}
		return nil, fmt.Errorf("missing query parameter 'path' (or CQL client not connected)")
	}

	if h.MockMode {
		return mock.GenerateMockStationsForPath(dataPath), nil
	}

	if h.Client == nil {
		return nil, fmt.Errorf("missing CQL client connection")
	}

	if file == "" || file == "latest" {
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

	if file == "" {
		return nil, fmt.Errorf("missing query parameter 'file'")
	}

	rawBlob, err := db.GetBlob(h.Client, dataPath, file)
	if err != nil && !strings.HasSuffix(file, ".000") && len(file) == 14 {
		rawBlob, err = db.GetBlob(h.Client, dataPath, file+".000")
		if err == nil {
			file = file + ".000"
		}
	}
	if err != nil {
		return nil, err
	}

	decompressed, err := parser.DecompressGzip(rawBlob)
	if err != nil {
		return nil, err
	}

	trimmed := bytes.TrimSpace(decompressed)
	lowerTrimmed := bytes.ToLower(trimmed)
	if parser.IsAWX(decompressed) {
		var targetLevel float64
		if lvlStr := r.URL.Query().Get("level"); lvlStr != "" {
			if l, err := strconv.ParseFloat(lvlStr, 64); err == nil {
				targetLevel = l
			}
		}
		return parser.ParseAWXDiscrete(decompressed, targetLevel)
	}
	if bytes.HasPrefix(lowerTrimmed, []byte("diamond 35")) {
		return parser.ParseSwanText(decompressed)
	}
	if bytes.HasPrefix(lowerTrimmed, []byte("diamond ")) {
		if !bytes.HasPrefix(lowerTrimmed, []byte("diamond 131")) &&
			!bytes.HasPrefix(lowerTrimmed, []byte("diamond 13 ")) &&
			!bytes.HasPrefix(lowerTrimmed, []byte("diamond 14 ")) &&
			!bytes.HasPrefix(lowerTrimmed, []byte("diamond 4 ")) &&
			!bytes.HasPrefix(lowerTrimmed, []byte("diamond 11 ")) &&
			!bytes.HasPrefix(lowerTrimmed, []byte("diamond 11\t")) &&
			!bytes.HasPrefix(lowerTrimmed, []byte("diamond 11\r")) &&
			!bytes.HasPrefix(lowerTrimmed, []byte("diamond 11\n")) {
			return parser.ParseDiamondTextStation(decompressed)
		}
	}

	if bytes.HasPrefix(trimmed, []byte("diamond 5")) || strings.Contains(dataPath, "TLOGP") {
		fc, err := parser.ExtractStationsGeoJSON(decompressed)
		if err == nil && fc != nil && len(fc.Features) > 0 {
			return fc, nil
		}
		// Gracefully fallback to generic station parser if Diamond 5 extraction fails
	}

	return parser.ParseStationData(decompressed)
}

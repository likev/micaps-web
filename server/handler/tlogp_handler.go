package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"micaps-web/db"
	"micaps-web/mock"
	"micaps-web/parser"
)

// TLogPHandler processes sounding data and station network requests
type TLogPHandler struct {
	Client   *db.CQLClient
	MockMode bool

	mu         sync.RWMutex
	cachedFile string
	cachedData []byte
	cachedAt   time.Time
}

// Handler handles GET /api/data/tlogp
func (h *TLogPHandler) Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	file := strings.TrimSpace(r.URL.Query().Get("file"))
	station := strings.TrimSpace(r.URL.Query().Get("station"))

	if h.MockMode {
		h.handleMock(w, station, file)
		return
	}

	decompressed, resolvedFile, err := h.getDecompressedData(file)
	if err != nil {
		if h.Client == nil || h.MockMode {
			h.handleMock(w, station, file)
			return
		}
		log.Printf("[TLogPHandler] Error getting T-lnP data: %v", err)
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	if station != "" {
		profile, err := parser.ExtractStationProfile(decompressed, station)
		if err != nil {
			log.Printf("[TLogPHandler] Station %s profile error: %v", station, err)
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":   err.Error(),
				"file":    resolvedFile,
				"station": station,
			})
			return
		}
		json.NewEncoder(w).Encode(profile)
	} else {
		geoJSON, err := parser.ExtractStationsGeoJSON(decompressed)
		if err != nil {
			log.Printf("[TLogPHandler] GeoJSON parsing error: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error": err.Error(),
				"file":  resolvedFile,
			})
			return
		}
		json.NewEncoder(w).Encode(geoJSON)
	}
}

func (h *TLogPHandler) handleMock(w http.ResponseWriter, station, file string) {
	if station != "" {
		profile := mock.GenerateMockTLogPProfile(station, file)
		json.NewEncoder(w).Encode(profile)
	} else {
		stations := mock.GenerateMockStationsForPath("UPPER_AIR/TLOGP")
		json.NewEncoder(w).Encode(stations)
	}
}

func (h *TLogPHandler) getDecompressedData(file string) ([]byte, string, error) {
	if h.Client == nil {
		return nil, "", fmt.Errorf("CQL client is not connected")
	}

	if file == "" || file == "latest" {
		latest, err := db.GetLatestCycle(h.Client, "UPPER_AIR/TLOGP", "")
		if err != nil {
			// Fall back to first treeview entry
			files, fErr := db.GetFileList(h.Client, "UPPER_AIR/TLOGP", 1)
			if fErr == nil && len(files) > 0 {
				latest = files[0].Name
			} else {
				return nil, "", fmt.Errorf("could not resolve latest cycle: %w", err)
			}
		}
		file = latest
	}

	// Check in-memory cache
	h.mu.RLock()
	if h.cachedFile == file && len(h.cachedData) > 0 && time.Since(h.cachedAt) < 5*time.Minute {
		dataCopy := make([]byte, len(h.cachedData))
		copy(dataCopy, h.cachedData)
		h.mu.RUnlock()
		return dataCopy, file, nil
	}
	h.mu.RUnlock()

	// Fetch from Cassandra
	blob, err := db.GetBlob(h.Client, "UPPER_AIR/TLOGP", file)
	if err != nil {
		return nil, file, fmt.Errorf("GetBlob failed for UPPER_AIR/TLOGP file %s: %w", file, err)
	}

	decompressed, err := parser.DecompressGzip(blob)
	if err != nil {
		return nil, file, fmt.Errorf("DecompressGzip failed for %s: %w", file, err)
	}

	// Store in cache
	h.mu.Lock()
	h.cachedFile = file
	h.cachedData = decompressed
	h.cachedAt = time.Now()
	h.mu.Unlock()

	return decompressed, file, nil
}

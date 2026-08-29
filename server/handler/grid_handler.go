package handler

import (
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

// GridHandler processes gridded data requests
type GridHandler struct {
	Client   *db.CQLClient
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
	dataPath := r.URL.Query().Get("path")
	file := r.URL.Query().Get("file")

	if h.Client == nil || dataPath == "" || file == "" {
		if h.MockMode {
			return h.getFallbackGrid(r), nil
		}
		return nil, fmt.Errorf("missing query parameter 'path' or 'file' (or CQL client not connected)")
	}

	if h.MockMode {
		return h.getFallbackGrid(r), nil
	}

	rawBlob, err := db.GetBlob(h.Client, dataPath, file)
	if err != nil {
		return nil, err
	}

	decompressed, err := parser.DecompressGzip(rawBlob)
	if err != nil {
		return nil, err
	}

	return parser.ParseGridData(decompressed)
}

func (h *GridHandler) getFallbackGrid(r *http.Request) *model.GridResponse {
	dataPath := r.URL.Query().Get("path")
	element := "TMP"
	var level float32 = 850
	var period int32 = 24

	if strings.Contains(dataPath, "HGT") {
		element = "HGT"
		level = 500
	} else if strings.Contains(dataPath, "RAIN") {
		element = "RAIN"
		level = 0
	} else if strings.Contains(dataPath, "WIND") || strings.Contains(dataPath, "UV") {
		element = "WIND"
		level = 850
	}

	if pStr := r.URL.Query().Get("period"); pStr != "" {
		if p, err := strconv.Atoi(pStr); err == nil {
			period = int32(p)
		}
	}

	return mock.GenerateMockGrid(element, level, period)
}

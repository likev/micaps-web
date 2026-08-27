package handler

import (
	"encoding/json"
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
		log.Printf("[GridHandler] Error fetching grid: %v. Falling back to mock.", err)
		gridResp = h.getFallbackGrid(r)
	}

	json.NewEncoder(w).Encode(gridResp)
}

// BinaryHandler handles /api/data/grid/binary
func (h *GridHandler) BinaryHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/octet-stream")

	gridResp, err := h.fetchGrid(r)
	if err != nil {
		log.Printf("[GridHandler] Error fetching grid: %v. Falling back to mock.", err)
		gridResp = h.getFallbackGrid(r)
	}

	bin := parser.EncodeBinaryStream(gridResp)
	w.Header().Set("Content-Length", strconv.Itoa(len(bin)))
	w.Write(bin)
}

func (h *GridHandler) fetchGrid(r *http.Request) (*model.GridResponse, error) {
	dataPath := r.URL.Query().Get("path")
	file := r.URL.Query().Get("file")

	if h.MockMode || h.Client == nil || dataPath == "" || file == "" {
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
	}

	if pStr := r.URL.Query().Get("period"); pStr != "" {
		if p, err := strconv.Atoi(pStr); err == nil {
			period = int32(p)
		}
	}

	return mock.GenerateMockGrid(element, level, period)
}

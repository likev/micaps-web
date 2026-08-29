package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"micaps-web/config"
)

var startTime = time.Now()

// StaticHandler serves the client SPA and PMTiles files
type StaticHandler struct {
	Cfg *config.Config
}

// PMTilesHandler serves map-china.pmtiles supporting HTTP 206 Range requests
func (h *StaticHandler) PMTilesHandler(w http.ResponseWriter, r *http.Request) {
	pmtilesFile := h.Cfg.PMTilesPath
	if _, err := os.Stat(pmtilesFile); os.IsNotExist(err) {
		// Try relative to workspace
		altPath := filepath.Join("../client/public/map-china.pmtiles")
		if _, aErr := os.Stat(altPath); aErr == nil {
			pmtilesFile = altPath
		}
	}

	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Range, Origin, Content-Type, Accept")
	w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
	w.Header().Set("Accept-Ranges", "bytes")

	http.ServeFile(w, r, pmtilesFile)
}

// StatusHandler returns API health, connection details, and uptime
func (h *StaticHandler) StatusHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":         "ok",
		"cassandra_host": h.Cfg.CassandraHost,
		"cassandra_port": h.Cfg.CassandraPort,
		"tunnel_mode":    h.Cfg.EnableTunnel,
		"mock_mode":      h.Cfg.MockMode,
		"uptime_seconds": int(time.Since(startTime).Seconds()),
	})
}

// ConfigHandler reads or updates config.json
func (h *StaticHandler) ConfigHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	distDir := h.Cfg.StaticDir
	candidates := []string{
		filepath.Join(distDir, "config.json"),
		filepath.Join(distDir, "config/config.json"),
		"client/public/config.json",
		"../client/public/config.json",
	}

	var configPath string
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			configPath = p
			break
		}
	}
	if configPath == "" {
		configPath = "client/public/config.json"
	}

	if r.Method == http.MethodPost || r.Method == http.MethodPut {
		var obj any
		if err := json.NewDecoder(r.Body).Decode(&obj); err != nil {
			http.Error(w, `{"error":"Invalid JSON: `+err.Error()+`"}`, http.StatusBadRequest)
			return
		}

		formatted, err := json.MarshalIndent(obj, "", "  ")
		if err != nil {
			http.Error(w, `{"error":"Format error: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		str := string(formatted)
		reColor := regexp.MustCompile(`"color":\s*\[\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\]`)
		str = reColor.ReplaceAllString(str, `"color": [$1, $2, $3, $4]`)
		reValColor := regexp.MustCompile(`\{\s*"val":\s*(-?[\d.]+),\s*"color":\s*(\[[^\]]+\])\s*\}`)
		str = reValColor.ReplaceAllString(str, `{ "val": $1, "color": $2 }`)

		_ = os.WriteFile(filepath.Join(distDir, "config.json"), []byte(str), 0644)
		_ = os.WriteFile("client/public/config.json", []byte(str), 0644)
		_ = os.WriteFile("../client/public/config.json", []byte(str), 0644)

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","message":"Configuration saved successfully"}`))
		return
	}

	// GET
	data, err := os.ReadFile(configPath)
	if err != nil {
		http.Error(w, `{"error":"Could not read config file: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// SPAHandler serves frontend static files with SPA fallback
func (h *StaticHandler) SPAHandler(w http.ResponseWriter, r *http.Request) {
	distDir := h.Cfg.StaticDir
	path := filepath.Join(distDir, filepath.Clean(r.URL.Path))

	info, err := os.Stat(path)
	if err == nil && !info.IsDir() {
		http.ServeFile(w, r, path)
		return
	}

	// Fallback to index.html for SPA routes
	indexPath := filepath.Join(distDir, "index.html")
	if _, err := os.Stat(indexPath); err == nil {
		http.ServeFile(w, r, indexPath)
		return
	}

	// If dist not built yet, return friendly placeholder
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(`<!DOCTYPE html><html><head><title>MICAPS-Web</title></head><body><h1>MICAPS-Web Server Running</h1><p>Client build in progress or available at Vite dev server.</p></body></html>`))
}


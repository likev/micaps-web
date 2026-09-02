package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
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
		candidates := []string{
			filepath.Join(h.Cfg.StaticDir, "map-china.pmtiles"),
			"client/dist/map-china.pmtiles",
			"../client/dist/map-china.pmtiles",
			"client/public/map-china.pmtiles",
			"../client/public/map-china.pmtiles",
			"map-china.pmtiles",
		}
		if exePath, err := os.Executable(); err == nil {
			exeDir := filepath.Dir(exePath)
			candidates = append([]string{filepath.Join(exeDir, "map-china.pmtiles")}, candidates...)
		}
		for _, alt := range candidates {
			if _, aErr := os.Stat(alt); aErr == nil {
				pmtilesFile = alt
				break
			}
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
	var candidates []string
	if distDir != "" {
		candidates = append(candidates,
			filepath.Join(distDir, "config.json"),
			filepath.Join(distDir, "config/config.json"),
		)
	}
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		candidates = append(candidates, filepath.Join(exeDir, "config.json"))
	}
	candidates = append(candidates,
		"config.json",
		"client/dist/config.json",
		"../client/dist/config.json",
		"client/public/config.json",
		"../client/public/config.json",
		"client/config.json",
	)

	var configPath string
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			configPath = p
			break
		}
	}
	if configPath == "" {
		configPath = filepath.Join(distDir, "config.json")
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

		// Strictly save only to client/dist/config.json (the runtime configuration)
		targetSavePath := filepath.Join(distDir, "config.json")
		if distDir == "" {
			targetSavePath = "client/dist/config.json"
		}
		if err := os.WriteFile(targetSavePath, []byte(str), 0644); err != nil {
			_ = os.WriteFile("client/dist/config.json", []byte(str), 0644)
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","message":"Configuration saved successfully to client/dist/config.json"}`))
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

	// If requesting /config.json specifically and not in distDir, try fallback paths
	if r.URL.Path == "/config.json" || r.URL.Path == "config.json" {
		fallbackPaths := []string{
			"client/public/config.json",
			"../client/public/config.json",
			"client/dist/config.json",
			"client/config.json",
			"config.json",
		}
		for _, fp := range fallbackPaths {
			if _, err := os.Stat(fp); err == nil {
				http.ServeFile(w, r, fp)
				return
			}
		}
	}

	// If requesting /palettes/... try multiple candidate paths and do not fallback to index.html
	if strings.HasPrefix(r.URL.Path, "/palettes/") {
		paletteRel := strings.TrimPrefix(r.URL.Path, "/palettes/")
		candidates := []string{
			filepath.Join(distDir, "palettes", paletteRel),
			filepath.Join("client", "public", "palettes", paletteRel),
			filepath.Join("client", "palettes", paletteRel),
			filepath.Join("..", "client", "public", "palettes", paletteRel),
			filepath.Join("..", "client", "palettes", paletteRel),
			filepath.Join("palettes", paletteRel),
		}
		if exePath, err := os.Executable(); err == nil {
			exeDir := filepath.Dir(exePath)
			candidates = append([]string{
				filepath.Join(exeDir, "palettes", paletteRel),
				filepath.Join(exeDir, "client", "palettes", paletteRel),
				filepath.Join(exeDir, "client", "public", "palettes", paletteRel),
				filepath.Join(exeDir, "client", "dist", "palettes", paletteRel),
			}, candidates...)
		}
		for _, cp := range candidates {
			if info, err := os.Stat(cp); err == nil && !info.IsDir() {
				http.ServeFile(w, r, cp)
				return
			}
		}
		http.NotFound(w, r)
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


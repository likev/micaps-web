package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"micaps-web/config"
	"micaps-web/filecache"
)

func systemConfigCandidates() []string {
	candidates := []string{
		"client/config.json",
		"../client/config.json",
	}
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		candidates = append(candidates, filepath.Join(exeDir, "client/config.json"))
	}
	return candidates
}

func systemColormapsCandidates() []string {
	candidates := []string{
		"client/colormaps.json",
		"../client/colormaps.json",
	}
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		candidates = append(candidates, filepath.Join(exeDir, "client", "colormaps.json"))
	}
	return candidates
}

var startTime = time.Now()

// StaticHandler serves the client SPA and PMTiles files
type StaticHandler struct {
	Cfg             *config.Config
	FileCache       *filecache.Cache
	PrefetchHandler *PrefetchHandler
}

// PMTilesHandler serves PMTiles files (*.pmtiles) supporting HTTP 206 Range requests
func (h *StaticHandler) PMTilesHandler(w http.ResponseWriter, r *http.Request) {
	requestedFile := filepath.Base(r.URL.Path)
	if requestedFile == "" || requestedFile == "." || requestedFile == "/" || !strings.HasSuffix(requestedFile, ".pmtiles") {
		requestedFile = "map-china.pmtiles"
	}

	var pmtilesFile string
	// If the standard map-china.pmtiles is requested (or filename matches configured path), serve configured PMTilesPath
	if requestedFile == "map-china.pmtiles" || filepath.Base(h.Cfg.PMTilesPath) == requestedFile {
		if _, err := os.Stat(h.Cfg.PMTilesPath); err == nil {
			pmtilesFile = h.Cfg.PMTilesPath
		}
	}

	if pmtilesFile == "" {
		baseDir := filepath.Dir(h.Cfg.PMTilesPath)
		candidates := []string{
			filepath.Join(baseDir, requestedFile),
			filepath.Join("client/map", requestedFile),
			filepath.Join("../client/map", requestedFile),
			filepath.Join("map", requestedFile),
			filepath.Join("client/public", requestedFile),
			filepath.Join("../client/public", requestedFile),
			filepath.Join(h.Cfg.StaticDir, requestedFile),
			filepath.Join("client/dist", requestedFile),
			filepath.Join("../client/dist", requestedFile),
			requestedFile,
			h.Cfg.PMTilesPath,
		}
		if exePath, err := os.Executable(); err == nil {
			exeDir := filepath.Dir(exePath)
			candidates = append([]string{
				filepath.Join(exeDir, "map", requestedFile),
				filepath.Join(exeDir, "client", "map", requestedFile),
				filepath.Join(exeDir, requestedFile),
			}, candidates...)
		}
		for _, alt := range candidates {
			if _, aErr := os.Stat(alt); aErr == nil {
				pmtilesFile = alt
				break
			}
		}
	}

	if pmtilesFile == "" {
		http.NotFound(w, r)
		return
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
	status := map[string]interface{}{
		"status":         "ok",
		"cassandra_host": h.Cfg.CassandraHost,
		"cassandra_port": h.Cfg.CassandraPort,
		"tunnel_mode":    h.Cfg.EnableTunnel,
		"mock_mode":      h.Cfg.MockMode,
		"uptime_seconds": int(time.Since(startTime).Seconds()),
	}
	if h.FileCache != nil {
		status["thCache"] = h.FileCache.Stats()
	} else {
		status["thCache"] = map[string]interface{}{
			"entries":  int64(0),
			"bytes":    int64(0),
			"capBytes": int64(0),
		}
	}
	if h.PrefetchHandler != nil {
		status["prefetch"] = h.PrefetchHandler.Stats()
	} else {
		status["prefetch"] = map[string]interface{}{
			"queued":       int64(0),
			"running":      int64(0),
			"warmed":       int64(0),
			"failed":       int64(0),
			"dropped":      int64(0),
			"negativeHits": int64(0),
		}
	}
	json.NewEncoder(w).Encode(status)
}

// ConfigHandler reads or updates config.json (per-user when X-Micaps-User / ?user= is specified)
func (h *StaticHandler) ConfigHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Micaps-User")
	w.Header().Set("Access-Control-Expose-Headers", "X-Micaps-Config-Source, X-Micaps-User")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	userID, err := ExtractRequestUserID(r)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	configPath := resolveSystemFilePath(systemConfigCandidates(), "client/config.json")

	if r.Method == http.MethodPost || r.Method == http.MethodPut {
		var obj any
		if err := json.NewDecoder(r.Body).Decode(&obj); err != nil {
			http.Error(w, `{"error":"Invalid JSON: `+err.Error()+`"}`, http.StatusBadRequest)
			return
		}

		formattedBytes, err := FormatCompactConfigBytes(obj)
		if err != nil {
			http.Error(w, `{"error":"Format error: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		if userID != "default" {
			userDir := h.userDirPath(userID)
			targetUserPath := filepath.Join(userDir, "config.json")
			if err := writeFileAtomic(targetUserPath, formattedBytes, 0644); err != nil {
				http.Error(w, `{"error":"Save error: `+err.Error()+`"}`, http.StatusInternalServerError)
				return
			}
			touchUserMetaTimestamp(userDir, userID)
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Micaps-User", userID)
			w.Header().Set("X-Micaps-Config-Source", "user")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":  "ok",
				"user":    userID,
				"source":  "user",
				"message": "Configuration saved for user " + userID,
			})
			return
		}

		// Strictly save to client/config.json for system default
		targetSavePath := resolveSystemFilePath(systemConfigCandidates(), "client/config.json")
		if err := os.WriteFile(targetSavePath, formattedBytes, 0644); err != nil {
			http.Error(w, `{"error":"Save error: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Micaps-User", "default")
		w.Header().Set("X-Micaps-Config-Source", "system")
		w.Write([]byte(`{"status":"ok","user":"default","source":"system","message":"Configuration saved successfully to client/config.json"}`))
		return
	}

	// GET
	if userID != "default" {
		userConfigPath := filepath.Join(h.userDirPath(userID), "config.json")
		if data, err := os.ReadFile(userConfigPath); err == nil {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Micaps-User", userID)
			w.Header().Set("X-Micaps-Config-Source", "user")
			w.Write(data)
			return
		}
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		http.Error(w, `{"error":"Could not read config file: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Micaps-User", userID)
	w.Header().Set("X-Micaps-Config-Source", "system")
	w.Write(data)
}

// ColormapsHandler reads or updates colormaps.json (per-user when X-Micaps-User / ?user= is specified)
func (h *StaticHandler) ColormapsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Micaps-User")
	w.Header().Set("Access-Control-Expose-Headers", "X-Micaps-Config-Source, X-Micaps-User")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	userID, err := ExtractRequestUserID(r)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	candidates := systemColormapsCandidates()

	if r.Method == http.MethodPost || r.Method == http.MethodPut {
		var obj map[string]any
		if err := json.NewDecoder(r.Body).Decode(&obj); err != nil {
			http.Error(w, `{"error":"Invalid JSON: `+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		formattedBytes, err := FormatCompactColormapsBytes(obj)
		if err != nil {
			http.Error(w, `{"error":"Format error: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		if userID != "default" {
			userDir := h.userDirPath(userID)
			targetUserPath := filepath.Join(userDir, "colormaps.json")
			if err := writeFileAtomic(targetUserPath, formattedBytes, 0644); err != nil {
				http.Error(w, `{"error":"Save error: `+err.Error()+`"}`, http.StatusInternalServerError)
				return
			}
			touchUserMetaTimestamp(userDir, userID)
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Micaps-User", userID)
			w.Header().Set("X-Micaps-Config-Source", "user")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":  "ok",
				"user":    userID,
				"source":  "user",
				"message": "Colormaps saved for user " + userID,
			})
			return
		}

		targetSavePath := resolveSystemFilePath(candidates, "client/colormaps.json")
		if err := os.WriteFile(targetSavePath, formattedBytes, 0644); err != nil {
			http.Error(w, `{"error":"Save error: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Micaps-User", "default")
		w.Header().Set("X-Micaps-Config-Source", "system")
		w.Write([]byte(`{"status":"ok","user":"default","source":"system","message":"Colormaps saved successfully to client/colormaps.json"}`))
		return
	}

	if userID != "default" {
		userColormapsPath := filepath.Join(h.userDirPath(userID), "colormaps.json")
		if data, err := os.ReadFile(userColormapsPath); err == nil {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Micaps-User", userID)
			w.Header().Set("X-Micaps-Config-Source", "user")
			w.Write(data)
			return
		}
	}

	for _, p := range candidates {
		if data, err := os.ReadFile(p); err == nil {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Micaps-User", userID)
			w.Header().Set("X-Micaps-Config-Source", "system")
			w.Write(data)
			return
		}
	}

	http.Error(w, `{"error":"Colormaps file not found"}`, http.StatusNotFound)
}

// SPAHandler serves frontend static files with SPA fallback
func (h *StaticHandler) SPAHandler(w http.ResponseWriter, r *http.Request) {
	// If requesting /config.json, delegate to ConfigHandler when user-scoped, else serve client/config.json
	if r.URL.Path == "/config.json" || r.URL.Path == "config.json" {
		if r.Header.Get("X-Micaps-User") != "" || r.URL.Query().Get("user") != "" {
			h.ConfigHandler(w, r)
			return
		}
		for _, fp := range systemConfigCandidates() {
			if _, err := os.Stat(fp); err == nil {
				http.ServeFile(w, r, fp)
				return
			}
		}
		http.NotFound(w, r)
		return
	}

	// If requesting /colormaps.json, delegate to ColormapsHandler when user-scoped, else serve client/colormaps.json
	if r.URL.Path == "/colormaps.json" || r.URL.Path == "colormaps.json" {
		if r.Header.Get("X-Micaps-User") != "" || r.URL.Query().Get("user") != "" {
			h.ColormapsHandler(w, r)
			return
		}
		for _, fp := range systemColormapsCandidates() {
			if _, err := os.Stat(fp); err == nil {
				http.ServeFile(w, r, fp)
				return
			}
		}
		http.NotFound(w, r)
		return
	}

	// If requesting *.pmtiles, delegate to PMTilesHandler for HTTP 206 Range support
	if strings.HasSuffix(r.URL.Path, ".pmtiles") {
		h.PMTilesHandler(w, r)
		return
	}

	// Unhandled /api/ routes and removed /derived/ routes must return 404, not the SPA index.html
	if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/derived/") || r.URL.Path == "/derived" {
		http.NotFound(w, r)
		return
	}

	distDir := h.Cfg.StaticDir
	path := filepath.Join(distDir, filepath.Clean(r.URL.Path))

	info, err := os.Stat(path)
	if err == nil && !info.IsDir() {
		http.ServeFile(w, r, path)
		return
	}

	// If requesting /palettes/... try multiple candidate paths and do not fallback to index.html
	if strings.HasPrefix(r.URL.Path, "/palettes/") {
		paletteRel := strings.TrimPrefix(r.URL.Path, "/palettes/")
		candidates := []string{
			filepath.Join("client", "palettes", paletteRel),
			filepath.Join("..", "client", "palettes", paletteRel),
			filepath.Join("palettes", paletteRel),
			filepath.Join(distDir, "palettes", paletteRel),
		}
		if exePath, err := os.Executable(); err == nil {
			exeDir := filepath.Dir(exePath)
			candidates = append([]string{
				filepath.Join(exeDir, "client", "palettes", paletteRel),
				filepath.Join(exeDir, "palettes", paletteRel),
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

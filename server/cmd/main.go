package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"micaps-web/config"
	"micaps-web/db"
	"micaps-web/handler"
)

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Range, Authorization, Accept, Origin")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	cfg := config.LoadConfig()

	log.Printf("[MICAPS-Web] Starting server on port :%s", cfg.HTTPPort)
	log.Printf("[MICAPS-Web] Target Cassandra: %s:%d (Tunnel=%t, Mock=%t)",
		cfg.CassandraHost, cfg.CassandraPort, cfg.EnableTunnel, cfg.MockMode)

	var cqlClient *db.CQLClient
	var err error

	if !cfg.MockMode {
		if cfg.CassandraHost == "" {
			log.Printf("[MICAPS-Web] WARNING: No Cassandra -host specified in product mode. Running in mock fallback mode. Specify -host <ip> to connect to Cassandra.")
			cfg.MockMode = true
		} else {
			addr := fmt.Sprintf("%s:%d", cfg.CassandraHost, cfg.CassandraPort)
			log.Printf("[MICAPS-Web] Connecting to Cassandra CQL v4 at %s (Tunnel=%t)...", addr, cfg.EnableTunnel)
			cqlClient, err = db.NewCQLClient(addr, 10*time.Second)
			if err != nil {
				log.Printf("[MICAPS-Web] WARNING: Could not connect to Cassandra at %s: %v. Running in mock fallback mode.", addr, err)
				cfg.MockMode = true
			} else {
				log.Printf("[MICAPS-Web] SUCCESS: Connected to Cassandra cluster at %s", addr)
				defer cqlClient.Close()
			}
		}
	}

	catH := &handler.CatalogHandler{Client: cqlClient, MockMode: cfg.MockMode}
	gridH := &handler.GridHandler{Client: cqlClient, MockMode: cfg.MockMode}
	statH := &handler.StationHandler{Client: cqlClient, MockMode: cfg.MockMode}
	staticH := &handler.StaticHandler{Cfg: cfg}

	mux := http.NewServeMux()

	// REST API routes
	mux.HandleFunc("/api/status", staticH.StatusHandler)
	mux.HandleFunc("/api/config/presets", staticH.PresetsConfigHandler)
	mux.HandleFunc("/api/catalog/models", catH.ModelsHandler)
	mux.HandleFunc("/api/catalog/tree", catH.TreeHandler)
	mux.HandleFunc("/api/catalog/levels", catH.LevelsHandler)
	mux.HandleFunc("/api/catalog/latest", catH.LatestHandler)
	mux.HandleFunc("/api/data/grid", gridH.JSONHandler)
	mux.HandleFunc("/api/data/grid/binary", gridH.BinaryHandler)
	mux.HandleFunc("/api/data/station", statH.StationGeoJSONHandler)

	// Map and PMTiles route
	mux.HandleFunc("/map-china.pmtiles", staticH.PMTilesHandler)

	// SPA fallback
	mux.HandleFunc("/", staticH.SPAHandler)

	srv := &http.Server{
		Addr:         ":" + cfg.HTTPPort,
		Handler:      corsMiddleware(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("[MICAPS-Web] Server listening on http://localhost:%s", cfg.HTTPPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[MICAPS-Web] Listen error: %v", err)
		}
	}()

	<-stopChan
	log.Println("[MICAPS-Web] Shutting down server gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("[MICAPS-Web] Server forced shutdown: %v", err)
	}
	log.Println("[MICAPS-Web] Server exiting")
}

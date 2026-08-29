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
			config.ExitWithError("No Cassandra host configured. Specify -host <ip>, place MICAPS.exe.config in the executable directory, or run with -mock for offline mock data.")
		} else {
			addr := fmt.Sprintf("%s:%d", cfg.CassandraHost, cfg.CassandraPort)
			log.Printf("[MICAPS-Web] Connecting to Cassandra CQL v4 at %s (Tunnel=%t)...", addr, cfg.EnableTunnel)
			cqlClient, err = db.NewCQLClient(addr, 10*time.Second)
			if err != nil {
				config.ExitWithError("Could not connect to Cassandra cluster at %s: %v", addr, err)
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
	mux.HandleFunc("/api/config", staticH.ConfigHandler)
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

	listenErrChan := make(chan error, 1)
	go func() {
		log.Printf("[MICAPS-Web] Server listening on http://localhost:%s", cfg.HTTPPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			listenErrChan <- err
		}
	}()

	select {
	case sig := <-stopChan:
		log.Printf("[MICAPS-Web] Received signal %v. Shutting down server gracefully...", sig)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("[MICAPS-Web] Server forced shutdown: %v", err)
		}
		log.Println("[MICAPS-Web] Server exiting")
	case err := <-listenErrChan:
		config.ExitWithError("Port :%s is not available or listen failed: %v", cfg.HTTPPort, err)
	}
}

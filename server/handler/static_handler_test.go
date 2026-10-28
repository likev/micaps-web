package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"micaps-web/config"
)

func TestPMTilesHandler_AllProfiles(t *testing.T) {
	// Create a dummy temp directory with PMTiles dummy files
	tempDir := t.TempDir()
	files := []string{"map-china.pmtiles", "map-global.pmtiles", "map-china-district.pmtiles"}
	dummyContent := []byte("PMTILES_TEST_HEADER_CONTENT_BYTES_1234567890")
	for _, f := range files {
		if err := os.WriteFile(filepath.Join(tempDir, f), dummyContent, 0644); err != nil {
			t.Fatalf("Failed to create dummy test file %s: %v", f, err)
		}
	}

	cfg := &config.Config{
		PMTilesPath: filepath.Join(tempDir, "map-china.pmtiles"),
		StaticDir:   tempDir,
	}
	h := &StaticHandler{Cfg: cfg}

	for _, f := range files {
		req := httptest.NewRequest("GET", "/"+f, nil)
		rec := httptest.NewRecorder()

		h.PMTilesHandler(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("Expected 200 OK for %s, got %d", f, rec.Code)
		}

		if rec.Header().Get("Accept-Ranges") != "bytes" {
			t.Errorf("Expected Accept-Ranges: bytes for %s, got %s", f, rec.Header().Get("Accept-Ranges"))
		}

		if rec.Body.String() != string(dummyContent) {
			t.Errorf("Expected body %q, got %q", string(dummyContent), rec.Body.String())
		}
	}

	// Test Range Request (HTTP 206)
	req := httptest.NewRequest("GET", "/map-global.pmtiles", nil)
	req.Header.Set("Range", "bytes=0-6")
	rec := httptest.NewRecorder()
	h.PMTilesHandler(rec, req)

	if rec.Code != http.StatusPartialContent {
		t.Errorf("Expected 206 Partial Content for range request, got %d", rec.Code)
	}
	if rec.Body.String() != "PMTILES" {
		t.Errorf("Expected 'PMTILES', got %q", rec.Body.String())
	}
}

func TestSPAHandler_PMTilesDelegation(t *testing.T) {
	tempDir := t.TempDir()
	f := "map-china.pmtiles"
	dummyContent := []byte("PMTILES_TEST_DATA")
	if err := os.WriteFile(filepath.Join(tempDir, f), dummyContent, 0644); err != nil {
		t.Fatalf("Failed to create dummy file: %v", err)
	}

	cfg := &config.Config{
		PMTilesPath: filepath.Join(tempDir, f),
		StaticDir:   tempDir,
	}
	h := &StaticHandler{Cfg: cfg}

	req := httptest.NewRequest("GET", "/map-china.pmtiles", nil)
	rec := httptest.NewRecorder()
	h.SPAHandler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Expected 200 OK via SPAHandler fallback, got %d", rec.Code)
	}
	if rec.Header().Get("Accept-Ranges") != "bytes" {
		t.Errorf("Expected Accept-Ranges: bytes, got %s", rec.Header().Get("Accept-Ranges"))
	}
}

func TestPMTilesHandler_ConfigInServer(t *testing.T) {
	tempDir := t.TempDir()
	customPMTiles := filepath.Join(tempDir, "custom-district.pmtiles")
	customContent := []byte("PMTILES_CUSTOM_DISTRICT_DATA")
	if err := os.WriteFile(customPMTiles, customContent, 0644); err != nil {
		t.Fatalf("Failed to create custom file: %v", err)
	}

	// Server configured with custom PMTiles
	cfg := &config.Config{
		PMTilesPath: customPMTiles,
		StaticDir:   tempDir,
	}
	h := &StaticHandler{Cfg: cfg}

	// Client requests default /map-china.pmtiles endpoint
	req := httptest.NewRequest("GET", "/map-china.pmtiles", nil)
	rec := httptest.NewRecorder()
	h.PMTilesHandler(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Expected 200 OK, got %d", rec.Code)
	}
	if rec.Body.String() != string(customContent) {
		t.Errorf("Expected body to be custom configured file %q, got %q", string(customContent), rec.Body.String())
	}
}

func TestStatusHandler_IncludesPrefetchAndThCache(t *testing.T) {
	cfg := &config.Config{
		CassandraHost: "127.0.0.1",
		CassandraPort: 9042,
	}
	h := &StaticHandler{Cfg: cfg}

	req := httptest.NewRequest("GET", "/api/status", nil)
	rec := httptest.NewRecorder()
	h.StatusHandler(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if _, ok := resp["thCache"]; !ok {
		t.Errorf("expected thCache in status response")
	}
	prefetchStats, ok := resp["prefetch"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected prefetch in status response")
	}
	for _, field := range []string{"queued", "running", "warmed", "failed", "dropped", "negativeHits"} {
		if _, exists := prefetchStats[field]; !exists {
			t.Errorf("missing field %s in prefetch status", field)
		}
	}
}

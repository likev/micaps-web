package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"micaps-web/handler"
	"micaps-web/model"
)

func TestStationHandlerMockMode_Surface(t *testing.T) {
	h := &handler.StationHandler{
		Client:   nil,
		MockMode: true,
	}

	req := httptest.NewRequest("GET", "/api/data/station?path=SURFACE/PLOT_GLOBAL_3H&file=latest", nil)
	w := httptest.NewRecorder()
	h.StationGeoJSONHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}

	var fc model.GeoJSONFeatureCollection
	if err := json.Unmarshal(w.Body.Bytes(), &fc); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}

	if len(fc.Features) == 0 {
		t.Errorf("expected non-empty features")
	}
}

func TestStationHandlerMockMode_AMV(t *testing.T) {
	h := &handler.StationHandler{
		Client:   nil,
		MockMode: true,
	}

	req := httptest.NewRequest("GET", "/api/data/station?path=SATELLITE/FY2G/L2/AMV/IR1&file=latest", nil)
	w := httptest.NewRecorder()
	h.StationGeoJSONHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}

	var fc model.GeoJSONFeatureCollection
	if err := json.Unmarshal(w.Body.Bytes(), &fc); err != nil {
		t.Fatalf("failed to decode JSON response: %v", err)
	}

	if len(fc.Features) == 0 {
		t.Fatalf("expected non-empty AMV features in mock mode")
	}

	feat := fc.Features[0]
	ws, ok := feat.Properties["wind_speed"].(float64)
	if !ok || ws <= 0 {
		t.Errorf("expected positive wind_speed, got %v", feat.Properties["wind_speed"])
	}
	wd, ok := feat.Properties["wind_dir"].(float64)
	if !ok || wd < 0 || wd > 360 {
		t.Errorf("expected valid wind_dir, got %v", feat.Properties["wind_dir"])
	}
	if src, ok := feat.Properties["source"].(string); !ok || src != "AMV" {
		t.Errorf("expected source AMV, got %v", feat.Properties["source"])
	}
}

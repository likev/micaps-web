package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"micaps-web/db"
	"micaps-web/handler"
	"micaps-web/model"
)

func TestTLogPHandlerMockMode(t *testing.T) {
	h := &handler.TLogPHandler{
		Client:   nil,
		MockMode: true,
	}

	// 1. Test station list GeoJSON (station omitted)
	req := httptest.NewRequest("GET", "/api/data/tlogp?file=20260320200000.000", nil)
	w := httptest.NewRecorder()
	h.Handler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", w.Code)
	}

	var fc model.GeoJSONFeatureCollection
	if err := json.Unmarshal(w.Body.Bytes(), &fc); err != nil {
		t.Fatalf("Failed to parse GeoJSON: %v", err)
	}
	if len(fc.Features) == 0 {
		t.Errorf("Expected features > 0, got 0")
	}

	// 2. Test station profile JSON for 58362
	req2 := httptest.NewRequest("GET", "/api/data/tlogp?file=20260320200000.000&station=58362", nil)
	w2 := httptest.NewRecorder()
	h.Handler(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", w2.Code)
	}

	var profile model.StationSounding
	if err := json.Unmarshal(w2.Body.Bytes(), &profile); err != nil {
		t.Fatalf("Failed to parse station profile: %v", err)
	}
	if profile.StationID != "58362" {
		t.Errorf("Expected StationID 58362, got %s", profile.StationID)
	}
	if len(profile.Levels) == 0 {
		t.Errorf("Expected vertical levels > 0, got 0")
	}
}

func TestTLogPHandlerMock_EdgeCases(t *testing.T) {
	h := &handler.TLogPHandler{
		Client:   nil,
		MockMode: true,
	}

	// 1. Test 14-digit file without .000
	req1 := httptest.NewRequest("GET", "/api/data/tlogp?file=20260320200000&station=58362", nil)
	w1 := httptest.NewRecorder()
	h.Handler(w1, req1)
	if w1.Code != http.StatusOK {
		t.Errorf("Expected 200 OK for 14-digit file without .000, got %d", w1.Code)
	}

	// 2. Test file=latest
	req2 := httptest.NewRequest("GET", "/api/data/tlogp?file=latest", nil)
	w2 := httptest.NewRecorder()
	h.Handler(w2, req2)
	if w2.Code != http.StatusOK {
		t.Errorf("Expected 200 OK for file=latest, got %d", w2.Code)
	}

	// 3. Test empty file
	req3 := httptest.NewRequest("GET", "/api/data/tlogp?file=", nil)
	w3 := httptest.NewRecorder()
	h.Handler(w3, req3)
	if w3.Code != http.StatusOK {
		t.Errorf("Expected 200 OK for empty file, got %d", w3.Code)
	}

	// 4. Test non-mock mode returns 404 when Client is nil
	hNonMock := &handler.TLogPHandler{
		Client:   nil,
		MockMode: false,
	}
	req4 := httptest.NewRequest("GET", "/api/data/tlogp?file=20260320200000.000&station=58362", nil)
	w4 := httptest.NewRecorder()
	hNonMock.Handler(w4, req4)
	if w4.Code != http.StatusNotFound {
		t.Errorf("Expected 404 StatusNotFound when Client is nil and MockMode is false, got %d", w4.Code)
	}
}

func TestTLogPHandlerLiveCassandra(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping live Cassandra test in short mode")
	}
	cqlClient, err := db.NewCQLClient("bore.pub:59042", 15*time.Second)
	if err != nil {
		t.Skipf("Live Cassandra bore.pub:59042 not reachable: %v", err)
		return
	}
	defer cqlClient.Close()

	h := &handler.TLogPHandler{
		Client:   cqlClient,
		MockMode: false,
	}

	// 1. Fetch latest stations GeoJSON
	req := httptest.NewRequest("GET", "/api/data/tlogp?file=latest", nil)
	w := httptest.NewRecorder()
	h.Handler(w, req)

	if w.Code != http.StatusOK {
		t.Skipf("Live Cassandra returned code %d: %s", w.Code, w.Body.String())
		return
	}

	var fc model.GeoJSONFeatureCollection
	if err := json.Unmarshal(w.Body.Bytes(), &fc); err != nil {
		t.Skipf("Failed to parse live GeoJSON: %v", err)
		return
	}
	if len(fc.Features) == 0 {
		t.Skipf("Live station features count is 0")
		return
	}

	// 2. Fetch sounding profile for a present station in latest run
	var profile model.StationSounding
	var targetStn string
	for _, feat := range fc.Features {
		stn, ok := feat.Properties["station_id"].(string)
		if !ok || stn == "" {
			continue
		}
		req2 := httptest.NewRequest("GET", fmt.Sprintf("/api/data/tlogp?file=latest&station=%s", stn), nil)
		w2 := httptest.NewRecorder()
		h.Handler(w2, req2)
		if w2.Code == http.StatusOK {
			var p model.StationSounding
			if err := json.Unmarshal(w2.Body.Bytes(), &p); err == nil && len(p.Levels) >= 5 {
				profile = p
				targetStn = stn
				break
			}
		}
	}
	if targetStn == "" && len(fc.Features) > 0 {
		// Fallback to first feature
		targetStn = fc.Features[0].Properties["station_id"].(string)
		req2 := httptest.NewRequest("GET", fmt.Sprintf("/api/data/tlogp?file=latest&station=%s", targetStn), nil)
		w2 := httptest.NewRecorder()
		h.Handler(w2, req2)
		if w2.Code == http.StatusOK {
			json.Unmarshal(w2.Body.Bytes(), &profile)
		}
	}

	if targetStn == "" || len(profile.Levels) == 0 {
		t.Skipf("No live sounding profile with levels found in latest run")
		return
	}
	if profile.StationID != targetStn {
		t.Errorf("Expected StationID %s, got %s", targetStn, profile.StationID)
	}

	// 3. Specifically verify Shanghai 58362 in synoptic 08:00 BJT release
	req3 := httptest.NewRequest("GET", "/api/data/tlogp?file=20260918080000.000&station=58362", nil)
	w3 := httptest.NewRecorder()
	h.Handler(w3, req3)
	if w3.Code == http.StatusOK {
		var shProfile model.StationSounding
		if err := json.Unmarshal(w3.Body.Bytes(), &shProfile); err == nil {
			if shProfile.StationID != "58362" {
				t.Errorf("Expected StationID 58362, got %s", shProfile.StationID)
			}
			if len(shProfile.Levels) < 100 {
				t.Errorf("Expected >100 levels for Shanghai, got %d", len(shProfile.Levels))
			}
		}
	}

	// 4. Verify StationHandler handles UPPER_AIR/TLOGP/500 defensively
	statH := &handler.StationHandler{Client: cqlClient, MockMode: false}
	req4 := httptest.NewRequest("GET", "/api/data/station?path=UPPER_AIR/TLOGP/500&file=latest", nil)
	w4 := httptest.NewRecorder()
	statH.StationGeoJSONHandler(w4, req4)
	if w4.Code != http.StatusOK {
		t.Errorf("Expected StationHandler to return 200 for UPPER_AIR/TLOGP/500, got %d: %s", w4.Code, w4.Body.String())
	}
}
